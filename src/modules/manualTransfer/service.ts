import { MedusaService } from "@medusajs/framework/utils"
import ManualTransferAccount from "./models/manual-transfer-account"
import ManualTransferProof from "./models/manual-transfer-proof"
import ManualTransferProofFile from "./models/manual-transfer-proof-file"
import ManualTransferReference from "./models/manual-transfer-reference"

class ManualTransferModuleService extends MedusaService({
  ManualTransferAccount,
  ManualTransferReference,
  ManualTransferProof,
  ManualTransferProofFile,
}) {}

export default ManualTransferModuleService
