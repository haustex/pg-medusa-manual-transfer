import {
  acquireLockStep,
  capturePaymentWorkflow,
  emitEventStep,
  releaseLockStep,
} from "@medusajs/medusa/core-flows"
import { createWorkflow, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { MANUAL_TRANSFER_EVENTS, ManualTransferConfirmation, paymentLockKey } from "../lib/payment-data"
import { markManualTransferPaidStep } from "./steps/mark-manual-transfer-paid"
import { reviewManualTransferProofsStep } from "./steps/review-manual-transfer-proofs"
import { validateManualTransferConfirmationStep } from "./steps/validate-manual-transfer-confirmation"

export type ConfirmManualTransferPaymentInput = {
  payment_id: string
  amount_received: number
  /** YYYY-MM-DD the money arrived according to the bank statement */
  received_at: string
  bank_reference?: string | null
  note?: string | null
  accept_shortfall?: boolean
  /** Admin user confirming */
  actor_id?: string
}

/**
 * The only way a manual transfer gets captured: an admin who checked the bank
 * statement confirms it, the confirmation is written to the payment data, and
 * Medusa's capture runs (marking the order paid), and a pending proof is
 * accepted. If anything fails, the payment data is restored.
 */
export const confirmManualTransferPaymentWorkflow = createWorkflow(
  "confirm-manual-transfer-payment",
  function (input: ConfirmManualTransferPaymentInput) {
    const lockKey = transform({ input }, ({ input }) => paymentLockKey(input.payment_id))
    acquireLockStep({ key: lockKey, timeout: 5, ttl: 30 })

    const payment = validateManualTransferConfirmationStep(input)

    const markInput = transform({ input, payment }, ({ input, payment }) => {
      const confirmation: ManualTransferConfirmation = {
        amount_received: input.amount_received,
        received_at: input.received_at,
        bank_reference: input.bank_reference ?? null,
        note: input.note ?? null,
        confirmed_by: input.actor_id ?? null,
        confirmed_at: new Date().toISOString(),
      }
      return { payment_id: payment.id, previous_data: payment.data, confirmation }
    })
    markManualTransferPaidStep(markInput)

    const captured = capturePaymentWorkflow.runAsStep({
      input: transform({ input }, ({ input }) => ({
        payment_id: input.payment_id,
        captured_by: input.actor_id,
      })),
    })

    // A proof waiting for review is accepted along with the payment
    reviewManualTransferProofsStep(
      transform({ input }, ({ input }) => ({
        payment_id: input.payment_id,
        status: "accepted" as const,
        reviewed_by: input.actor_id ?? null,
      }))
    )

    emitEventStep({
      eventName: MANUAL_TRANSFER_EVENTS.PAYMENT_CONFIRMED,
      data: transform({ input }, ({ input }) => ({ id: input.payment_id })),
    })
    releaseLockStep({ key: lockKey })

    return new WorkflowResponse(captured)
  }
)
