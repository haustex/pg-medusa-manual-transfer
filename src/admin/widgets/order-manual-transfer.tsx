import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { DetailWidgetProps, HttpTypes } from "@medusajs/framework/types"
import { ArrowUpRightOnBox, ExclamationCircle, InformationCircle } from "@medusajs/icons"
import { Alert, Button, Container, Copy, Heading, StatusBadge, Text, toast } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"
import {
  BankCheckWarning,
  ConfirmPaymentDrawer,
  RejectProofDrawer,
  UnderpaymentDrawer,
} from "../components/transfer-actions"
import {
  formatAmount,
  formatDate,
  formatDateTime,
  formatSize,
  getOrderTransfer,
  invoiceUrl,
  OPEN_STATUSES,
  openProof,
  OrderTransfer,
  orderTransferQueryKey,
  PROOF_STATUS_COLOR,
  roundAmount,
  STATUS_COLOR,
  TransferHistoryEntry,
  TransferProof,
  userLabel,
} from "../lib/transfer"

type Party = { bank_name?: string; account_number?: string }

function describe(party: unknown): string {
  const p = (party ?? {}) as Party
  return [p.bank_name, p.account_number].filter(Boolean).join(" ")
}

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="grid grid-cols-2 items-start gap-x-3 px-6 py-3">
    <Text size="small" leading="compact" weight="plus">
      {label}
    </Text>
    <div className="min-w-0 text-right">{children}</div>
  </div>
)

const HISTORY_HIGHLIGHT = new Set(["account_substituted", "underpaid", "expired"])

const HistoryItem = ({ entry, transfer }: { entry: TransferHistoryEntry; transfer: OrderTransfer }) => {
  const { t, i18n } = useTranslation()
  const highlight = HISTORY_HIGHLIGHT.has(entry.event)
  const details = entry.details ?? {}
  const money = (n: unknown) =>
    typeof n === "number" ? formatAmount(n, transfer.payment.currency_code, i18n.language) : "-"
  const actor =
    entry.actor_type === "user"
      ? userLabel(transfer.users, entry.actor_id) ?? t("manualTransfer.actor.user")
      : t(`manualTransfer.actor.${entry.actor_type}`)

  let detail: string | null = null
  if (entry.event === "account_substituted") {
    detail = t("manualTransfer.widget.substitutedShort", {
      from: describe(details.from),
      to: describe(details.to),
      reason: t(`manualTransfer.widget.reason.${details.reason}`, { defaultValue: "" }),
    })
  } else if (entry.event === "underpaid") {
    detail = t("manualTransfer.widget.underpaidDetail", {
      amount: money(details.amount_received),
      remaining: money(details.remaining),
    })
  } else if (entry.event === "confirmed") {
    detail = t("manualTransfer.widget.confirmedDetail", {
      amount: money(details.amount_received),
      date: formatDate(details.received_at as string, i18n.language),
    })
  }

  return (
    <li className="flex flex-col gap-y-0.5">
      <div className="flex items-center gap-x-1.5">
        {highlight && <ExclamationCircle className="text-ui-fg-error shrink-0" />}
        <Text size="small" leading="compact" weight="plus" className={highlight ? "text-ui-fg-error" : undefined}>
          {t(`manualTransfer.history.${entry.event}`, { defaultValue: entry.event })}
        </Text>
      </div>
      <Text size="xsmall" leading="compact" className="text-ui-fg-subtle break-words">
        {formatDateTime(entry.at, i18n.language)} · {actor}
      </Text>
      {detail && (
        <Text size="xsmall" leading="compact" className="text-ui-fg-muted break-words">
          {detail}
          {typeof details.bank_reference === "string" && details.bank_reference ? ` · ${details.bank_reference}` : ""}
        </Text>
      )}
      {entry.note && (
        <Text size="xsmall" leading="compact" className="text-ui-fg-muted break-words">
          “{entry.note}”
        </Text>
      )}
    </li>
  )
}

