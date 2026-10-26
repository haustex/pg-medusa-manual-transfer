import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { loadTransferDocument } from "../../../../../../lib/notifications/context"
import { sendInvoice } from "../../../../../manual-transfer-invoice"

/** The order's pro-forma invoice (PDF), as the buyer gets it */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  await sendInvoice(req, res, await loadTransferDocument(req.scope, req.params.id))
}
