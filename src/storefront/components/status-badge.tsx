import { labelsFor, TransferLocale } from "../labels"
import { cx, resolveTheme, ThemeOverrides } from "../theme"
import type { TransferStatus } from "../types"

const TONES: Record<TransferStatus, "green" | "orange" | "red" | "grey" | "blue"> = {
  awaiting_payment: "orange",
  awaiting_verification: "blue",
  paid: "green",
  underpaid: "orange",
  rejected: "red",
  expired: "grey",
  canceled: "grey",
}

export default function StatusBadge({
  status,
  locale,
  theme,
}: {
  status: TransferStatus
  locale: TransferLocale
  theme?: ThemeOverrides
}) {
  const t = resolveTheme(theme)
  return (
    <span className={cx(t.badge, t.badgeTone[TONES[status]])} data-testid="transfer-status">
      {labelsFor(locale).status[status]}
    </span>
  )
}
