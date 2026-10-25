import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { updateManualTransferAccountWorkflow } from "../../../../../workflows/update-manual-transfer-account"
import { PostAdminUpdateAccountType } from "../validators"

export async function POST(
  req: AuthenticatedMedusaRequest<PostAdminUpdateAccountType>,
  res: MedusaResponse
) {
  const { result } = await updateManualTransferAccountWorkflow(req.scope).run({
    input: { ...req.validatedBody, id: req.params.id },
  })
  res.json({ account: result })
}
