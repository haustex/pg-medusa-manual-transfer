import { model } from "@medusajs/framework/utils"

/**
 * Every payment reference ever issued. The unique index on `code` is what
 * makes references unique: the provider inserts here before handing a code
 * out and draws a new one on a conflict (see src/lib/reference-store.ts).
 * Rows are never deleted, so a code is never reused either.
 */
const ManualTransferReference = model
  .define("manual_transfer_reference", {
    id: model.id({ prefix: "mtref" }).primaryKey(),
    code: model.text().unique(),
    payment_session_id: model.text().nullable(),
  })
  .indexes([{ on: ["payment_session_id"] }])

export default ManualTransferReference
