import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { loadTransferDocument } from "../../../../../../lib/notifications/context"
import { loadOrderTransfer } from "../../../../../../lib/order-transfer"
import { buyerAccess } from "../../../../../manual-transfer-http"
import { sendInvoice } from "../../../../../manual-transfer-invoice"

/**
 * The order's pro-forma invoice (PDF), for the customer who placed it or a
 * guest holding the upload token, like the payment instructions.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const transfer = await loadOrderTransfer(req.scope.resolve(ContainerRegistrationKeys.QUERY), req.params.id)
  buyerAccess(req, transfer)
  await sendInvoice(req, res, await loadTransferDocument(req.scope, transfer.order.id))
}
