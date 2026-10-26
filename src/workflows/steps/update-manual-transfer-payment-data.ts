import type { IPaymentModuleService, UpdatePaymentDTO } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

export type UpdateManualTransferPaymentDataInput = {
  payment_id: string
  /** payment.data as read before the change, restored on rollback */
  previous_data: Record<string, unknown>
  data: Record<string, unknown>
}

/**
 * UpdatePaymentDTO only declares `id`, but updatePayment passes the whole
 * object to the payment repository, so `data` is written as well.
 */
export function writePaymentData(
  paymentModule: IPaymentModuleService,
  id: string,
  data: Record<string, unknown>
) {
  return paymentModule.updatePayment({ id, data } as UpdatePaymentDTO)
}

/** Replaces payment.data; callers run it under the payment's lock */
export const updateManualTransferPaymentDataStep = createStep(
  "update-manual-transfer-payment-data",
  async (input: UpdateManualTransferPaymentDataInput, { container }) => {
    await writePaymentData(container.resolve(Modules.PAYMENT), input.payment_id, input.data)
    return new StepResponse(input.data, { id: input.payment_id, data: input.previous_data })
  },
  async (restore, { container }) => {
    if (!restore) {
      return
    }
    await writePaymentData(container.resolve(Modules.PAYMENT), restore.id, restore.data)
  }
)
