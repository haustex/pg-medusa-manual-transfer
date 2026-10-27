"use client"

import { useState } from "react"
import { cx, resolveTheme, ThemeOverrides } from "../theme"
import { CheckIcon, CopyIcon } from "./icons"

/** Copies `value` to the clipboard; falls back to a hidden textarea where the Clipboard API is missing (plain http) */
export default function CopyButton({
  value,
  label,
  copiedLabel,
  theme,
  "data-testid": testId,
}: {
  value: string
  label: string
  copiedLabel: string
  theme?: ThemeOverrides
  "data-testid"?: string
}) {
  const t = resolveTheme(theme)
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      const area = document.createElement("textarea")
      area.value = value
      area.setAttribute("readonly", "")
      area.style.position = "fixed"
      area.style.opacity = "0"
      document.body.appendChild(area)
      area.select()
      document.execCommand("copy")
      area.remove()
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button type="button" onClick={copy} className={cx(t.copyButton)} aria-label={`${label}: ${value}`} data-testid={testId}>
      {copied ? <CheckIcon /> : <CopyIcon />}
      <span aria-live="polite">{copied ? copiedLabel : label}</span>
    </button>
  )
}
