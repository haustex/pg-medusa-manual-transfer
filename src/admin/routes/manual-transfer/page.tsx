import { defineRouteConfig } from "@medusajs/admin-sdk"
import { CreditCard, InformationCircle } from "@medusajs/icons"
import {
  Badge,
  Container,
  createDataTableColumnHelper,
  DataTable,
  DataTablePaginationState,
  Heading,
  StatusBadge,
  Tabs,
  Text,
  useDataTable,
} from "@medusajs/ui"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate, useSearchParams } from "react-router-dom"
import { CreditFooter } from "../../components/credit-footer"
import { BankCheckWarning } from "../../components/transfer-actions"
import {
  formatAmount,
  formatDateTime,
  listTransfers,
  STATUS_COLOR,
  TransferListRow,
  TRANSFERS_QUERY_KEY,
} from "../../lib/transfer"

/** Tabs of the queue, one per status, and every payment */
const TABS = [
  "awaiting_verification",
  "awaiting_payment",
  "underpaid",
  "rejected",
  "paid",
  "expired",
  "canceled",
  "all",
] as const

const PAGE_SIZE = 20

const columnHelper = createDataTableColumnHelper<TransferListRow>()

const ManualTransferQueuePage = () => {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const requested = params.get("status") ?? "awaiting_verification"
  const tab = (TABS as readonly string[]).includes(requested) ? requested : "awaiting_verification"
  const [search, setSearch] = useState("")
  const [pagination, setPagination] = useState<DataTablePaginationState>({ pageIndex: 0, pageSize: PAGE_SIZE })

  const { data, isLoading, isError } = useQuery({
    queryKey: [...TRANSFERS_QUERY_KEY, tab, search, pagination.pageIndex],
    queryFn: () =>
      listTransfers({
        status: tab === "all" ? undefined : tab,
        q: search || undefined,
        limit: PAGE_SIZE,
        offset: pagination.pageIndex * PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  })
  const counts = data?.counts ?? {}
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0)

  const columns = useMemo(
    () => [
      columnHelper.accessor("display_id", {
        header: t("manualTransfer.queue.order"),
        cell: ({ row }) => (
          <div className="flex flex-col">
            <Text size="small" leading="compact" weight="plus">
              #{row.original.display_id ?? "-"}
            </Text>
            <Text size="xsmall" leading="compact" className="text-ui-fg-subtle truncate">
              {row.original.email ?? "-"}
            </Text>
          </div>
        ),
      }),
      columnHelper.accessor("reference", {
        header: t("manualTransfer.widget.reference"),
        cell: ({ getValue }) => (
          <Text size="small" leading="compact" className="font-mono">
            {getValue() ?? "-"}
          </Text>
        ),
      }),
      columnHelper.accessor("amount", {
        header: t("manualTransfer.widget.amount"),
        cell: ({ row }) => formatAmount(row.original.amount, row.original.currency_code, i18n.language),
      }),
      columnHelper.accessor("status", {
        header: t("manualTransfer.queue.status"),
        cell: ({ getValue }) => {
          const status = getValue() ?? "awaiting_payment"
          return (
            <StatusBadge color={STATUS_COLOR[status] ?? "grey"}>
              {t(`manualTransfer.status.${status}`, { defaultValue: status })}
            </StatusBadge>
          )
        },
      }),
      columnHelper.accessor("last_proof_at", {
        header: t("manualTransfer.queue.proof"),
        cell: ({ getValue }) => (getValue() ? formatDateTime(getValue(), i18n.language) : "-"),
      }),
      columnHelper.accessor("expires_at", {
        header: t("manualTransfer.widget.deadline"),
        cell: ({ row }) => {
          const { expires_at, status } = row.original
          const late =
            !!expires_at &&
            Date.parse(expires_at) < Date.now() &&
            ["awaiting_payment", "awaiting_verification", "underpaid", "rejected"].includes(status ?? "")
          return (
            <Text size="small" leading="compact" className={late ? "text-ui-fg-error" : undefined}>
              {formatDateTime(expires_at, i18n.language)}
            </Text>
          )
        },
      }),
    ],
    [t, i18n.language]
  )

  const table = useDataTable({
    data: data?.payments ?? [],
    columns,
    getRowId: (row) => row.payment_id,
    rowCount: data?.count ?? 0,
    isLoading,
    search: {
      state: search,
      onSearchChange: (value) => {
        setSearch(value)
        setPagination((p) => ({ ...p, pageIndex: 0 }))
      },
    },
    pagination: { state: pagination, onPaginationChange: setPagination },
    onRowClick: (_, row) => navigate(`/orders/${row.order_id}`),
  })

  const selectTab = (value: string) => {
    setParams(value === "awaiting_verification" ? {} : { status: value })
    setPagination((p) => ({ ...p, pageIndex: 0 }))
  }

  return (
    // minWidth 0 keeps the wide table from stretching the page on phones
    <div className="flex flex-col gap-y-3" style={{ minWidth: 0 }}>
      <Container className="divide-y overflow-hidden p-0">
        <div className="flex flex-col gap-y-1 px-6 py-4">
          <Heading level="h1">{t("manualTransfer.queue.title")}</Heading>
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            {t("manualTransfer.queue.description")}
          </Text>
        </div>
        <div className="flex flex-col gap-y-3 px-6 py-4">
          <BankCheckWarning />
          <div className="flex items-start gap-x-1.5">
            <InformationCircle className="text-ui-fg-muted mt-0.5 shrink-0" />
            <Text size="xsmall" leading="compact" className="text-ui-fg-muted">
              {t("manualTransfer.widget.nativeCapture")}
            </Text>
          </div>
        </div>
        {/* Scrolls sideways on narrow screens; inline because the dashboard's CSS may lack overflow-x-auto */}
        <div className="px-6 py-3" style={{ overflowX: "auto" }}>
          <Tabs value={tab} onValueChange={selectTab}>
            <Tabs.List>
              {TABS.map((value) => {
                const count = value === "all" ? total : counts[value] ?? 0
                return (
                  <Tabs.Trigger key={value} value={value} className="gap-x-1.5 whitespace-nowrap">
                    {t(`manualTransfer.queue.tabs.${value}`)}
                    {count > 0 && (
                      <Badge size="2xsmall" color={value === "awaiting_verification" ? "blue" : "grey"}>
                        {count}
                      </Badge>
                    )}
                  </Tabs.Trigger>
                )
              })}
            </Tabs.List>
          </Tabs>
        </div>
        {isError ? (
          <div className="px-6 py-4">
            <Text size="small" className="text-ui-fg-error">
              {t("manualTransfer.queue.loadError")}
            </Text>
          </div>
        ) : (
          <DataTable instance={table}>
            <DataTable.Toolbar className="px-6 py-4">
              <DataTable.Search placeholder={t("manualTransfer.queue.search")} />
            </DataTable.Toolbar>
            <DataTable.Table
              emptyState={{
                empty: { heading: t("manualTransfer.queue.empty"), description: t("manualTransfer.queue.emptyHint") },
                filtered: { heading: t("manualTransfer.queue.noMatch") },
              }}
            />
            <DataTable.Pagination />
          </DataTable>
        )}
      </Container>
      <CreditFooter />
    </div>
  )
}

const Breadcrumb = () => {
  const { t } = useTranslation()
  return <>{t("manualTransfer.queue.label")}</>
}

export const config = defineRouteConfig({
  label: "manualTransfer.queue.label",
  translationNs: "translation",
  icon: CreditCard,
})

export const handle = {
  breadcrumb: () => <Breadcrumb />,
}

export default ManualTransferQueuePage
