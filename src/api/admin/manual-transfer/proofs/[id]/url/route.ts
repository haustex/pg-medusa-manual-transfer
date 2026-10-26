import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { getSigningSecret } from "../../../../../../lib/plugin-options"
import { signProofPath } from "../../../../../../lib/tokens"

/**
 * A link to view a proof, valid for 5 minutes. The path is relative to the
 * backend URL; the file route checks only the signature, so the link also
 * works in a new tab or an <img>.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "manual_transfer_proof",
    fields: ["id", "file_deleted_at"],
    filters: { id: req.params.id },
  })
  if (!data[0]) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Proof ${req.params.id} not found`)
  }
  if (data[0].file_deleted_at) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "The file of this proof was deleted under the proof retention setting"
    )
  }
  const { path, expires_at } = signProofPath(getSigningSecret(req.scope), data[0].id)
  res.json({ url: path, expires_at })
}
