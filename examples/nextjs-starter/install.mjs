#!/usr/bin/env node
// Adds the bank-transfer pages to a Medusa Next.js Starter checkout:
//
//   node node_modules/medusa-payment-manual-transfer/examples/nextjs-starter/install.mjs <starter-dir>
//
// 1. copies src/ of this example into the starter (new files only; --force
//    overwrites files that differ),
// 2. makes four small edits to starter files, each skipped when already done:
//    - src/lib/constants.tsx: "Bank transfer" in paymentInfoMap
//    - src/modules/checkout/components/payment-button/index.tsx: the place-order
//      button for bank transfers (continues to the payment instructions)
//    - src/modules/order/templates/order-details-template.tsx: a link to the
//      payment instructions on the account's order page
//    - src/modules/order/components/payment-details/index.tsx: no "paid at" for
//      a transfer that may not be paid yet
//
// An edit whose anchor text is missing (the starter changed) is reported and
// left for you to make by hand: see README.md next to this script.
import fs from "node:fs"
import path from "node:path"

const EXAMPLE_DIR = path.dirname(new URL(import.meta.url).pathname)
const args = process.argv.slice(2)
const force = args.includes("--force")
const target = args.find((arg) => !arg.startsWith("--"))

if (!target || !fs.existsSync(path.join(target, "src", "lib", "constants.tsx"))) {
  console.error("Usage: node install.mjs <path to a Medusa Next.js Starter checkout> [--force]")
  process.exit(1)
}

let problems = 0

function copyTree(from, to) {
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name)
    const dest = path.join(to, entry.name)
    if (entry.isDirectory()) {
      fs.mkdirSync(dest, { recursive: true })
      copyTree(source, dest)
      continue
    }
    const content = fs.readFileSync(source)
    if (fs.existsSync(dest)) {
      if (fs.readFileSync(dest).equals(content)) continue
      if (!force) {
        console.warn(`keep    ${path.relative(target, dest)} (differs; --force to overwrite)`)
        continue
      }
    }
    fs.writeFileSync(dest, content)
    console.log(`copy    ${path.relative(target, dest)}`)
  }
}

/** Applies `edit(source) → source` to a starter file unless `done(source)` */
function patch(file, done, edit) {
  const full = path.join(target, file)
  if (!fs.existsSync(full)) {
    console.warn(`missing ${file}: make this edit by hand (README.md)`)
    problems++
    return
  }
  const source = fs.readFileSync(full, "utf8")
  if (done(source)) {
    console.log(`ok      ${file}`)
    return
  }
  const result = edit(source)
  if (!result || result === source) {
    console.warn(`skip    ${file}: anchor not found, make this edit by hand (README.md)`)
    problems++
    return
  }
  fs.writeFileSync(full, result)
  console.log(`edit    ${file}`)
}

/** Replaces `anchor` once; null when it is not there */
function replaceOnce(source, anchor, replacement) {
  return source.includes(anchor) ? source.replace(anchor, replacement) : null
}

copyTree(path.join(EXAMPLE_DIR, "src"), path.join(target, "src"))

patch(
  "src/lib/constants.tsx",
  (s) => s.includes("pp_manual-transfer_manual-transfer"),
  (s) => {
    const withIcon = s.includes("Buildings")
      ? s
      : replaceOnce(s, 'import { CreditCard } from "@medusajs/icons"', 'import { Buildings, CreditCard } from "@medusajs/icons"')
    return (
      withIcon &&
      replaceOnce(
        withIcon,
        "  // Add more payment providers here",
        '  "pp_manual-transfer_manual-transfer": {\n    title: "Bank transfer",\n    icon: <Buildings />,\n  },\n  // Add more payment providers here'
      )
    )
  }
)

patch(
  "src/modules/checkout/components/payment-button/index.tsx",
  (s) => s.includes("ManualTransferPaymentButton"),
  (s) => {
    const imports = replaceOnce(
      s,
      'import { placeOrder } from "@lib/data/cart"',
      'import { placeOrder } from "@lib/data/cart"\nimport { isManualTransfer } from "@lib/manual-transfer/types"\nimport ManualTransferPaymentButton from "@modules/manual-transfer/components/manual-transfer-button"'
    )
    return (
      imports &&
      replaceOnce(
        imports,
        "    case isManual(paymentSession?.provider_id):",
        "    case isManualTransfer(paymentSession?.provider_id):\n      return <ManualTransferPaymentButton notReady={notReady} data-testid={dataTestId} />\n    case isManual(paymentSession?.provider_id):"
      )
    )
  }
)

patch(
  "src/modules/order/templates/order-details-template.tsx",
  (s) => s.includes("OrderTransferLink"),
  (s) => {
    const imports = replaceOnce(
      s,
      'import OrderDetails from "@modules/order/components/order-details"',
      'import OrderDetails from "@modules/order/components/order-details"\nimport OrderTransferLink from "@modules/manual-transfer/components/order-transfer-link"'
    )
    return (
      imports &&
      replaceOnce(
        imports,
        "        <OrderDetails order={order} showStatus />",
        "        <OrderDetails order={order} showStatus />\n        <OrderTransferLink order={order} />"
      )
    )
  }
)

patch(
  "src/modules/order/components/payment-details/index.tsx",
  (s) => s.includes("isManualTransfer"),
  (s) => {
    const imports = replaceOnce(
      s,
      'import { isStripeLike, paymentInfoMap } from "@lib/constants"',
      'import { isStripeLike, paymentInfoMap } from "@lib/constants"\nimport { isManualTransfer } from "@lib/manual-transfer/types"'
    )
    // "<amount> paid at <date>" → "<amount>" for bank transfers
    const paidAt = /\}\)\} paid at \$\{new Date\(\s*payment\.created_at \?\? ""\s*\)\.toLocaleString\(\)\}`/
    return (
      imports &&
      paidAt.test(imports) &&
      imports.replace(
        paidAt,
        '})}${isManualTransfer(payment.provider_id) ? "" : ` paid at ${new Date(payment.created_at ?? "").toLocaleString()}`}`'
      )
    )
  }
)

if (problems) {
  console.warn(`\n${problems} edit(s) to make by hand, see ${path.join(EXAMPLE_DIR, "README.md")}`)
  process.exitCode = 1
} else {
  console.log("\nDone. Set notifications.paymentUrl to https://<your storefront>/transfer/{order_id}?token={token}")
}
