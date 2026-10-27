import type { ComponentType } from "react"
import { fill, formatMoney, labelsFor, plainAmount, TransferLabels, TransferLocale } from "../labels"
import { cx, resolveTheme, ThemeOverrides, TransferTheme } from "../theme"
import type { TransferView as Transfer } from "../types"
import CopyButton from "./copy-button"
import Countdown from "./countdown"
import { DownloadIcon } from "./icons"
import ProofUpload, { ProofUploadProps } from "./proof-upload"
import StatusBadge from "./status-badge"

/** Statuses in which the buyer still has to transfer money */
const OWES = ["awaiting_payment", "underpaid", "rejected"]

function Row({
  label,
  value,
  copy,
  mono,
  testId,
  l,
  t,
  theme,
}: {
  label: string
  value: string | null | undefined
  copy?: boolean
  mono?: boolean
  testId: string
  l: TransferLabels
  t: TransferTheme
  theme?: ThemeOverrides
}) {
  if (!value) {
    return null
  }
  return (
    <div className={t.row}>
      <p className={t.rowLabel}>{label}</p>
      <div className="flex flex-1 items-center justify-between gap-x-3 min-w-0">
        <p className={cx(t.rowValue, mono && t.mono)} data-testid={testId}>
          {value}
        </p>
        {copy && <CopyButton value={value} label={l.copy} copiedLabel={l.copied} theme={theme} data-testid={`${testId}-copy`} />}
      </div>
    </div>
  )
}

export type TransferViewProps = {
  transfer: Transfer
  /** The guest upload token from the link; null for a logged-in customer */
  token: string | null
  locale: TransferLocale
  /** The storefront route that forwards the upload (multipart POST) */
  uploadUrl: string
  /** The storefront route that forwards the invoice PDF, with the token if any */
  invoiceUrl: string
  theme?: ThemeOverrides
  /** Replaces the upload form, e.g. a client wrapper that refreshes the page afterwards */
  Upload?: ComponentType<ProofUploadProps>
}

/**
 * The payment page: status, exact amount, bank details with copy buttons,
 * reference, deadline countdown, invoice download, proof upload and the
 * proofs sent so far. Plain React: works as a server component (the
 * interactive parts are client components) and carries the store's look only.
 */
export default function TransferView({
  transfer,
  token,
  locale,
  uploadUrl,
  invoiceUrl,
  theme,
  Upload = ProofUpload,
}: TransferViewProps) {
  const l = labelsFor(locale)
  const t = resolveTheme(theme)
  const status = transfer.status ?? "awaiting_payment"
  const owes = OWES.includes(status)
  const due = transfer.amount_received > 0 ? transfer.amount_remaining : transfer.amount
  const money = (amount: number) => formatMoney(amount, transfer.currency_code, locale)
  const account = transfer.account
  const row = { l, t, theme }

  return (
    <div className={t.page} data-testid="transfer-page">
      <div className={t.inner}>
        <div className="flex flex-col gap-y-3">
          <p className={t.subtle} data-testid="transfer-order-number">
            {fill(l.order, { number: transfer.display_id ? `#${transfer.display_id}` : transfer.order_id })}
            {transfer.reference && ` · ${l.reference}: ${transfer.reference}`}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className={t.title}>{l.title}</h1>
            <StatusBadge status={status} locale={locale} theme={theme} />
          </div>
          <p className={t.subtle} data-testid="transfer-status-text">
            {l.statusText[status]}
          </p>
        </div>

        {owes && (
          <>
            <div className={cx(t.card, "gap-y-2")}>
              <p className={t.small}>{l.amountToPay}</p>
              {transfer.amount_received > 0 && (
                <p className={t.subtle}>
                  {fill(l.amountRemaining, { received: money(transfer.amount_received), total: money(transfer.amount) })}
                </p>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className={t.amount} data-testid="transfer-amount">
                  {money(due)}
                </span>
                <CopyButton
                  value={plainAmount(due, transfer.currency_code)}
                  label={l.copy}
                  copiedLabel={l.copied}
                  theme={theme}
                  data-testid="transfer-amount-copy"
                />
              </div>
              <p className={t.muted}>{fill(l.amountExact, { currency: transfer.currency_code.toUpperCase() })}</p>
            </div>

            <div className={t.card}>
              <h2 className={cx(t.heading, "mb-2")}>{l.payTo}</h2>
              <Row {...row} label={l.bank} value={account?.bank_name} testId="transfer-bank" />
              <Row {...row} label={l.accountHolder} value={account?.account_holder} copy testId="transfer-holder" />
              <Row {...row} label={l.accountNumber} value={account?.account_number} copy mono testId="transfer-account-number" />
              <Row {...row} label={l.swift} value={account?.swift_code} copy mono testId="transfer-swift" />
              <Row {...row} label={l.bankAddress} value={account?.bank_address} testId="transfer-bank-address" />
              <Row {...row} label={l.currency} value={transfer.currency_code.toUpperCase()} testId="transfer-currency" />
              <Row {...row} label={l.reference} value={transfer.reference} copy mono testId="transfer-reference" />
              <p className={cx(t.small, "mt-3")}>{l.referenceHint}</p>
              <div className={cx(t.notice, "mt-4")} data-testid="transfer-fees-note">
                <p className={t.noticeText}>{l.feesNote}</p>
              </div>
            </div>

            {transfer.expires_at && (
              <div className={t.card}>
                <Countdown expiresAt={transfer.expires_at} locale={locale} theme={theme} />
              </div>
            )}
          </>
        )}

        <div>
          <a href={invoiceUrl} className={t.link} data-testid="transfer-invoice-link">
            <DownloadIcon />
            {l.invoice}
          </a>
        </div>

        {transfer.can_upload && (
          <div className={t.card}>
            <Upload uploadUrl={uploadUrl} token={token} locale={locale} again={status !== "awaiting_payment"} theme={theme} />
          </div>
        )}

        {transfer.proofs.length > 0 && (
          <div className="flex flex-col gap-y-2" data-testid="transfer-proofs">
            <h2 className={t.heading}>{l.proofs}</h2>
            <ul className="flex flex-col">
              {transfer.proofs.map((proof) => (
                <li key={proof.id} className={cx(t.row, "sm:flex-col sm:items-stretch")}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className={cx(t.text, "break-all")}>{proof.filename}</p>
                    <p className={t.small} data-testid="transfer-proof-status">
                      {l.proofStatus[proof.status]} ·{" "}
                      {new Date(proof.created_at).toLocaleDateString(locale === "id" ? "id-ID" : "en-US")}
                    </p>
                  </div>
                  {proof.status === "rejected" && proof.rejection_reason && (
                    <p className={t.error}>{fill(l.rejectedBecause, { reason: proof.rejection_reason })}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
