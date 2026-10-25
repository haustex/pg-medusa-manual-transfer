import type { RemoteQueryFunction } from "@medusajs/framework/types"
import { MathBN, MedusaError } from "@medusajs/framework/utils"
import { isManualTransferProviderId, ManualTransferPaymentData } from "./payment-data"

export type OrderTransfer = {
  order: {
    id: string
    display_id: number | null
    email: string | null
    customer_id: string | null
    status: string
    created_at: string
  }
  payment: {
    id: string
    amount: number
    currency_code: string
    captured_at: string | null
    canceled_at: string | null
    data: Partial<ManualTransferPaymentData>
  }
}

type GraphPayment = {
  id: string
  provider_id: string
  amount: unknown
  currency_code: string
  captured_at: string | Date | null
  canceled_at: string | Date | null
  created_at: string | Date
  data: Record<string, unknown> | null
}

const iso = (value: string | Date | null): string | null =>
  value ? new Date(value).toISOString() : null

/**
 * The order and its manual-transfer payment: the newest one that is not
 * canceled, or the newest one at all. Throws NOT_FOUND when the order does not
 * exist or was not paid by manual transfer.
 */
export async function loadOrderTransfer(query: Omit<RemoteQueryFunction, symbol>, orderId: string): Promise<OrderTransfer> {
  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "email",
      "customer_id",
      "status",
      "created_at",
      "payment_collections.payments.id",
      "payment_collections.payments.provider_id",
      "payment_collections.payments.amount",
      "payment_collections.payments.currency_code",
      "payment_collections.payments.captured_at",
      "payment_collections.payments.canceled_at",
      "payment_collections.payments.created_at",
      "payment_collections.payments.data",
    ],
    filters: { id: orderId },
  })
  const order = data[0] as Record<string, any> | undefined
  if (!order) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Order ${orderId} not found`)
  }
  const payments = ((order.payment_collections ?? []) as { payments?: GraphPayment[] }[])
    .flatMap((collection) => collection?.payments ?? [])
    .filter((payment) => payment && isManualTransferProviderId(payment.provider_id))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  const payment = payments.find((p) => !p.canceled_at) ?? payments[0]
  if (!payment) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Order ${orderId} has no manual transfer payment`)
  }
  return {
    order: {
      id: order.id,
      display_id: order.display_id ?? null,
      email: order.email ?? null,
      customer_id: order.customer_id ?? null,
      status: order.status,
      created_at: iso(order.created_at)!,
    },
    payment: {
      id: payment.id,
      amount: MathBN.convert(payment.amount as never).toNumber(),
      currency_code: payment.currency_code,
      captured_at: iso(payment.captured_at),
      canceled_at: iso(payment.canceled_at),
      data: (payment.data ?? {}) as Partial<ManualTransferPaymentData>,
    },
  }
}
