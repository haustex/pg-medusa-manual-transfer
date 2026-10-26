// Prepares the E2E test app: links node_modules, (re)creates the database,
// runs the migrations, seeds a store and creates the admin user.
//
// Usage: node integration-tests/setup.mjs [--fresh] [--admin]
//   --fresh  drop and recreate the test database first (only names starting with mt_)
//   --admin  also build the app with the Admin (for the screenshots, served from app/.medusa/server)
//
// Build the plugin first (npm run build): the app loads it from .medusa/server.
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  APP_DIR,
  appEnv,
  DB_NAME,
  GUARD,
  MEDUSA_BIN,
  PLUGIN_DIR,
  psql,
  STATE_DIR,
} from "./env.mjs"

const args = new Set(process.argv.slice(2))

function run(command, commandArgs, { cwd = APP_DIR, env = {} } = {}) {
  console.log(`> ${[command, ...commandArgs].join(" ")}`)
  const result = spawnSync(command, commandArgs, { cwd, env: appEnv(env), stdio: "inherit" })
  if (result.status !== 0) {
    console.error(`failed: ${command} ${commandArgs.join(" ")}`)
    process.exit(result.status ?? 1)
  }
}

/** app/node_modules: one symlink per package of the plugin's node_modules, plus the plugin itself */
function linkNodeModules(target) {
  const source = path.join(PLUGIN_DIR, "node_modules")
  fs.rmSync(target, { recursive: true, force: true })
  fs.mkdirSync(target, { recursive: true })
  for (const entry of fs.readdirSync(source)) {
    if (entry === ".package-lock.json" || entry === ".cache" || entry === ".vite") {
      continue
    }
    fs.symlinkSync(path.join(source, entry), path.join(target, entry))
  }
  fs.symlinkSync(PLUGIN_DIR, path.join(target, "medusa-payment-manual-transfer"))
}

if (!fs.existsSync(path.join(PLUGIN_DIR, ".medusa/server/src/providers/manual-transfer/index.js"))) {
  console.error("The plugin is not built: run `npm run build` first.")
  process.exit(1)
}

linkNodeModules(path.join(APP_DIR, "node_modules"))
fs.mkdirSync(STATE_DIR, { recursive: true })

if (args.has("--fresh")) {
  if (!/^mt_[a-z0-9_]+$/.test(DB_NAME)) {
    console.error(`Refusing to drop ${DB_NAME}: only databases named mt_* are dropped.`)
    process.exit(1)
  }
  for (const sql of [`drop database if exists ${DB_NAME} with (force)`, `create database ${DB_NAME}`]) {
    const result = psql(sql, "postgres")
    if (!result.ok) {
      console.error(result.out)
      process.exit(1)
    }
  }
  console.log(`database ${DB_NAME} recreated`)
} else if (!psql(`select 1 from pg_database where datname = '${DB_NAME}'`, "postgres").out) {
  const result = psql(`create database ${DB_NAME}`, "postgres")
  if (!result.ok) {
    console.error(result.out)
    process.exit(1)
  }
}

run("node", [GUARD, MEDUSA_BIN, "db:migrate"])
if (args.has("--fresh") || !fs.existsSync(path.join(STATE_DIR, "seed.json"))) {
  run("node", [GUARD, MEDUSA_BIN, "exec", "./src/scripts/seed.ts"], { env: { SEED_OUT: path.join(STATE_DIR, "seed.json") } })
  run("node", [GUARD, MEDUSA_BIN, "user", "-e", ADMIN_EMAIL, "-p", ADMIN_PASSWORD])
}

if (args.has("--admin")) {
  fs.rmSync(path.join(APP_DIR, ".medusa"), { recursive: true, force: true })
  run("node", [GUARD, MEDUSA_BIN, "build"], { env: { MT_ADMIN: "1" } })
  const server = path.join(APP_DIR, ".medusa/server")
  fs.rmSync(path.join(server, "node_modules"), { recursive: true, force: true })
  fs.symlinkSync(path.join(APP_DIR, "node_modules"), path.join(server, "node_modules"))
  console.log("admin build ready in app/.medusa/server")
}

console.log("setup done")
