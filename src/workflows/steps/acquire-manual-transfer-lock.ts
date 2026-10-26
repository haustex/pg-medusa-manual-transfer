import { MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { setTimeout as sleep } from "timers/promises"
import { resolvePaymentLocking } from "../../lib/locking"

export type AcquireManualTransferLockInput = {
  key: string
  /** Seconds to keep retrying while someone else holds the lock */
  timeout: number
  /** Seconds after which the lock expires on its own */
  ttl: number
}

const RETRY_MS = 300

/**
 * Takes a payment lock through the Locking Module, or the in-process fallback
 * when the app has none (see src/lib/locking.ts). Rollback releases it.
 */
export const acquireManualTransferLockStep = createStep(
  "acquire-manual-transfer-lock",
  async (input: AcquireManualTransferLockInput, { container }) => {
    const locking = resolvePaymentLocking(container)
    const until = Date.now() + input.timeout * 1000
    while (true) {
      try {
        await locking.acquire(input.key, { expire: input.ttl })
        break
      } catch {
        if (Date.now() >= until) {
          throw new MedusaError(
            MedusaError.Types.CONFLICT,
            "Another change to this payment is in progress, try again in a moment"
          )
        }
      }
      await sleep(RETRY_MS)
    }
    return new StepResponse(undefined, input.key)
  },
  async (key, { container }) => {
    if (!key) {
      return
    }
    await resolvePaymentLocking(container).release(key)
  }
)
