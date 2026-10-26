import { DEFAULT_PROOF_LIMITS, getPluginOptions, getProofLimits, getSigningSecret } from "../plugin-options"

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
  })

  it("merges proof limits over the defaults", () => {
    const c = container({ plugins: [{ resolve: "medusa-payment-manual-transfer", options: { proofUploads: { perOrderPerDay: 2 } } }] })
    expect(getProofLimits(c)).toEqual({ ...DEFAULT_PROOF_LIMITS, perOrderPerDay: 2 })
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
