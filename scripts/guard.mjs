// Guard for every medusa / db command run on this host. The same machine runs
// the production hauskayu store (Medusa 9000/8001, Postgres 5432, Redis 6379,
// *.hauskayu.com): this refuses to run anything unless the environment points
// only at the mt-spike-* containers (Postgres 127.0.0.1:55433, Redis
// 127.0.0.1:56380) and HTTP ports 9400+.
//
// Usage: node scripts/guard.mjs <command> [args…]
// The command runs with DB_HOST / DB_PORT / DB_USERNAME / DB_PASSWORD derived
// from DATABASE_URL, because `medusa plugin:db:generate` otherwise falls back to
// localhost:5432.
import { spawnSync } from "node:child_process"

export const SPIKE_PG_PORT = "55433"
export const SPIKE_REDIS_PORT = "56380"
export const MIN_HTTP_PORT = 9400
const LOCAL = new Set(["127.0.0.1", "localhost"])
const FORBIDDEN_PORTS = new Set(["80", "443", "5432", "6379", "8001", "9000"])

function fail(message) {
  console.error(`Aborted: ${message}`)
  process.exit(1)
}

function parseUrl(name, example) {
  const raw = process.env[name]
  if (!raw || !raw.trim()) {
    fail(`${name} is not set. Example: ${name}=${example}`)
  }
  try {
    return new URL(raw)
  } catch {
    fail(`${name} is not a valid URL.`)
  }
}

export function checkEnv() {
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string" && /hauskayu\.com/i.test(value) && /^(https?|postgres|redis)/i.test(value)) {
      fail(`${key} points at a hauskayu.com host.`)
    }
  }

  const db = parseUrl("DATABASE_URL", `postgres://postgres:spike@127.0.0.1:${SPIKE_PG_PORT}/mt_spike`)
  if (!LOCAL.has(db.hostname) || db.port !== SPIKE_PG_PORT) {
    fail(`DATABASE_URL points at ${db.hostname}:${db.port || "5432"}; only 127.0.0.1:${SPIKE_PG_PORT} (mt-spike-pg) is allowed.`)
  }
  if (!db.pathname || db.pathname === "/") {
    fail("DATABASE_URL has no database name.")
  }

  const redis = parseUrl("REDIS_URL", `redis://127.0.0.1:${SPIKE_REDIS_PORT}`)
  if (!LOCAL.has(redis.hostname) || redis.port !== SPIKE_REDIS_PORT) {
    fail(`REDIS_URL points at ${redis.hostname}:${redis.port || "6379"}; only 127.0.0.1:${SPIKE_REDIS_PORT} (mt-spike-redis) is allowed.`)
  }

  for (const key of ["DB_HOST", "DB_PORT"]) {
    const value = process.env[key]
    if (value && !["127.0.0.1", "localhost", SPIKE_PG_PORT].includes(value)) {
      fail(`${key}=${value} would override DATABASE_URL.`)
    }
  }

  const port = process.env.PORT
  if (port !== undefined) {
    if (FORBIDDEN_PORTS.has(port) || !/^\d+$/.test(port) || Number(port) < MIN_HTTP_PORT) {
      fail(`PORT=${port}; only ports ${MIN_HTTP_PORT}+ may be used on this host.`)
    }
  }
  return { db, redis }
}

const isMain = import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  const { db } = checkEnv()
  console.log(`guard ok: ${db.hostname}:${db.port}${db.pathname}`)
  const [command, ...args] = process.argv.slice(2)
  if (command) {
    const result = spawnSync(command, args, {
      stdio: "inherit",
      shell: false,
      env: {
        ...process.env,
        DB_HOST: db.hostname,
        DB_PORT: db.port,
        DB_USERNAME: decodeURIComponent(db.username),
        DB_PASSWORD: decodeURIComponent(db.password),
      },
    })
    process.exit(result.status ?? 1)
  }
}
