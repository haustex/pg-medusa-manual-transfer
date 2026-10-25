import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import {
  createManualTransferAccountStep,
  CreateManualTransferAccountInput,
} from "./steps/create-manual-transfer-account"

export const createManualTransferAccountWorkflow = createWorkflow(
  "create-manual-transfer-account",
  function (input: CreateManualTransferAccountInput) {
    return new WorkflowResponse(createManualTransferAccountStep(input))
  }
)
