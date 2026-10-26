import { acquireLockStep, emitEventStep, releaseLockStep } from "@medusajs/medusa/core-flows"
import { createWorkflow, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import {
  appendHistory,
  HISTORY_EVENT,
  historyEntry,
  MANUAL_TRANSFER_EVENTS,
  MANUAL_TRANSFER_STATUS,
  paymentLockKey,
} from "../lib/payment-data"
import { ProofMimeType } from "../lib/proof-file"
import { createManualTransferProofStep } from "./steps/create-manual-transfer-proof"
import { loadManualTransferOrderStep } from "./steps/load-manual-transfer-order"
import { updateManualTransferPaymentDataStep } from "./steps/update-manual-transfer-payment-data"
import { validateManualTransferProofUploadStep } from "./steps/validate-manual-transfer-proof-upload"

export type UploadManualTransferProofInput = {
  order_id: string
  file: {
    content_base64: string
    filename: string
    mime_type: ProofMimeType
    size: number
    sha256: string
  }
  note?: string | null
  uploaded_by: "customer" | "guest"
  customer_id?: string | null
}

/**
 * A buyer sends a payment proof: it is stored privately, the payment moves to
 * "awaiting verification" with a history entry, and an event goes out for
 * notifications. Allowed while the payment awaits payment, was rejected or is
 * underpaid, so a rejected buyer can simply upload again.
 */
export const uploadManualTransferProofWorkflow = createWorkflow(
  "upload-manual-transfer-proof",
  function (input: UploadManualTransferProofInput) {
    const located = loadManualTransferOrderStep({ order_id: input.order_id })
    const lockKey = transform({ located }, ({ located }) => paymentLockKey(located.payment.id))
    acquireLockStep({ key: lockKey, timeout: 5, ttl: 30 })

    const transfer = validateManualTransferProofUploadStep({ order_id: input.order_id })

    const proofInput = transform({ input, transfer }, ({ input, transfer }) => ({
      order_id: transfer.order.id,
      payment_id: transfer.payment.id,
      reference: transfer.payment.data.reference ?? null,
      file: input.file,
      uploaded_by: input.uploaded_by,
      customer_id: input.customer_id ?? null,
      note: input.note ?? null,
    }))
    const proof = createManualTransferProofStep(proofInput)

    const dataInput = transform({ input, transfer, proof }, ({ input, transfer, proof }) => {
      const previous = transfer.payment.data as Record<string, unknown>
      return {
        payment_id: transfer.payment.id,
        previous_data: previous,
        data: {
          ...previous,
          status: MANUAL_TRANSFER_STATUS.AWAITING_VERIFICATION,
          history: appendHistory(
            previous,
            historyEntry(HISTORY_EVENT.PROOF_UPLOADED, {
              actor_type: input.uploaded_by,
              actor_id: input.customer_id ?? null,
              note: input.note ?? null,
              details: {
                proof_id: proof.id,
                filename: proof.filename,
                ...(proof.duplicate_of_order_id ? { duplicate_of_order_id: proof.duplicate_of_order_id } : {}),
              },
            })
          ),
        },
      }
    })
    updateManualTransferPaymentDataStep(dataInput)

    emitEventStep({
      eventName: MANUAL_TRANSFER_EVENTS.PROOF_UPLOADED,
      data: transform({ proof }, ({ proof }) => ({ id: proof.id, order_id: proof.order_id })),
    })
    releaseLockStep({ key: lockKey })

    return new WorkflowResponse(proof)
  }
)
