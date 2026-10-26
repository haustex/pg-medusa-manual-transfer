import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { loadOrderTransfer, OrderTransfer } from "../../lib/order-transfer"
import { ManualTransferStatus } from "../../lib/payment-data"

export type ValidateManualTransferDeadlineInput = {
  order_id: string
  payment_id: string
  statuses: readonly ManualTransferStatus[]
  /** The deadline must be at or before this time (ISO) */
  due_before: string
  /** …and after this one (ISO), if given */
  due_after?: string
  /** Refuse when a reminder was already sent */
  not_reminded?: boolean
}

/**
 * Under the payment lock, re-checks what a job found: the order's current
 * manual-transfer payment is this one, still open, in one of `statuses`, with
 * its deadline in the window. NOT_ALLOWED otherwise, which the jobs skip.
 */
export const validateManualTransferDeadlineStep = createStep(
  "validate-manual-transfer-deadline",
  async (input: ValidateManualTransferDeadlineInput, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const transfer = await loadOrderTransfer(query, input.order_id)
    const { order, payment } = transfer
    const data = payment.data
    const expiresAt = data.expires_at ? Date.parse(data.expires_at) : NaN
    const problem =
      payment.id !== input.payment_id
        ? "is no longer the order's payment"
        : order.status === "canceled" || payment.canceled_at || payment.captured_at
          ? "is closed"
          : !data.status || !input.statuses.includes(data.status)
            ? `is ${data.status ?? "without status"}`
            : !(expiresAt <= Date.parse(input.due_before)) ||
                (input.due_after !== undefined && !(expiresAt > Date.parse(input.due_after)))
              ? "is not due"
              : input.not_reminded && data.reminded_at
                ? "was already reminded"
                : null
    if (problem) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, `Payment ${input.payment_id} ${problem}`)
    }
    return new StepResponse<OrderTransfer>(transfer)
  }
)
