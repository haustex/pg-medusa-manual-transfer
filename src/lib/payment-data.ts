import type { PaymentSessionStatus } from "@medusajs/framework/types"
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

export type ManualTransferConfirmation = {
  amount_received: number
  /** Date the money arrived according to the bank statement (YYYY-MM-DD) */
  received_at: string
  bank_reference: string | null
  note: string | null
  confirmed_by: string | null
  confirmed_at: string
}

export type ManualTransferRefund = {
  amount: number
  refunded_at: string
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
  canceled_at?: string
  refunds?: ManualTransferRefund[]
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
  "canceled_at",
  "refunds",
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
