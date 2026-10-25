import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createManualTransferAccountWorkflow } from "../../../../workflows/create-manual-transfer-account"
import { PostAdminCreateAccountType } from "./validators"

export const ACCOUNT_FIELDS = [
  "id",
  "label",
  "bank_name",
  "account_holder",
  "account_number",
  "swift_code",
  "bank_address",
  "currency_code",
  "region_ids",
  "is_active",
  "rank",
  "created_at",
  "updated_at",
]

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: accounts } = await query.graph({
    entity: "manual_transfer_account",
    fields: ACCOUNT_FIELDS,
    pagination: { order: { rank: "ASC", created_at: "ASC" } },
  })
  res.json({ accounts })
}

export async function POST(
  req: AuthenticatedMedusaRequest<PostAdminCreateAccountType>,
  res: MedusaResponse
) {
  const { result } = await createManualTransferAccountWorkflow(req.scope).run({
    input: req.validatedBody,
  })
  res.status(201).json({ account: result })
}
