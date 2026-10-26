import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { loadOrderTransfer } from "../../../../../lib/order-transfer"
import { receivedSoFar } from "../../../../../lib/payment-data"
import { PROOF_FIELDS } from "../../../../manual-transfer-http"

/**
 * The manual-transfer payment of an order, with its history and proofs, for
 * the order page widget. `users` names the admins who appear in the history.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { order, payment } = await loadOrderTransfer(query, req.params.id)
  const { data: proofs } = await query.graph({
    entity: "manual_transfer_proof",
    fields: [...PROOF_FIELDS],
    filters: { order_id: order.id },
    pagination: { order: { created_at: "DESC" } },
  })

  const userIds = new Set<string>()
  for (const entry of payment.data.history ?? []) {
    if (entry.actor_type === "user" && entry.actor_id) {
      userIds.add(entry.actor_id)
    }
  }
  for (const proof of proofs) {
    if (proof.reviewed_by) {
      userIds.add(proof.reviewed_by)
    }
  }
  const { data: users } = userIds.size
    ? await query.graph({
        entity: "user",
        fields: ["id", "email", "first_name", "last_name"],
        filters: { id: [...userIds] },
        withDeleted: true,
      })
    : { data: [] }

  res.json({
    order_id: order.id,
    order_status: order.status,
    payment,
    amount_received: receivedSoFar(payment.data),
    proofs,
    users: Object.fromEntries(
      users.map((u) => [
        u.id,
        { email: u.email, name: [u.first_name, u.last_name].filter(Boolean).join(" ") || null },
      ])
    ),
  })
}
