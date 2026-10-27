// The example storefronts (examples/nextjs-starter, examples/dtc-starter) end
// to end. Each starter is a pinned checkout in .state/, reset and set up with
// the example's install.mjs, built and served (Next.js Starter on 9410, DTC
// Starter on 9420) against the test app on 9400 (Admin build). Then, in
// Chromium (Playwright container): guest checkout → payment instructions →
// proof upload → admin confirms in the Admin → "paid" on the page and in the
// e-mail; the guest link from the e-mail, a logged-in customer, the invoice PDF
// (accented name), the Admin's e-mail recipients with and without
// notifications.adminEmails. From the host: the storefront passes the buyer's
// IP (X-Real-IP) to the backend's per-IP limit with the proxy secret, and does
// not pass on x-mt-* headers a buyer sends.
//
// Screenshots go to ~/shots/manual-transfer/storefront[-dtc] (MT_SHOTS_DIR).
// Usage: node integration-tests/storefront.mjs [nextjs|dtc|all] [--shots <prefix>] [--reuse]
//   --reuse  keep the starter builds from the last run (no reset, install or next build)
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
  PROXY_SECRET,
  readState,
  SERVER_PORT,
  STATE_DIR,
  writeState,
} from "./env.mjs"
import { startMedusa, stop, waitClosed, waitHealth } from "./processes.mjs"

/**
 * The starters, each at a pinned commit. `app` is the Next.js app inside the
 * checkout; `backendUrlEnv` the variable its src/lib/config.ts reads.
 */
const STARTERS = {
  nextjs: {
    name: "Medusa Next.js Starter",
    repo: "https://github.com/medusajs/nextjs-starter-medusa",
    // main as of 2026-04-23; deprecated upstream in favour of dtc-starter
    commit: "9818886f06e493cb2249733d114d339aa216ef00",
    dir: path.join(STATE_DIR, "nextjs-starter"),
    app: ".",
    example: "nextjs-starter",
    port: 9410,
    backendUrlEnv: "MEDUSA_BACKEND_URL",
    shots: "/shots/storefront",
    install: (dir) => run("node", [".yarn/releases/yarn-4.12.0.cjs", "install", "--immutable"], { cwd: dir }),
  },
  dtc: {
    name: "Medusa DTC Starter",
    repo: "https://github.com/medusajs/dtc-starter",
    // main as of 2026-10-26 (Medusa 2.22.1, Next.js 16.3)
    commit: "6965d8ac4185740c521a2b26855258ea20817b8e",
    dir: path.join(STATE_DIR, "dtc-starter"),
    app: "apps/storefront",
    example: "dtc-starter",
    port: 9420,
    backendUrlEnv: "NEXT_PUBLIC_MEDUSA_BACKEND_URL",
    shots: "/shots/storefront-dtc",
    install: (dir) =>
      run("corepack", ["pnpm@10.11.1", "install", "--frozen-lockfile", "--filter", "@dtc/storefront"], {
        cwd: dir,
        env: { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: "0" },
      }),
  },
}

const SERVER_DIR = path.join(APP_DIR, ".medusa", "server")
const EMAIL_DIR = path.join(STATE_DIR, "storefront-emails")

const args = process.argv.slice(2)
const shotsPrefix = args.includes("--shots") ? args[args.indexOf("--shots") + 1] ?? "" : ""
const which = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--shots") ?? "all"
if (!["nextjs", "dtc", "all"].includes(which)) {
  console.error("Usage: node integration-tests/storefront.mjs [nextjs|dtc|all] [--shots <prefix>] [--reuse]")
  process.exit(1)
}
const selected = which === "all" ? Object.values(STARTERS) : [STARTERS[which]]

const appDir = (starter) => path.join(starter.dir, starter.app)
// localhost, not 127.0.0.1: the starters' middleware redirects to the host name Next.js reports
const shopOf = (starter) => `http://localhost:${starter.port}`
const reuseBuild = (starter) => args.includes("--reuse") && fs.existsSync(path.join(appDir(starter), ".next", "BUILD_ID"))

function run(command, commandArgs, options = {}) {
  console.log(`> ${[command, ...commandArgs].join(" ")}`)
  const result = spawnSync(command, commandArgs, { stdio: "inherit", ...options })
  if (result.status !== 0) {
    throw new Error(`failed: ${command} ${commandArgs.join(" ")}`)
  }
}

