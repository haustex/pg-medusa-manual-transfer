import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { loadOrderTransfer } from "../../../../../../lib/order-transfer"
import { getProofLimits } from "../../../../../../lib/plugin-options"
import { cleanFilename, detectProofType, sha256 } from "../../../../../../lib/proof-file"
import { uploadManualTransferProofWorkflow } from "../../../../../../workflows/upload-manual-transfer-proof"
import { BUYER_PROOF_FIELDS, buyerAccess, pickFields, tooManyRequests } from "../../../../../manual-transfer-http"

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Upload a payment proof (multipart, field `file`, optional `note`): JPG, PNG
 * or PDF up to 5 MB, recognised by content. The order's customer (logged in)
 * or a guest with the upload token may upload while the payment awaits
 * payment, was rejected or is underpaid.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const transfer = await loadOrderTransfer(query, req.params.id)
  const access = buyerAccess(req, transfer)

  // Per-order limit, counted in the database so it holds across instances
  const { perOrderPerDay } = getProofLimits(req.scope)
  const { metadata } = await query.graph({
    entity: "manual_transfer_proof",
    fields: ["id"],
    filters: { order_id: transfer.order.id, created_at: { $gte: new Date(Date.now() - DAY_MS) } },
    pagination: { take: 1, skip: 0 },
  })
  if ((metadata?.count ?? 0) >= perOrderPerDay) {
    return tooManyRequests(res, 3600, "Too many payment proofs for this order today, try again later")
  }

  const file = (req as unknown as { file?: { buffer: Buffer; originalname?: string } }).file
  if (!file?.buffer?.length) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Attach the payment proof as the `file` field")
  }
  const mimeType = detectProofType(file.buffer)
  if (!mimeType) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "The payment proof must be a JPG, PNG or PDF file")
  }
  const note = (req.body as Record<string, unknown> | undefined)?.note
  if (note !== undefined && (typeof note !== "string" || note.length > 500)) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "note must be text of at most 500 characters")
  }

  const { result } = await uploadManualTransferProofWorkflow(req.scope).run({
    input: {
      order_id: transfer.order.id,
      file: {
        content_base64: file.buffer.toString("base64"),
        filename: cleanFilename(file.originalname, mimeType),
        mime_type: mimeType,
        size: file.buffer.length,
        sha256: sha256(file.buffer),
      },
      note: typeof note === "string" && note.trim() ? note.trim() : null,
      uploaded_by: access.as,
      customer_id: access.as === "customer" ? access.customer_id : null,
    },
  })
  res.status(201).json({ proof: pickFields(result as Record<string, unknown>, BUYER_PROOF_FIELDS) })
}
