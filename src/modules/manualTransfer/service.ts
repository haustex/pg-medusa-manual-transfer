import { MedusaService } from "@medusajs/framework/utils"
import ManualTransferAccount from "./models/manual-transfer-account"
import ManualTransferReference from "./models/manual-transfer-reference"

class ManualTransferModuleService extends MedusaService({
  ManualTransferAccount,
  ManualTransferReference,
}) {}

export default ManualTransferModuleService
