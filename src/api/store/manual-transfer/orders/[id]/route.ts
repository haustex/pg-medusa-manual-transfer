import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { loadOrderTransfer } from "../../../../../lib/order-transfer"
import { buyerAccess, buyerView } from "../../../../manual-transfer-http"

/**
 * Payment instructions and proof status of an order, for the customer who
 * placed it (logged in) or a guest holding the upload token
 * (`x-manual-transfer-token` header or `?token=`).
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const transfer = await loadOrderTransfer(query, req.params.id)
  buyerAccess(req, transfer)
  const { data: proofs } = await query.graph({
    entity: "manual_transfer_proof",
    fields: ["id", "filename", "mime_type", "size", "status", "rejection_reason", "created_at"],
    filters: { order_id: transfer.order.id },
    pagination: { order: { created_at: "DESC" } },
  })
  res.json({ manual_transfer: buyerView(transfer, proofs) })
}
