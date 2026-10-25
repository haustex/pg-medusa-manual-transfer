import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { DetailWidgetProps, HttpTypes } from "@medusajs/framework/types"
import { ExclamationCircle } from "@medusajs/icons"
import { Alert, Container, Copy, Heading, StatusBadge, Text } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import {
  formatAmount,
  formatDateTime,
  getOrderTransfer,
  orderTransferQueryKey,
  STATUS_COLOR,
  TransferHistoryEntry,
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

const OrderManualTransferWidget = ({ data: order }: DetailWidgetProps<HttpTypes.AdminOrder>) => {
  const { t, i18n } = useTranslation()
  const { data: payment, isLoading, isError } = useQuery({
    queryKey: orderTransferQueryKey(order.id),
    queryFn: () => getOrderTransfer(order.id),
    retry: false,
  })

  // Not a manual-transfer order: stay out of the way
  if (isLoading || payment === null) {
    return null
  }
  if (isError || !payment) {
    return (
      <Container className="px-6 py-4">
        <Text size="small" className="text-ui-fg-error">
          {t("manualTransfer.widget.loadError")}
        </Text>
      </Container>
    )
  }

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
