import { Module } from "@medusajs/framework/utils"
import ManualTransferModuleService from "./service"

export const MANUAL_TRANSFER_MODULE = "manualTransfer"

export default Module(MANUAL_TRANSFER_MODULE, {
  service: ManualTransferModuleService,
})
