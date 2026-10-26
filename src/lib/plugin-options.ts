import type { ConfigModule, MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import type { SigningSecret } from "./tokens"

/**
 * Options of the plugin entry in medusa-config (`plugins: [{ resolve, options }]`),
 * as opposed to the payment provider's own options.
 */
export type ManualTransferPluginOptions = {
  /** Show the small Haus Kayu credit in the Admin (phase 3). Default true. */
  showCredit?: boolean
  /** Secret for guest upload links and signed proof URLs. Default: MANUAL_TRANSFER_SECRET, then http.jwtSecret. */
  secret?: string
  proofUploads?: {
    /** Uploads one IP may attempt per window. Default 10. */
    perIp?: number
    /** Window for perIp, in minutes. Default 15. */
    perIpWindowMinutes?: number
    /** Status reads one IP may make per minute. Default 120. */
    readsPerIpPerMinute?: number
    /** Proofs one order may receive per 24 hours. Default 5. */
    perOrderPerDay?: number
  }
}

export const PACKAGE_NAME = "medusa-payment-manual-transfer"

export const DEFAULT_PROOF_LIMITS = {
  perIp: 10,
  perIpWindowMinutes: 15,
  readsPerIpPerMinute: 120,
  perOrderPerDay: 5,
}

function configModule(container: MedusaContainer): ConfigModule {
  return container.resolve(ContainerRegistrationKeys.CONFIG_MODULE)
}

export function getPluginOptions(container: MedusaContainer): ManualTransferPluginOptions {
  const plugins = (configModule(container).plugins ?? []) as (string | { resolve: string; options?: unknown })[]
  for (const plugin of plugins) {
    const resolve = typeof plugin === "string" ? plugin : plugin.resolve
    // Installed from npm, or linked by path in development
    if (resolve === PACKAGE_NAME || resolve.replace(/\/+$/, "").endsWith(`/${PACKAGE_NAME}`)) {
      return (typeof plugin === "string" ? {} : (plugin.options as ManualTransferPluginOptions)) ?? {}
    }
  }
  return {}
}

export function getProofLimits(container: MedusaContainer) {
  return { ...DEFAULT_PROOF_LIMITS, ...(getPluginOptions(container).proofUploads ?? {}) }
}

export function getSigningSecret(container: MedusaContainer): SigningSecret {
  const jwtSecret = configModule(container).projectConfig?.http?.jwtSecret
  // jwtSecret may also be a { key, passphrase } pair for asymmetric JWTs
  const fromJwt =
    jwtSecret && typeof jwtSecret === "object" && "key" in jwtSecret ? jwtSecret.key : jwtSecret
  const secret = getPluginOptions(container).secret || process.env.MANUAL_TRANSFER_SECRET || fromJwt
  if (!secret) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      "manual transfer: set MANUAL_TRANSFER_SECRET (or http.jwtSecret) to sign upload links"
    )
  }
  return secret
}
