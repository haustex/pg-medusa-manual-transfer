import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import EmailPreviewNotificationService from "./service"

export default ModuleProvider(Modules.NOTIFICATION, {
  services: [EmailPreviewNotificationService],
})
