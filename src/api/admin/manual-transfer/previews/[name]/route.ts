import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { renderInvoicePdf } from "../../../../../lib/invoice"
import { loadStoreIdentity } from "../../../../../lib/notifications/context"
import { renderSample, sampleDocument } from "../../../../../lib/notifications/sample"
import { ADMIN_TEMPLATES, BUYER_TEMPLATES, TemplateName } from "../../../../../lib/notifications/templates"
import { getNotificationOptions } from "../../../../../lib/plugin-options"

const NAMES: readonly string[] = [...BUYER_TEMPLATES, ...ADMIN_TEMPLATES]

/**
 * One e-mail (`:name` = template name) or the invoice (`invoice`), rendered
 * with a made-up order and the store's real identity and templates, to check
 * them without sending anything. ?locale=en|id.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const locale = req.query.locale === "id" ? "id" : "en"
  const name = req.params.name
  const store = await loadStoreIdentity(req.scope)
  res.setHeader("Cache-Control", "private, no-store")
  res.setHeader("X-Content-Type-Options", "nosniff")

  if (name === "invoice") {
    const pdf = await renderInvoicePdf(req.scope, sampleDocument(store), locale)
    res.setHeader("Content-Type", "application/pdf")
    res.setHeader("Content-Disposition", 'inline; filename="invoice-preview.pdf"')
    return res.status(200).end(pdf)
  }
  if (!NAMES.includes(name)) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `No e-mail template ${name}`)
  }
  const email = renderSample(req.scope, store, name as TemplateName, locale, {
    templatesDir: getNotificationOptions(req.scope).templatesDir,
  })
  res.setHeader("Content-Type", "text/html; charset=utf-8")
  res.setHeader("Content-Security-Policy", "default-src 'none'; img-src * data:; style-src 'unsafe-inline'; sandbox")
  res.status(200).send(email.html)
}
