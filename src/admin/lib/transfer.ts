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

export type TransferReceipt = {
  amount: number
  received_at: string
  bank_reference: string | null
  note: string | null
  recorded_by: string | null
  recorded_at: string
}

export type TransferConfirmation = {
  amount_received: number
  total_received?: number
  received_at: string
  bank_reference: string | null
  note: string | null
  confirmed_by: string | null
  confirmed_at: string
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
    reminded_at?: string
    confirmation?: TransferConfirmation
    receipts?: TransferReceipt[]
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
  reviewed_by: string | null
  reviewed_at: string | null
  file_deleted_at: string | null
  created_at: string
}

export type TransferUser = { email: string; name: string | null }

export type OrderTransfer = {
  order_status: string
  payment: OrderTransferPayment
  /** Partial transfers recorded so far */
  amount_received: number
  proofs: TransferProof[]
  users: Record<string, TransferUser>
}

export const orderTransferQueryKey = (orderId: string) => ["manual-transfer-order", orderId]

/** null when the order was not paid by manual transfer */
export async function getOrderTransfer(orderId: string): Promise<OrderTransfer | null> {
  try {
    return await sdk.client.fetch<OrderTransfer>(`/admin/manual-transfer/orders/${orderId}`)
  } catch (error) {
    if (error instanceof FetchError && error.status === 404) {
      return null
    }
    throw error
  }
}

export type TransferAmountInput = {
  amount_received: number
  received_at: string
  bank_reference?: string | null
  note?: string | null
}

export function confirmPayment(paymentId: string, body: TransferAmountInput & { accept_shortfall?: boolean }) {
  return sdk.client.fetch(`/admin/manual-transfer/payments/${paymentId}/confirm`, { method: "POST", body })
}

export function recordUnderpayment(paymentId: string, body: TransferAmountInput) {
  return sdk.client.fetch(`/admin/manual-transfer/payments/${paymentId}/underpaid`, { method: "POST", body })
}

export function rejectProof(proofId: string, reason: string) {
  return sdk.client.fetch(`/admin/manual-transfer/proofs/${proofId}/reject`, { method: "POST", body: { reason } })
}

export type TransferListRow = {
  payment_id: string
  order_id: string
  display_id: number | null
  email: string | null
  amount: number
  currency_code: string
  status: string | null
  reference: string | null
  expires_at: string | null
  created_at: string
  last_proof_at: string | null
}

export type TransferList = {
  payments: TransferListRow[]
  count: number
  counts: Record<string, number>
}

export const TRANSFERS_QUERY_KEY = ["manual-transfer-payments"]

export function listTransfers(params: { status?: string; q?: string; limit: number; offset: number }) {
  return sdk.client.fetch<TransferList>("/admin/manual-transfer/payments", {
    query: Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== "")),
  })
}

export type PluginConfig = { show_credit: boolean; proof_retention_days: number | null }

export const CONFIG_QUERY_KEY = ["manual-transfer-config"]

export function getPluginConfig() {
  return sdk.client.fetch<PluginConfig>("/admin/manual-transfer/config")
}

/** Statuses in which an admin can still confirm or record money (mirrors CONFIRMABLE_STATUSES) */
export const OPEN_STATUSES = ["awaiting_payment", "awaiting_verification", "underpaid", "rejected"]

/** Today in the browser's time zone, YYYY-MM-DD */
export function today(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** Rounds away float noise from sums of amounts (to 1/10000 of a unit) */
export function roundAmount(value: number): number {
  return Math.round(value * 10000) / 10000
}

export function userLabel(users: Record<string, TransferUser> | undefined, id: string | null): string | null {
  if (!id) {
    return null
  }
  const user = users?.[id]
  return user ? user.name || user.email : id
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

export function formatDate(value: string | null | undefined, locale?: string): string {
  if (!value) {
    return "-"
  }
  // YYYY-MM-DD from a bank statement: show it as that calendar day, whatever the time zone
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value)
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date)
}

export function formatDateTime(value: string | null | undefined, locale?: string): string {
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
