import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { recordManualTransferUnderpaymentWorkflow } from "../../../../../../workflows/record-manual-transfer-underpayment"
import { PostAdminRecordUnderpaymentType } from "../../validators"

/** Records a partial transfer: the payment becomes "underpaid" and the buyer owes the rest */
export async function POST(
  req: AuthenticatedMedusaRequest<PostAdminRecordUnderpaymentType>,
  res: MedusaResponse
) {
  const { result } = await recordManualTransferUnderpaymentWorkflow(req.scope).run({
    input: {
      ...req.validatedBody,
      payment_id: req.params.id,
      actor_id: req.auth_context.actor_id,
    },
  })
  res.json({ payment: { id: req.params.id, data: result } })
}