/** The starter at the pinned commit, reset to pristine, with the example installed */
function prepareStarter(starter) {
  if (!fs.existsSync(path.join(starter.dir, ".git"))) {
    run("git", ["clone", "--quiet", starter.repo, starter.dir])
  }
  run("git", ["-C", starter.dir, "checkout", "--quiet", "--force", starter.commit])
  run("git", ["-C", starter.dir, "clean", "-fdq", path.join(starter.app, "src")])
  if (!fs.existsSync(path.join(appDir(starter), "node_modules", "next"))) {
    starter.install(starter.dir)
  }
  run("node", [path.join(PLUGIN_DIR, "examples", starter.example, "install.mjs"), appDir(starter)])
}

function starterEnv(starter, seed) {
  return {
    ...process.env,
    [starter.backendUrlEnv]: BASE,
    NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY: seed.publishable_key,
    NEXT_PUBLIC_BASE_URL: shopOf(starter),
    NEXT_PUBLIC_DEFAULT_REGION: "us",
    NEXT_TELEMETRY_DISABLED: "1",
    // = the test app's trustedProxySecret: the buyer's IP reaches the backend's per-IP limits
    MANUAL_TRANSFER_PROXY_SECRET: PROXY_SECRET,
  }
}

let storefront = null

function startStorefront(starter, seed) {
  const out = fs.openSync(path.join(STATE_DIR, "logs", `storefront-${starter.example}.log`), "w")
  storefront = spawn("node", ["node_modules/next/dist/bin/next", "start", "-p", String(starter.port), "-H", "127.0.0.1"], {
    cwd: appDir(starter),
    env: starterEnv(starter, seed),
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

/** An order placed by transfer through the store API: a registered customer's, or a guest's with its upload token */
async function storeOrder(seed, { guest = false } = {}) {
  const email = `${guest ? "guest" : "customer"}-${Date.now()}@e2e.test`
  let token = null
  if (!guest) {
    const reg = await api("POST", "/auth/customer/emailpass/register", { body: { email, password: "e2e-password" } })
    await api("POST", "/store/customers", { store: true, seed, token: reg.json.token, body: { email, first_name: "Siti", last_name: "Rahayu" } })
    token = (await api("POST", "/auth/customer/emailpass", { body: { email, password: "e2e-password" } })).json.token
  }
  const s = (m, p, b) => api(m, p, { store: true, seed, token, body: b })
  const { json: c } = await s("POST", "/store/carts", { region_id: seed.region_id, ...(guest ? { email } : {}) })
  await s("POST", `/store/carts/${c.cart.id}/line-items`, { variant_id: seed.variant_id, quantity: 1 })
  await s("POST", `/store/carts/${c.cart.id}`, {
    shipping_address: { first_name: "Siti", last_name: "Rahayu", address_1: "1 Main St", city: "Austin", country_code: "us", postal_code: "78701" },
  })
  await s("POST", `/store/carts/${c.cart.id}/shipping-methods`, { option_id: seed.option_id })
  const { json: pc } = await s("POST", "/store/payment-collections", { cart_id: c.cart.id })
  await s("POST", `/store/payment-collections/${pc.payment_collection.id}/payment-sessions`, { provider_id: PROVIDER })
  const done = await s("POST", `/store/carts/${c.cart.id}/complete`)
  if (!done.json.order?.id) throw new Error(`store order: ${JSON.stringify(done.json)}`)
  if (guest) {
    token = (await api("GET", `/store/manual-transfer/carts/${c.cart.id}/upload-token`, { store: true, seed })).json.token
  }
  return { token, order_id: done.json.order.id }
}

const GIF = Buffer.from("GIF89a\x01\x00\x01\x00\x00\x00\x00;", "latin1")

/**
 * Uploads through the storefront's route count against the buyer's IP (from
 * X-Real-IP, as a proxy in front of the storefront sets it), not against the
 * storefront server's; x-mt-* headers from the buyer are not passed on. The
 * GIF is refused (400) once past the limiter, so nothing is stored. The test
 * app allows 40 uploads per IP and 15 minutes.
 */
async function ipForwarding(starter, seed) {
  let passed = 0
  let failed = 0
  const check = (name, ok, detail) => {
    if (ok) passed++
    else failed++
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n      ${JSON.stringify(detail)}`}`)
  }
  const { order_id, token } = await storeOrder(seed, { guest: true })
  const send = async (headers) => {
    const form = new FormData()
    form.append("file", new Blob([GIF]), "spam.gif")
    form.append("token", token)
    return (await fetch(`${shopOf(starter)}/api/manual-transfer/${order_id}/proofs`, { method: "POST", body: form, headers })).status
  }
  // Distinct per starter and run: the backend's limiter lives as long as its process
  const net = `198.18.${starter.port % 256}`
  const buyer = `${net}.${Date.now() % 200}`
  let limitedAt = null
  for (let i = 1; i <= 45 && limitedAt === null; i++) {
    if ((await send({ "x-real-ip": buyer })) === 429) limitedAt = i
  }
  check(`${starter.example}: one buyer IP limited after 40 uploads through the storefront`, limitedAt === 41, limitedAt)
  check(`${starter.example}: another buyer IP still uploads`, (await send({ "x-real-ip": `${net}.250` })) === 400)
  const forged = await send({ "x-real-ip": buyer, "x-mt-client-ip": `${net}.251`, "x-mt-proxy-secret": "guess" })
  check(`${starter.example}: buyer-sent x-mt-* headers are not passed on`, forged === 429, forged)
  check(`${starter.example}: first X-Forwarded-For entry when there is no X-Real-IP`, (await send({ "x-forwarded-for": `${buyer}, 10.0.0.1` })) === 429)
  console.log(`ip forwarding ${starter.example}: ${passed} passed, ${failed} failed`)
  return failed === 0
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

async function runStarter(starter, seed) {
  const shop = shopOf(starter)
  const reuse = reuseBuild(starter)
  if (!reuse) prepareStarter(starter)
  fs.rmSync(EMAIL_DIR, { recursive: true, force: true })
  // The e-mails link to this starter's page
  return withBackend(`storefront-backend-${starter.example}`, { MT_PAYMENT_URL: `${shop}/transfer/{order_id}?token={token}` }, async () => {
    const { json: auth } = await api("POST", "/auth/user/emailpass", { body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } })
    await ensureAccount(auth.token)
    await restock(auth.token, seed)
    writeState("storefront.json", { customer: await storeOrder(seed), publishable_key: seed.publishable_key })
    // The starter pre-renders product pages from the backend at build time
    if (!reuse) run("node", ["node_modules/next/dist/bin/next", "build"], { cwd: appDir(starter), env: starterEnv(starter, seed) })
    startStorefront(starter, seed)
    try {
      await waitFor(`${shop}/us`)
      console.log(`\n--- ${starter.name} (${shop})`)
      const flowOk = inBrowser("storefront.mjs", ["flow", starter.shots, shotsPrefix, EMAIL_DIR, shop])
      return (await ipForwarding(starter, seed)) && flowOk
    } finally {
      stopStorefront()
    }
  })
}

async function main() {
  if (!fs.existsSync(path.join(SERVER_DIR, "public", "admin"))) {
    throw new Error("No Admin build: run `node integration-tests/setup.mjs --admin` first")
  }
  const seed = readState("seed.json")
  ensureBrowserPackages()
  fs.mkdirSync(path.join(STATE_DIR, "logs"), { recursive: true })
  const results = {}
  for (const starter of selected) {
    results[starter.example] = await runStarter(starter, seed)
  }

  // Without notifications.adminEmails the settings page names the fallback recipients
  const shop = shopOf(selected[0])
  results["settings-fallback"] = await withBackend(
    "storefront-backend-fallback",
    { MT_NO_ADMIN_EMAILS: "1", MT_PAYMENT_URL: `${shop}/transfer/{order_id}?token={token}` },
    async () => inBrowser("storefront.mjs", ["settings-fallback", selected[0].shots, shotsPrefix, "", shop])
  )

  const ok = Object.values(results).every(Boolean)
  console.log(`storefront: ${Object.entries(results).map(([k, v]) => `${k} ${v ? "passed" : "FAILED"}`).join(", ")}`)
  process.exitCode = ok ? 0 : 1
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
