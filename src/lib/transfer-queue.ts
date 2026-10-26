import type { Knex } from "@medusajs/framework/mikro-orm/knex"
import { ADMIN_FOLLOW_UP, ManualTransferStatus } from "./payment-data"

/**
 * Manual-transfer payments with their order, read straight from the database.
 * The Payment Module cannot filter on payment.data, where the manual-transfer
 * status and deadline live, so the verification queue and the jobs query the
 * payment table (and the order link) through the shared connection, the same
 * way the provider reads accounts.
 */

export type TransferRow = {
  payment_id: string
  order_id: string
  display_id: number | null
  email: string | null
  amount: number
  currency_code: string
  status: ManualTransferStatus | null
  reference: string | null
  expires_at: string | null
  created_at: string
  last_proof_at: string | null
  /** Start of the current wait for an admin (awaiting verification, underpaid), else null */
  status_since: string | null
  admin_reminded_at: string | null
}

const PROVIDER_PATTERN = "pp_manual-transfer_%"

/** payment ⋈ order of every manual-transfer payment, not deleted */
function base(pg: Knex) {
  return pg("payment as p")
    .join("order_payment_collection as opc", function () {
      this.on("opc.payment_collection_id", "p.payment_collection_id").andOnNull("opc.deleted_at")
    })
    .join("order as o", function () {
      this.on("o.id", "opc.order_id").andOnNull("o.deleted_at")
    })
    .whereNull("p.deleted_at")
    .andWhere("p.provider_id", "like", PROVIDER_PATTERN)
}

/** Still waiting for money: neither captured nor canceled, order not canceled */
function open(query: Knex.QueryBuilder) {
  return query.whereNull("p.captured_at").whereNull("p.canceled_at").andWhereNot("o.status", "canceled")
}

const iso = (value: unknown): string | null => (value ? new Date(value as string).toISOString() : null)

function toRow(raw: Record<string, unknown>): TransferRow {
  return {
    payment_id: raw.payment_id as string,
    order_id: raw.order_id as string,
    display_id: raw.display_id === null || raw.display_id === undefined ? null : Number(raw.display_id),
    email: (raw.email as string) ?? null,
    amount: Number(raw.amount),
    currency_code: raw.currency_code as string,
    status: (raw.status as ManualTransferStatus) ?? null,
    reference: (raw.reference as string) ?? null,
    expires_at: iso(raw.expires_at),
    created_at: iso(raw.created_at)!,
    last_proof_at: iso(raw.last_proof_at),
    status_since: iso(raw.status_since),
    admin_reminded_at: iso(raw.admin_reminded_at),
  }
}

/** Latest history entry of the event that started the status's wait for an admin */
const STATUS_SINCE_SQL = `(
  select max((h->>'at')::timestamptz)
  from jsonb_array_elements(case when jsonb_typeof(p.data->'history') = 'array' then p.data->'history' else '[]'::jsonb end) h
  where h->>'event' = case p.data->>'status' ${Object.entries(ADMIN_FOLLOW_UP)
    .map(([status, event]) => `when '${status}' then '${event}'`)
    .join(" ")} end
) as status_since`

function columns(pg: Knex) {
  return [
    "p.id as payment_id",
    "o.id as order_id",
    "o.display_id",
    "o.email",
    "p.amount",
    "p.currency_code",
    "p.created_at",
    pg.raw("p.data->>'status' as status"),
    pg.raw("p.data->>'reference' as reference"),
    pg.raw("p.data->>'expires_at' as expires_at"),
    pg.raw("p.data->>'admin_reminded_at' as admin_reminded_at"),
    pg.raw(
      "(select max(mp.created_at) from manual_transfer_proof mp where mp.payment_id = p.id and mp.deleted_at is null) as last_proof_at"
    ),
    pg.raw(STATUS_SINCE_SQL),
  ]
}

export type ListTransfersFilter = {
  statuses?: readonly ManualTransferStatus[]
  /** Reference, e-mail or order number */
  q?: string
  limit: number
  offset: number
}

