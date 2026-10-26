import { emitEventStep } from "@medusajs/medusa/core-flows"
import { createWorkflow, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { MathBN } from "@medusajs/framework/utils"
import {
  appendHistory,
  HISTORY_EVENT,
  historyEntry,
  MANUAL_TRANSFER_EVENTS,
  MANUAL_TRANSFER_STATUS,
  ManualTransferReceipt,
  paymentLockKey,
} from "../lib/payment-data"
import { acquireManualTransferLockStep } from "./steps/acquire-manual-transfer-lock"
import { releaseManualTransferLockStep } from "./steps/release-manual-transfer-lock"
import { reviewManualTransferProofsStep } from "./steps/review-manual-transfer-proofs"
import { updateManualTransferPaymentDataStep } from "./steps/update-manual-transfer-payment-data"
import { validateManualTransferUnderpaymentStep } from "./steps/validate-manual-transfer-underpayment"

export type RecordManualTransferUnderpaymentInput = {
  payment_id: string
  amount_received: number
  /** YYYY-MM-DD the money arrived according to the bank statement */
  received_at: string
  bank_reference?: string | null
  note?: string | null
  actor_id?: string
}

/**
 * An admin saw less than the amount due arrive: the transfer is recorded as a
 * receipt, the payment goes to "underpaid" with the remaining amount in its
 * history, and the buyer may upload a proof of the rest. A pending proof is
 * accepted, since it showed a real transfer. Nothing is captured until an
 * admin confirms the payment.
 */
export const recordManualTransferUnderpaymentWorkflow = createWorkflow(
  "record-manual-transfer-underpayment",
  function (input: RecordManualTransferUnderpaymentInput) {
    const lockKey = transform({ input }, ({ input }) => paymentLockKey(input.payment_id))
    acquireManualTransferLockStep({ key: lockKey, timeout: 5, ttl: 30 })

    const payment = validateManualTransferUnderpaymentStep({
      payment_id: input.payment_id,
      amount_received: input.amount_received,
    })

    const data = updateManualTransferPaymentDataStep(
      transform({ input, payment }, ({ input, payment }) => {
        const previous = payment.data
        const now = new Date()
        const receipt: ManualTransferReceipt = {
          amount: input.amount_received,
          received_at: input.received_at,
          bank_reference: input.bank_reference ?? null,
          note: input.note ?? null,
          recorded_by: input.actor_id ?? null,
          recorded_at: now.toISOString(),
        }
        const receipts = Array.isArray(previous.receipts) ? (previous.receipts as ManualTransferReceipt[]) : []
        return {
          payment_id: payment.id,
          previous_data: previous,
          data: {
            ...previous,
            status: MANUAL_TRANSFER_STATUS.UNDERPAID,
            receipts: [...receipts, receipt],
            history: appendHistory(
              previous,
              historyEntry(HISTORY_EVENT.UNDERPAID, {
                at: now,
                actor_type: "user",
                actor_id: input.actor_id ?? null,
                note: input.note ?? null,
                details: {
                  amount_received: input.amount_received,
                  received_at: input.received_at,
                  bank_reference: input.bank_reference ?? null,
                  total_received: payment.total_received,
                  remaining: MathBN.sub(payment.amount, payment.total_received).toNumber(),
                },
              })
            ),
          },
        }
      })
    )

    reviewManualTransferProofsStep(
      transform({ input }, ({ input }) => ({
        payment_id: input.payment_id,
        status: "accepted" as const,
        reviewed_by: input.actor_id ?? null,
      }))
    )

    emitEventStep({
      eventName: MANUAL_TRANSFER_EVENTS.PAYMENT_UNDERPAID,
      data: transform({ input }, ({ input }) => ({ id: input.payment_id })),
    })
    releaseManualTransferLockStep({ key: lockKey })

    return new WorkflowResponse(data)
  }
)
