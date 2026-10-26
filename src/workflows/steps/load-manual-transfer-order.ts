import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { loadOrderTransfer, OrderTransfer } from "../../lib/order-transfer"

/** Reads an order and its manual-transfer payment (NOT_FOUND otherwise) */
export const loadManualTransferOrderStep = createStep(
  "load-manual-transfer-order",
  async (input: { order_id: string }, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    return new StepResponse<OrderTransfer>(await loadOrderTransfer(query, input.order_id))
  }
)
