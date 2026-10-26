import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { loadOrderTransfer } from "../../../../../../lib/order-transfer"
import { getSigningSecret } from "../../../../../../lib/plugin-options"
import { uploadToken } from "../../../../../../lib/tokens"

/** How long after checkout the cart id can still be traded for the upload token */
const WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * Right after checkout, the storefront still holds the cart id (Medusa's own
 * bearer secret for the cart) and can exchange it here for the order's upload
 * token, so a guest can upload a proof on the confirmation page. Later on the
 * token comes from the e-mail.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "cart",
    fields: ["id", "completed_at", "order.id"],
    filters: { id: req.params.id },
  })
  const cart = data[0] as { completed_at?: string | Date | null; order?: { id: string } | null } | undefined
  const completedAt = cart?.completed_at ? new Date(cart.completed_at).getTime() : 0
  if (!cart?.order?.id || !completedAt || Date.now() - completedAt > WINDOW_MS) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `No recent order for cart ${req.params.id}`)
  }
  // Only for orders paid by manual transfer (NOT_FOUND otherwise)
  const { order } = await loadOrderTransfer(query, cart.order.id)
  res.json({ order_id: order.id, token: uploadToken(getSigningSecret(req.scope), order.id) })
}
