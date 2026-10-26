import { model } from "@medusajs/framework/utils"

/**
 * A payment proof a buyer uploaded for an order. The file itself lives in
 * manual_transfer_proof_file so listing proofs never loads file contents.
 */
const ManualTransferProof = model
  .define("manual_transfer_proof", {
    id: model.id({ prefix: "mtproof" }).primaryKey(),
    order_id: model.text(),
    payment_id: model.text(),
    reference: model.text().nullable(),
    file_id: model.text(),
    /** Original name, cleaned; only for display */
    filename: model.text(),
    /** Detected from the file's magic bytes, not from what the browser claimed */
    mime_type: model.enum(["image/jpeg", "image/png", "application/pdf"]),
    size: model.number(),
    sha256: model.text(),
    status: model.enum(["pending", "accepted", "rejected"]).default("pending"),
    rejection_reason: model.text().nullable(),
    reviewed_by: model.text().nullable(),
    reviewed_at: model.dateTime().nullable(),
    uploaded_by: model.enum(["customer", "guest"]),
    customer_id: model.text().nullable(),
    note: model.text().nullable(),
    /** Set when the same file was already uploaded for another order */
    duplicate_of_order_id: model.text().nullable(),
  })
  .indexes([{ on: ["order_id"] }, { on: ["payment_id"] }, { on: ["sha256"] }])

export default ManualTransferProof
