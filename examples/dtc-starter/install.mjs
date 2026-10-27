#!/usr/bin/env node
// Adds the bank-transfer pages to the storefront of a Medusa DTC Starter
// (github.com/medusajs/dtc-starter, apps/storefront):
//
//   node node_modules/medusa-payment-manual-transfer/examples/dtc-starter/install.mjs <repo>/apps/storefront [--force]
//
// Copies the core (src/storefront of the package) to
// src/modules/manual-transfer/core/, this example's src/ into the storefront,
// and makes four small edits to starter files: see ../shared/install.mjs and
// README.md next to this script.
import path from "node:path"
import { install } from "../shared/install.mjs"

install({ exampleDir: path.dirname(new URL(import.meta.url).pathname), starterName: "Medusa DTC Starter" })