const ProofItem = ({
  proof,
  transfer,
  canReject,
  onReject,
}: {
  proof: TransferProof
  transfer: OrderTransfer
  canReject: boolean
  onReject: () => void
}) => {
  const { t, i18n } = useTranslation()
  const view = () =>
    openProof(proof.id).catch((error) => toast.error(error instanceof Error ? error.message : String(error)))
  const reviewer = userLabel(transfer.users, proof.reviewed_by)
  return (
    <li className="flex flex-col gap-y-1">
      <div className="flex items-start justify-between gap-x-2">
        <div className="flex min-w-0 flex-col gap-y-0.5">
          <Text size="small" leading="compact" weight="plus" className="truncate">
            {proof.filename}
          </Text>
          <Text size="xsmall" leading="compact" className="text-ui-fg-subtle">
            {formatDateTime(proof.created_at, i18n.language)} · {formatSize(proof.size)} ·{" "}
            {t(`manualTransfer.actor.${proof.uploaded_by}`)}
          </Text>
        </div>
        <StatusBadge color={PROOF_STATUS_COLOR[proof.status] ?? "grey"} className="shrink-0">
          {t(`manualTransfer.proofStatus.${proof.status}`)}
        </StatusBadge>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {proof.file_deleted_at ? (
          <Text size="xsmall" leading="compact" className="text-ui-fg-muted">
            {t("manualTransfer.widget.fileDeleted", { date: formatDate(proof.file_deleted_at, i18n.language) })}
          </Text>
        ) : (
          <Button size="small" variant="secondary" onClick={view}>
            <ArrowUpRightOnBox />
            {t("manualTransfer.widget.view")}
          </Button>
        )}
        {canReject && proof.status === "pending" && (
          <Button size="small" variant="secondary" onClick={onReject}>
            {t("manualTransfer.actions.reject")}
          </Button>
        )}
      </div>
      {proof.duplicate_of_order_id && (
        <Text size="xsmall" leading="compact" className="text-ui-fg-error break-words">
          {t("manualTransfer.widget.duplicate")}{" "}
          <Link to={`/orders/${proof.duplicate_of_order_id}`} className="underline">
            {proof.duplicate_of_order_id}
          </Link>
        </Text>
      )}
      {proof.note && (
        <Text size="xsmall" leading="compact" className="text-ui-fg-muted break-words">
          “{proof.note}”
        </Text>
      )}
      {proof.rejection_reason && (
        <Text size="xsmall" leading="compact" className="text-ui-fg-muted break-words">
          {t("manualTransfer.widget.rejectedBecause", { reason: proof.rejection_reason })}
        </Text>
      )}
      {proof.reviewed_at && proof.status !== "pending" && (
        <Text size="xsmall" leading="compact" className="text-ui-fg-muted break-words">
          {t("manualTransfer.widget.reviewedBy", {
            who: reviewer ?? t("manualTransfer.actor.user"),
            at: formatDateTime(proof.reviewed_at, i18n.language),
          })}
        </Text>
      )}
    </li>
  )
}

