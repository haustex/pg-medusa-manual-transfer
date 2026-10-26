import type { PaymentSessionStatus } from "@medusajs/framework/types"
import { MathBN } from "@medusajs/framework/utils"
import type { AccountSnapshot } from "./accounts"

/**
 * What the manual-transfer provider keeps in payment_session.data and
 * payment.data. Only the provider and this plugin's workflows write it: the
 * provider rebuilds it from known keys at every step, so anything a storefront
 * sends along when it creates the session is dropped.
 */

export const MANUAL_TRANSFER_STATUS = {
  /** Order placed, waiting for the buyer's transfer */
  AWAITING_PAYMENT: "awaiting_payment",
  /** Buyer uploaded a proof, an admin has to check the bank statement */
  AWAITING_VERIFICATION: "awaiting_verification",
  /** Confirmed by an admin and captured */
  PAID: "paid",
  /** Money arrived but less than the amount due */
  UNDERPAID: "underpaid",
  /** Proof rejected; the buyer may upload again */
  REJECTED: "rejected",
  /** Deadline passed without a confirmed payment */
  EXPIRED: "expired",
  /** Order or payment canceled */
  CANCELED: "canceled",
} as const

export type ManualTransferStatus = (typeof MANUAL_TRANSFER_STATUS)[keyof typeof MANUAL_TRANSFER_STATUS]

/** Statuses from which an admin may still confirm the payment */
export const CONFIRMABLE_STATUSES: readonly ManualTransferStatus[] = [
  MANUAL_TRANSFER_STATUS.AWAITING_PAYMENT,
  MANUAL_TRANSFER_STATUS.AWAITING_VERIFICATION,
  MANUAL_TRANSFER_STATUS.UNDERPAID,
  MANUAL_TRANSFER_STATUS.REJECTED,
]

/** Statuses in which the buyer may upload a (new) payment proof */
export const UPLOADABLE_STATUSES: readonly ManualTransferStatus[] = [
  MANUAL_TRANSFER_STATUS.AWAITING_PAYMENT,
  MANUAL_TRANSFER_STATUS.REJECTED,
  MANUAL_TRANSFER_STATUS.UNDERPAID,
]

/** Lock key shared by every workflow that rewrites a payment's data */
export function paymentLockKey(paymentId: string): string {
  return `manual-transfer:payment:${paymentId}`
}

/** Statuses the expiry job cancels once the deadline passed (not when a proof awaits review or money arrived) */
export const EXPIRABLE_STATUSES: readonly ManualTransferStatus[] = [
  MANUAL_TRANSFER_STATUS.AWAITING_PAYMENT,
  MANUAL_TRANSFER_STATUS.REJECTED,
]

/** Statuses in which the buyer still owes money and gets a reminder before the deadline */
export const REMINDABLE_STATUSES: readonly ManualTransferStatus[] = [
  MANUAL_TRANSFER_STATUS.AWAITING_PAYMENT,
  MANUAL_TRANSFER_STATUS.REJECTED,
  MANUAL_TRANSFER_STATUS.UNDERPAID,
]

export const MANUAL_TRANSFER_EVENTS = {
  PROOF_UPLOADED: "manual_transfer.proof_uploaded",
  PROOF_REJECTED: "manual_transfer.proof_rejected",
  PAYMENT_CONFIRMED: "manual_transfer.payment_confirmed",
  PAYMENT_UNDERPAID: "manual_transfer.payment_underpaid",
  PAYMENT_REMINDER: "manual_transfer.payment_reminder",
  PAYMENT_EXPIRED: "manual_transfer.payment_expired",
} as const

export type ManualTransferConfirmation = {
  /** What arrived with this (last) transfer */
  amount_received: number
  /** Everything received for the order, earlier partial transfers included */
  total_received?: number
  /** Date the money arrived according to the bank statement (YYYY-MM-DD) */
  received_at: string
  bank_reference: string | null
  note: string | null
  confirmed_by: string | null
  confirmed_at: string
}

/** A partial transfer an admin recorded as "underpaid" */
export type ManualTransferReceipt = {
  amount: number
  received_at: string
  bank_reference: string | null
  note: string | null
  recorded_by: string | null
  recorded_at: string
}

