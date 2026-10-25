import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { deleteManualTransferAccountWorkflow } from "../../../../../workflows/delete-manual-transfer-account"
import { updateManualTransferAccountWorkflow } from "../../../../../workflows/update-manual-transfer-account"
import { ACCOUNT_FIELDS } from "../route"
import { PostAdminUpdateAccountType } from "../validators"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [account],
  } = await query.graph({
    entity: "manual_transfer_account",
    fields: ACCOUNT_FIELDS,
    filters: { id: req.params.id },
  })
  if (!account) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Bank account ${req.params.id} not found`)
  }
  res.json({ account })
}

export async function POST(
  req: AuthenticatedMedusaRequest<PostAdminUpdateAccountType>,
  res: MedusaResponse
) {
  const { result } = await updateManualTransferAccountWorkflow(req.scope).run({
    input: { ...req.validatedBody, id: req.params.id },
  })
  res.json({ account: result })
}

export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  await deleteManualTransferAccountWorkflow(req.scope).run({
    input: { id: req.params.id },
  })
  res.json({ id: req.params.id, object: "manual_transfer_account", deleted: true })
}
