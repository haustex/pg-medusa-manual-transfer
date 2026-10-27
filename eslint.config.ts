import { defineConfig } from "eslint/config"
import medusa from "@medusajs/eslint-plugin"

export default defineConfig([
  // Storefront code (Next.js), checked against the starter in integration-tests/storefront.mjs
  { ignores: ["examples/**"] },
  ...medusa.configs.recommended,
])
