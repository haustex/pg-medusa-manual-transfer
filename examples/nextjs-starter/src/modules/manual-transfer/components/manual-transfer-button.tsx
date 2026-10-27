"use client"

import { placeManualTransferOrder } from "@lib/manual-transfer/data"
import { labelsFor, TransferLocale } from "@lib/manual-transfer/labels"
import { Button } from "@medusajs/ui"
import ErrorMessage from "@modules/checkout/components/error-message"
import { useState } from "react"

/**
 * "Place order" for bank transfers, used by the starter's PaymentButton:
 * places the order and continues to the payment instructions.
 */
export default function ManualTransferPaymentButton({
  notReady,
  locale = "en",
  "data-testid": testId = "submit-order-button",
}: {
  notReady: boolean
  locale?: TransferLocale
  "data-testid"?: string
}) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const place = async () => {
    setSubmitting(true)
    setError(null)
    // On success the action redirects; it only returns when the cart could not be completed
    await placeManualTransferOrder()
      .catch((err) => setError(err.message))
      .finally(() => setSubmitting(false))
  }

  return (
    <>
      <Button disabled={notReady} isLoading={submitting} onClick={place} size="large" data-testid={testId}>
        {labelsFor(locale).placeOrder}
      </Button>
      <ErrorMessage error={error} data-testid="manual-transfer-error-message" />
    </>
  )
}
