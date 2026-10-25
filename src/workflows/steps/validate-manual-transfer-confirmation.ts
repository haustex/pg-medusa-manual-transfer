import { MathBN, MedusaError, Modules } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import {
  CONFIRMABLE_STATUSES,
  isManualTransferProviderId,
  ManualTransferStatus,
} from "../../lib/payment-data"

export type ValidateManualTransferConfirmationInput = {
  payment_id: string
  amount_received: number
  /** Confirm although less than the amount due arrived (e.g. bank fees the store absorbs) */
  accept_shortfall?: boolean
}

export type ValidatedManualTransferPayment = {
  id: string
  amount: number
  currency_code: string
  data: Record<string, unknown>
}

export const validateManualTransferConfirmationStep = createStep(
  "validate-manual-transfer-confirmation",
  async (input: ValidateManualTransferConfirmationInput, { container }) => {
    const paymentModule = container.resolve(Modules.PAYMENT)
    // Throws NOT_FOUND for an unknown id
    const payment = await paymentModule.retrievePayment(input.payment_id, {
      select: ["id", "amount", "currency_code", "provider_id", "data", "captured_at", "canceled_at"],
    })
    if (!isManualTransferProviderId(payment.provider_id)) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Payment ${payment.id} was not made by manual bank transfer`
      )
    }
    const data = (payment.data ?? {}) as Record<string, unknown>
    const status = data.status as ManualTransferStatus
    if (payment.canceled_at || payment.captured_at || !CONFIRMABLE_STATUSES.includes(status)) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Payment ${payment.id} cannot be confirmed (status: ${payment.captured_at ? "captured" : status ?? "unknown"})`
      )
    }
    if (MathBN.lt(input.amount_received, payment.amount) && !input.accept_shortfall) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Received ${input.amount_received} is less than the ${MathBN.convert(payment.amount).toString()} due. ` +
          "Check the bank statement, or confirm with accept_shortfall if the store absorbs the difference."
      )
    }
    return new StepResponse<ValidatedManualTransferPayment>({
      id: payment.id,
      amount: MathBN.convert(payment.amount).toNumber(),
      currency_code: payment.currency_code,
      data,
    })
  }
)
