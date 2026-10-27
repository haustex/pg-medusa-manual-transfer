import { Badge, Container, Heading, Text } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { CONFIG_QUERY_KEY, getPluginConfig } from "../lib/transfer"

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-y-2 px-6 py-4">
      <Text size="small" leading="compact" weight="plus">
        {label}
      </Text>
      {children}
    </div>
  )
}

/**
 * Who receives the e-mails, read-only: they are set in medusa-config
 * (`notifications.adminEmails`, `notifications.paymentUrl`). Without
 * adminEmails every Admin user is a recipient, which is said here plainly.
 */
export const NotificationSettingsSection = () => {
  const { t } = useTranslation()
  const { data } = useQuery({ queryKey: CONFIG_QUERY_KEY, queryFn: getPluginConfig, staleTime: Infinity })
  const notifications = data?.notifications
  if (!notifications) {
    return null
  }
  const { admin_recipients: recipients } = notifications
  const fallback = recipients.source === "admin_users"

  return (
    <Container className="divide-y p-0">
      <div className="flex items-start justify-between gap-x-4 px-6 py-4">
        <div className="flex min-w-0 flex-1 flex-col gap-y-1">
          <Heading level="h2">{t("manualTransfer.notifications.title")}</Heading>
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            {t("manualTransfer.notifications.description")}
          </Text>
        </div>
        <Badge size="2xsmall" color={notifications.active ? "green" : "grey"} className="shrink-0">
          {t(
            notifications.active
              ? "manualTransfer.notifications.on"
              : notifications.enabled
                ? "manualTransfer.notifications.noModule"
                : "manualTransfer.notifications.off"
          )}
        </Badge>
      </div>
      <Row label={t("manualTransfer.notifications.adminRecipients")}>
        <div className="flex flex-wrap gap-2" data-testid="mt-admin-recipients">
          {recipients.emails.length ? (
            recipients.emails.map((email) => (
              <Badge key={email} size="2xsmall" className="font-mono">
                {email}
              </Badge>
            ))
          ) : (
            <Text size="small" leading="compact" className="text-ui-fg-muted">
              {t("manualTransfer.notifications.noRecipients")}
            </Text>
          )}
        </div>
        <Text size="small" leading="compact" className={fallback ? "text-ui-fg-error" : "text-ui-fg-subtle"}>
          {fallback
            ? t("manualTransfer.notifications.fallback", { count: recipients.emails.length })
            : t("manualTransfer.notifications.fromOption")}
        </Text>
      </Row>
      <Row label={t("manualTransfer.notifications.paymentUrl")}>
        {notifications.payment_url ? (
          <Text size="small" leading="compact" className="font-mono text-ui-fg-subtle" style={{ wordBreak: "break-all" }}>
            {notifications.payment_url}
          </Text>
        ) : (
          <Text size="small" leading="compact" className="text-ui-fg-error">
            {t("manualTransfer.notifications.noPaymentUrl")}
          </Text>
        )}
      </Row>
    </Container>
  )
}
