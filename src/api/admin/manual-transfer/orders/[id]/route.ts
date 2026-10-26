import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { loadOrderTransfer } from "../../../../../lib/order-transfer"
import { PROOF_FIELDS } from "../../../../manual-transfer-http"

/** The manual-transfer payment of an order, with its history and proofs, for the order page widget */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { order, payment } = await loadOrderTransfer(query, req.params.id)
  const { data: proofs } = await query.graph({
    entity: "manual_transfer_proof",
    fields: [...PROOF_FIELDS],
    filters: { order_id: order.id },
    pagination: { order: { created_at: "DESC" } },
  })
  res.json({ order_id: order.id, payment, proofs })
}
