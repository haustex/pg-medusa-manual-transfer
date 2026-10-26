import type { Logger, MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { getProofRetentionDays } from "../lib/plugin-options"
import { findProofFilesToPurge } from "../lib/transfer-queue"
import { purgeManualTransferProofFilesWorkflow } from "../workflows/purge-manual-transfer-proof-files"

const BATCH = 100
const MAX_BATCHES = 50

/**
 * Daily, only with the plugin option `proofRetentionDays`: deletes the file
 * contents of proofs whose payment was captured (paid) or canceled more than
 * that many days ago. Proof records, history and hashes stay.
 */
export default async function manualTransferProofRetentionJob(container: MedusaContainer) {
  const days = getProofRetentionDays(container)
  if (days === null) {
    return
  }
  const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER)
  const pg = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const before = new Date(Date.now() - days * 24 * 3600_000)

  let purged = 0
  for (let i = 0; i < MAX_BATCHES; i++) {
    const proofs = await findProofFilesToPurge(pg, before, BATCH)
    if (!proofs.length) {
      break
    }
    await purgeManualTransferProofFilesWorkflow(container).run({ input: { proofs } })
    purged += proofs.length
    if (proofs.length < BATCH) {
      break
    }
  }
  if (purged) {
    logger.info(`manual transfer: deleted ${purged} payment proof file(s) older than ${days} days`)
  }
}

export const config = {
  name: "manual-transfer-proof-retention",
  schedule: "30 3 * * *",
}