export async function listTransfers(
  pg: Knex,
  { statuses, q, limit, offset }: ListTransfersFilter
): Promise<{ rows: TransferRow[]; count: number }> {
  const filtered = base(pg)
  if (statuses?.length) {
    filtered.whereRaw("p.data->>'status' = any(?)", [statuses as string[]])
  }
  const search = q?.trim()
  if (search) {
    filtered.andWhere((w) => {
      w.whereRaw("p.data->>'reference' ilike ?", [`%${search}%`]).orWhere("o.email", "ilike", `%${search}%`)
      if (/^#?\d{1,9}$/.test(search)) {
        w.orWhere("o.display_id", Number(search.replace("#", "")))
      }
    })
  }
  const [{ count }] = await filtered.clone().count<{ count: string }[]>({ count: "p.id" })
  const rows = await filtered
    .select(...columns(pg))
    .orderBy("p.created_at", "desc")
    .limit(limit)
    .offset(offset)
  return { rows: rows.map(toRow), count: Number(count) }
}

/** Number of payments per manual-transfer status, for the tab badges */
export async function countTransfersByStatus(pg: Knex): Promise<Record<string, number>> {
  const rows = (await base(pg)
    .select(pg.raw("p.data->>'status' as status"))
    .count({ count: "p.id" })
    .groupByRaw("p.data->>'status'")) as unknown as { status: string | null; count: string }[]
  return Object.fromEntries(rows.map((r) => [String(r.status), Number(r.count)]))
}

/**
 * Open payments waiting for an admin (awaiting verification, underpaid), oldest
 * first; the caller decides with src/lib/overdue.ts which ones are late.
 */
export async function listFollowUps(pg: Knex, limit = 500): Promise<TransferRow[]> {
  const rows = await open(base(pg))
    .whereRaw("p.data->>'status' = any(?)", [Object.keys(ADMIN_FOLLOW_UP)])
    .select(...columns(pg))
    .orderBy("p.created_at", "asc")
    .limit(limit)
  return rows.map(toRow)
}

/** The order a manual-transfer payment belongs to */
export async function findPaymentOrderId(pg: Knex, paymentId: string): Promise<string | null> {
  const row = await base(pg).where("p.id", paymentId).first("o.id as order_id")
  return (row?.order_id as string | undefined) ?? null
}

/** Payments by id, with their order (for the admin digest) */
export async function listTransfersById(pg: Knex, paymentIds: string[]): Promise<TransferRow[]> {
  if (!paymentIds.length) {
    return []
  }
  const rows = await base(pg).whereIn("p.id", paymentIds).select(...columns(pg)).orderBy("p.created_at", "asc")
  return rows.map(toRow)
}

export type DueTransfer = { payment_id: string; order_id: string }

/** Open payments in one of `statuses` whose deadline is at or before `before` */
export async function findTransfersDue(
  pg: Knex,
  {
    statuses,
    before,
    after,
    notReminded = false,
    limit = 100,
  }: {
    statuses: readonly ManualTransferStatus[]
    before: Date
    after?: Date
    notReminded?: boolean
    limit?: number
  }
): Promise<DueTransfer[]> {
  const query = open(base(pg))
    .whereRaw("p.data->>'status' = any(?)", [statuses as string[]])
    .whereRaw("(p.data->>'expires_at')::timestamptz <= ?", [before.toISOString()])
  if (after) {
    query.whereRaw("(p.data->>'expires_at')::timestamptz > ?", [after.toISOString()])
  }
  if (notReminded) {
    query.whereRaw("p.data->>'reminded_at' is null")
  }
  return query
    .select("p.id as payment_id", "o.id as order_id")
    .orderByRaw("(p.data->>'expires_at')::timestamptz asc")
    .limit(limit)
}

/**
 * Proofs whose file is still stored although their payment was captured or
 * canceled before `before`.
 */
export async function findProofFilesToPurge(
  pg: Knex,
  before: Date,
  limit = 100
): Promise<{ proof_id: string; file_id: string }[]> {
  return pg("manual_transfer_proof as mp")
    .join("payment as p", "p.id", "mp.payment_id")
    .whereNull("mp.deleted_at")
    .whereNull("mp.file_deleted_at")
    .andWhere((w) => w.where("p.captured_at", "<", before).orWhere("p.canceled_at", "<", before))
    .select("mp.id as proof_id", "mp.file_id")
    .orderBy("mp.created_at", "asc")
    .limit(limit)
}
