import { MedusaService } from "@medusajs/framework/utils"
import ManualTransferAccount from "./models/manual-transfer-account"

class ManualTransferModuleService extends MedusaService({
  ManualTransferAccount,
}) {}

export default ManualTransferModuleService
