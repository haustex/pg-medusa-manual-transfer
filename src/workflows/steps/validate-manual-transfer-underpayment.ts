import { MathBN, MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { loadConfirmablePayment, ValidatedManualTransferPayment } from "./validate-manual-transfer-confirmation"

/** Under the payment lock: the payment still waits for money and this transfer leaves part of it unpaid */
export const validateManualTransferUnderpaymentStep = createStep(
  "validate-manual-transfer-underpayment",
  async (input: { payment_id: string; amount_received: number }, { container }) => {
    const payment = await loadConfirmablePayment(container, input.payment_id, input.amount_received)
    if (!MathBN.lt(payment.total_received, payment.amount)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Received ${payment.total_received} in total covers the ${payment.amount} due: confirm the payment instead`
      )
    }
    return new StepResponse<ValidatedManualTransferPayment>(payment)
  }
)
