import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import {
  PurgeManualTransferProofFilesInput,
  purgeManualTransferProofFilesStep,
} from "./steps/purge-manual-transfer-proof-files"

/** Deletes proof file contents under proofRetentionDays, keeping the proof records */
export const purgeManualTransferProofFilesWorkflow = createWorkflow(
  "purge-manual-transfer-proof-files",
  function (input: PurgeManualTransferProofFilesInput) {
    return new WorkflowResponse(purgeManualTransferProofFilesStep(input))
  }
)
