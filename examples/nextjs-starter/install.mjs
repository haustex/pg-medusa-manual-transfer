#!/usr/bin/env node
// Adds the bank-transfer pages to a Medusa Next.js Starter checkout:
//
//   node node_modules/medusa-payment-manual-transfer/examples/nextjs-starter/install.mjs <starter-dir> [--force]
//
// Copies the core (src/storefront of the package) to
// src/modules/manual-transfer/core/, this example's src/ into the starter, and
// makes four small edits to starter files: see ../shared/install.mjs and
// README.md next to this script.
import path from "node:path"
import { install } from "../shared/install.mjs"

install({ exampleDir: path.dirname(new URL(import.meta.url).pathname), starterName: "Medusa Next.js Starter" })
