import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { invoiceFilename, renderInvoicePdf } from "../lib/invoice"
import { buyerLocale, TransferDocument } from "../lib/notifications/context"

/** Sends the pro-forma invoice PDF; ?locale=en|id picks the language */
export async function sendInvoice(req: MedusaRequest, res: MedusaResponse, doc: TransferDocument) {
  const requested = req.query.locale
  const locale = requested === "id" || requested === "en" ? requested : buyerLocale(req.scope, doc)
  const pdf = await renderInvoicePdf(req.scope, doc, locale)
  res.setHeader("Content-Type", "application/pdf")
  res.setHeader("Content-Disposition", `attachment; filename="${invoiceFilename(doc)}"`)
  res.setHeader("Content-Length", String(pdf.length))
  res.setHeader("Cache-Control", "private, no-store")
  res.setHeader("X-Content-Type-Options", "nosniff")
  res.status(200).end(pdf)
}
