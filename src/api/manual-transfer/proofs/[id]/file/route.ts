import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { MANUAL_TRANSFER_MODULE } from "../../../../../modules/manualTransfer"
import ManualTransferModuleService from "../../../../../modules/manualTransfer/service"
import { getSigningSecret } from "../../../../../lib/plugin-options"
import { verifyProofSignature } from "../../../../../lib/tokens"

/**
 * Serves a proof to whoever holds a fresh signed link from
 * GET /admin/manual-transfer/proofs/:id/url. Outside /admin so it opens in a
 * new tab without auth headers; the 5-minute signature is the access check.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { expires, signature } = req.query
  if (!verifyProofSignature(getSigningSecret(req.scope), req.params.id, expires, signature)) {
    res.status(403).json({ type: "forbidden", message: "This link is invalid or has expired" })
    return
  }
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "manual_transfer_proof",
    fields: ["id", "file_id", "filename", "mime_type", "size", "file_deleted_at"],
    filters: { id: req.params.id },
  })
  const proof = data[0]
  if (!proof) {
    res.status(404).json({ type: "not_found", message: "Not found" })
    return
  }
  if (proof.file_deleted_at) {
    res.status(410).json({ type: "not_found", message: "This file was deleted under the proof retention setting" })
    return
  }
  // The content column is only read here, through the module service
  const service: ManualTransferModuleService = req.scope.resolve(MANUAL_TRANSFER_MODULE)
  const file = await service.retrieveManualTransferProofFile(proof.file_id, { select: ["id", "content"] })
  const body = Buffer.from(file.content, "base64")

  res.setHeader("Content-Type", proof.mime_type)
  res.setHeader("Content-Length", String(body.length))
  res.setHeader(
    "Content-Disposition",
    `inline; filename="${proof.filename.replace(/[^\x20-\x7e]|"/g, "_")}"`
  )
  res.setHeader("Cache-Control", "private, no-store")
  res.setHeader("X-Content-Type-Options", "nosniff")
  res.setHeader("Referrer-Policy", "no-referrer")
  res.setHeader("Cross-Origin-Resource-Policy", "same-site")
  // Images get a locked-down sandbox; Chrome refuses to show PDFs in a sandboxed document
  res.setHeader(
    "Content-Security-Policy",
    proof.mime_type === "application/pdf"
      ? "default-src 'none'; object-src 'self'"
      : "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox"
  )
  res.status(200).end(body)
}
