// The buyer's IP behind a storefront (plugin option trustedProxySecret): the
// backend trusts x-mt-client-ip only with the matching x-mt-proxy-secret, and
// otherwise counts the connection's IP; X-Forwarded-For is never read.
// Runs after phase 2, which used up 127.0.0.1's upload budget (40 in the test
// app): an upload that gets past the limiter answers 400 (a GIF is refused).
import { PROXY_SECRET } from "../env.mjs"

const GIF = Buffer.from("GIF89a\x01\x00\x01\x00\x00\x00\x00;", "latin1")

export async function clientIp(ctx) {
  const { check, raw, loadOrders } = ctx
  const { verify: orderId, verifyToken: token } = loadOrders()

  const send = (headers = {}) => {
    const fd = new FormData()
    fd.append("file", new Blob([GIF]), "spam.gif")
    return raw("POST", `/store/manual-transfer/orders/${orderId}/proofs`, {
      body: fd,
      headers: { "x-manual-transfer-token": token, ...headers },
    })
  }
  const vouched = (ip) => ({ "x-mt-client-ip": ip, "x-mt-proxy-secret": PROXY_SECRET })

  check("connection IP is out of upload budget", (await send()).status === 429)
  const forged = await send({ "x-mt-client-ip": "203.0.113.10" })
  check("forged x-mt-client-ip without secret -> still 429", forged.status === 429, forged.status)
  const wrong = await send({ "x-mt-client-ip": "203.0.113.11", "x-mt-proxy-secret": "guessed-secret" })
  check("x-mt-client-ip with a wrong secret -> still 429", wrong.status === 429, wrong.status)
  const xff = await send({ "x-forwarded-for": "203.0.113.12", "x-real-ip": "203.0.113.12" })
  check("X-Forwarded-For / X-Real-IP ignored -> still 429", xff.status === 429, xff.status)
  const notIp = await send(vouched("not-an-ip"))
  check("secret with an invalid IP -> connection IP, 429", notIp.status === 429, notIp.status)
  const ok = await send(vouched("203.0.113.20"))
  check("secret + x-mt-client-ip -> own budget (past the limiter)", ok.status === 400, { status: ok.status, json: ok.json })

  // The vouched IP has a budget of its own, and its neighbour another one
  let limitedAfter = null
  for (let i = 1; i <= 45 && limitedAfter === null; i++) {
    if ((await send(vouched("203.0.113.30"))).status === 429) limitedAfter = i
  }
  check("vouched IP limited after 40 uploads", limitedAfter === 41, limitedAfter)
  const other = await send(vouched("203.0.113.31"))
  check("another vouched IP still has its budget", other.status === 400, other.status)
  const v6 = await send(vouched("2001:db8::31"))
  check("IPv6 client IP accepted", v6.status === 400, v6.status)
}
