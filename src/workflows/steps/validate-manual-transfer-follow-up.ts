import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { loadOrderTransfer, OrderTransfer } from "../../lib/order-transfer"
import { followUpSince } from "../../lib/overdue"

export type ValidateManualTransferFollowUpInput = {
  order_id: string
  payment_id: string
  /** status and status_since the job saw; the payment must still be in that wait */
  status: string
  status_since: string
}

/**
 * Under the payment lock, re-checks what the deadlines job found: the payment
 * still waits for an admin since the same moment, and the admins were not told
 * about this wait yet. NOT_ALLOWED otherwise, which the job skips.
 */
export const validateManualTransferFollowUpStep = createStep(
  "validate-manual-transfer-follow-up",
  async (input: ValidateManualTransferFollowUpInput, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const transfer = await loadOrderTransfer(query, input.order_id)
    const { order, payment } = transfer
    const since = followUpSince(payment.data)
    const remindedAt = payment.data.admin_reminded_at
    const problem =
      payment.id !== input.payment_id
        ? "is no longer the order's payment"
        : order.status === "canceled" || payment.canceled_at || payment.captured_at
          ? "is closed"
          : payment.data.status !== input.status || !since || Date.parse(since) !== Date.parse(input.status_since)
            ? "changed since"
            : remindedAt && Date.parse(remindedAt) >= Date.parse(since)
              ? "was already reported to the admins"
              : null
    if (problem) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, `Payment ${input.payment_id} ${problem}`)
    }
    return new StepResponse<OrderTransfer>(transfer)
  }
)
