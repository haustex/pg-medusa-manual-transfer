import { fill, formatMoney, labelsFor, plainAmount, TransferLocale } from "@lib/manual-transfer/labels"
import type { TransferView } from "@lib/manual-transfer/types"
import { ArrowDownTray } from "@medusajs/icons"
import { Container, Heading, Text } from "@medusajs/ui"
import CopyButton from "../components/copy-button"
import Countdown from "../components/countdown"
import ProofUpload from "../components/proof-upload"
import StatusBadge from "../components/status-badge"

/** Statuses in which the buyer still has to transfer money */
const OWES = ["awaiting_payment", "underpaid", "rejected"]

function Row({
  label,
  value,
  copy,
  mono,
  testId,
  t,
}: {
  label: string
  value: string | null | undefined
  copy?: boolean
  mono?: boolean
  testId: string
  t: ReturnType<typeof labelsFor>
}) {
  if (!value) {
    return null
  }
  return (
    <div className="flex flex-col small:flex-row small:items-center gap-y-1 gap-x-4 py-3 border-b border-ui-border-base last:border-b-0">
      <Text className="txt-small text-ui-fg-subtle small:w-44 shrink-0">{label}</Text>
      <div className="flex flex-1 items-center justify-between gap-x-3 min-w-0">
        <Text
          className={`txt-medium-plus text-ui-fg-base break-words min-w-0 ${mono ? "font-mono tracking-wide" : ""}`}
          data-testid={testId}
        >
          {value}
        </Text>
        {copy && <CopyButton value={value} label={t.copy} copiedLabel={t.copied} data-testid={`${testId}-copy`} />}
      </div>
    </div>
  )
}

/**
 * The payment page: status, exact amount, bank details with copy buttons,
 * reference, deadline countdown, invoice download, proof upload and the
 * proofs sent so far. Carries the store's own look only.
 */
export default function TransferTemplate({
  transfer,
  token,
  locale,
}: {
  transfer: TransferView
  token: string | null
  locale: TransferLocale
}) {
  const t = labelsFor(locale)
  const status = transfer.status ?? "awaiting_payment"
  const owes = OWES.includes(status)
  const due = transfer.amount_received > 0 ? transfer.amount_remaining : transfer.amount
  const money = (amount: number) => formatMoney(amount, transfer.currency_code, locale)
  const account = transfer.account
  const invoiceUrl = `/api/manual-transfer/${encodeURIComponent(transfer.order_id)}/invoice?locale=${locale}${
    token ? `&token=${encodeURIComponent(token)}` : ""
  }`

  return (
    <div className="py-6 min-h-[calc(100vh-64px)]" data-testid="transfer-page">
      <div className="content-container flex flex-col gap-y-8 max-w-3xl w-full">
        <div className="flex flex-col gap-y-3">
          <Text className="txt-medium text-ui-fg-subtle" data-testid="transfer-order-number">
            {fill(t.order, { number: transfer.display_id ? `#${transfer.display_id}` : transfer.order_id })}
            {transfer.reference && ` · ${t.reference}: ${transfer.reference}`}
          </Text>
          <div className="flex flex-wrap items-center gap-3">
            <Heading level="h1" className="text-3xl-regular">
              {t.title}
            </Heading>
            <StatusBadge status={status} locale={locale} />
          </div>
          <Text className="txt-medium text-ui-fg-subtle" data-testid="transfer-status-text">
            {t.statusText[status]}
          </Text>
        </div>

        {owes && (
          <>
            <Container className="flex flex-col gap-y-2 p-6">
              <Text className="txt-small text-ui-fg-subtle">{t.amountToPay}</Text>
              {transfer.amount_received > 0 && (
                <Text className="txt-medium text-ui-fg-subtle">
                  {fill(t.amountRemaining, { received: money(transfer.amount_received), total: money(transfer.amount) })}
                </Text>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-3xl-semi text-ui-fg-base tabular-nums" data-testid="transfer-amount">
                  {money(due)}
                </span>
                <CopyButton
                  value={plainAmount(due, transfer.currency_code)}
                  label={t.copy}
                  copiedLabel={t.copied}
                  data-testid="transfer-amount-copy"
                />
              </div>
              <Text className="txt-small text-ui-fg-muted">
                {fill(t.amountExact, { currency: transfer.currency_code.toUpperCase() })}
              </Text>
            </Container>

            <Container className="flex flex-col p-6">
              <Heading level="h2" className="text-xl-semi mb-2">
                {t.payTo}
              </Heading>
              <Row t={t} label={t.bank} value={account?.bank_name} testId="transfer-bank" />
              <Row t={t} label={t.accountHolder} value={account?.account_holder} copy testId="transfer-holder" />
              <Row t={t} label={t.accountNumber} value={account?.account_number} copy mono testId="transfer-account-number" />
              <Row t={t} label={t.swift} value={account?.swift_code} copy mono testId="transfer-swift" />
              <Row t={t} label={t.bankAddress} value={account?.bank_address} testId="transfer-bank-address" />
              <Row t={t} label={t.currency} value={transfer.currency_code.toUpperCase()} testId="transfer-currency" />
              <Row t={t} label={t.reference} value={transfer.reference} copy mono testId="transfer-reference" />
              <Text className="txt-small text-ui-fg-subtle mt-3">{t.referenceHint}</Text>
              <div className="mt-4 rounded-md border border-ui-tag-orange-border bg-ui-tag-orange-bg px-4 py-3" data-testid="transfer-fees-note">
                <Text className="txt-small text-ui-tag-orange-text">{t.feesNote}</Text>
              </div>
            </Container>

            {transfer.expires_at && (
              <Container className="p-6">
                <Countdown expiresAt={transfer.expires_at} locale={locale} />
              </Container>
            )}
          </>
        )}

        <div>
          <a
            href={invoiceUrl}
            className="inline-flex items-center gap-x-2 txt-medium-plus text-ui-fg-interactive hover:text-ui-fg-interactive-hover"
            data-testid="transfer-invoice-link"
          >
            <ArrowDownTray />
            {t.invoice}
          </a>
        </div>

        {transfer.can_upload && (
          <Container className="p-6">
            <ProofUpload
              orderId={transfer.order_id}
              token={token}
              locale={locale}
              again={status !== "awaiting_payment"}
            />
          </Container>
        )}

        {transfer.proofs.length > 0 && (
          <div className="flex flex-col gap-y-2" data-testid="transfer-proofs">
            <Heading level="h2" className="text-xl-semi">
              {t.proofs}
            </Heading>
            <ul className="flex flex-col">
              {transfer.proofs.map((proof) => (
                <li key={proof.id} className="flex flex-col gap-y-1 py-3 border-b border-ui-border-base last:border-b-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Text className="txt-medium text-ui-fg-base break-all">{proof.filename}</Text>
                    <Text className="txt-small text-ui-fg-subtle" data-testid="transfer-proof-status">
                      {t.proofStatus[proof.status]} ·{" "}
                      {new Date(proof.created_at).toLocaleDateString(locale === "id" ? "id-ID" : "en-US")}
                    </Text>
                  </div>
                  {proof.status === "rejected" && proof.rejection_reason && (
                    <Text className="txt-small text-ui-fg-error">{fill(t.rejectedBecause, { reason: proof.rejection_reason })}</Text>
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
