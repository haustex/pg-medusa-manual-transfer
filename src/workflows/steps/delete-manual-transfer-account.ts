import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { MANUAL_TRANSFER_MODULE } from "../../modules/manualTransfer"
import ManualTransferModuleService from "../../modules/manualTransfer/service"

/**
 * Soft-deletes an account. Orders placed earlier keep their snapshot of it in
 * the payment data, so their instructions do not change.
 */
export const deleteManualTransferAccountStep = createStep(
  "delete-manual-transfer-account",
  async (id: string, { container }) => {
    const service: ManualTransferModuleService = container.resolve(MANUAL_TRANSFER_MODULE)
    // Throws NOT_FOUND for an unknown id
    await service.retrieveManualTransferAccount(id)
    await service.softDeleteManualTransferAccounts(id)
    return new StepResponse(id, id)
  },
  async (id, { container }) => {
    if (!id) {
      return
    }
    const service: ManualTransferModuleService = container.resolve(MANUAL_TRANSFER_MODULE)
    await service.restoreManualTransferAccounts(id)
  }
)
