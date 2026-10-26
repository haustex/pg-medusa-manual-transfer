import { defineRouteConfig } from "@medusajs/admin-sdk"
import { CheckCircle, EllipsisHorizontal, PencilSquare, Plus, Spinner, Trash, XCircle } from "@medusajs/icons"
import {
  Badge,
  Button,
  Container,
  Drawer,
  DropdownMenu,
  FocusModal,
  Heading,
  IconButton,
  StatusBadge,
  Text,
  toast,
  usePrompt,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { AccountForm, cleanAccountInput, isAccountInputComplete } from "../../../components/account-form"
import { CreditFooter } from "../../../components/credit-footer"
import {
  AccountInput,
  ACCOUNTS_QUERY_KEY,
  createAccount,
  deleteAccount,
  emptyAccountInput,
  listAccounts,
  ManualTransferAccount,
  toAccountInput,
  updateAccount,
} from "../../../lib/accounts"
import { sdk } from "../../../lib/client"

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

const CreateAccountModal = () => {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState<AccountInput>(emptyAccountInput)

  const create = useMutation({
    mutationFn: (body: AccountInput) => createAccount(cleanAccountInput(body)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ACCOUNTS_QUERY_KEY })
      toast.success(t("manualTransfer.toasts.created"))
      setOpen(false)
      setValue(emptyAccountInput())
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  return (
    <FocusModal open={open} onOpenChange={setOpen}>
      <FocusModal.Trigger asChild>
        <Button size="small" variant="secondary" className="shrink-0 whitespace-nowrap">
          <Plus />
          {t("manualTransfer.settings.add")}
        </Button>
      </FocusModal.Trigger>
      <FocusModal.Content>
        <div className="flex h-full flex-col overflow-hidden">
          <FocusModal.Header>
            <div className="flex items-center justify-end gap-x-2">
              <FocusModal.Close asChild>
                <Button size="small" variant="secondary" disabled={create.isPending}>
                  {t("manualTransfer.actions.cancel")}
                </Button>
              </FocusModal.Close>
              <Button
                size="small"
                disabled={!isAccountInputComplete(value) || create.isPending}
                isLoading={create.isPending}
                onClick={() => create.mutate(value)}
              >
                {t("manualTransfer.actions.save")}
              </Button>
            </div>
          </FocusModal.Header>
          <FocusModal.Body className="flex-1 overflow-auto">
            <div className="mx-auto flex w-full max-w-[720px] flex-col gap-y-6 px-6 py-16">
              <FocusModal.Title asChild>
                <Heading>{t("manualTransfer.titles.create")}</Heading>
              </FocusModal.Title>
              <AccountForm value={value} onChange={setValue} enabled={open} />
            </div>
          </FocusModal.Body>
        </div>
      </FocusModal.Content>
    </FocusModal>
  )
}

const EditAccountDrawer = ({
  account,
  onClose,
}: {
  account: ManualTransferAccount | null
  onClose: () => void
}) => {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [value, setValue] = useState<AccountInput | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  if (account && account.id !== editingId) {
    setEditingId(account.id)
    setValue(toAccountInput(account))
  }

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: AccountInput }) =>
      updateAccount(id, cleanAccountInput(body)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ACCOUNTS_QUERY_KEY })
      toast.success(t("manualTransfer.toasts.updated"))
      setEditingId(null)
      onClose()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const open = !!account && !!value
  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setEditingId(null)
          onClose()
        }
      }}
    >
      <Drawer.Content>
        <Drawer.Header>
          <Drawer.Title>{t("manualTransfer.titles.edit")}</Drawer.Title>
        </Drawer.Header>
        <Drawer.Body className="flex-1 overflow-auto p-4">
          {value && <AccountForm value={value} onChange={setValue} enabled={open} />}
        </Drawer.Body>
        <Drawer.Footer>
          <div className="flex items-center justify-end gap-x-2">
            <Drawer.Close asChild>
              <Button size="small" variant="secondary" disabled={update.isPending}>
                {t("manualTransfer.actions.cancel")}
              </Button>
            </Drawer.Close>
            <Button
              size="small"
              disabled={!value || !isAccountInputComplete(value) || update.isPending}
              isLoading={update.isPending}
              onClick={() => account && value && update.mutate({ id: account.id, body: value })}
            >
              {t("manualTransfer.actions.save")}
            </Button>
          </div>
        </Drawer.Footer>
      </Drawer.Content>
    </Drawer>
  )
}

