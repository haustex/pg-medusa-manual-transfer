// The example storefront (examples/nextjs-starter) end to end: a pinned
// checkout of the Medusa Next.js Starter in .state/nextjs-starter, reset and
// set up with the example's install.mjs, built and served on 9410 against the
// test app on 9400 (Admin build). Then, in Chromium (Playwright container):
// guest checkout → payment instructions → proof upload → admin confirms in the
// Admin → "paid" on the page and in the e-mail; the guest link from the
// e-mail, a logged-in customer, the invoice PDF (accented name), and the
// Admin's e-mail recipients with and without notifications.adminEmails.
//
// Screenshots go to ~/shots/manual-transfer/storefront (MT_SHOTS_DIR/storefront).
// Usage: node integration-tests/storefront.mjs [--shots <prefix>] [--reuse]
//   --reuse  keep the starter build from the last run (no reset, install or next build)
// Needs `npm run build` and `node integration-tests/setup.mjs --admin` first.
import { spawn, spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { ensureBrowserPackages, inBrowser } from "./browser-run.mjs"
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  APP_DIR,
  BASE,
  PLUGIN_DIR,
  PROVIDER,
  readState,
  SERVER_PORT,
  STATE_DIR,
  STOREFRONT_PORT,
  writeState,
} from "./env.mjs"
import { startMedusa, stop, waitClosed, waitHealth } from "./processes.mjs"

const STARTER_REPO = "https://github.com/medusajs/nextjs-starter-medusa"
/** main as of 2026-04-23; the starter is deprecated upstream in favour of dtc-starter */
const STARTER_COMMIT = "9818886f06e493cb2249733d114d339aa216ef00"
const STARTER_DIR = path.join(STATE_DIR, "nextjs-starter")
const SERVER_DIR = path.join(APP_DIR, ".medusa", "server")
const EMAIL_DIR = path.join(STATE_DIR, "storefront-emails")
// localhost, not 127.0.0.1: the starter's middleware redirects to the host name Next.js reports
const SHOP = `http://localhost:${STOREFRONT_PORT}`

const args = process.argv.slice(2)
const shotsPrefix = args.includes("--shots") ? args[args.indexOf("--shots") + 1] ?? "" : ""
const reuse = args.includes("--reuse") && fs.existsSync(path.join(STARTER_DIR, ".next", "BUILD_ID"))

function run(command, commandArgs, options = {}) {
  console.log(`> ${[command, ...commandArgs].join(" ")}`)
  const result = spawnSync(command, commandArgs, { stdio: "inherit", ...options })
  if (result.status !== 0) {
    throw new Error(`failed: ${command} ${commandArgs.join(" ")}`)
  }
}

/** The starter at the pinned commit, reset to pristine, with the example installed */
function prepareStarter() {
  if (!fs.existsSync(path.join(STARTER_DIR, ".git"))) {
    run("git", ["clone", "--quiet", STARTER_REPO, STARTER_DIR])
  }
  run("git", ["-C", STARTER_DIR, "checkout", "--quiet", "--force", STARTER_COMMIT])
  run("git", ["-C", STARTER_DIR, "clean", "-fdq", "src"])
  if (!fs.existsSync(path.join(STARTER_DIR, "node_modules", "next"))) {
    run("node", [".yarn/releases/yarn-4.12.0.cjs", "install", "--immutable"], { cwd: STARTER_DIR })
  }
  run("node", [path.join(PLUGIN_DIR, "examples", "nextjs-starter", "install.mjs"), STARTER_DIR])
}

function starterEnv(seed) {
  return {
    ...process.env,
    MEDUSA_BACKEND_URL: BASE,
    NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY: seed.publishable_key,
    NEXT_PUBLIC_BASE_URL: SHOP,
    NEXT_PUBLIC_DEFAULT_REGION: "us",
    NEXT_TELEMETRY_DISABLED: "1",
  }
}

let storefront = null

function startStorefront(seed) {
  const out = fs.openSync(path.join(STATE_DIR, "logs", "storefront.log"), "w")
  storefront = spawn("node", ["node_modules/next/dist/bin/next", "start", "-p", String(STOREFRONT_PORT), "-H", "127.0.0.1"], {
    cwd: STARTER_DIR,
    env: starterEnv(seed),
    stdio: ["ignore", out, out],
    detached: true,
  })
}

function stopStorefront() {
  if (storefront) {
    try {
      process.kill(-storefront.pid, "SIGTERM")
    } catch {
      // already gone
    }
    storefront = null
  }
}
process.on("exit", stopStorefront)

