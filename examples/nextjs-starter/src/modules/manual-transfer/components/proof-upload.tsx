"use client"

import { labelsFor, TransferLocale } from "@lib/manual-transfer/labels"
import { Button, Heading, Text, Textarea } from "@medusajs/ui"
import { useRouter } from "next/navigation"
import { FormEvent, useRef, useState } from "react"

const MAX_BYTES = 5 * 1024 * 1024
const ACCEPT = ["image/jpeg", "image/png", "application/pdf"]

/**
 * The proof-of-transfer form. The backend checks the real file type (magic
 * bytes) and size again; the checks here only spare the buyer a round trip.
 */
export default function ProofUpload({
  orderId,
  token,
  locale,
  again,
}: {
  orderId: string
  token: string | null
  locale: TransferLocale
  /** A proof was rejected or part of the money is missing */
  again: boolean
}) {
  const t = labelsFor(locale)
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    const file = input.current?.files?.[0]
    if (!file || (file.type && !ACCEPT.includes(file.type))) {
      return setError(t.errorType)
    }
    if (file.size > MAX_BYTES) {
      return setError(t.errorSize)
    }
    const form = new FormData(event.currentTarget)
    if (token) {
      form.set("token", token)
    }
    setBusy(true)
    try {
      const response = await fetch(`/api/manual-transfer/${encodeURIComponent(orderId)}/proofs`, { method: "POST", body: form })
      if (!response.ok) {
        setError(
          response.status === 413
            ? t.errorSize
            : response.status === 429
              ? t.errorTooMany
              : response.status === 400
                ? t.errorType
                : t.errorGeneric
        )
        return
      }
      setDone(true)
      router.refresh()
    } catch {
      setError(t.errorGeneric)
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4" data-testid="proof-uploaded">
        <Text className="txt-medium text-ui-fg-base">{t.uploaded}</Text>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-y-4" data-testid="proof-upload-form">
      <div className="flex flex-col gap-y-1">
        <Heading level="h2" className="text-xl-semi">
          {t.uploadTitle}
        </Heading>
        <Text className="txt-medium text-ui-fg-subtle">{again ? t.uploadAgainHint : t.uploadHint}</Text>
      </div>
      <label className="flex flex-col gap-y-2">
        <span className="txt-compact-small-plus text-ui-fg-base">{t.file}</span>
        <input
          ref={input}
          type="file"
          name="file"
          required
          accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
          className="txt-compact-small text-ui-fg-subtle file:mr-3 file:rounded-md file:border file:border-ui-border-base file:bg-ui-bg-base file:px-3 file:py-1.5 file:txt-compact-small-plus file:text-ui-fg-base"
          data-testid="proof-file-input"
        />
      </label>
      <label className="flex flex-col gap-y-2">
        <span className="txt-compact-small-plus text-ui-fg-base">{t.note}</span>
        <Textarea name="note" maxLength={500} rows={2} placeholder={t.notePlaceholder} data-testid="proof-note-input" />
      </label>
      {error && (
        <Text className="txt-small text-ui-fg-error" role="alert" data-testid="proof-upload-error">
          {error}
        </Text>
      )}
      <div>
        <Button type="submit" size="large" isLoading={busy} disabled={busy} data-testid="proof-upload-button">
          {busy ? t.uploading : t.upload}
        </Button>
      </div>
    </form>
  )
}
