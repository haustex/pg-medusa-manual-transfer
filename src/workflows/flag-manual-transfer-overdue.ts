import { createWorkflow, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { paymentLockKey } from "../lib/payment-data"
import { acquireManualTransferLockStep } from "./steps/acquire-manual-transfer-lock"
import { releaseManualTransferLockStep } from "./steps/release-manual-transfer-lock"
import { updateManualTransferPaymentDataStep } from "./steps/update-manual-transfer-payment-data"
import { validateManualTransferFollowUpStep } from "./steps/validate-manual-transfer-follow-up"

export type FlagManualTransferOverdueInput = {
  order_id: string
  payment_id: string
  status: string
  status_since: string
}

/**
 * Notes `admin_reminded_at` on a payment that waits too long for an admin, so
 * the digest e-mail of the deadlines job mentions it once per wait. The job
 * emits manual_transfer.admin_overdue for all payments it flagged.
 */
export const flagManualTransferOverdueWorkflow = createWorkflow(
  "flag-manual-transfer-overdue",
  function (input: FlagManualTransferOverdueInput) {
    const lockKey = transform({ input }, ({ input }) => paymentLockKey(input.payment_id))
    acquireManualTransferLockStep({ key: lockKey, timeout: 5, ttl: 30 })

    const transfer = validateManualTransferFollowUpStep(input)

    updateManualTransferPaymentDataStep(
      transform({ transfer }, ({ transfer }) => {
        const previous = transfer.payment.data as Record<string, unknown>
        return {
          payment_id: transfer.payment.id,
          previous_data: previous,
          data: { ...previous, admin_reminded_at: new Date().toISOString() },
        }
      })
    )
    releaseManualTransferLockStep({ key: lockKey })

    return new WorkflowResponse(transfer)
  }
)
