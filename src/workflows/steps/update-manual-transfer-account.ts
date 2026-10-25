import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { MANUAL_TRANSFER_MODULE } from "../../modules/manualTransfer"
import ManualTransferModuleService from "../../modules/manualTransfer/service"
import { CreateManualTransferAccountInput } from "./create-manual-transfer-account"

export type UpdateManualTransferAccountInput = Partial<CreateManualTransferAccountInput> & { id: string }

const FIELDS = [
  "label",
  "bank_name",
  "account_holder",
  "account_number",
  "swift_code",
  "bank_address",
  "currency_code",
  "region_ids",
  "is_active",
  "rank",
] as const

export const updateManualTransferAccountStep = createStep(
  "update-manual-transfer-account",
  async (input: UpdateManualTransferAccountInput, { container }) => {
    const service: ManualTransferModuleService = container.resolve(MANUAL_TRANSFER_MODULE)
    // Throws NOT_FOUND for an unknown id
    const previous = await service.retrieveManualTransferAccount(input.id)
    const account = await service.updateManualTransferAccounts(input)
    const restore: UpdateManualTransferAccountInput = { id: previous.id }
    for (const key of FIELDS) {
      if (key in input) {
        Object.assign(restore, { [key]: previous[key] })
      }
    }
    return new StepResponse(account, restore)
  },
  async (restore, { container }) => {
    if (!restore) {
      return
    }
    const service: ManualTransferModuleService = container.resolve(MANUAL_TRANSFER_MODULE)
    await service.updateManualTransferAccounts(restore)
  }
)
