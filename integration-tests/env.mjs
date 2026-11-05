// Paths, ports and the environment shared by the E2E scripts. Everything lives
// inside this repository (integration-tests/), nothing under /tmp.
//
// On the Haus Kayu host the defaults point at the mt-spike-* containers
// (Postgres 127.0.0.1:55433, Redis 127.0.0.1:56380) and ports 9400+; every
// medusa command still goes through scripts/guard.mjs, which refuses anything
// else. Elsewhere (CI) override MT_E2E_DATABASE_URL, MT_E2E_REDIS_URL and
// MT_PG_CONTAINER.
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

export const TESTS_DIR = path.dirname(new URL(import.meta.url).pathname)
export const PLUGIN_DIR = path.resolve(TESTS_DIR, "..")
export const APP_DIR = path.join(TESTS_DIR, "app")
export const STATE_DIR = path.join(TESTS_DIR, ".state")
export const LOG_DIR = path.join(STATE_DIR, "logs")
export const GUARD = path.join(PLUGIN_DIR, "scripts", "guard.mjs")
export const MEDUSA_BIN = "./node_modules/.bin/medusa"

export const DB_NAME = process.env.MT_E2E_DB ?? "mt_e2e"
export const DATABASE_URL =
  process.env.MT_E2E_DATABASE_URL ?? `postgres://postgres:spike@127.0.0.1:55433/${DB_NAME}`
export const REDIS_URL = process.env.MT_E2E_REDIS_URL ?? "redis://127.0.0.1:56380"
export const PG_CONTAINER = process.env.MT_PG_CONTAINER ?? "mt-spike-pg"

export const SERVER_PORT = 9400
export const WORKER_PORT = 9401
export const EXEC_PORT = 9402
/** The example Next.js storefront (examples/nextjs-starter), see storefront.mjs */
export const STOREFRONT_PORT = 9410
export const BASE = `http://127.0.0.1:${SERVER_PORT}`

export const ADMIN_EMAIL = "admin@e2e.test"
export const ADMIN_PASSWORD = "e2e-password"
export const PROVIDER = "pp_manual-transfer_manual-transfer"
/** trustedProxySecret of the test app: the example storefronts send it with the buyer's IP */
export const PROXY_SECRET = process.env.MT_PROXY_SECRET || "mt-e2e-proxy-secret"

/** Where the email-preview notification provider writes every message it "sends" */
export const EMAIL_DIR = process.env.MT_EMAIL_DIR ?? path.join(STATE_DIR, "emails")

/** Environment for every medusa process of the test app */
export function appEnv(extra = {}) {
  return {
    ...process.env,
    DATABASE_URL,
    REDIS_URL,
    NODE_ENV: "development",
    MT_PLUGIN_DIR: PLUGIN_DIR,
    MT_EMAIL_DIR: EMAIL_DIR,
    ...extra,
  }
}

export function readState(name) {
  return JSON.parse(fs.readFileSync(path.join(STATE_DIR, name), "utf8"))
}

export function writeState(name, value) {
  fs.mkdirSync(STATE_DIR, { recursive: true })
  fs.writeFileSync(path.join(STATE_DIR, name), JSON.stringify(value, null, 2))
}

/**
 * psql inside the Postgres container, over TCP (127.0.0.1): a fresh postgres image first runs a temporary,
 * socket-only init server and restarts, so socket connections can hit the server that is about to go away.
 * { ok, out }
 */
export function psql(sql, db = DB_NAME) {
  try {
    const out = execFileSync("docker", ["exec", PG_CONTAINER, "psql", "-h", "127.0.0.1", "-U", "postgres", "-d", db, "-tAc", sql], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
    return { ok: true, out: out.trim() }
  } catch (e) {
    return { ok: false, out: String(e.stderr || e.message) }
  }
}

/** Waits until the container's final Postgres server answers over TCP, at most `seconds` (default 60) */
export async function waitForPostgres(seconds = 60) {
  const started = Date.now()
  let last = ""
  while (Date.now() - started < seconds * 1000) {
    const r = psql("select 1", "postgres")
    if (r.ok && r.out === "1") return
    last = r.out
    await new Promise((res) => setTimeout(res, 1000))
  }
  throw new Error(
    `Postgres container "${PG_CONTAINER}" not ready after ${seconds} s (last: ${last.trim() || "no answer"}). ` +
      "Start it as in integration-tests/README.md, or set MT_PG_CONTAINER."
  )
}
