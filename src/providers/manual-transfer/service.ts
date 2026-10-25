import type { Knex } from "@medusajs/framework/mikro-orm/knex"
import type {
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  BigNumberInput,
  CancelPaymentInput,
  CancelPaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  Logger,
  ProviderWebhookPayload,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  WebhookActionResult,
} from "@medusajs/framework/types"
import {
  AbstractPaymentProvider,
  BigNumber,
  ContainerRegistrationKeys,
  MedusaError,
  PaymentActions,
} from "@medusajs/framework/utils"
import {
  AccountRow,
  findSessionRegionId,
  listActiveAccounts,
  pickAccount,
  snapshotAccount,
} from "../../lib/accounts"
import {
  addBusinessDays,
  DEFAULT_DEADLINE_BUSINESS_DAYS,
  DEFAULT_TIMEZONE,
  isValidHoliday,
  isValidTimezone,
} from "../../lib/deadline"
import {
  appendHistory,
  HISTORY_EVENT,
  historyEntry,
  MANUAL_TRANSFER_STATUS,
  ManualTransferHistoryEntry,
  ManualTransferPaymentData,
  pickPaymentData,
  toSessionStatus,
} from "../../lib/payment-data"
import { DEFAULT_REFERENCE_PREFIX, isValidReferencePrefix, parseReference } from "../../lib/reference"
import { reserveReference } from "../../lib/reference-store"

type InjectedDependencies = {
  logger: Logger
  [ContainerRegistrationKeys.PG_CONNECTION]?: Knex
}

export type ManualTransferProviderOptions = {
  /** Prefix of the payment reference, 1–6 of A–Z/0–9. Default "MT" (MT-7K3QX-9PA2B). */
  referencePrefix?: string
  /** Business days the buyer has to pay after placing the order. Default 3. */
  deadlineBusinessDays?: number
  /** IANA time zone business days are counted in, e.g. "Asia/Jakarta". Default "UTC". */
  timezone?: string
  /** Non-working days (YYYY-MM-DD in `timezone`) skipped when counting. */
  holidays?: string[]
}

/** Session data keys carried from one step to the next; everything else is rebuilt */
const SESSION_KEYS = ["reference", "account", "amount", "currency_code", "region_id", "session_id"] as const

const CAPTURE_ONLY_BY_ADMIN =
  "Manual transfer payments are captured only by confirming them in the manual transfer panel, " +
  "after the money is visible in the bank statement."

function toNumber(amount: BigNumberInput): number {
  return new BigNumber(amount).numeric
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length ? value : null
}

class ManualTransferProviderService extends AbstractPaymentProvider<ManualTransferProviderOptions> {
  static identifier = "manual-transfer"

  protected logger_: Logger
  protected pg_: Knex | undefined
  protected options_: Required<ManualTransferProviderOptions>

