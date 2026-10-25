import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { loadOrderTransfer } from "../../../../../lib/order-transfer"

/** The manual-transfer payment of an order, with its history, for the order page widget */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { order, payment } = await loadOrderTransfer(query, req.params.id)
  res.json({ order_id: order.id, payment })
}
