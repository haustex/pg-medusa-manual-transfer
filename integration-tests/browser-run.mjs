// Runs a script of browser/ inside a throwaway Playwright container (the host's
// Chromium lacks libnss3). integration-tests/ is mounted at the same path, the
// screenshots folder at /shots; host networking reaches the test ports.
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { TESTS_DIR } from "./env.mjs"

export const IMAGE = "mcr.microsoft.com/playwright:v1.48.2-jammy"
export const SHOTS_DIR = process.env.MT_SHOTS_DIR ?? path.join(os.homedir(), "shots", "manual-transfer")
export const BROWSER_DIR = path.join(TESTS_DIR, "browser")

/** npm ci in browser/ when its packages are missing (playwright-core, pdfjs-dist) */
export function ensureBrowserPackages() {
  const lock = path.join(BROWSER_DIR, "package-lock.json")
  const marker = path.join(BROWSER_DIR, "node_modules", ".package-lock.json")
  if (!fs.existsSync(marker) || fs.statSync(marker).mtimeMs < fs.statSync(lock).mtimeMs) {
    spawnSync("npm", ["ci", "--no-audit", "--no-fund"], { cwd: BROWSER_DIR, stdio: "inherit" })
  }
}

/** node <script> inside the Playwright container; true when it exits 0 */
export function inBrowser(script, scriptArgs, extraMounts = []) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true })
  const uid = `${process.getuid()}:${process.getgid()}`
  const mounts = [`${TESTS_DIR}:${TESTS_DIR}`, `${SHOTS_DIR}:/shots`, ...extraMounts].flatMap((m) => ["-v", m])
  const result = spawnSync(
    "docker",
    ["run", "--rm", "--name", "mt-spike-browser", "--network", "host", "--user", uid, "-e", "HOME=/tmp", ...mounts, "-w", BROWSER_DIR, IMAGE, "node", script, ...scriptArgs],
    { stdio: "inherit" }
  )
  return result.status === 0
}