const AccountRow = ({
  account,
  regionNames,
  onEdit,
}: {
  account: ManualTransferAccount
  regionNames: Map<string, string>
  onEdit: () => void
}) => {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const prompt = usePrompt()
  const name = account.label || account.bank_name

  const toggle = useMutation({
    mutationFn: () => updateAccount(account.id, { is_active: !account.is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ACCOUNTS_QUERY_KEY })
      toast.success(t("manualTransfer.toasts.updated"))
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const remove = useMutation({
    mutationFn: () => deleteAccount(account.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ACCOUNTS_QUERY_KEY })
      toast.success(t("manualTransfer.toasts.deleted"))
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const confirmDelete = async () => {
    const confirmed = await prompt({
      title: t("manualTransfer.confirmDelete.title"),
      description: t("manualTransfer.confirmDelete.description", { name }),
      confirmText: t("manualTransfer.actions.delete"),
      cancelText: t("manualTransfer.actions.cancel"),
    })
    if (confirmed) {
      remove.mutate()
    }
  }

  const regions = account.region_ids?.length
    ? account.region_ids.map((id) => regionNames.get(id) ?? id).join(", ")
    : t("manualTransfer.account.allRegions")

  return (
    <div className="flex items-start justify-between gap-x-4 px-6 py-4">
      <div className="flex min-w-0 flex-1 flex-col gap-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Text size="small" leading="compact" weight="plus">
            {account.bank_name}
          </Text>
          <Badge size="2xsmall">{account.currency_code.toUpperCase()}</Badge>
          {account.label && (
            <Text size="small" leading="compact" className="text-ui-fg-muted">
              {account.label}
            </Text>
          )}
        </div>
        <Text size="small" leading="compact" className="text-ui-fg-subtle break-words">
          {account.account_holder} · {account.account_number}
          {account.swift_code ? ` · SWIFT ${account.swift_code}` : ""}
        </Text>
        <Text size="small" leading="compact" className="text-ui-fg-muted">
          {t("manualTransfer.account.regions")}: {regions} · {t("manualTransfer.account.rank")} {account.rank}
        </Text>
      </div>
      <div className="flex shrink-0 items-center gap-x-2">
        <StatusBadge color={account.is_active ? "green" : "grey"}>
          {account.is_active ? t("manualTransfer.account.active") : t("manualTransfer.account.inactive")}
        </StatusBadge>
        <DropdownMenu>
          <DropdownMenu.Trigger asChild>
            <IconButton size="small" variant="transparent" disabled={toggle.isPending || remove.isPending}>
              <EllipsisHorizontal />
            </IconButton>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="end">
            <DropdownMenu.Item className="gap-x-2" onClick={onEdit}>
              <PencilSquare className="text-ui-fg-subtle" />
              {t("manualTransfer.actions.edit")}
            </DropdownMenu.Item>
            <DropdownMenu.Item className="gap-x-2" onClick={() => toggle.mutate()}>
              {account.is_active ? (
                <XCircle className="text-ui-fg-subtle" />
              ) : (
                <CheckCircle className="text-ui-fg-subtle" />
              )}
              {account.is_active ? t("manualTransfer.actions.deactivate") : t("manualTransfer.actions.activate")}
            </DropdownMenu.Item>
            <DropdownMenu.Separator />
            <DropdownMenu.Item className="gap-x-2" onClick={confirmDelete}>
              <Trash className="text-ui-fg-subtle" />
              {t("manualTransfer.actions.delete")}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu>
      </div>
    </div>
  )
}

const ManualTransferSettingsPage = () => {
  const { t } = useTranslation()
  const [editing, setEditing] = useState<ManualTransferAccount | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ACCOUNTS_QUERY_KEY,
    queryFn: listAccounts,
  })
  const { data: regionData } = useQuery({
    queryKey: ["manual-transfer-regions"],
    queryFn: () => sdk.admin.region.list({ limit: 200, fields: "id,name,currency_code" }),
  })
  const regionNames = new Map((regionData?.regions ?? []).map((r) => [r.id, r.name]))
  const accounts = data?.accounts ?? []

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="divide-y p-0">
        <div className="flex items-start justify-between gap-x-4 px-6 py-4">
          <div className="flex min-w-0 flex-1 flex-col gap-y-1">
            <Heading level="h2">{t("manualTransfer.settings.title")}</Heading>
            <Text size="small" leading="compact" className="text-ui-fg-subtle">
              {t("manualTransfer.settings.description")}
            </Text>
          </div>
          <CreateAccountModal />
        </div>
        {isLoading && (
          <div className="flex justify-center px-6 py-4">
            <Spinner className="text-ui-fg-subtle animate-spin" />
          </div>
        )}
        {isError && (
          <div className="px-6 py-4">
            <Text size="small" className="text-ui-fg-error">
              {t("manualTransfer.settings.loadError")}
            </Text>
          </div>
        )}
        {!isLoading && !isError && accounts.length === 0 && (
          <div className="px-6 py-4">
            <Text size="small" className="text-ui-fg-subtle">
              {t("manualTransfer.settings.empty")}
            </Text>
          </div>
        )}
        {accounts.map((account) => (
          <AccountRow
            key={account.id}
            account={account}
            regionNames={regionNames}
            onEdit={() => setEditing(account)}
          />
        ))}
        <EditAccountDrawer account={editing} onClose={() => setEditing(null)} />
      </Container>
      <CreditFooter />
    </div>
  )
}

const Breadcrumb = () => {
  const { t } = useTranslation()
  return <>{t("manualTransfer.settings.label")}</>
}

export const config = defineRouteConfig({
  label: "manualTransfer.settings.label",
  translationNs: "translation",
})

export const handle = {
  breadcrumb: () => <Breadcrumb />,
}

export default ManualTransferSettingsPage
