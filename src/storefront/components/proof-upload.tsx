"use client"

import { FormEvent, useRef, useState } from "react"
import { labelsFor, TransferLocale } from "../labels"
import { resolveTheme, ThemeOverrides } from "../theme"

const MAX_BYTES = 5 * 1024 * 1024
const ACCEPT = ["image/jpeg", "image/png", "application/pdf"]

export type ProofUploadProps = {
  /** The storefront's own route that forwards the upload to the backend (see api.ts `postProof`) */
  uploadUrl: string
  /** The guest upload token; null for a logged-in customer */
  token: string | null
  locale: TransferLocale
  /** A proof was rejected or part of the money is missing */
  again: boolean
  theme?: ThemeOverrides
  /** After a successful upload, e.g. to reload the page's data */
  onUploaded?: () => void
}

/** The error text for the storefront route's (= the backend's) answer */
function errorFor(status: number, l: ReturnType<typeof labelsFor>) {
  if (status === 413) return l.errorSize
  if (status === 429) return l.errorTooMany
  if (status === 400) return l.errorType
  return l.errorGeneric
}

/**
 * The proof-of-transfer form (multipart `file`, `note`, and `token` for
 * guests). The backend checks the real file type (magic bytes) and size again;
 * the checks here only spare the buyer a round trip.
 */
export default function ProofUpload({ uploadUrl, token, locale, again, theme, onUploaded }: ProofUploadProps) {
  const l = labelsFor(locale)
  const t = resolveTheme(theme)
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    const file = input.current?.files?.[0]
    if (!file || (file.type && !ACCEPT.includes(file.type))) {
      return setError(l.errorType)
    }
    if (file.size > MAX_BYTES) {
      return setError(l.errorSize)
    }
    const form = new FormData(event.currentTarget)
    if (token) {
      form.set("token", token)
    }
    setBusy(true)
    try {
      const response = await fetch(uploadUrl, { method: "POST", body: form })
      if (!response.ok) {
        return setError(errorFor(response.status, l))
      }
      setDone(true)
      onUploaded?.()
    } catch {
      setError(l.errorGeneric)
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className={t.success} data-testid="proof-uploaded">
        <p className={t.text}>{l.uploaded}</p>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-y-4" data-testid="proof-upload-form">
      <div className="flex flex-col gap-y-1">
        <h2 className={t.heading}>{l.uploadTitle}</h2>
        <p className={t.subtle}>{again ? l.uploadAgainHint : l.uploadHint}</p>
      </div>
      <label className="flex flex-col gap-y-2">
        <span className={t.text}>{l.file}</span>
        <input
          ref={input}
          type="file"
          name="file"
          required
          accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
          className={t.fileInput}
          data-testid="proof-file-input"
        />
      </label>
      <label className="flex flex-col gap-y-2">
        <span className={t.text}>{l.note}</span>
        <textarea
          name="note"
          maxLength={500}
          rows={2}
          placeholder={l.notePlaceholder}
          className={t.textarea}
          data-testid="proof-note-input"
        />
      </label>
      {error && (
        <p className={t.error} role="alert" data-testid="proof-upload-error">
          {error}
        </p>
      )}
      <div>
        <button type="submit" disabled={busy} aria-busy={busy} className={t.button} data-testid="proof-upload-button">
          {busy ? l.uploading : l.upload}
        </button>
      </div>
    </form>
  )
}
