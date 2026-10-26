import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { resolvePaymentLocking } from "../../lib/locking"

/** Releases a lock taken by acquireManualTransferLockStep */
export const releaseManualTransferLockStep = createStep(
  "release-manual-transfer-lock",
  async (input: { key: string }, { container }) => {
    return new StepResponse(await resolvePaymentLocking(container).release(input.key))
  }
)