const OrderManualTransferWidget = ({ data: order }: DetailWidgetProps<HttpTypes.AdminOrder>) => {
  const { t, i18n } = useTranslation()
  const [confirming, setConfirming] = useState(false)
  const [recordingUnderpaid, setRecordingUnderpaid] = useState(false)
  const [rejecting, setRejecting] = useState<TransferProof | null>(null)
  const { data: transfer, isLoading, isError } = useQuery({
    queryKey: orderTransferQueryKey(order.id),
    queryFn: () => getOrderTransfer(order.id),
    retry: false,
  })

  // Not a manual-transfer order: stay out of the way
  if (isLoading || transfer === null) {
    return null
  }
  if (isError || !transfer) {
    return (
      <Container className="px-6 py-4">
        <Text size="small" className="text-ui-fg-error">
          {t("manualTransfer.widget.loadError")}
        </Text>
      </Container>
    )
  }

  const { payment, proofs } = transfer
  const { data } = payment
  const money = (n: number) => formatAmount(n, payment.currency_code, i18n.language)
  const status = data.status ?? "awaiting_payment"
  const history = data.history ?? []
  const substitution = [...history].reverse().find((entry) => entry.event === "account_substituted")
  const isOpen =
    OPEN_STATUSES.includes(status) &&
    !payment.captured_at &&
    !payment.canceled_at &&
    transfer.order_status !== "canceled"
  const remaining = roundAmount(payment.amount - transfer.amount_received)
  const confirmation = data.confirmation

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between gap-x-2 px-6 py-4">
        <Heading level="h2">{t("manualTransfer.widget.title")}</Heading>
        <StatusBadge color={STATUS_COLOR[status] ?? "grey"}>
          {t(`manualTransfer.status.${status}`, { defaultValue: status })}
        </StatusBadge>
      </div>

      {substitution && (
        <div className="px-6 py-4">
          <Alert variant="warning">
            <Text size="small" leading="compact" weight="plus">
              {t("manualTransfer.widget.substituted")}
            </Text>
            <Text size="small" leading="compact">
              {t("manualTransfer.widget.substitutedText", {
                from: describe(substitution.details?.from),
                to: describe(substitution.details?.to),
              })}
            </Text>
          </Alert>
        </div>
      )}

      <div className="divide-y">
        <Row label={t("manualTransfer.widget.reference")}>
          <div className="flex items-center justify-end gap-x-1">
            <Text size="small" leading="compact" className="font-mono">
              {data.reference ?? "-"}
            </Text>
            {data.reference && <Copy content={data.reference} />}
          </div>
        </Row>
        <Row label={t("manualTransfer.widget.invoice")}>
          <a
            href={invoiceUrl(order.id, i18n.language)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover txt-compact-small inline-flex items-center gap-x-1"
          >
            {t("manualTransfer.widget.invoicePdf")}
            <ArrowUpRightOnBox />
          </a>
        </Row>
        <Row label={t("manualTransfer.widget.amount")}>
          <Text size="small" leading="compact">
            {money(payment.amount)}
          </Text>
        </Row>
        {transfer.amount_received > 0 && !confirmation && (
          <>
            <Row label={t("manualTransfer.widget.received")}>
              <Text size="small" leading="compact">
                {money(transfer.amount_received)}
              </Text>
            </Row>
            <Row label={t("manualTransfer.widget.remaining")}>
              <Text size="small" leading="compact" weight="plus" className="text-ui-fg-error">
                {money(remaining)}
              </Text>
            </Row>
          </>
        )}
        {confirmation ? (
          <Row label={t("manualTransfer.widget.paid")}>
            <Text size="small" leading="compact">
              {money(confirmation.total_received ?? confirmation.amount_received)}
            </Text>
            <Text size="small" leading="compact" className="text-ui-fg-subtle break-words">
              {formatDate(confirmation.received_at, i18n.language)}
              {confirmation.bank_reference ? ` · ${confirmation.bank_reference}` : ""}
            </Text>
          </Row>
        ) : (
          <Row label={t("manualTransfer.widget.deadline")}>
            <Text size="small" leading="compact">
              {formatDateTime(data.expires_at, i18n.language)}
            </Text>
          </Row>
        )}
        {data.account && (
          <Row label={t("manualTransfer.widget.account")}>
            <Text size="small" leading="compact">
              {data.account.bank_name}
            </Text>
            <Text size="small" leading="compact" className="text-ui-fg-subtle break-words">
              {data.account.account_holder}
            </Text>
            <Text size="small" leading="compact" className="text-ui-fg-subtle font-mono">
              {data.account.account_number}
            </Text>
          </Row>
        )}
      </div>

      {isOpen && (
        <div className="flex flex-col gap-y-3 px-6 py-4">
          <BankCheckWarning />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="small" onClick={() => setConfirming(true)}>
              {t("manualTransfer.actions.confirm")}
            </Button>
            <Button size="small" variant="secondary" onClick={() => setRecordingUnderpaid(true)}>
              {t("manualTransfer.actions.recordUnderpaid")}
            </Button>
          </div>
          <div className="flex items-start gap-x-1.5">
            <InformationCircle className="text-ui-fg-muted mt-0.5 shrink-0" />
            <Text size="xsmall" leading="compact" className="text-ui-fg-muted">
              {t("manualTransfer.widget.nativeCapture")}
            </Text>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-y-3 px-6 py-4">
        <Text size="small" leading="compact" weight="plus">
          {t("manualTransfer.widget.proofs")}
        </Text>
        {proofs.length ? (
          <ul className="flex flex-col gap-y-4">
            {proofs.map((proof) => (
              <ProofItem
                key={proof.id}
                proof={proof}
                transfer={transfer}
                canReject={isOpen && status === "awaiting_verification"}
                onReject={() => setRejecting(proof)}
              />
            ))}
          </ul>
        ) : (
          <Text size="small" className="text-ui-fg-subtle">
            {t("manualTransfer.widget.noProofs")}
          </Text>
        )}
      </div>

      <div className="flex flex-col gap-y-3 px-6 py-4">
        <Text size="small" leading="compact" weight="plus">
          {t("manualTransfer.widget.history")}
        </Text>
        {history.length ? (
          <ol className="flex flex-col gap-y-3">
            {[...history].reverse().map((entry, i) => (
              <HistoryItem key={`${entry.at}-${i}`} entry={entry} transfer={transfer} />
            ))}
          </ol>
        ) : (
          <Text size="small" className="text-ui-fg-subtle">
            {t("manualTransfer.widget.noHistory")}
          </Text>
        )}
      </div>

      {isOpen && (
        <>
          <ConfirmPaymentDrawer
            orderId={order.id}
            transfer={transfer}
            open={confirming}
            onOpenChange={setConfirming}
          />
          <UnderpaymentDrawer
            orderId={order.id}
            transfer={transfer}
            open={recordingUnderpaid}
            onOpenChange={setRecordingUnderpaid}
          />
          <RejectProofDrawer orderId={order.id} proof={rejecting} onClose={() => setRejecting(null)} />
        </>
      )}
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.side",
})

export default OrderManualTransferWidget
