import type { MedusaContainer } from "@medusajs/framework/types"
import { MathBN, MedusaError, Modules } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import {
  CONFIRMABLE_STATUSES,
  isManualTransferProviderId,
  ManualTransferStatus,
  receivedSoFar,
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
  /** Earlier partial transfers plus this one */
  total_received: number
}

/**
 * Reads a manual-transfer payment that still waits for money (not captured,
 * not canceled, in a confirmable status) and adds `amount_received` to what
 * earlier partial transfers brought in.
 */
export async function loadConfirmablePayment(
  container: MedusaContainer,
  paymentId: string,
  amountReceived: number
): Promise<ValidatedManualTransferPayment> {
  const paymentModule = container.resolve(Modules.PAYMENT)
  // Throws NOT_FOUND for an unknown id
  const payment = await paymentModule.retrievePayment(paymentId, {
    select: ["id", "amount", "currency_code", "provider_id", "data", "captured_at", "canceled_at"],
  })
  if (!isManualTransferProviderId(payment.provider_id)) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, `Payment ${payment.id} was not made by manual bank transfer`)
  }
  const data = (payment.data ?? {}) as Record<string, unknown>
  const status = data.status as ManualTransferStatus
  if (payment.canceled_at || payment.captured_at || !CONFIRMABLE_STATUSES.includes(status)) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      `Payment ${payment.id} cannot be confirmed (status: ${payment.captured_at ? "captured" : status ?? "unknown"})`
    )
  }
  return {
    id: payment.id,
    amount: MathBN.convert(payment.amount).toNumber(),
    currency_code: payment.currency_code,
    data,
    total_received: MathBN.add(receivedSoFar(data), amountReceived).toNumber(),
  }
}

export const validateManualTransferConfirmationStep = createStep(
  "validate-manual-transfer-confirmation",
  async (input: ValidateManualTransferConfirmationInput, { container }) => {
    const payment = await loadConfirmablePayment(container, input.payment_id, input.amount_received)
    // Partial transfers recorded as "underpaid" count towards the amount due
    if (MathBN.lt(payment.total_received, payment.amount) && !input.accept_shortfall) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Received ${payment.total_received} in total is less than the ${payment.amount} due. ` +
          "Check the bank statement, or confirm with accept_shortfall if the store absorbs the difference."
      )
    }
    return new StepResponse<ValidatedManualTransferPayment>(payment)
  }
)
