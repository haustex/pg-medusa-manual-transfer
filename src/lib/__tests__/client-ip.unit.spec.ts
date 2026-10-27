import { clientIp, normalizeIp } from "../client-ip"

const SECRET = "storefront-shared-secret-0123456789"

function request(headers: Record<string, string | string[]>, remoteAddress = "10.0.0.5") {
  return { headers, socket: { remoteAddress } }
}

describe("clientIp", () => {
  it("uses the storefront's x-mt-client-ip when the secret matches", () => {
    const req = request({ "x-mt-client-ip": "203.0.113.7", "x-mt-proxy-secret": SECRET })
    expect(clientIp(req, SECRET)).toBe("203.0.113.7")
    expect(clientIp(request({ "x-mt-client-ip": "2001:DB8::1", "x-mt-proxy-secret": SECRET }), SECRET)).toBe("2001:db8::1")
  })

  it("ignores a forged x-mt-client-ip sent without the secret", () => {
    expect(clientIp(request({ "x-mt-client-ip": "203.0.113.7" }), SECRET)).toBe("10.0.0.5")
  })

  it("ignores the header with a wrong secret, or when no secret is configured", () => {
    const wrong = request({ "x-mt-client-ip": "203.0.113.7", "x-mt-proxy-secret": "guess" })
    expect(clientIp(wrong, SECRET)).toBe("10.0.0.5")
    const right = request({ "x-mt-client-ip": "203.0.113.7", "x-mt-proxy-secret": SECRET })
    expect(clientIp(right, null)).toBe("10.0.0.5")
    expect(clientIp(right, "")).toBe("10.0.0.5")
  })

  it("never reads X-Forwarded-For", () => {
    const req = request({ "x-forwarded-for": "198.51.100.1", "x-real-ip": "198.51.100.2" })
    expect(clientIp(req, SECRET)).toBe("10.0.0.5")
    expect(clientIp(req, null)).toBe("10.0.0.5")
  })

  it("falls back to the connection for a value that is not one IP", () => {
    for (const value of ["not-an-ip", "203.0.113.7, 198.51.100.1", "", "203.0.113.7:443"]) {
      expect(clientIp(request({ "x-mt-client-ip": value, "x-mt-proxy-secret": SECRET }), SECRET)).toBe("10.0.0.5")
    }
    // The header sent twice
    const twice = request({ "x-mt-client-ip": ["203.0.113.7", "198.51.100.1"], "x-mt-proxy-secret": SECRET })
    expect(clientIp(twice, SECRET)).toBe("10.0.0.5")
  })

  it("normalizes IPv4 on a dual-stack socket", () => {
    expect(normalizeIp("::ffff:127.0.0.1")).toBe("127.0.0.1")
    expect(clientIp(request({}, "::ffff:192.0.2.9"), SECRET)).toBe("192.0.2.9")
    expect(clientIp({ headers: {}, socket: null }, SECRET)).toBe("unknown")
  })
})
