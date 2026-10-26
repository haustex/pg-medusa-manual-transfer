import { ArrowUpRightOnBox, PencilSquare } from "@medusajs/icons"
import { Button, Container, Drawer, DropdownMenu, Heading, Input, Label, Text, Textarea, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { sdk } from "../lib/client"

/** Store metadata keys the e-mails and the invoice read (src/lib/notifications/context.ts) */
const KEYS = ["logo_url", "address", "support_email", "phone", "website"] as const
type Identity = { name: string } & Record<(typeof KEYS)[number], string>

const STORE_QUERY_KEY = ["manual-transfer-store"]

const PREVIEWS = [
  "order_placed",
  "proof_received",
  "proof_rejected",
  "payment_underpaid",
  "payment_confirmed",
  "payment_reminder",
  "payment_expired",
  "payment_canceled",
  "admin_status_changed",
  "admin_overdue",
] as const

function previewUrl(name: string, locale: string): string {
  const backend = import.meta.env.VITE_BACKEND_URL || "/"
  const base = backend === "/" ? window.location.origin : backend.replace(/\/+$/, "")
  return `${base}/admin/manual-transfer/previews/${name}?locale=${locale}`
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-y-2">
      <Label htmlFor={id} size="small" weight="plus">
        {label}
      </Label>
      {children}
      {hint && (
        <Text size="small" leading="compact" className="text-ui-fg-subtle">
          {hint}
        </Text>
      )}
    </div>
  )
}

/**
 * The store's name, logo and contact details as the buyer sees them in the
 * e-mails and on the invoice: the store name plus a few store metadata keys.
 */
export const StoreIdentitySection = () => {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<Identity | null>(null)

  const { data } = useQuery({
    queryKey: STORE_QUERY_KEY,
    queryFn: async () => (await sdk.admin.store.list({ fields: "id,name,metadata" })).stores[0] ?? null,
  })
  const metadata = (data?.metadata ?? {}) as Record<string, unknown>
  const current: Identity = {
    name: data?.name ?? "",
    ...(Object.fromEntries(KEYS.map((key) => [key, typeof metadata[key] === "string" ? (metadata[key] as string) : ""])) as Record<
      (typeof KEYS)[number],
      string
    >),
  }

  const save = useMutation({
    mutationFn: (value: Identity) =>
      sdk.admin.store.update(data!.id, {
        name: value.name.trim() || current.name,
        metadata: { ...metadata, ...Object.fromEntries(KEYS.map((key) => [key, value[key].trim()])) },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: STORE_QUERY_KEY })
      toast.success(t("manualTransfer.toasts.storeSaved"))
      setDraft(null)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : String(error)),
  })

  const set = (key: keyof Identity) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setDraft((d) => (d ? { ...d, [key]: event.target.value } : d))
  const locale = i18n.language?.startsWith("id") ? "id" : "en"
  const contact = [current.support_email, current.phone, current.website].filter(Boolean).join(" · ")

  return (
    <Container className="divide-y p-0">
      <div className="flex items-start justify-between gap-x-4 px-6 py-4">
        <div className="flex min-w-0 flex-1 flex-col gap-y-1">
          <Heading level="h2">{t("manualTransfer.identity.title")}</Heading>
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            {t("manualTransfer.identity.description")}
          </Text>
        </div>
        <div className="flex shrink-0 items-center gap-x-2">
          <DropdownMenu>
            <DropdownMenu.Trigger asChild>
              <Button size="small" variant="secondary" className="whitespace-nowrap">
                {t("manualTransfer.identity.preview")}
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="end">
              {PREVIEWS.map((name) => (
                <DropdownMenu.Item key={name} className="gap-x-2" onClick={() => window.open(previewUrl(name, locale), "_blank", "noopener")}>
                  <ArrowUpRightOnBox className="text-ui-fg-subtle" />
                  {t(`manualTransfer.identity.templates.${name}`)}
                </DropdownMenu.Item>
              ))}
              <DropdownMenu.Separator />
              <DropdownMenu.Item className="gap-x-2" onClick={() => window.open(previewUrl("invoice", locale), "_blank", "noopener")}>
                <ArrowUpRightOnBox className="text-ui-fg-subtle" />
                {t("manualTransfer.identity.templates.invoice")}
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu>
          <Button size="small" variant="secondary" disabled={!data} onClick={() => setDraft(current)}>
            <PencilSquare />
            {t("manualTransfer.actions.edit")}
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-y-1 px-6 py-4">
        <Text size="small" leading="compact" weight="plus">
          {current.name || "-"}
        </Text>
        {current.address && (
          <Text size="small" leading="compact" className="text-ui-fg-subtle whitespace-pre-line">
            {current.address}
          </Text>
        )}
        <Text size="small" leading="compact" className="text-ui-fg-muted">
          {contact || t("manualTransfer.identity.noContact")}
        </Text>
      </div>

      <Drawer open={!!draft} onOpenChange={(open) => !open && setDraft(null)}>
        <Drawer.Content>
          <Drawer.Header>
            <Drawer.Title>{t("manualTransfer.identity.title")}</Drawer.Title>
          </Drawer.Header>
          <Drawer.Body className="flex flex-1 flex-col gap-y-4 overflow-auto p-4">
            {draft && (
              <>
                <Field id="mt-store-name" label={t("manualTransfer.identity.name")}>
                  <Input id="mt-store-name" value={draft.name} onChange={set("name")} />
                </Field>
                <Field id="mt-store-logo" label={t("manualTransfer.identity.logo")} hint={t("manualTransfer.identity.logoHint")}>
                  <Input id="mt-store-logo" type="url" placeholder="https://" value={draft.logo_url} onChange={set("logo_url")} />
                </Field>
                <Field id="mt-store-address" label={t("manualTransfer.identity.address")}>
                  <Textarea id="mt-store-address" rows={3} value={draft.address} onChange={set("address")} />
                </Field>
                <Field id="mt-store-email" label={t("manualTransfer.identity.email")} hint={t("manualTransfer.identity.emailHint")}>
                  <Input id="mt-store-email" type="email" value={draft.support_email} onChange={set("support_email")} />
                </Field>
                <Field id="mt-store-phone" label={t("manualTransfer.identity.phone")}>
                  <Input id="mt-store-phone" value={draft.phone} onChange={set("phone")} />
                </Field>
                <Field id="mt-store-website" label={t("manualTransfer.identity.website")}>
                  <Input id="mt-store-website" type="url" placeholder="https://" value={draft.website} onChange={set("website")} />
                </Field>
              </>
            )}
          </Drawer.Body>
          <Drawer.Footer>
            <div className="flex items-center justify-end gap-x-2">
              <Drawer.Close asChild>
                <Button size="small" variant="secondary" disabled={save.isPending}>
                  {t("manualTransfer.actions.cancel")}
                </Button>
              </Drawer.Close>
              <Button size="small" isLoading={save.isPending} disabled={!draft || save.isPending} onClick={() => draft && save.mutate(draft)}>
                {t("manualTransfer.actions.save")}
              </Button>
            </div>
          </Drawer.Footer>
        </Drawer.Content>
      </Drawer>
    </Container>
  )
}
