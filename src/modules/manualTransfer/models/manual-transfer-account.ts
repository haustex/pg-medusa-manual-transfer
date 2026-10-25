import { model } from "@medusajs/framework/utils"

/**
 * A bank account buyers transfer to. Managed from the Admin; the payment
 * provider reads this table directly (see src/lib/accounts.ts), so keep the
 * column names in sync with `AccountRow` there.
 */
const ManualTransferAccount = model
  .define("manual_transfer_account", {
    id: model.id({ prefix: "mtacc" }).primaryKey(),
    /** Internal name shown in the Admin, e.g. "Jago USD pocket" */
    label: model.text().nullable(),
    bank_name: model.text(),
    account_holder: model.text(),
    account_number: model.text(),
    swift_code: model.text().nullable(),
    bank_address: model.text().nullable(),
    /** lower-case ISO 4217, e.g. "usd" */
    currency_code: model.text(),
    /** Region ids this account is offered in; empty means every region */
    region_ids: model.array().default([]),
    is_active: model.boolean().default(true),
    /** Lower comes first when several accounts match */
    rank: model.number().default(0),
    metadata: model.json().nullable(),
  })
  .indexes([{ on: ["currency_code", "is_active"], where: "deleted_at IS NULL" }])

export default ManualTransferAccount
