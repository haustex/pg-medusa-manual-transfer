import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { MANUAL_TRANSFER_MODULE } from "../../modules/manualTransfer"
import ManualTransferModuleService from "../../modules/manualTransfer/service"
import { ProofMimeType } from "../../lib/proof-file"

export type CreateManualTransferProofInput = {
  order_id: string
  payment_id: string
  reference: string | null
  file: {
    content_base64: string
    filename: string
    mime_type: ProofMimeType
    size: number
    sha256: string
  }
  uploaded_by: "customer" | "guest"
  customer_id: string | null
  note: string | null
}

/** Stores the file and its proof record; flags a file already sent for another order */
export const createManualTransferProofStep = createStep(
  "create-manual-transfer-proof",
  async (input: CreateManualTransferProofInput, { container }) => {
    const service: ManualTransferModuleService = container.resolve(MANUAL_TRANSFER_MODULE)
    const [earlier] = await service.listManualTransferProofs(
      { sha256: input.file.sha256, order_id: { $ne: input.order_id } },
      { select: ["id", "order_id"], take: 1, order: { created_at: "ASC" } }
    )
    const file = await service.createManualTransferProofFiles({ content: input.file.content_base64 })
    const proof = await service.createManualTransferProofs({
      order_id: input.order_id,
      payment_id: input.payment_id,
      reference: input.reference,
      file_id: file.id,
      filename: input.file.filename,
      mime_type: input.file.mime_type,
      size: input.file.size,
      sha256: input.file.sha256,
      uploaded_by: input.uploaded_by,
      customer_id: input.customer_id,
      note: input.note,
      duplicate_of_order_id: earlier?.order_id ?? null,
    })
    return new StepResponse(proof, { proof_id: proof.id, file_id: file.id })
  },
  async (created, { container }) => {
    if (!created) {
      return
    }
    const service: ManualTransferModuleService = container.resolve(MANUAL_TRANSFER_MODULE)
    await service.deleteManualTransferProofs(created.proof_id)
    await service.deleteManualTransferProofFiles(created.file_id)
  }
)
