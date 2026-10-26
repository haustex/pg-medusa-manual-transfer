import { model } from "@medusajs/framework/utils"

/**
 * Contents of a payment proof, base64. Kept in the database on purpose: it is
 * private by construction (nothing serves it except the signed admin URL),
 * needs no storage setup, and works the same for the server and the worker.
 * Proofs are capped at 5 MB.
 */
const ManualTransferProofFile = model.define("manual_transfer_proof_file", {
  id: model.id({ prefix: "mtpfile" }).primaryKey(),
  content: model.text(),
})

export default ManualTransferProofFile
