import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import type { Logger } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError, OrderWorkflowEvents } from "@medusajs/framework/utils"
import { notifyAdminsOverdue, notifyTransferChange, TransferChange } from "../lib/notifications/send"
import { loadOrderTransfer } from "../lib/order-transfer"
import { MANUAL_TRANSFER_EVENTS, MANUAL_TRANSFER_STATUS } from "../lib/payment-data"
import { findPaymentOrderId } from "../lib/transfer-queue"

const CHANGES: Record<string, TransferChange> = {
  [OrderWorkflowEvents.PLACED]: "placed",
  [MANUAL_TRANSFER_EVENTS.PROOF_UPLOADED]: "proof_uploaded",
  [MANUAL_TRANSFER_EVENTS.PROOF_REJECTED]: "rejected",
  [MANUAL_TRANSFER_EVENTS.PAYMENT_UNDERPAID]: "underpaid",
  [MANUAL_TRANSFER_EVENTS.PAYMENT_CONFIRMED]: "paid",
  [MANUAL_TRANSFER_EVENTS.PAYMENT_REMINDER]: "reminder",
  [MANUAL_TRANSFER_EVENTS.PAYMENT_EXPIRED]: "expired",
  [OrderWorkflowEvents.CANCELED]: "canceled",
}

type EventData = { id?: string; order_id?: string; payment_ids?: string[] }

/** The order an event is about: order events carry its id, payment events the payment id */
async function orderIdOf(container: SubscriberArgs["container"], name: string, data: EventData): Promise<string | null> {
  if (data.order_id) {
    return data.order_id
  }
  if (name === OrderWorkflowEvents.PLACED || name === OrderWorkflowEvents.CANCELED) {
    return data.id ?? null
  }
  return data.id ? findPaymentOrderId(container.resolve(ContainerRegistrationKeys.PG_CONNECTION), data.id) : null
}

/**
 * E-mails to the buyer and the admins for every status change of a manual
 * transfer (see src/lib/notifications). Orders paid another way are skipped.
 */
export default async function manualTransferNotifications({ event, container }: SubscriberArgs<EventData>) {
  const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER)
  try {
    if (event.name === MANUAL_TRANSFER_EVENTS.ADMIN_OVERDUE) {
      await notifyAdminsOverdue(container, event.data.payment_ids ?? [], event.name)
      return
    }
    const change = CHANGES[event.name]
    const orderId = change ? await orderIdOf(container, event.name, event.data) : null
    if (!change || !orderId) {
      return
    }
    if (change === "canceled") {
      // An expired order was canceled by the deadlines job, which sends its own e-mail
      const { payment } = await loadOrderTransfer(container.resolve(ContainerRegistrationKeys.QUERY), orderId)
      if (payment.data.status !== MANUAL_TRANSFER_STATUS.CANCELED) {
        return
      }
    }
    await notifyTransferChange(container, change, {
      order_id: orderId,
      proof_id: change === "proof_uploaded" || change === "rejected" ? event.data.id : undefined,
      trigger: event.name,
    })
  } catch (error) {
    // Not paid by manual transfer
    if (error instanceof MedusaError && error.type === MedusaError.Types.NOT_FOUND) {
      return
    }
    logger.warn(`manual transfer: notifications for ${event.name} failed: ${(error as Error).message}`)
  }
}

export const config: SubscriberConfig = {
  event: [...Object.keys(CHANGES), MANUAL_TRANSFER_EVENTS.ADMIN_OVERDUE],
  context: { subscriberId: "manual-transfer-notifications" },
}
