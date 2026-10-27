// E2E suite against the test app (integration-tests/app).
// Usage: node integration-tests/e2e/run.mjs shared|split|no-credit
//   shared     one process (workerMode shared)
//   split      a server (9400) and a worker (9401) process, like production
//   no-credit  the app started with showCredit: false (the Admin footer check is in ui.mjs)
// Run integration-tests/setup.mjs first.
import fs from "node:fs"
import { EMAIL_DIR, SERVER_PORT, WORKER_PORT } from "../env.mjs"
import { startMedusa, stopAll, waitHealth } from "../processes.mjs"
import { createContext } from "./context.mjs"
import { clientIp } from "./client-ip.mjs"
import { phase1 } from "./phase1.mjs"
import { phase2 } from "./phase2.mjs"
import { phase3, phase3Limits } from "./phase3.mjs"
import { phase4 } from "./phase4.mjs"

const mode = process.argv[2] ?? "shared"

async function main() {
  if (!["shared", "split", "no-credit"].includes(mode)) {
    throw new Error(`unknown mode ${mode}`)
  }
  if (mode === "split") {
    startMedusa("split-server", { port: SERVER_PORT, workerMode: "server" })
    startMedusa("split-worker", { port: WORKER_PORT, workerMode: "worker" })
    await Promise.all([waitHealth(SERVER_PORT), waitHealth(WORKER_PORT)])
  } else {
    startMedusa(mode, { port: SERVER_PORT, env: mode === "no-credit" ? { MT_SHOW_CREDIT: "0" } : {} })
    await waitHealth(SERVER_PORT)
  }

  const ctx = createContext()
  const { check, admin, reservedQuantity, seed } = ctx
  const login = await ctx.login()
  check("admin login", !!login.json.token, login.json)

  if (mode === "no-credit") {
    const cfg = await admin("GET", "/admin/manual-transfer/config")
    check("config: show_credit false with showCredit: false", cfg.status === 200 && cfg.json.show_credit === false, cfg.json)
    return ctx
  }

  // Enough stock for this run whatever earlier runs reserved
  const reservedNow = await reservedQuantity()
  await admin("POST", `/admin/inventory-items/${seed.inventory_item_id}/location-levels/${seed.location_id}`, { stocked_quantity: reservedNow + 200 })
  // Each run starts with an empty mailbox
  fs.rmSync(EMAIL_DIR, { recursive: true, force: true })

  console.log("\n--- phase 1")
  await phase1(ctx)
  console.log("\n--- phase 3")
  await phase3(ctx)
  console.log("\n--- phase 4")
  await phase4(ctx)
  // Phase 2 ends by exhausting this IP's upload budget
  console.log("\n--- phase 2")
  await phase2(ctx)
  console.log("\n--- phase 3 limits")
  await phase3Limits(ctx)
  console.log("\n--- client IP behind a storefront")
  await clientIp(ctx)

  return ctx
}

let ctx
main()
  .then((c) => (ctx = c))
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => {
    stopAll()
    if (ctx) {
      const { passed, failed } = ctx.results()
      console.log(`\n${mode}: ${passed} passed, ${failed} failed`)
      if (failed) process.exitCode = 1
    }
  })
