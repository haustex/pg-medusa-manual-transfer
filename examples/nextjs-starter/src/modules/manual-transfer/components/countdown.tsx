"use client"

import { fill, formatDeadline, TransferLocale, labelsFor } from "@lib/manual-transfer/labels"
import { Text } from "@medusajs/ui"
import { useEffect, useState } from "react"

const pad = (n: number) => String(n).padStart(2, "0")

/**
 * The deadline in the buyer's own time zone and a live countdown. Both are
 * rendered in the browser only (the server does not know the buyer's zone).
 */
export default function Countdown({ expiresAt, locale }: { expiresAt: string; locale: TransferLocale }) {
  const t = labelsFor(locale)
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const left = now === null ? null : new Date(expiresAt).getTime() - now
  let remaining = ""
  if (left !== null && left > 0) {
    const seconds = Math.floor(left / 1000)
    remaining = fill(t.countdown, {
      days: Math.floor(seconds / 86400),
      hours: pad(Math.floor((seconds % 86400) / 3600)),
      minutes: pad(Math.floor((seconds % 3600) / 60)),
      seconds: pad(seconds % 60),
    })
  }

  return (
    <div className="grid grid-cols-1 small:grid-cols-2 gap-4" data-testid="transfer-deadline">
      <div className="flex flex-col gap-y-1">
        <Text className="txt-small text-ui-fg-subtle">{t.deadline}</Text>
        <Text className="txt-medium-plus text-ui-fg-base">{now === null ? "…" : formatDeadline(expiresAt, locale)}</Text>
      </div>
      <div className="flex flex-col gap-y-1">
        <Text className="txt-small text-ui-fg-subtle">{t.timeLeft}</Text>
        {left !== null && left <= 0 ? (
          <Text className="txt-medium-plus text-ui-fg-error">{t.deadlinePassed}</Text>
        ) : (
          <Text className="txt-medium-plus text-ui-fg-base tabular-nums" data-testid="transfer-countdown">
            {remaining || "…"}
          </Text>
        )}
      </div>
    </div>
  )
}
