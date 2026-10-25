import { sdk } from "./client"

export type ManualTransferAccount = {
  id: string
  label: string | null
  bank_name: string
  account_holder: string
  account_number: string
  swift_code: string | null
  bank_address: string | null
  currency_code: string
  region_ids: string[]
  is_active: boolean
  rank: number
  created_at: string
  updated_at: string
}

export type AccountInput = {
  label: string | null
  bank_name: string
  account_holder: string
  account_number: string
  swift_code: string | null
  bank_address: string | null
  currency_code: string
  region_ids: string[]
  is_active: boolean
  rank: number
}

export const ACCOUNTS_QUERY_KEY = ["manual-transfer-accounts"]

export function listAccounts() {
  return sdk.client.fetch<{ accounts: ManualTransferAccount[] }>("/admin/manual-transfer/accounts")
}

export function createAccount(body: AccountInput) {
  return sdk.client.fetch<{ account: ManualTransferAccount }>("/admin/manual-transfer/accounts", {
    method: "POST",
    body,
  })
}

export function updateAccount(id: string, body: Partial<AccountInput>) {
  return sdk.client.fetch<{ account: ManualTransferAccount }>(`/admin/manual-transfer/accounts/${id}`, {
    method: "POST",
    body,
  })
}

export function deleteAccount(id: string) {
  return sdk.client.fetch<{ id: string; deleted: boolean }>(`/admin/manual-transfer/accounts/${id}`, {
    method: "DELETE",
  })
}

export function emptyAccountInput(): AccountInput {
  return {
    label: null,
    bank_name: "",
    account_holder: "",
    account_number: "",
    swift_code: null,
    bank_address: null,
    currency_code: "usd",
    region_ids: [],
    is_active: true,
    rank: 0,
  }
}

export function toAccountInput(account: ManualTransferAccount): AccountInput {
  return {
    label: account.label,
    bank_name: account.bank_name,
    account_holder: account.account_holder,
    account_number: account.account_number,
    swift_code: account.swift_code,
    bank_address: account.bank_address,
    currency_code: account.currency_code,
    region_ids: account.region_ids ?? [],
    is_active: account.is_active,
    rank: account.rank,
  }
}
