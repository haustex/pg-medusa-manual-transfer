import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { MANUAL_TRANSFER_MODULE } from "../../modules/manualTransfer"
import ManualTransferModuleService from "../../modules/manualTransfer/service"

export type ReviewManualTransferProofsInput = {
  /** Specific proofs, or every pending proof of `payment_id` */
  proof_ids?: string[]
  payment_id?: string
  status: "accepted" | "rejected"
  rejection_reason?: string | null
  reviewed_by: string | null
}

type Previous = {
  id: string
  status: "pending" | "accepted" | "rejected"
  rejection_reason: string | null
  reviewed_by: string | null
  reviewed_at: Date | null
}

/** Marks proofs accepted or rejected; rollback restores their earlier review state */
export const reviewManualTransferProofsStep = createStep(
  "review-manual-transfer-proofs",
  async (input: ReviewManualTransferProofsInput, { container }) => {
    const service: ManualTransferModuleService = container.resolve(MANUAL_TRANSFER_MODULE)
    const filters = input.proof_ids
      ? { id: input.proof_ids }
      : { payment_id: input.payment_id, status: "pending" as const }
    const previous = (await service.listManualTransferProofs(filters, {
      select: ["id", "status", "rejection_reason", "reviewed_by", "reviewed_at"],
    })) as Previous[]
    if (!previous.length) {
      return new StepResponse([], [] as Previous[])
    }
    const updated = await service.updateManualTransferProofs(
      previous.map((proof) => ({
        id: proof.id,
        status: input.status,
        rejection_reason: input.status === "rejected" ? input.rejection_reason ?? null : null,
        reviewed_by: input.reviewed_by,
        reviewed_at: new Date(),
      }))
    )
    return new StepResponse(updated, previous)
  },
  async (previous, { container }) => {
    if (!previous?.length) {
      return
    }
    const service: ManualTransferModuleService = container.resolve(MANUAL_TRANSFER_MODULE)
    await service.updateManualTransferProofs(previous)
  }
)