  static validateOptions(options: Record<string, unknown>): void {
    const { referencePrefix, deadlineBusinessDays, timezone, holidays } =
      (options ?? {}) as ManualTransferProviderOptions
    const problems: string[] = []
    if (referencePrefix !== undefined && !isValidReferencePrefix(referencePrefix)) {
      problems.push("referencePrefix must be 1-6 characters A-Z or 0-9")
    }
    if (
      deadlineBusinessDays !== undefined &&
      !(Number.isInteger(deadlineBusinessDays) && deadlineBusinessDays >= 1 && deadlineBusinessDays <= 60)
    ) {
      problems.push("deadlineBusinessDays must be a whole number from 1 to 60")
    }
    if (timezone !== undefined && !isValidTimezone(timezone)) {
      problems.push(`timezone "${timezone}" is not an IANA time zone`)
    }
    if (holidays !== undefined && !(Array.isArray(holidays) && holidays.every(isValidHoliday))) {
      problems.push("holidays must be a list of YYYY-MM-DD dates")
    }
    if (problems.length) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `manual-transfer provider options: ${problems.join("; ")}`
      )
    }
  }

  constructor(container: InjectedDependencies, options: ManualTransferProviderOptions = {}) {
    super(container, options)
    this.logger_ = container.logger
    try {
      this.pg_ = container[ContainerRegistrationKeys.PG_CONNECTION]
    } catch {
      this.pg_ = undefined
    }
    this.options_ = {
      referencePrefix: options.referencePrefix ?? DEFAULT_REFERENCE_PREFIX,
      deadlineBusinessDays: options.deadlineBusinessDays ?? DEFAULT_DEADLINE_BUSINESS_DAYS,
      timezone: options.timezone ?? DEFAULT_TIMEZONE,
      holidays: options.holidays ?? [],
    }
  }

  protected db(): Knex {
    if (!this.pg_) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "manual transfer provider: no database connection in the payment module container"
      )
    }
    return this.pg_
  }

  /** The region the session's cart or order is in, falling back to the storefront's hint */
  protected async resolveRegionId(data: Record<string, unknown>): Promise<string | null> {
    const sessionId = asString(data.session_id)
    const regionId = sessionId ? await findSessionRegionId(this.db(), sessionId) : null
    return regionId ?? asString(data.region_id)
  }

  protected async chooseAccount(
    currencyCode: string,
    regionId: string | null,
    accountId: string | null
  ): Promise<AccountRow> {
    return this.pickOrFail(await listActiveAccounts(this.db(), currencyCode), currencyCode, regionId, accountId)
  }

  protected pickOrFail(
    rows: AccountRow[],
    currencyCode: string,
    regionId: string | null,
    accountId: string | null
  ): AccountRow {
    const account = pickAccount(rows, { regionId, accountId })
    if (!account) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `No active bank account for currency ${currencyCode.toUpperCase()}`
      )
    }
    return account
  }

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
    const data = (input.data ?? {}) as Record<string, unknown>
    const regionId = await this.resolveRegionId(data)
    const account = await this.chooseAccount(input.currency_code, regionId, asString(data.account_id))
    const reference = await reserveReference(this.db(), {
      prefix: this.options_.referencePrefix,
      sessionId: asString(data.session_id),
    })
    const sessionData: ManualTransferPaymentData = {
      reference,
      account: snapshotAccount(account),
      amount: toNumber(input.amount),
      currency_code: input.currency_code.toLowerCase(),
      region_id: regionId,
      status: MANUAL_TRANSFER_STATUS.AWAITING_PAYMENT,
      ...(asString(data.session_id) ? { session_id: data.session_id as string } : {}),
    }
    return { id: reference, data: sessionData, status: "pending" }
  }

  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    const current = pickPaymentData(input.data, SESSION_KEYS)
    const currencyCode = input.currency_code.toLowerCase()
    let account = current.account
    if (!account || account.currency_code !== currencyCode) {
      account = snapshotAccount(
        await this.chooseAccount(currencyCode, current.region_id ?? null, null)
      )
    }
    const reference =
      (current.reference && parseReference(current.reference)) ||
      (await reserveReference(this.db(), {
        prefix: this.options_.referencePrefix,
        sessionId: current.session_id ?? null,
      }))
    const data: ManualTransferPaymentData = {
      ...current,
      reference,
      account,
      amount: toNumber(input.amount),
      currency_code: currencyCode,
      region_id: current.region_id ?? null,
      status: MANUAL_TRANSFER_STATUS.AWAITING_PAYMENT,
    }
    return { data, status: "pending" }
  }

  /**
   * Placing the order: the payment is authorized right away so Medusa creates
   * the order and reserves stock, while the money is still on its way. The
   * account details are re-read here and frozen for this order, and the
   * payment deadline starts.
   */
  async authorizePayment(input: AuthorizePaymentInput): Promise<AuthorizePaymentOutput> {
    const session = pickPaymentData(input.data, SESSION_KEYS)
    const reference = session.reference && parseReference(session.reference)
    if (!reference || !session.account || !session.currency_code || session.amount === undefined) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "manual transfer session is incomplete; select the payment method again"
      )
    }
    // The account may have been edited or deactivated since checkout started
    const rows = await listActiveAccounts(this.db(), session.currency_code)
    const account = this.pickOrFail(rows, session.currency_code, session.region_id ?? null, session.account.id)
    const now = new Date()
    const expiresAt = addBusinessDays(now, this.options_.deadlineBusinessDays, this.options_)
    // Buyer-supplied history is never carried over: it starts here
    const history: ManualTransferHistoryEntry[] = [
      historyEntry(HISTORY_EVENT.AUTHORIZED, { at: now, details: { account_id: account.id } }),
    ]
    if (account.id !== session.account.id) {
      const reason = rows.some((row) => row.id === session.account!.id) ? "not_offered_in_region" : "inactive_or_deleted"
      history.push(
        historyEntry(HISTORY_EVENT.ACCOUNT_SUBSTITUTED, {
          at: now,
          note: `Account chosen at checkout (${session.account.bank_name}) was not available; ${account.bank_name} was used instead.`,
          details: {
            reason,
            from: { id: session.account.id, bank_name: session.account.bank_name, account_number: session.account.account_number },
            to: { id: account.id, bank_name: account.bank_name, account_number: account.account_number },
          },
        })
      )
      this.logger_.warn(
        `manual-transfer: payment ${session.reference} uses account ${account.id} instead of ${session.account.id} (${reason})`
      )
    }
    const data: ManualTransferPaymentData = {
      ...session,
      reference,
      account: snapshotAccount(account),
      amount: session.amount,
      currency_code: session.currency_code,
      region_id: session.region_id ?? null,
      status: MANUAL_TRANSFER_STATUS.AWAITING_PAYMENT,
      authorized_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      history,
    }
    return { status: "authorized", data }
  }

  /**
   * Medusa's own "Capture" button lands here too. It is refused unless an
   * admin confirmed the transfer through this plugin, which marks the payment
   * data as paid before capturing.
   */
  async capturePayment(input: CapturePaymentInput): Promise<CapturePaymentOutput> {
    const data = pickPaymentData(input.data)
    if (data.status !== MANUAL_TRANSFER_STATUS.PAID || !data.confirmation) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, CAPTURE_ONLY_BY_ADMIN)
    }
    return { data: input.data }
  }

  /** Records the refund; the money itself is sent back by hand from the bank */
  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    const data = (input.data ?? {}) as Record<string, unknown>
    const refunds = Array.isArray(data.refunds) ? data.refunds : []
    const amount = toNumber(input.amount)
    const now = new Date()
    return {
      data: {
        ...data,
        refunds: [...refunds, { amount, refunded_at: now.toISOString() }],
        history: appendHistory(data, historyEntry(HISTORY_EVENT.REFUNDED, { at: now, details: { amount } })),
      },
    }
  }

  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    const data = (input.data ?? {}) as Record<string, unknown>
    if (data.status === MANUAL_TRANSFER_STATUS.PAID) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "This manual transfer is already paid; refund it instead of canceling."
      )
    }
    const now = new Date()
    return {
      data: {
        ...data,
        status:
          data.status === MANUAL_TRANSFER_STATUS.EXPIRED
            ? MANUAL_TRANSFER_STATUS.EXPIRED
            : MANUAL_TRANSFER_STATUS.CANCELED,
        canceled_at: now.toISOString(),
        history: appendHistory(data, historyEntry(HISTORY_EVENT.CANCELED, { at: now })),
      },
    }
  }

  async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    return { data: input.data }
  }

  async retrievePayment(input: RetrievePaymentInput): Promise<RetrievePaymentOutput> {
    return { data: input.data }
  }

  async getPaymentStatus(input: GetPaymentStatusInput): Promise<GetPaymentStatusOutput> {
    return { status: toSessionStatus(pickPaymentData(input.data)), data: input.data }
  }

  async getWebhookActionAndData(
    _payload: ProviderWebhookPayload["payload"]
  ): Promise<WebhookActionResult> {
    // Bank transfers have no webhook: payments are confirmed by an admin.
    return { action: PaymentActions.NOT_SUPPORTED }
  }
}

export default ManualTransferProviderService
