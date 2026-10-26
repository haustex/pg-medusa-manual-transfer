import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { rejectManualTransferProofWorkflow } from "../../../../../../workflows/reject-manual-transfer-proof"
import { PROOF_FIELDS, pickFields } from "../../../../../manual-transfer-http"
import { PostAdminRejectProofType } from "../../validators"

export async function POST(
  req: AuthenticatedMedusaRequest<PostAdminRejectProofType>,
  res: MedusaResponse
) {
  const { result } = await rejectManualTransferProofWorkflow(req.scope).run({
    input: {
      proof_id: req.params.id,
      reason: req.validatedBody.reason,
      actor_id: req.auth_context.actor_id,
    },
  })
  res.json({ proof: pickFields(result as Record<string, unknown>, PROOF_FIELDS) })
}
