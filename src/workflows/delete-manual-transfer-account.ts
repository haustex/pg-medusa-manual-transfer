import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { deleteManualTransferAccountStep } from "./steps/delete-manual-transfer-account"

export const deleteManualTransferAccountWorkflow = createWorkflow(
  "delete-manual-transfer-account",
  function (input: { id: string }) {
    return new WorkflowResponse(deleteManualTransferAccountStep(input.id))
  }
)
