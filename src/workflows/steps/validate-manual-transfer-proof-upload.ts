import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { loadOrderTransfer, OrderTransfer } from "../../lib/order-transfer"
import { ManualTransferStatus, UPLOADABLE_STATUSES } from "../../lib/payment-data"

/**
 * Re-reads the order under the payment lock and checks it still takes a
 * proof: not canceled, not paid, and not already waiting for a review.
 */
export const validateManualTransferProofUploadStep = createStep(
  "validate-manual-transfer-proof-upload",
  async (input: { order_id: string }, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const transfer = await loadOrderTransfer(query, input.order_id)
    const { order, payment } = transfer
    const status = payment.data.status as ManualTransferStatus | undefined
    if (order.status === "canceled" || payment.canceled_at || payment.captured_at) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "This order no longer accepts payment proofs")
    }
    if (!status || !UPLOADABLE_STATUSES.includes(status)) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        status === "awaiting_verification"
          ? "A payment proof is already waiting for review"
          : `This payment does not accept proofs (status: ${status ?? "unknown"})`
      )
    }
    return new StepResponse<OrderTransfer>(transfer)
  }
)
