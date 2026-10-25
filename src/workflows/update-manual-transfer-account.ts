import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import {
  updateManualTransferAccountStep,
  UpdateManualTransferAccountInput,
} from "./steps/update-manual-transfer-account"

export const updateManualTransferAccountWorkflow = createWorkflow(
  "update-manual-transfer-account",
  function (input: UpdateManualTransferAccountInput) {
    return new WorkflowResponse(updateManualTransferAccountStep(input))
  }
)
