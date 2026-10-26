import { Modules } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import {
  appendHistory,
  HISTORY_EVENT,
  historyEntry,
  MANUAL_TRANSFER_STATUS,
  ManualTransferConfirmation,
} from "../../lib/payment-data"
import { writePaymentData } from "./update-manual-transfer-payment-data"

export type MarkManualTransferPaidInput = {
  payment_id: string
  /** payment.data as read before the change, restored on rollback */
  previous_data: Record<string, unknown>
  confirmation: ManualTransferConfirmation
}

/**
 * Writes the admin's confirmation into payment.data. The provider only lets
 * capturePayment through once this is there.
 */
export const markManualTransferPaidStep = createStep(
  "mark-manual-transfer-paid",
  async (input: MarkManualTransferPaidInput, { container }) => {
    const paymentModule = container.resolve(Modules.PAYMENT)
    await writePaymentData(paymentModule, input.payment_id, {
      ...input.previous_data,
      status: MANUAL_TRANSFER_STATUS.PAID,
      confirmation: input.confirmation,
      history: appendHistory(
        input.previous_data,
        historyEntry(HISTORY_EVENT.CONFIRMED, {
          at: new Date(input.confirmation.confirmed_at),
          actor_type: "user",
          actor_id: input.confirmation.confirmed_by,
          note: input.confirmation.note,
          details: {
            amount_received: input.confirmation.amount_received,
            total_received: input.confirmation.total_received,
            received_at: input.confirmation.received_at,
            bank_reference: input.confirmation.bank_reference,
          },
        })
      ),
    })
    return new StepResponse(undefined, { id: input.payment_id, data: input.previous_data })
  },
  async (restore, { container }) => {
    if (!restore) {
      return
    }
    await writePaymentData(container.resolve(Modules.PAYMENT), restore.id, restore.data)
  }
)
