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
import fs from "node:fs"
import path from "node:path"
import { ensureBrowserPackages, inBrowser, SHOTS_DIR } from "./browser-run.mjs"
import { APP_DIR, SERVER_PORT } from "./env.mjs"
import { startMedusa, stop, waitClosed, waitHealth } from "./processes.mjs"

const SERVER_DIR = path.join(APP_DIR, ".medusa", "server")

const args = process.argv.slice(2)
const shotsPrefix = args.includes("--shots") ? args[args.indexOf("--shots") + 1] ?? "" : null
const emailShots = args.includes("--emails")

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
  ensureBrowserPackages()
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
