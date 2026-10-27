import path from "node:path"
import {
  DEFAULT_PROOF_LIMITS,
  getDeadlineOptions,
  getPluginOptions,
  getProofLimits,
  getProofRetentionDays,
  getSigningSecret,
  getTrustedProxySecret,
} from "../plugin-options"

function container(config: Record<string, unknown>) {
  return { resolve: () => config } as never
}

describe("plugin options", () => {
  it("finds the plugin by package name or by a path ending in it", () => {
    const options = { showCredit: false }
    expect(getPluginOptions(container({ plugins: [{ resolve: "medusa-payment-manual-transfer", options }] }))).toBe(options)
    expect(getPluginOptions(container({ plugins: ["x", { resolve: "/srv/medusa-payment-manual-transfer/", options }] }))).toBe(options)
    expect(getPluginOptions(container({ plugins: [{ resolve: "medusa-payment-manual-transfer-extra", options }] }))).toEqual({})
    expect(getPluginOptions(container({}))).toEqual({})
    // A checkout under another folder name, recognised by its package.json
    const checkout = path.resolve(__dirname, "../../..")
    expect(getPluginOptions(container({ plugins: [{ resolve: checkout, options }] }))).toBe(options)
    expect(getPluginOptions(container({ plugins: [{ resolve: path.join(checkout, "src"), options }] }))).toEqual({})
  })

  it("merges proof limits over the defaults", () => {
    const c = container({ plugins: [{ resolve: "medusa-payment-manual-transfer", options: { proofUploads: { perOrderPerDay: 2 } } }] })
    expect(getProofLimits(c)).toEqual({ ...DEFAULT_PROOF_LIMITS, perOrderPerDay: 2 })
  })
})

describe("proofRetentionDays and deadline options", () => {
  const withOptions = (options: Record<string, unknown>) =>
    container({ plugins: [{ resolve: "medusa-payment-manual-transfer", options }] })

  it("keeps proofs forever by default and accepts whole days", () => {
    expect(getProofRetentionDays(container({}))).toBeNull()
    expect(getProofRetentionDays(withOptions({ proofRetentionDays: null }))).toBeNull()
    expect(getProofRetentionDays(withOptions({ proofRetentionDays: 90 }))).toBe(90)
    expect(() => getProofRetentionDays(withOptions({ proofRetentionDays: 0 }))).toThrow(/whole number/)
    expect(() => getProofRetentionDays(withOptions({ proofRetentionDays: 1.5 }))).toThrow(/whole number/)
  })

  it("reminds 24 h ahead and auto-cancels unless turned off", () => {
    expect(getDeadlineOptions(container({}))).toEqual({ reminderHours: 24, autoCancelExpired: true })
    expect(getDeadlineOptions(withOptions({ reminderHours: 6, autoCancelExpired: false }))).toEqual({
      reminderHours: 6,
      autoCancelExpired: false,
    })
    expect(getDeadlineOptions(withOptions({ reminderHours: -1 })).reminderHours).toBe(24)
  })

  it("has its own token-exchange limit", () => {
    expect(getProofLimits(container({}))).toMatchObject({ tokenExchangesPerIp: 10, tokenExchangesWindowMinutes: 60 })
  })
})

describe("getSigningSecret", () => {
  const env = process.env.MANUAL_TRANSFER_SECRET
  afterEach(() => {
    process.env.MANUAL_TRANSFER_SECRET = env
    if (env === undefined) delete process.env.MANUAL_TRANSFER_SECRET
  })

  it("prefers the plugin option, then MANUAL_TRANSFER_SECRET, then jwtSecret", () => {
    delete process.env.MANUAL_TRANSFER_SECRET
    const base = { projectConfig: { http: { jwtSecret: "jwt" } } }
    expect(getSigningSecret(container(base))).toBe("jwt")
    expect(getSigningSecret(container({ projectConfig: { http: { jwtSecret: { key: "pem", passphrase: "p" } } } }))).toBe("pem")
    process.env.MANUAL_TRANSFER_SECRET = "env"
    expect(getSigningSecret(container(base))).toBe("env")
    expect(
      getSigningSecret(container({ ...base, plugins: [{ resolve: "medusa-payment-manual-transfer", options: { secret: "opt" } }] }))
    ).toBe("opt")
  })

  it("refuses to run without any secret", () => {
    delete process.env.MANUAL_TRANSFER_SECRET
    expect(() => getSigningSecret(container({ projectConfig: { http: {} } }))).toThrow(/MANUAL_TRANSFER_SECRET/)
  })
})

describe("getTrustedProxySecret", () => {
  const env = process.env.MANUAL_TRANSFER_PROXY_SECRET
  afterEach(() => {
    process.env.MANUAL_TRANSFER_PROXY_SECRET = env
    if (env === undefined) delete process.env.MANUAL_TRANSFER_PROXY_SECRET
  })

  it("is off by default, then MANUAL_TRANSFER_PROXY_SECRET, the plugin option first", () => {
    delete process.env.MANUAL_TRANSFER_PROXY_SECRET
    expect(getTrustedProxySecret(container({}))).toBeNull()
    process.env.MANUAL_TRANSFER_PROXY_SECRET = "env"
    expect(getTrustedProxySecret(container({}))).toBe("env")
    const withOption = container({ plugins: [{ resolve: "medusa-payment-manual-transfer", options: { trustedProxySecret: "opt" } }] })
    expect(getTrustedProxySecret(withOption)).toBe("opt")
  })
})
