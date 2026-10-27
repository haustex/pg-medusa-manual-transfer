"use client"

import { labelsFor, TransferLocale } from "@lib/manual-transfer/labels"
import { isManualTransfer } from "@lib/manual-transfer/types"
import { HttpTypes } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

/** On the account's order page: a link to the payment instructions of a bank-transfer order */
export default function OrderTransferLink({ order, locale = "en" }: { order: HttpTypes.StoreOrder; locale?: TransferLocale }) {
  const payment = order.payment_collections?.[0]?.payments?.[0] ?? order.payment_collections?.[0]?.payment_sessions?.[0]
  if (!isManualTransfer(payment?.provider_id)) {
    return null
  }
  return (
    <LocalizedClientLink
      href={`/transfer/${order.id}`}
      className="txt-medium-plus text-ui-fg-interactive hover:text-ui-fg-interactive-hover"
      data-testid="order-transfer-link"
    >
      {labelsFor(locale).instructionsLink} →
    </LocalizedClientLink>
  )
}
