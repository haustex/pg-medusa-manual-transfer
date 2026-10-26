import { FetchError } from "@medusajs/js-sdk"
import { sdk } from "./client"

export type TransferHistoryEntry = {
  event: string
  at: string
  actor_type: "system" | "customer" | "guest" | "user"
  actor_id: string | null
  note: string | null
  details?: Record<string, unknown>
}

export type TransferAccount = {
  id: string
  bank_name: string
  account_holder: string
  account_number: string
  swift_code: string | null
  bank_address: string | null
  currency_code: string
}

export type OrderTransferPayment = {
  id: string
  amount: number
  currency_code: string
  captured_at: string | null
  canceled_at: string | null
  data: {
    reference?: string
    account?: TransferAccount
    status?: string
    expires_at?: string
    history?: TransferHistoryEntry[]
  }
}

export type TransferProof = {
  id: string
  filename: string
  mime_type: string
  size: number
  status: "pending" | "accepted" | "rejected"
  rejection_reason: string | null
  uploaded_by: "customer" | "guest"
  note: string | null
  duplicate_of_order_id: string | null
  created_at: string
}

export type OrderTransfer = { payment: OrderTransferPayment; proofs: TransferProof[] }

export const orderTransferQueryKey = (orderId: string) => ["manual-transfer-order", orderId]

/** null when the order was not paid by manual transfer */
export async function getOrderTransfer(orderId: string): Promise<OrderTransfer | null> {
  try {
    const { payment, proofs } = await sdk.client.fetch<OrderTransfer>(`/admin/manual-transfer/orders/${orderId}`)
    return { payment, proofs }
  } catch (error) {
    if (error instanceof FetchError && error.status === 404) {
      return null
    }
    throw error
  }
}

/** Opens a proof through a fresh 5-minute signed link (opened first, so popup blockers allow it) */
export async function openProof(proofId: string) {
  const tab = window.open("about:blank", "_blank")
  const { url } = await sdk.client.fetch<{ url: string; expires_at: string }>(
    `/admin/manual-transfer/proofs/${proofId}/url`
  )
  const backend = import.meta.env.VITE_BACKEND_URL || "/"
  const absolute = new URL(url, backend === "/" ? window.location.origin : backend).toString()
  if (tab) {
    tab.opener = null
    tab.location.href = absolute
  } else {
    window.location.href = absolute
  }
}

export function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

export function formatAmount(amount: number, currencyCode: string, locale?: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: currencyCode.toUpperCase() }).format(amount)
  } catch {
    return `${amount} ${currencyCode.toUpperCase()}`
  }
}

export function formatDateTime(value: string | undefined, locale?: string): string {
  if (!value) {
    return "-"
  }
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
}

export const PROOF_STATUS_COLOR: Record<string, "green" | "orange" | "red" | "grey" | "blue"> = {
  pending: "blue",
  accepted: "green",
  rejected: "red",
}

export const STATUS_COLOR: Record<string, "green" | "orange" | "red" | "grey" | "blue"> = {
  awaiting_payment: "orange",
  awaiting_verification: "blue",
  paid: "green",
  underpaid: "orange",
  rejected: "red",
  expired: "grey",
  canceled: "grey",
}
