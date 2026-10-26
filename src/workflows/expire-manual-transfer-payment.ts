import { cancelOrderWorkflow, emitEventStep } from "@medusajs/medusa/core-flows"
import { createWorkflow, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import {
  appendHistory,
  EXPIRABLE_STATUSES,
  HISTORY_EVENT,
  historyEntry,
  MANUAL_TRANSFER_EVENTS,
  MANUAL_TRANSFER_STATUS,
  paymentLockKey,
} from "../lib/payment-data"
import { acquireManualTransferLockStep } from "./steps/acquire-manual-transfer-lock"
import { releaseManualTransferLockStep } from "./steps/release-manual-transfer-lock"
import { updateManualTransferPaymentDataStep } from "./steps/update-manual-transfer-payment-data"
import { validateManualTransferDeadlineStep } from "./steps/validate-manual-transfer-deadline"

export type ExpireManualTransferPaymentInput = {
  order_id: string
  payment_id: string
}

/**
 * The deadline passed and nothing arrived: the payment is marked "expired"
 * and the order is canceled with Medusa's own workflow, which cancels the
 * payment and releases the reserved stock. Payments with a proof waiting for
 * review or with part of the money received are left for an admin. If the
 * cancel fails (e.g. the order was already fulfilled), the data is restored.
 */
export const expireManualTransferPaymentWorkflow = createWorkflow(
  "expire-manual-transfer-payment",
  function (input: ExpireManualTransferPaymentInput) {
    const lockKey = transform({ input }, ({ input }) => paymentLockKey(input.payment_id))
    acquireManualTransferLockStep({ key: lockKey, timeout: 5, ttl: 60 })

    const transfer = validateManualTransferDeadlineStep(
      transform({ input }, ({ input }) => ({
        order_id: input.order_id,
        payment_id: input.payment_id,
        statuses: EXPIRABLE_STATUSES,
        due_before: new Date().toISOString(),
      }))
    )

    updateManualTransferPaymentDataStep(
      transform({ transfer }, ({ transfer }) => {
        const previous = transfer.payment.data as Record<string, unknown>
        return {
          payment_id: transfer.payment.id,
          previous_data: previous,
          data: {
            ...previous,
            status: MANUAL_TRANSFER_STATUS.EXPIRED,
            history: appendHistory(
              previous,
              historyEntry(HISTORY_EVENT.EXPIRED, { details: { expires_at: previous.expires_at } })
            ),
          },
        }
      })
    )

    // Cancels the payment through the provider (which keeps "expired") and releases the stock
    cancelOrderWorkflow.runAsStep({
      input: transform({ transfer }, ({ transfer }) => ({ order_id: transfer.order.id })),
    })

    emitEventStep({
      eventName: MANUAL_TRANSFER_EVENTS.PAYMENT_EXPIRED,
      data: transform({ transfer }, ({ transfer }) => ({ id: transfer.payment.id, order_id: transfer.order.id })),
    })
    releaseManualTransferLockStep({ key: lockKey })

    return new WorkflowResponse(transfer)
  }
)
