import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getPluginOptions, getProofRetentionDays } from "../../../../lib/plugin-options"

/** Plugin settings the Admin pages need */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const options = getPluginOptions(req.scope)
  res.json({
    show_credit: options.showCredit !== false,
    proof_retention_days: getProofRetentionDays(req.scope),
  })
}
