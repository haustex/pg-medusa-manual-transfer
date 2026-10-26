import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { MANUAL_TRANSFER_MODULE } from "../../modules/manualTransfer"
import ManualTransferModuleService from "../../modules/manualTransfer/service"

export type PurgeManualTransferProofFilesInput = { proofs: { proof_id: string; file_id: string }[] }

/**
 * Deletes the stored file contents of these proofs for good and stamps
 * `file_deleted_at`; the proof records (name, size, hash, review) stay. There
 * is nothing to roll back to, so this has no compensation.
 */
export const purgeManualTransferProofFilesStep = createStep(
  "purge-manual-transfer-proof-files",
  async (input: PurgeManualTransferProofFilesInput, { container }) => {
    if (!input.proofs.length) {
      return new StepResponse([] as string[])
    }
    const service: ManualTransferModuleService = container.resolve(MANUAL_TRANSFER_MODULE)
    const now = new Date()
    await service.updateManualTransferProofs(input.proofs.map((p) => ({ id: p.proof_id, file_deleted_at: now })))
    await service.deleteManualTransferProofFiles(input.proofs.map((p) => p.file_id))
    return new StepResponse(input.proofs.map((p) => p.proof_id))
  }
)
