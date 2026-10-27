"use client"

import { CheckMini, SquareTwoStack } from "@medusajs/icons"
import { useState } from "react"

/** Copies `value` to the clipboard; falls back to a hidden textarea where the Clipboard API is missing (plain http) */
export default function CopyButton({
  value,
  label,
  copiedLabel,
  "data-testid": testId,
}: {
  value: string
  label: string
  copiedLabel: string
  "data-testid"?: string
}) {
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
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-x-1 rounded-md border border-ui-border-base bg-ui-bg-base px-2 py-1 txt-compact-small-plus text-ui-fg-subtle hover:bg-ui-bg-base-hover hover:text-ui-fg-base shrink-0"
      aria-label={`${label}: ${value}`}
      data-testid={testId}
    >
      {copied ? <CheckMini /> : <SquareTwoStack />}
      <span aria-live="polite">{copied ? copiedLabel : label}</span>
    </button>
  )
}
