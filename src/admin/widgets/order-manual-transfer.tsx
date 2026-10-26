import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { DetailWidgetProps, HttpTypes } from "@medusajs/framework/types"
import { ArrowUpRightOnBox, ExclamationCircle } from "@medusajs/icons"
import { Alert, Button, Container, Copy, Heading, StatusBadge, Text, toast } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"
import {
  formatAmount,
  formatDateTime,
  formatSize,
  getOrderTransfer,
  openProof,
  orderTransferQueryKey,
  PROOF_STATUS_COLOR,
  STATUS_COLOR,
  TransferHistoryEntry,
  TransferProof,
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

const HistoryItem = ({ entry }: { entry: TransferHistoryEntry }) => {
  const { t, i18n } = useTranslation()
  const highlight = entry.event === "account_substituted"
  return (
    <li className="flex flex-col gap-y-0.5">
      <div className="flex items-center gap-x-1.5">
        {highlight && <ExclamationCircle className="text-ui-fg-error shrink-0" />}
        <Text size="small" leading="compact" weight="plus" className={highlight ? "text-ui-fg-error" : undefined}>
          {t(`manualTransfer.history.${entry.event}`, { defaultValue: entry.event })}
        </Text>
      </div>
      <Text size="xsmall" leading="compact" className="text-ui-fg-subtle">
        {formatDateTime(entry.at, i18n.language)} · {t(`manualTransfer.actor.${entry.actor_type}`)}
      </Text>
      {highlight ? (
        <Text size="xsmall" leading="compact" className="text-ui-fg-muted break-words">
          {t("manualTransfer.widget.substitutedShort", {
            from: describe(entry.details?.from),
            to: describe(entry.details?.to),
            reason: t(`manualTransfer.widget.reason.${entry.details?.reason}`, { defaultValue: "" }),
          })}
        </Text>
      ) : (
        entry.note && (
          <Text size="xsmall" leading="compact" className="text-ui-fg-muted break-words">
            {entry.note}
          </Text>
        )
      )}
    </li>
  )
}

const ProofItem = ({ proof }: { proof: TransferProof }) => {
  const { t, i18n } = useTranslation()
  const view = () =>
    openProof(proof.id).catch((error) => toast.error(error instanceof Error ? error.message : String(error)))
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
        <div className="flex shrink-0 items-center gap-x-2">
          <StatusBadge color={PROOF_STATUS_COLOR[proof.status] ?? "grey"}>
            {t(`manualTransfer.proofStatus.${proof.status}`)}
          </StatusBadge>
          <Button size="small" variant="secondary" onClick={view}>
            <ArrowUpRightOnBox />
            {t("manualTransfer.widget.view")}
          </Button>
        </div>
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
    </li>
  )
}

const OrderManualTransferWidget = ({ data: order }: DetailWidgetProps<HttpTypes.AdminOrder>) => {
  const { t, i18n } = useTranslation()
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
  const status = data.status ?? "awaiting_payment"
  const history = data.history ?? []
  const substitution = [...history].reverse().find((entry) => entry.event === "account_substituted")

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
        <Row label={t("manualTransfer.widget.amount")}>
          <Text size="small" leading="compact">
            {formatAmount(payment.amount, payment.currency_code, i18n.language)}
          </Text>
        </Row>
        <Row label={t("manualTransfer.widget.deadline")}>
          <Text size="small" leading="compact">
            {formatDateTime(data.expires_at, i18n.language)}
          </Text>
        </Row>
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

      <div className="flex flex-col gap-y-3 px-6 py-4">
        <Text size="small" leading="compact" weight="plus">
          {t("manualTransfer.widget.proofs")}
        </Text>
        {proofs.length ? (
          <ul className="flex flex-col gap-y-3">
            {proofs.map((proof) => (
              <ProofItem key={proof.id} proof={proof} />
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
              <HistoryItem key={`${entry.at}-${i}`} entry={entry} />
            ))}
          </ol>
        ) : (
          <Text size="small" className="text-ui-fg-subtle">
            {t("manualTransfer.widget.noHistory")}
          </Text>
        )}
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.side",
})

export default OrderManualTransferWidget