async function waitFor(url, ms = 120_000) {
  const until = Date.now() + ms
  while (Date.now() < until) {
    try {
      const response = await fetch(url, { redirect: "manual" })
      if (response.status < 500) return
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error(`${url} not reachable`)
}

async function api(method, urlPath, { body, token, store, seed } = {}) {
  const headers = { "content-type": "application/json" }
  if (store) headers["x-publishable-api-key"] = seed.publishable_key
  if (token) headers.authorization = `Bearer ${token}`
  const response = await fetch(BASE + urlPath, { method, headers, body: body ? JSON.stringify(body) : undefined })
  return { status: response.status, json: await response.json().catch(() => ({})) }
}

/** An active USD account for the US region, like an owner would add in the Admin */
async function ensureAccount(adminToken) {
  const { json } = await api("GET", "/admin/manual-transfer/accounts", { token: adminToken })
  if ((json.accounts ?? []).some((a) => a.is_active && a.currency_code === "usd" && !(a.region_ids ?? []).length)) {
    return
  }
  const created = await api("POST", "/admin/manual-transfer/accounts", {
    token: adminToken,
    body: {
      label: "Storefront example",
      bank_name: "Example Bank",
      account_holder: "PT Contoh Jati",
      account_number: "0001234567",
      swift_code: "EXAMIDJA",
      bank_address: "Jl. Contoh 1, Jakarta",
      currency_code: "usd",
    },
  })
  if (created.status !== 201) throw new Error(`account: ${JSON.stringify(created.json)}`)
}

/** Every run reserves stock (orders awaiting payment): keep 10 available */
async function restock(adminToken, seed) {
  const levelPath = `/admin/inventory-items/${seed.inventory_item_id}/location-levels/${seed.location_id}`
  const { json } = await api("GET", `/admin/inventory-items/${seed.inventory_item_id}?fields=reserved_quantity`, { token: adminToken })
  const updated = await api("POST", levelPath, { token: adminToken, body: { stocked_quantity: (json.inventory_item?.reserved_quantity ?? 0) + 10 } })
  if (updated.status !== 200) throw new Error(`restock: ${JSON.stringify(updated.json)}`)
}

/** A registered customer with an order placed by transfer through the store API */
async function customerOrder(seed) {
  const email = `customer-${Date.now()}@e2e.test`
  const reg = await api("POST", "/auth/customer/emailpass/register", { body: { email, password: "e2e-password" } })
  await api("POST", "/store/customers", { store: true, seed, token: reg.json.token, body: { email, first_name: "Siti", last_name: "Rahayu" } })
  const { json: login } = await api("POST", "/auth/customer/emailpass", { body: { email, password: "e2e-password" } })
  const s = (m, p, b) => api(m, p, { store: true, seed, token: login.token, body: b })
  const { json: c } = await s("POST", "/store/carts", { region_id: seed.region_id })
  await s("POST", `/store/carts/${c.cart.id}/line-items`, { variant_id: seed.variant_id, quantity: 1 })
  await s("POST", `/store/carts/${c.cart.id}`, {
    shipping_address: { first_name: "Siti", last_name: "Rahayu", address_1: "1 Main St", city: "Austin", country_code: "us", postal_code: "78701" },
  })
  await s("POST", `/store/carts/${c.cart.id}/shipping-methods`, { option_id: seed.option_id })
  const { json: pc } = await s("POST", "/store/payment-collections", { cart_id: c.cart.id })
  await s("POST", `/store/payment-collections/${pc.payment_collection.id}/payment-sessions`, { provider_id: PROVIDER })
  const done = await s("POST", `/store/carts/${c.cart.id}/complete`)
  if (!done.json.order?.id) throw new Error(`customer order: ${JSON.stringify(done.json)}`)
  return { token: login.token, order_id: done.json.order.id }
}

async function withBackend(name, env, fn) {
  const child = startMedusa(name, {
    port: SERVER_PORT,
    cwd: SERVER_DIR,
    env: { MT_ADMIN: "1", MT_EMAIL_DIR: EMAIL_DIR, ...env },
  })
  try {
    await waitHealth(SERVER_PORT)
    return await fn()
  } finally {
    stop(child)
    await waitClosed(SERVER_PORT)
  }
}

async function main() {
  if (!fs.existsSync(path.join(SERVER_DIR, "public", "admin"))) {
    throw new Error("No Admin build: run `node integration-tests/setup.mjs --admin` first")
  }
  const seed = readState("seed.json")
  ensureBrowserPackages()
  if (!reuse) prepareStarter()
  fs.rmSync(EMAIL_DIR, { recursive: true, force: true })
  fs.mkdirSync(path.join(STATE_DIR, "logs"), { recursive: true })
  let ok = true

  ok =
    (await withBackend("storefront-backend", {}, async () => {
      const { json: auth } = await api("POST", "/auth/user/emailpass", { body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } })
      await ensureAccount(auth.token)
      await restock(auth.token, seed)
      writeState("storefront.json", { customer: await customerOrder(seed), publishable_key: seed.publishable_key })
      // The starter pre-renders product pages from the backend at build time
      if (!reuse) run("node", ["node_modules/next/dist/bin/next", "build"], { cwd: STARTER_DIR, env: starterEnv(seed) })
      startStorefront(seed)
      try {
        await waitFor(`${SHOP}/us`)
        return inBrowser("storefront.mjs", ["flow", "/shots/storefront", shotsPrefix, EMAIL_DIR])
      } finally {
        stopStorefront()
      }
    })) && ok

  // Without notifications.adminEmails the settings page names the fallback recipients
  ok =
    (await withBackend("storefront-backend-fallback", { MT_NO_ADMIN_EMAILS: "1" }, async () =>
      inBrowser("storefront.mjs", ["settings-fallback", "/shots/storefront", shotsPrefix])
    )) && ok

  console.log(ok ? "storefront: all passed" : "storefront: FAILED")
  process.exitCode = ok ? 0 : 1
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
