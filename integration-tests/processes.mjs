// Starting and stopping the test app. Every medusa process is spawned
// `detached`, in its own process group: stopping it kills the whole group
// (guard.mjs and the medusa child), and a signal meant for one process (e.g. a
// job run through `medusa exec`) never reaches the test server.
import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { APP_DIR, appEnv, EXEC_PORT, GUARD, LOG_DIR, MEDUSA_BIN } from "./env.mjs"

const groups = []

export function startMedusa(name, { port, workerMode = "shared", cwd = APP_DIR, env = {} }) {
  fs.mkdirSync(LOG_DIR, { recursive: true })
  const out = fs.openSync(path.join(LOG_DIR, `${name}.log`), "w")
  const child = spawn("node", [GUARD, MEDUSA_BIN, "start"], {
    cwd,
    env: appEnv({ PORT: String(port), MEDUSA_WORKER_MODE: workerMode, ...env }),
    stdio: ["ignore", out, out],
    detached: true,
  })
  groups.push(child)
  return child
}

/** Stops one process started with startMedusa, with its whole group */
export function stop(child) {
  const index = groups.indexOf(child)
  if (index >= 0) {
    groups.splice(index, 1)
  }
  try {
    process.kill(-child.pid, "SIGTERM")
  } catch {
    // already gone
  }
}

export function stopAll() {
  for (const child of [...groups]) {
    stop(child)
  }
}

process.on("exit", stopAll)
process.on("SIGINT", () => process.exit(130))
process.on("SIGTERM", () => process.exit(143))

export async function waitHealth(port, ms = 180_000) {
  const until = Date.now() + ms
  while (Date.now() < until) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) {
        return
      }
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error(`port ${port} not healthy, see ${LOG_DIR}`)
}

/** Waits until nothing listens on the port any more */
export async function waitClosed(port, ms = 30_000) {
  const until = Date.now() + ms
  while (Date.now() < until) {
    try {
      await fetch(`http://127.0.0.1:${port}/health`)
    } catch {
      return
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`port ${port} still in use`)
}

/**
 * Runs `medusa exec <script> [args]` in the test app, in its own process
 * group like a separate worker host. Resolves with { ok, out }; `ok` when the
 * output contains `doneMarker`.
 */
export function medusaExec(script, args, { doneMarker, logName, env = {} }) {
  return new Promise((resolve) => {
    const child = spawn("node", [GUARD, MEDUSA_BIN, "exec", script, ...args], {
      cwd: APP_DIR,
      env: appEnv({ PORT: String(EXEC_PORT), ...env }),
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    })
    let out = ""
    child.stdout.on("data", (d) => (out += d))
    child.stderr.on("data", (d) => (out += d))
    child.on("close", () => {
      fs.mkdirSync(LOG_DIR, { recursive: true })
      fs.writeFileSync(path.join(LOG_DIR, `${logName}-${Date.now()}.log`), out)
      resolve({ ok: out.includes(doneMarker), out })
    })
  })
}
