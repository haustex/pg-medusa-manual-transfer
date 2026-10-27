"use client"

import { useEffect, useState } from "react"
import { fill, formatDeadline, labelsFor, TransferLocale } from "../labels"
import { resolveTheme, ThemeOverrides } from "../theme"

const pad = (n: number) => String(n).padStart(2, "0")

/**
 * The deadline in the buyer's own time zone and a live countdown. Both are
 * rendered in the browser only (the server does not know the buyer's zone).
 */
export default function Countdown({
  expiresAt,
  locale,
  theme,
}: {
  expiresAt: string
  locale: TransferLocale
  theme?: ThemeOverrides
}) {
  const l = labelsFor(locale)
  const t = resolveTheme(theme)
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
    remaining = fill(l.countdown, {
      days: Math.floor(seconds / 86400),
      hours: pad(Math.floor((seconds % 86400) / 3600)),
      minutes: pad(Math.floor((seconds % 3600) / 60)),
      seconds: pad(seconds % 60),
    })
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" data-testid="transfer-deadline">
      <div className="flex flex-col gap-y-1">
        <p className={t.small}>{l.deadline}</p>
        <p className={t.rowValue}>{now === null ? "…" : formatDeadline(expiresAt, locale)}</p>
      </div>
      <div className="flex flex-col gap-y-1">
        <p className={t.small}>{l.timeLeft}</p>
        {left !== null && left <= 0 ? (
          <p className={t.error}>{l.deadlinePassed}</p>
        ) : (
          <p className={`${t.rowValue} tabular-nums`} data-testid="transfer-countdown">
            {remaining || "…"}
          </p>
        )}
      </div>
    </div>
  )
}
