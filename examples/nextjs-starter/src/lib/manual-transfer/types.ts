/** GET /store/manual-transfer/orders/:id → manual_transfer */

export type TransferStatus =
  | "awaiting_payment"
  | "awaiting_verification"
  | "paid"
  | "underpaid"
  | "rejected"
  | "expired"
  | "canceled"

export type TransferProof = {
  id: string
  filename: string
  mime_type: string
  size: number
  status: "pending" | "accepted" | "rejected"
  rejection_reason: string | null
  created_at: string
}

export type TransferView = {
  order_id: string
  display_id: number | null
  reference: string | null
  status: TransferStatus | null
  amount: number
  currency_code: string
  amount_received: number
  amount_remaining: number
  expires_at: string | null
  account: {
    bank_name: string
    account_holder: string
    account_number: string
    swift_code: string | null
    bank_address: string | null
    currency_code: string
  } | null
  can_upload: boolean
  proofs: TransferProof[]
}

/** The payment provider id of the plugin, as registered with `id: "manual-transfer"` in medusa-config */
export const MANUAL_TRANSFER_PROVIDER = "pp_manual-transfer_manual-transfer"

export const isManualTransfer = (providerId?: string | null) => !!providerId?.startsWith("pp_manual-transfer_")
