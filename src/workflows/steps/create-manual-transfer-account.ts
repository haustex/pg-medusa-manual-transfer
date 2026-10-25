import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { MANUAL_TRANSFER_MODULE } from "../../modules/manualTransfer"
import ManualTransferModuleService from "../../modules/manualTransfer/service"

export type CreateManualTransferAccountInput = {
  label?: string | null
  bank_name: string
  account_holder: string
  account_number: string
  swift_code?: string | null
  bank_address?: string | null
  currency_code: string
  region_ids?: string[]
  is_active?: boolean
  rank?: number
}

export const createManualTransferAccountStep = createStep(
  "create-manual-transfer-account",
  async (input: CreateManualTransferAccountInput, { container }) => {
    const service: ManualTransferModuleService = container.resolve(MANUAL_TRANSFER_MODULE)
    const account = await service.createManualTransferAccounts(input)
    return new StepResponse(account, account.id)
  },
  async (id, { container }) => {
    if (!id) {
      return
    }
    const service: ManualTransferModuleService = container.resolve(MANUAL_TRANSFER_MODULE)
    await service.deleteManualTransferAccounts(id)
  }
)
