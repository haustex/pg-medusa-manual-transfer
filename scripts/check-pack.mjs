// `npm pack --dry-run` must be clean: what the package needs is in it, nothing
// else is (tests, test app, CI, secrets, notes), and the buyer-facing code
// carries no Haus Kayu credit. Run after `npm run build`.
//
//   node scripts/check-pack.mjs
import { execFileSync } from "node:child_process"
import fs from "node:fs"

const [pack] = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { encoding: "utf8" }))
const paths = pack.files.map((file) => file.path)
const problems = []

const REQUIRED = [
  "package.json",
  "README.md",
  "LICENSE",
  "CHANGELOG.md",
  "SECURITY.md",
  ".medusa/server/src/providers/manual-transfer/index.js",
  ".medusa/server/src/providers/email-preview/index.js",
  ".medusa/server/src/modules/manualTransfer/index.js",
  ".medusa/server/src/workflows/index.js",
  ".medusa/server/src/admin/index.js",
  ".medusa/server/src/admin/index.mjs",
  ".medusa/server/src/api/middlewares.js",
  "assets/fonts/NotoSans-Regular.ttf",
  "assets/fonts/OFL.txt",
  "examples/shared/install.mjs",
  "examples/nextjs-starter/install.mjs",
  "examples/dtc-starter/install.mjs",
  "src/storefront/api.ts",
  "src/storefront/labels.ts",
  "src/storefront/components/transfer-view.tsx",
]
for (const required of REQUIRED) {
  if (!paths.includes(required)) problems.push(`missing ${required}`)
}

const FORBIDDEN = [
  [/(^|\/)__tests__\//, "tests"],
  [/\.spec\.[jt]sx?$/, "tests"],
  [/^integration-tests\//, "the test app"],
  [/^\.github\//, "CI"],
  [/^scripts\//, "repo scripts"],
  [/^docs\//, "docs/screenshots"],
  [/(^|\/)\.env(\.|$)/, "an env file"],
  [/(^|\/)CLAUDE\.md$/, "working notes"],
  [/(^|\/)\.state\//, "test state"],
  [/(^|\/)node_modules\//, "node_modules"],
  [/^src\/(?!storefront\/)/, "plugin sources (the build is shipped)"],
  [/tsconfig\.json$/, "a tsconfig"],
]
for (const path of paths) {
  for (const [pattern, what] of FORBIDDEN) {
    if (pattern.test(path)) problems.push(`${path}: ${what}`)
  }
}

// What the buyer sees is the store's own: no Haus Kayu credit in the storefront
// code, the e-mail templates or the invoice
const BUYER_FACING = [/^examples\//, /^src\/storefront\//, /^\.medusa\/server\/src\/lib\/(notifications|invoice)/]
for (const path of paths.filter((p) => BUYER_FACING.some((r) => r.test(p)))) {
  if (/haus\s*kayu|hauskayu/i.test(fs.readFileSync(path, "utf8"))) problems.push(`${path}: Haus Kayu credit in buyer-facing code`)
}

console.log(`${pack.name}@${pack.version}: ${pack.files.length} files, ${(pack.size / 1024).toFixed(0)} kB packed, ${(pack.unpackedSize / 1024).toFixed(0)} kB unpacked`)
if (problems.length) {
  console.error(problems.map((p) => `  ${p}`).join("\n"))
  console.error(`npm pack: ${problems.length} problem(s)`)
  process.exit(1)
}
console.log("npm pack: clean")
