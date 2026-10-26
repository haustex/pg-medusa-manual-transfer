// HTTP helpers, checks and shared state for the E2E phases.
import fs from "node:fs"
import path from "node:path"
import { ADMIN_EMAIL, ADMIN_PASSWORD, BASE, EMAIL_DIR, PROVIDER, psql, readState, STATE_DIR } from "../env.mjs"
import { medusaExec } from "../processes.mjs"

export function createContext() {
  const seed = readState("seed.json")
  let token
  let passed = 0
  let failed = 0

  async function call(method, urlPath, body, { store = false, bearer } = {}) {
    const headers = { "content-type": "application/json" }
    if (store) headers["x-publishable-api-key"] = seed.publishable_key
    if (bearer) headers.authorization = `Bearer ${bearer}`
    else if (!store && token) headers.authorization = `Bearer ${token}`
    const r = await fetch(BASE + urlPath, { method, headers, body: body ? JSON.stringify(body) : undefined })
    const text = await r.text()
    let json
    try {
      json = JSON.parse(text)
    } catch {
      json = { raw: text }
    }
    return { status: r.status, json, headers: r.headers }
  }
  const admin = (m, p, b) => call(m, p, b)
  const store = (m, p, b) => call(m, p, b, { store: true })

  /** Store request without a JSON body (multipart uploads, token headers) */
  async function raw(method, urlPath, { headers = {}, body, token: bearer } = {}) {
    const h = { "x-publishable-api-key": seed.publishable_key, ...headers }
    if (bearer) h.authorization = `Bearer ${bearer}`
    const r = await fetch(BASE + urlPath, { method, headers: h, body })
    const buffer = Buffer.from(await r.arrayBuffer())
    let json
    try {
      json = JSON.parse(buffer.toString("utf8"))
    } catch {
      json = { raw: buffer.toString("utf8", 0, 200) }
    }
    return { status: r.status, json, headers: r.headers, buffer }
  }

  function check(name, ok, detail) {
    if (ok) passed++
    else failed++
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n      ${JSON.stringify(detail).slice(0, 600)}`}`)
  }

  async function login() {
    const res = await call("POST", "/auth/user/emailpass", { email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
    token = res.json.token
    return res
  }

  async function checkout({ regionId = seed.region_id, sessionData = {}, country = "us", customerToken, email = "buyer@e2e.test" } = {}) {
    const s = (m, p, b) => call(m, p, b, { store: true, bearer: customerToken })
    const { json: c } = await s("POST", "/store/carts", { region_id: regionId, ...(customerToken ? {} : { email }) })
    const cart = c.cart
    await s("POST", `/store/carts/${cart.id}/line-items`, { variant_id: seed.variant_id, quantity: 2 })
    await s("POST", `/store/carts/${cart.id}`, {
      shipping_address: { first_name: "Buyer", last_name: "E2E", address_1: "1 Main St", city: "Austin", country_code: country, postal_code: "78701" },
    })
    const sm = await s("POST", `/store/carts/${cart.id}/shipping-methods`, { option_id: seed.option_id })
    if (sm.status !== 200) throw new Error("shipping method: " + JSON.stringify(sm.json))
    const { json: pc } = await s("POST", "/store/payment-collections", { cart_id: cart.id })
    const session = await s("POST", `/store/payment-collections/${pc.payment_collection.id}/payment-sessions`, {
      provider_id: PROVIDER,
      data: sessionData,
    })
    return { cart, session }
  }

  async function orderPayment(orderId) {
    const { json } = await admin(
      "GET",
      `/admin/orders/${orderId}?fields=id,status,payment_status,total,*payment_collections,*payment_collections.payments,*payment_collections.payments.captures`
    )
    return { order: json.order, payment: json.order?.payment_collections?.[0]?.payments?.[0] }
  }

  async function reservedQuantity() {
    const { json } = await admin("GET", `/admin/inventory-items/${seed.inventory_item_id}?fields=reserved_quantity,stocked_quantity`)
    return json.inventory_item?.reserved_quantity
  }

  /** Guest order placed by transfer, with its upload token */
  async function placeOrder(options = {}) {
    const { cart } = await checkout(options)
    const done = await store("POST", `/store/carts/${cart.id}/complete`)
    const orderId = done.json.order.id
    const uploadToken = (await raw("GET", `/store/manual-transfer/carts/${cart.id}/upload-token`)).json.token
    const { order, payment } = await orderPayment(orderId)
    return { orderId, token: uploadToken, total: Number(order.total), payment, display_id: done.json.order.display_id }
  }

  function upload(orderId, uploadToken, buffer, filename = "bukti.png") {
    const fd = new FormData()
    fd.append("file", new Blob([buffer]), filename)
    return raw("POST", `/store/manual-transfer/orders/${orderId}/proofs`, { body: fd, headers: { "x-manual-transfer-token": uploadToken } })
  }

  /** One of the plugin's jobs, through `medusa exec` in its own process group */
  async function runJob(name) {
    const { ok } = await medusaExec("./src/scripts/run-mt-job.ts", [name], { doneMarker: `job ${name} done`, logName: `job-${name}` })
    return ok
  }

  /** Sets payment.data.<key> to a string value straight in the database */
  const setData = (paymentId, key, value) =>
    psql(`update payment set data = jsonb_set(data, '{${key}}', to_jsonb('${value}'::text)) where id = '${paymentId}'`)

  /** Orders other phases and the screenshots refer to */
  function saveOrders(patch) {
    const file = path.join(STATE_DIR, "orders.json")
    const current = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {}
    fs.writeFileSync(file, JSON.stringify({ ...current, ...patch }, null, 2))
  }
  const loadOrders = () => readState("orders.json")

  /** E-mails the email-preview provider wrote, as parsed JSON records */
  function sentEmails() {
    if (!fs.existsSync(EMAIL_DIR)) return []
    return fs
      .readdirSync(EMAIL_DIR)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .map((f) => ({ file: f, ...JSON.parse(fs.readFileSync(path.join(EMAIL_DIR, f), "utf8")) }))
  }

  return {
    BASE,
    seed,
    call,
    admin,
    store,
    raw,
    check,
    login,
    checkout,
    orderPayment,
    reservedQuantity,
    placeOrder,
    upload,
    runJob,
    setData,
    psql,
    saveOrders,
    loadOrders,
    sentEmails,
    EMAIL_DIR,
    results: () => ({ passed, failed }),
  }
}
