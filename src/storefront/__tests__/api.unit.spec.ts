import { backendHeaders, BackendConfig, clientIpFrom, forwardProof, getTransfer, getUploadToken } from "../api"

const config: BackendConfig = {
  baseUrl: "http://backend.test/",
  publishableKey: "pk_test",
  authorization: null,
  clientIp: "203.0.113.7",
  proxySecret: "shared-secret",
}

const headersOf = (values: Record<string, string>) => ({ get: (name: string) => values[name] ?? null })

describe("clientIpFrom", () => {
  it("prefers X-Real-IP, then the first X-Forwarded-For entry", () => {
    expect(clientIpFrom(headersOf({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1" }))).toBe("203.0.113.7")
    expect(clientIpFrom(headersOf({ "x-forwarded-for": " 198.51.100.1 , 10.0.0.1" }))).toBe("198.51.100.1")
    expect(clientIpFrom(headersOf({}))).toBeNull()
  })
})

describe("backendHeaders", () => {
  it("sends the buyer's IP only together with the proxy secret", () => {
    expect(backendHeaders(config, "tok")).toEqual({
      "x-publishable-api-key": "pk_test",
      "x-manual-transfer-token": "tok",
      "x-mt-client-ip": "203.0.113.7",
      "x-mt-proxy-secret": "shared-secret",
    })
    const withoutSecret = backendHeaders({ ...config, proxySecret: null })
    expect(withoutSecret).not.toHaveProperty("x-mt-client-ip")
    expect(withoutSecret).not.toHaveProperty("x-mt-proxy-secret")
    expect(backendHeaders({ ...config, clientIp: null })).not.toHaveProperty("x-mt-proxy-secret")
  })

  it("passes the customer's JWT", () => {
    expect(backendHeaders({ ...config, authorization: "Bearer jwt" }).authorization).toBe("Bearer jwt")
  })
})

describe("backend calls", () => {
  const realFetch = globalThis.fetch
  let calls: { url: string; init: RequestInit }[] = []
  const answer = (response: Response) => {
    globalThis.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} })
      return response
    }) as typeof fetch
  }
  beforeEach(() => (calls = []))
  afterEach(() => (globalThis.fetch = realFetch))

  it("reads the transfer, null when the backend refuses", async () => {
    answer(Response.json({ manual_transfer: { order_id: "order_1" } }))
    expect(await getTransfer(config, "order_1", "tok")).toEqual({ order_id: "order_1" })
    expect(calls[0].url).toBe("http://backend.test/store/manual-transfer/orders/order_1")
    answer(Response.json({ type: "not_found" }, { status: 404 }))
    expect(await getTransfer(config, "order_1")).toBeNull()
  })

  it("trades a cart id for the upload token", async () => {
    answer(Response.json({ token: "tok" }))
    expect(await getUploadToken(config, "cart 1")).toBe("tok")
    expect(calls[0].url).toBe("http://backend.test/store/manual-transfer/carts/cart%201/upload-token")
  })

  it("forwards an upload without the token field, and relays only safe headers", async () => {
    answer(
      new Response('{"proof":{}}', {
        status: 201,
        headers: { "content-type": "application/json", "set-cookie": "x=1", "retry-after": "5" },
      })
    )
    const form = new FormData()
    form.append("file", new Blob(["%PDF-1.4"]), "a.pdf")
    form.append("token", "tok")
    const response = await forwardProof(config, "order_1", new Request("http://shop.test/api", { method: "POST", body: form }))
    expect(response.status).toBe(201)
    expect(response.headers.get("set-cookie")).toBeNull()
    expect(response.headers.get("retry-after")).toBe("5")
    const sent = calls[0].init
    expect((sent.headers as Record<string, string>)["x-manual-transfer-token"]).toBe("tok")
    expect((sent.body as FormData).has("token")).toBe(false)
    expect((sent.body as FormData).has("file")).toBe(true)
  })

  it("refuses an oversized body before reading it", async () => {
    answer(new Response(null, { status: 500 }))
    const request = new Request("http://shop.test/api", { method: "POST", body: "x", headers: { "content-length": String(7 * 1024 * 1024) } })
    expect((await forwardProof(config, "order_1", request)).status).toBe(413)
    expect(calls).toHaveLength(0)
  })
})
