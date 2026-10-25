import type { Knex } from "@medusajs/framework/mikro-orm/knex"

/**
 * Bank accounts as the payment provider sees them.
 *
 * The provider lives in the Payment Module's container and cannot resolve the
 * manualTransfer module, so it reads `manual_transfer_account` straight through
 * the shared `__pg_connection__` that Medusa injects into every module. There is
 * deliberately no in-process cache: the server and the worker (workerMode
 * "server" / "worker") must both see an account the moment the Admin saves it,
 * and one indexed query per payment session is cheap.
 */

export const ACCOUNT_TABLE = "manual_transfer_account"

/** Columns of manual_transfer_account (src/modules/manualTransfer/models/manual-transfer-account.ts) */
export type AccountRow = {
  id: string
  label: string | null
  bank_name: string
  account_holder: string
  account_number: string
  swift_code: string | null
  bank_address: string | null
  currency_code: string
  region_ids: string[] | null
  is_active: boolean
  rank: number
}

/** What is copied into the payment session, so later edits never change an order's instructions */
export type AccountSnapshot = {
  id: string
  bank_name: string
  account_holder: string
  account_number: string
  swift_code: string | null
  bank_address: string | null
  currency_code: string
}

const COLUMNS = [
  "id",
  "label",
  "bank_name",
  "account_holder",
  "account_number",
  "swift_code",
  "bank_address",
  "currency_code",
  "region_ids",
  "is_active",
  "rank",
] as const

export async function listActiveAccounts(
  pg: Knex,
  currencyCode: string
): Promise<AccountRow[]> {
  return pg(ACCOUNT_TABLE)
    .select(COLUMNS as unknown as string[])
    .whereNull("deleted_at")
    .andWhere("is_active", true)
    .andWhere("currency_code", currencyCode.toLowerCase())
    .orderBy([
      { column: "rank", order: "asc" },
      { column: "created_at", order: "asc" },
    ])
}

/**
 * Picks the account for a session: the requested one if it matches, otherwise
 * the first account offered in the region (accounts without regions are
 * offered everywhere).
 */
export function pickAccount(
  rows: AccountRow[],
  { regionId, accountId }: { regionId?: string | null; accountId?: string | null } = {}
): AccountRow | null {
  const inRegion = rows.filter(
    (row) => !row.region_ids?.length || (!!regionId && row.region_ids.includes(regionId))
  )
  if (accountId) {
    const requested = inRegion.find((row) => row.id === accountId)
    if (requested) {
      return requested
    }
  }
  return inRegion[0] ?? null
}

export function snapshotAccount(row: AccountRow): AccountSnapshot {
  return {
    id: row.id,
    bank_name: row.bank_name,
    account_holder: row.account_holder,
    account_number: row.account_number,
    swift_code: row.swift_code,
    bank_address: row.bank_address,
    currency_code: row.currency_code,
  }
}
