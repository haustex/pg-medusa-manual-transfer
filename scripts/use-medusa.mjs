// Installs another Medusa release over the lockfile's, without saving it, for
// the CI matrix (and to reproduce a matrix leg locally):
//
//   node scripts/use-medusa.mjs 2.22.1
//   npm ci          # back to the lockfile's versions (2.19.0)
//
// Every @medusajs/* package the plugin builds and tests against moves to that
// version; @medusajs/ui follows the version the Admin dashboard of that
// release depends on.
import { execFileSync, spawnSync } from "node:child_process"

const version = process.argv[2]
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
  console.error("Usage: node scripts/use-medusa.mjs <x.y.z>")
  process.exit(1)
}

const PACKAGES = ["admin-sdk", "cli", "eslint-plugin", "framework", "icons", "js-sdk", "medusa", "test-utils"]

const dashboard = JSON.parse(
  execFileSync("npm", ["view", `@medusajs/dashboard@${version}`, "dependencies", "--json"], { encoding: "utf8" })
)
const ui = dashboard["@medusajs/ui"]
if (!ui) {
  console.error(`@medusajs/dashboard@${version} names no @medusajs/ui version`)
  process.exit(1)
}

const specs = [...PACKAGES.map((name) => `@medusajs/${name}@${version}`), `@medusajs/ui@${ui}`]
console.log(`> npm install --no-save ${specs.join(" ")}`)
const result = spawnSync("npm", ["install", "--no-save", "--no-audit", "--no-fund", ...specs], { stdio: "inherit" })
process.exit(result.status ?? 1)
