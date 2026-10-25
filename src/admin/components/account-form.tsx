import { Checkbox, Input, Label, Switch, Text, Textarea } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { AccountInput } from "../lib/accounts"
import { sdk } from "../lib/client"

type Props = {
  value: AccountInput
  onChange: (value: AccountInput) => void
  /** Load the region list only while the form is shown */
  enabled: boolean
}

export function isAccountInputComplete(value: AccountInput): boolean {
  return (
    !!value.bank_name.trim() &&
    !!value.account_holder.trim() &&
    !!value.account_number.trim() &&
    /^[a-z]{3}$/i.test(value.currency_code.trim())
  )
}

/** Trims text and turns empty optional fields into null before sending */
export function cleanAccountInput(value: AccountInput): AccountInput {
  const optional = (text: string | null) => (text && text.trim() ? text.trim() : null)
  return {
    ...value,
    label: optional(value.label),
    bank_name: value.bank_name.trim(),
    account_holder: value.account_holder.trim(),
    account_number: value.account_number.trim(),
    swift_code: optional(value.swift_code)?.toUpperCase() ?? null,
    bank_address: optional(value.bank_address),
    currency_code: value.currency_code.trim().toLowerCase(),
  }
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string
  label: string
  hint?: string
  children: React.ReactNode
}) {
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

export const AccountForm = ({ value, onChange, enabled }: Props) => {
  const { t } = useTranslation()
  const set = <K extends keyof AccountInput>(key: K, next: AccountInput[K]) =>
    onChange({ ...value, [key]: next })

  const { data: regionData } = useQuery({
    queryKey: ["manual-transfer-regions"],
    queryFn: () => sdk.admin.region.list({ limit: 200, fields: "id,name,currency_code" }),
    enabled,
  })
  const regions = regionData?.regions ?? []

  const toggleRegion = (regionId: string, checked: boolean) =>
    set(
      "region_ids",
      checked ? [...value.region_ids, regionId] : value.region_ids.filter((id) => id !== regionId)
    )

  return (
    <div className="flex flex-col gap-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field id="mt-bank-name" label={t("manualTransfer.account.bankName")}>
          <Input
            id="mt-bank-name"
            value={value.bank_name}
            onChange={(e) => set("bank_name", e.target.value)}
          />
        </Field>
        <Field id="mt-label" label={t("manualTransfer.account.label")} hint={t("manualTransfer.account.labelHint")}>
          <Input
            id="mt-label"
            value={value.label ?? ""}
            onChange={(e) => set("label", e.target.value)}
          />
        </Field>
        <Field id="mt-holder" label={t("manualTransfer.account.accountHolder")}>
          <Input
            id="mt-holder"
            value={value.account_holder}
            onChange={(e) => set("account_holder", e.target.value)}
          />
        </Field>
        <Field id="mt-number" label={t("manualTransfer.account.accountNumber")}>
          <Input
            id="mt-number"
            value={value.account_number}
            autoComplete="off"
            onChange={(e) => set("account_number", e.target.value)}
          />
        </Field>
        <Field id="mt-swift" label={t("manualTransfer.account.swiftCode")} hint={t("manualTransfer.account.swiftHint")}>
          <Input
            id="mt-swift"
            value={value.swift_code ?? ""}
            onChange={(e) => set("swift_code", e.target.value.toUpperCase())}
          />
        </Field>
        <Field id="mt-currency" label={t("manualTransfer.account.currency")} hint={t("manualTransfer.account.currencyHint")}>
          <Input
            id="mt-currency"
            value={value.currency_code.toUpperCase()}
            maxLength={3}
            onChange={(e) => set("currency_code", e.target.value.toLowerCase())}
          />
        </Field>
      </div>

      <Field id="mt-address" label={t("manualTransfer.account.bankAddress")}>
        <Textarea
          id="mt-address"
          rows={2}
          value={value.bank_address ?? ""}
          onChange={(e) => set("bank_address", e.target.value)}
        />
      </Field>

      <div className="flex flex-col gap-y-2">
        <Label size="small" weight="plus">
          {t("manualTransfer.account.regions")}
        </Label>
        <div className="flex flex-col gap-y-2">
          {regions.map((region) => (
            <div key={region.id} className="flex items-center gap-x-2">
              <Checkbox
                id={`mt-region-${region.id}`}
                checked={value.region_ids.includes(region.id)}
                onCheckedChange={(checked) => toggleRegion(region.id, checked === true)}
              />
              <Label htmlFor={`mt-region-${region.id}`} size="small">
                {region.name}{" "}
                <span className="text-ui-fg-muted">({region.currency_code.toUpperCase()})</span>
              </Label>
            </div>
          ))}
        </div>
        <Text size="small" leading="compact" className="text-ui-fg-subtle">
          {t("manualTransfer.account.regionsHint")}
        </Text>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field id="mt-rank" label={t("manualTransfer.account.rank")} hint={t("manualTransfer.account.rankHint")}>
          <Input
            id="mt-rank"
            type="number"
            min={0}
            value={value.rank}
            onChange={(e) => set("rank", Math.max(0, Number.parseInt(e.target.value, 10) || 0))}
          />
        </Field>
        <div className="flex items-start gap-x-3 pt-6">
          <Switch
            id="mt-active"
            checked={value.is_active}
            onCheckedChange={(checked) => set("is_active", checked)}
          />
          <div className="flex flex-col gap-y-1">
            <Label htmlFor="mt-active" size="small" weight="plus">
              {t("manualTransfer.account.active")}
            </Label>
            <Text size="small" leading="compact" className="text-ui-fg-subtle">
              {t("manualTransfer.account.activeHint")}
            </Text>
          </div>
        </div>
      </div>
    </div>
  )
}
