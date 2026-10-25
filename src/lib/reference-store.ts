import type { Knex } from "@medusajs/framework/mikro-orm/knex"
import { generateEntityId, MedusaError } from "@medusajs/framework/utils"
import { generateReference } from "./reference"

/**
 * Issues payment references that the database guarantees to be unique.
 *
 * Like the account lookup, this runs inside the Payment Module's container and
 * goes through the shared `__pg_connection__`. A code is only handed out after
 * it was inserted into manual_transfer_reference; a unique violation means the
 * code was already issued, so a new one is drawn.
 */

export const REFERENCE_TABLE = "manual_transfer_reference"
export const MAX_REFERENCE_ATTEMPTS = 8

const UNIQUE_VIOLATION = "23505"

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === UNIQUE_VIOLATION
}

export async function reserveReference(
  pg: Knex,
  {
    prefix,
    sessionId = null,
    generate = generateReference,
  }: {
    prefix: string
    sessionId?: string | null
    /** Injectable for tests */
    generate?: (prefix: string) => string
  }
): Promise<string> {
  for (let attempt = 1; attempt <= MAX_REFERENCE_ATTEMPTS; attempt++) {
    const code = generate(prefix)
    try {
      await pg(REFERENCE_TABLE).insert({
        id: generateEntityId(undefined, "mtref"),
        code,
        payment_session_id: sessionId,
      })
      return code
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error
      }
    }
  }
  throw new MedusaError(
    MedusaError.Types.UNEXPECTED_STATE,
    `Could not issue a unique payment reference after ${MAX_REFERENCE_ATTEMPTS} attempts`
  )
}
