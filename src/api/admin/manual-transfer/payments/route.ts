import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { countTransfersByStatus, listTransfers } from "../../../../lib/transfer-queue"
import { GetAdminTransfers } from "./validators"

/**
 * The verification queue: manual-transfer payments with their order, newest
 * first, optionally of one status and matching a reference, e-mail or order
 * number. `counts` has the number of payments per status for the tabs.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const parsed = GetAdminTransfers.safeParse(req.query)
  if (!parsed.success) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, parsed.error.issues.map((i) => i.message).join("; "))
  }
  const { status, q, limit, offset } = parsed.data
  const pg = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const [{ rows, count }, counts] = await Promise.all([
    listTransfers(pg, { statuses: status ? [status] : undefined, q, limit, offset }),
    countTransfersByStatus(pg),
  ])
  res.json({ payments: rows, count, limit, offset, counts })
}