export type ManualTransferRefund = {
  amount: number
  refunded_at: string
}

export const HISTORY_EVENT = {
  AUTHORIZED: "authorized",
  /** The account picked at checkout was no longer available; another one was used */
  ACCOUNT_SUBSTITUTED: "account_substituted",
  PROOF_UPLOADED: "proof_uploaded",
  PROOF_REJECTED: "proof_rejected",
  UNDERPAID: "underpaid",
  CONFIRMED: "confirmed",
  REMINDER_SENT: "reminder_sent",
  EXPIRED: "expired",
  CANCELED: "canceled",
  REFUNDED: "refunded",
} as const

export type ManualTransferHistoryEvent = (typeof HISTORY_EVENT)[keyof typeof HISTORY_EVENT]

export type ManualTransferHistoryEntry = {
  event: ManualTransferHistoryEvent
  at: string
  /** Who did it: the provider/system, the buyer, or an admin user */
  actor_type: "system" | "customer" | "guest" | "user"
  actor_id: string | null
  note: string | null
  details?: Record<string, unknown>
}

export function historyEntry(
  event: ManualTransferHistoryEvent,
  {
    actor_type = "system",
    actor_id = null,
    note = null,
    details,
    at = new Date(),
  }: Partial<Omit<ManualTransferHistoryEntry, "event" | "at">> & { at?: Date } = {}
): ManualTransferHistoryEntry {
  return {
    event,
    at: at.toISOString(),
    actor_type,
    actor_id,
    note,
    ...(details ? { details } : {}),
  }
}

/** Returns the history with the entry appended, never mutating the input */
export function appendHistory(
  data: { history?: unknown } | undefined,
  ...entries: ManualTransferHistoryEntry[]
): ManualTransferHistoryEntry[] {
  const history = Array.isArray(data?.history) ? (data!.history as ManualTransferHistoryEntry[]) : []
  return [...history, ...entries]
}

export type ManualTransferPaymentData = {
  reference: string
  account: AccountSnapshot
  amount: number
  currency_code: string
  region_id: string | null
  status: ManualTransferStatus
  session_id?: string
  authorized_at?: string
  expires_at?: string
  confirmation?: ManualTransferConfirmation
  receipts?: ManualTransferReceipt[]
  reminded_at?: string
  canceled_at?: string
  refunds?: ManualTransferRefund[]
  history?: ManualTransferHistoryEntry[]
}

const KEYS = [
  "reference",
  "account",
  "amount",
  "currency_code",
  "region_id",
  "status",
  "session_id",
  "authorized_at",
  "expires_at",
  "confirmation",
  "receipts",
  "reminded_at",
  "canceled_at",
  "refunds",
  "history",
] as const

type Picked = Partial<ManualTransferPaymentData>

/** Keeps only the keys this plugin writes */
export function pickPaymentData(data: Record<string, unknown> | undefined, keys: readonly (typeof KEYS)[number][] = KEYS): Picked {
  const picked: Record<string, unknown> = {}
  for (const key of keys) {
    if (data && data[key] !== undefined) {
      picked[key] = data[key]
    }
  }
  return picked as Picked
}

/** Sum of the partial transfers recorded so far */
export function receivedSoFar(data: { receipts?: unknown } | undefined): number {
  const receipts = Array.isArray(data?.receipts) ? (data!.receipts as ManualTransferReceipt[]) : []
  return receipts.reduce((sum, receipt) => MathBN.add(sum, receipt.amount ?? 0), MathBN.convert(0)).toNumber()
}

/** How Medusa should see a payment in a given manual-transfer status */
export function toSessionStatus(data: Picked): PaymentSessionStatus {
  switch (data.status) {
    case MANUAL_TRANSFER_STATUS.PAID:
      return "captured"
    case MANUAL_TRANSFER_STATUS.EXPIRED:
    case MANUAL_TRANSFER_STATUS.CANCELED:
      return "canceled"
    default:
      return data.authorized_at ? "authorized" : "pending"
  }
}

/** Provider ids look like pp_{identifier}_{id from medusa-config} */
export function isManualTransferProviderId(providerId: string | null | undefined): boolean {
  return !!providerId && providerId.startsWith("pp_manual-transfer_")
}
