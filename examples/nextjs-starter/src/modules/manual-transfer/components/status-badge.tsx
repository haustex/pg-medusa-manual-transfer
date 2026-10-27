import { labelsFor, TransferLocale } from "@lib/manual-transfer/labels"
import type { TransferStatus } from "@lib/manual-transfer/types"
import { Badge } from "@medusajs/ui"

const COLORS: Record<TransferStatus, "green" | "orange" | "red" | "grey" | "blue"> = {
  awaiting_payment: "orange",
  awaiting_verification: "blue",
  paid: "green",
  underpaid: "orange",
  rejected: "red",
  expired: "grey",
  canceled: "grey",
}

export default function StatusBadge({ status, locale }: { status: TransferStatus; locale: TransferLocale }) {
  return (
    <Badge color={COLORS[status]} size="base" data-testid="transfer-status">
      {labelsFor(locale).status[status]}
    </Badge>
  )
}
