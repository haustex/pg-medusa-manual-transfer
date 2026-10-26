import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { MANUAL_TRANSFER_MODULE } from "../../modules/manualTransfer"
import ManualTransferModuleService from "../../modules/manualTransfer/service"

/** Reads a proof's ids (NOT_FOUND for an unknown id) */
export const loadManualTransferProofStep = createStep(
  "load-manual-transfer-proof",
  async (input: { proof_id: string }, { container }) => {
    const service: ManualTransferModuleService = container.resolve(MANUAL_TRANSFER_MODULE)
    const proof = await service.retrieveManualTransferProof(input.proof_id, {
      select: ["id", "order_id", "payment_id"],
    })
    return new StepResponse({ id: proof.id, order_id: proof.order_id, payment_id: proof.payment_id })
  }
)
