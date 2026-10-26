import { emitEventStep } from "@medusajs/medusa/core-flows"
import { createWorkflow, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import {
  appendHistory,
  HISTORY_EVENT,
  historyEntry,
  MANUAL_TRANSFER_EVENTS,
  paymentLockKey,
  REMINDABLE_STATUSES,
} from "../lib/payment-data"
import { acquireManualTransferLockStep } from "./steps/acquire-manual-transfer-lock"
import { releaseManualTransferLockStep } from "./steps/release-manual-transfer-lock"
import { updateManualTransferPaymentDataStep } from "./steps/update-manual-transfer-payment-data"
import { validateManualTransferDeadlineStep } from "./steps/validate-manual-transfer-deadline"

export type RemindManualTransferPaymentInput = {
  order_id: string
  payment_id: string
  /** Remind when the deadline is within this many hours. Default 24. */
  within_hours?: number
}

/**
 * Once per payment, when its deadline is near and the buyer still owes the
 * money: notes `reminded_at` and a history entry, and emits
 * manual_transfer.payment_reminder for a notification subscriber.
 */
export const remindManualTransferPaymentWorkflow = createWorkflow(
  "remind-manual-transfer-payment",
  function (input: RemindManualTransferPaymentInput) {
    const lockKey = transform({ input }, ({ input }) => paymentLockKey(input.payment_id))
    acquireManualTransferLockStep({ key: lockKey, timeout: 5, ttl: 30 })

    const transfer = validateManualTransferDeadlineStep(
      transform({ input }, ({ input }) => {
        const now = Date.now()
        return {
          order_id: input.order_id,
          payment_id: input.payment_id,
          statuses: REMINDABLE_STATUSES,
          due_before: new Date(now + (input.within_hours ?? 24) * 3600_000).toISOString(),
          due_after: new Date(now).toISOString(),
          not_reminded: true,
        }
      })
    )

    updateManualTransferPaymentDataStep(
      transform({ transfer }, ({ transfer }) => {
        const previous = transfer.payment.data as Record<string, unknown>
        const now = new Date()
        return {
          payment_id: transfer.payment.id,
          previous_data: previous,
          data: {
            ...previous,
            reminded_at: now.toISOString(),
            history: appendHistory(
              previous,
              historyEntry(HISTORY_EVENT.REMINDER_SENT, { at: now, details: { expires_at: previous.expires_at } })
            ),
          },
        }
      })
    )

    emitEventStep({
      eventName: MANUAL_TRANSFER_EVENTS.PAYMENT_REMINDER,
      data: transform({ transfer }, ({ transfer }) => ({
        id: transfer.payment.id,
        order_id: transfer.order.id,
        expires_at: transfer.payment.data.expires_at ?? null,
      })),
    })
    releaseManualTransferLockStep({ key: lockKey })

    return new WorkflowResponse(transfer)
  }
)
