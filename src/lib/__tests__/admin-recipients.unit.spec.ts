import { adminRecipients } from "../notifications/send"

function container(notifications: Record<string, unknown>, users: { email: string | null }[]) {
  const warnings: string[] = []
  const config = { plugins: [{ resolve: "medusa-payment-manual-transfer", options: { notifications } }] }
  const services: Record<string, unknown> = {
    configModule: config,
    logger: { warn: (message: string) => warnings.push(message) },
    query: { graph: async () => ({ data: users }) },
  }
  return { container: { resolve: (key: string) => services[key] } as never, warnings }
}

describe("admin e-mail recipients", () => {
  it("are notifications.adminEmails when set, trimmed and without duplicates", async () => {
    const { container: c, warnings } = container({ adminEmails: [" ops@shop.test", "ops@shop.test", "", "boss@shop.test"] }, [{ email: "dev@shop.test" }])
    expect(await adminRecipients(c)).toEqual({ source: "option", emails: ["ops@shop.test", "boss@shop.test"] })
    expect(warnings).toEqual([])
  })

  it("fall back to every Admin user, with one warning per process", async () => {
    const { container: c, warnings } = container({}, [{ email: "a@shop.test" }, { email: null }, { email: "b@shop.test" }])
    // The settings page reads them without warning
    expect(await adminRecipients(c, { warn: false })).toEqual({ source: "admin_users", emails: ["a@shop.test", "b@shop.test"] })
    expect(warnings).toEqual([])
    await adminRecipients(c)
    await adminRecipients(c)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/notifications\.adminEmails is not set.*every Admin user \(2\)/)
  })
})
