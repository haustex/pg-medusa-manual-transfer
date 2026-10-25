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

export const orderTransferQueryKey = (orderId: string) => ["manual-transfer-order", orderId]

/** null when the order was not paid by manual transfer */
export async function getOrderTransfer(orderId: string): Promise<OrderTransferPayment | null> {
  try {
    const { payment } = await sdk.client.fetch<{ payment: OrderTransferPayment }>(
      `/admin/manual-transfer/orders/${orderId}`
    )
    return payment
  } catch (error) {
    if (error instanceof FetchError && error.status === 404) {
      return null
    }
    throw error
  }
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

export const STATUS_COLOR: Record<string, "green" | "orange" | "red" | "grey" | "blue"> = {
  awaiting_payment: "orange",
  awaiting_verification: "blue",
  paid: "green",
  underpaid: "orange",
  rejected: "red",
  expired: "grey",
  canceled: "grey",
}
