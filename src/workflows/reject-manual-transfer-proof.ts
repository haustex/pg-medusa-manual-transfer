import { emitEventStep } from "@medusajs/medusa/core-flows"
import { createWorkflow, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import {
  appendHistory,
  HISTORY_EVENT,
  historyEntry,
  MANUAL_TRANSFER_EVENTS,
  MANUAL_TRANSFER_STATUS,
  paymentLockKey,
} from "../lib/payment-data"
import { acquireManualTransferLockStep } from "./steps/acquire-manual-transfer-lock"
import { loadManualTransferProofStep } from "./steps/load-manual-transfer-proof"
import { releaseManualTransferLockStep } from "./steps/release-manual-transfer-lock"
import { reviewManualTransferProofsStep } from "./steps/review-manual-transfer-proofs"
import { updateManualTransferPaymentDataStep } from "./steps/update-manual-transfer-payment-data"
import { validateManualTransferProofRejectionStep } from "./steps/validate-manual-transfer-proof-rejection"

export type RejectManualTransferProofInput = {
  proof_id: string
  /** Shown to the buyer; required */
  reason: string
  actor_id?: string
}

/**
 * An admin rejects a pending proof with a reason. The payment goes to
 * "rejected", which lets the buyer upload a new proof.
 */
export const rejectManualTransferProofWorkflow = createWorkflow(
  "reject-manual-transfer-proof",
  function (input: RejectManualTransferProofInput) {
    const located = loadManualTransferProofStep({ proof_id: input.proof_id })
    const lockKey = transform({ located }, ({ located }) => paymentLockKey(located.payment_id))
    acquireManualTransferLockStep({ key: lockKey, timeout: 5, ttl: 30 })

    const validated = validateManualTransferProofRejectionStep({ proof_id: input.proof_id })

    const reviewed = reviewManualTransferProofsStep(
      transform({ input }, ({ input }) => ({
        proof_ids: [input.proof_id],
        status: "rejected" as const,
        rejection_reason: input.reason,
        reviewed_by: input.actor_id ?? null,
      }))
    )

    updateManualTransferPaymentDataStep(
      transform({ input, validated }, ({ input, validated }) => {
        const previous = validated.transfer.payment.data as Record<string, unknown>
        return {
          payment_id: validated.transfer.payment.id,
          previous_data: previous,
          data: {
            ...previous,
            status: MANUAL_TRANSFER_STATUS.REJECTED,
            history: appendHistory(
              previous,
              historyEntry(HISTORY_EVENT.PROOF_REJECTED, {
                actor_type: "user",
                actor_id: input.actor_id ?? null,
                note: input.reason,
                details: { proof_id: input.proof_id },
              })
            ),
          },
        }
      })
    )

    emitEventStep({
      eventName: MANUAL_TRANSFER_EVENTS.PROOF_REJECTED,
      data: transform({ located }, ({ located }) => ({ id: located.id, order_id: located.order_id })),
    })
    releaseManualTransferLockStep({ key: lockKey })

    return new WorkflowResponse(transform({ reviewed }, ({ reviewed }) => reviewed[0]))
  }
)
