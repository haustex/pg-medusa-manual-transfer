import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import ManualTransferProviderService from "./service"

export default ModuleProvider(Modules.PAYMENT, {
  services: [ManualTransferProviderService],
})
