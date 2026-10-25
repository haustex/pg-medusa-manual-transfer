import type { Knex } from "@medusajs/framework/mikro-orm/knex"
import type {
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
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
  ContainerRegistrationKeys,
  MedusaError,
  PaymentActions,
} from "@medusajs/framework/utils"
import { randomUUID } from "node:crypto"
import { listActiveAccounts, pickAccount, snapshotAccount } from "../../lib/accounts"

type InjectedDependencies = {
  logger: Logger
  [ContainerRegistrationKeys.PG_CONNECTION]?: Knex
}

export type ManualTransferProviderOptions = Record<string, never>

const NOT_IMPLEMENTED = "manual transfer provider: implemented in phase 1"

class ManualTransferProviderService extends AbstractPaymentProvider<ManualTransferProviderOptions> {
  static identifier = "manual-transfer"

  protected logger_: Logger
  protected pg_: Knex | undefined

  constructor(container: InjectedDependencies, options: ManualTransferProviderOptions) {
    super(container, options)
    this.logger_ = container.logger
    try {
      this.pg_ = container[ContainerRegistrationKeys.PG_CONNECTION]
    } catch {
      this.pg_ = undefined
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

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
    const data = (input.data ?? {}) as Record<string, unknown>
    const rows = await listActiveAccounts(this.db(), input.currency_code)
    const account = pickAccount(rows, {
      regionId: typeof data.region_id === "string" ? data.region_id : null,
      accountId: typeof data.account_id === "string" ? data.account_id : null,
    })
    if (!account) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `No active bank account for currency ${input.currency_code.toUpperCase()}`
      )
    }
    return {
      id: `mt_${randomUUID()}`,
      data: {
        account: snapshotAccount(account),
        amount: input.amount,
        currency_code: input.currency_code,
        status: "awaiting_payment",
      },
    }
  }

  async authorizePayment(_input: AuthorizePaymentInput): Promise<AuthorizePaymentOutput> {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, NOT_IMPLEMENTED)
  }

  async capturePayment(_input: CapturePaymentInput): Promise<CapturePaymentOutput> {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, NOT_IMPLEMENTED)
  }

  async refundPayment(_input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, NOT_IMPLEMENTED)
  }

  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    return { data: input.data }
  }

  async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    return { data: input.data }
  }

  async retrievePayment(input: RetrievePaymentInput): Promise<RetrievePaymentOutput> {
    return { data: input.data }
  }

  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    return { data: input.data }
  }

  async getPaymentStatus(_input: GetPaymentStatusInput): Promise<GetPaymentStatusOutput> {
    return { status: "pending" }
  }

  async getWebhookActionAndData(
    _payload: ProviderWebhookPayload["payload"]
  ): Promise<WebhookActionResult> {
    // Bank transfers have no webhook: payments are confirmed by an admin.
    return { action: PaymentActions.NOT_SUPPORTED }
  }
}

export default ManualTransferProviderService
