import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { confirmManualTransferPaymentWorkflow } from "../../../../../../workflows/confirm-manual-transfer-payment"
import { PostAdminConfirmPaymentType } from "../../validators"

export async function POST(
  req: AuthenticatedMedusaRequest<PostAdminConfirmPaymentType>,
  res: MedusaResponse
) {
  const { result } = await confirmManualTransferPaymentWorkflow(req.scope).run({
    input: {
      ...req.validatedBody,
      payment_id: req.params.id,
      actor_id: req.auth_context.actor_id,
    },
  })
  res.json({ payment: result })
}
