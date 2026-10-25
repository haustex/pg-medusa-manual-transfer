import type { IPaymentModuleService, UpdatePaymentDTO } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { MANUAL_TRANSFER_STATUS, ManualTransferConfirmation } from "../../lib/payment-data"

export type MarkManualTransferPaidInput = {
  payment_id: string
  /** payment.data as read before the change, restored on rollback */
  previous_data: Record<string, unknown>
  confirmation: ManualTransferConfirmation
}

/**
 * UpdatePaymentDTO only declares `id`, but updatePayment passes the whole
 * object to the payment repository, so `data` is written as well.
 */
function writePaymentData(paymentModule: IPaymentModuleService, id: string, data: Record<string, unknown>) {
  return paymentModule.updatePayment({ id, data } as UpdatePaymentDTO)
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
