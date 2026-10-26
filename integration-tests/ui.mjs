// Admin UI checks and screenshots. The test app runs on this host (port 9400,
// from the Admin build in app/.medusa/server); Chromium runs in a throwaway
// mt-spike-browser container from the Playwright image, because the host's
// Chromium lacks libnss3.
//
// Usage: node integration-tests/ui.mjs [--shots <prefix>] [--emails]
//   always    credit footer present (default options) and absent (showCredit: false)
//   --shots   the Admin screenshots (needs .state/orders.json from an E2E run)
//   --emails  screenshots of the e-mails in MT_EMAIL_DIR and the preview samples
// Run `node integration-tests/setup.mjs --admin` first.
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { APP_DIR, SERVER_PORT, TESTS_DIR } from "./env.mjs"
import { startMedusa, stop, waitClosed, waitHealth } from "./processes.mjs"

const IMAGE = "mcr.microsoft.com/playwright:v1.48.2-jammy"
const SHOTS_DIR = process.env.MT_SHOTS_DIR ?? path.join(os.homedir(), "shots", "manual-transfer")
const BROWSER_DIR = path.join(TESTS_DIR, "browser")
const SERVER_DIR = path.join(APP_DIR, ".medusa", "server")

const args = process.argv.slice(2)
const shotsPrefix = args.includes("--shots") ? args[args.indexOf("--shots") + 1] ?? "" : null
const emailShots = args.includes("--emails")

/** node <script> inside the Playwright container; the repo's integration-tests and the shots folder are mounted */
function inBrowser(script, scriptArgs, extraMounts = []) {
  const uid = `${process.getuid()}:${process.getgid()}`
  const mounts = [`${TESTS_DIR}:${TESTS_DIR}`, `${SHOTS_DIR}:/shots`, ...extraMounts].flatMap((m) => ["-v", m])
  const result = spawnSync(
    "docker",
    ["run", "--rm", "--name", "mt-spike-browser", "--network", "host", "--user", uid, "-e", "HOME=/tmp", ...mounts, "-w", BROWSER_DIR, IMAGE, "node", script, ...scriptArgs],
    { stdio: "inherit" }
  )
  return result.status === 0
}

async function withServer(env, fn) {
  const child = startMedusa(`ui-${env.MT_SHOW_CREDIT === "0" ? "no-credit" : "default"}`, {
    port: SERVER_PORT,
    cwd: SERVER_DIR,
    env: { MT_ADMIN: "1", ...env },
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
  if (!fs.existsSync(path.join(BROWSER_DIR, "node_modules", "playwright-core"))) {
    spawnSync("npm", ["ci", "--no-audit", "--no-fund"], { cwd: BROWSER_DIR, stdio: "inherit" })
  }
  fs.mkdirSync(SHOTS_DIR, { recursive: true })
  let ok = true

  ok = (await withServer({}, async () => {
    const credit = inBrowser("credit.mjs", ["present", "/shots"])
    const shots = shotsPrefix === null || inBrowser("shots.mjs", ["/shots", shotsPrefix])
    return credit && shots
  })) && ok
  ok = (await withServer({ MT_SHOW_CREDIT: "0" }, async () => inBrowser("credit.mjs", ["absent", "/shots"]))) && ok

  if (emailShots) {
    ok = inBrowser("emails.mjs", ["/shots/email"]) && ok
  }
  console.log(ok ? "ui: all passed" : "ui: FAILED")
  process.exitCode = ok ? 0 : 1
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
