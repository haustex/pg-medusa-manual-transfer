import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { MANUAL_TRANSFER_MODULE } from "../../modules/manualTransfer"
import ManualTransferModuleService from "../../modules/manualTransfer/service"
import { loadOrderTransfer } from "../../lib/order-transfer"
import { MANUAL_TRANSFER_STATUS } from "../../lib/payment-data"

/** Under the payment lock: the proof is still pending and the payment is waiting for its review */
export const validateManualTransferProofRejectionStep = createStep(
  "validate-manual-transfer-proof-rejection",
  async (input: { proof_id: string }, { container }) => {
    const service: ManualTransferModuleService = container.resolve(MANUAL_TRANSFER_MODULE)
    const proof = await service.retrieveManualTransferProof(input.proof_id, {
      select: ["id", "order_id", "payment_id", "status"],
    })
    if (proof.status !== "pending") {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, `Proof ${proof.id} was already ${proof.status}`)
    }
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const transfer = await loadOrderTransfer(query, proof.order_id)
    if (
      transfer.payment.id !== proof.payment_id ||
      transfer.payment.data.status !== MANUAL_TRANSFER_STATUS.AWAITING_VERIFICATION
    ) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `The payment of proof ${proof.id} is not awaiting verification`
      )
    }
    return new StepResponse({ proof, transfer })
  }
)
