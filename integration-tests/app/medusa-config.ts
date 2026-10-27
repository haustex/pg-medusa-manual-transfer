import path from "node:path"
import { defineConfig } from "@medusajs/framework/utils"

// Test app for the E2E suite. Only ever started through scripts/guard.mjs, which
// on the Haus Kayu host allows nothing but the mt-spike-* containers
// (Postgres 127.0.0.1:55433, Redis 127.0.0.1:56380) and ports 9400+.
//
// MT_PLUGIN_DIR is set by integration-tests/env.mjs; the fallback works when the
// config runs from integration-tests/app itself.
const pluginDir = process.env.MT_PLUGIN_DIR || path.resolve(__dirname, "../..")
const redisUrl = process.env.REDIS_URL!

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl,
    workerMode: (process.env.MEDUSA_WORKER_MODE as "shared" | "worker" | "server") || "shared",
    http: {
      storeCors: "*",
      adminCors: "*",
      authCors: "*",
      jwtSecret: "mt-e2e-jwt",
      cookieSecret: "mt-e2e-cookie",
    },
  },
  admin: { disable: process.env.MT_ADMIN !== "1", backendUrl: "/" },
  plugins: [
    {
      resolve: pluginDir,
      options: {
        showCredit: process.env.MT_SHOW_CREDIT !== "0",
        proofUploads: { perIp: 40, tokenExchangesPerIp: 30 },
        proofRetentionDays: 30,
        adminReminders: { verificationBusinessDays: 1, underpaidBusinessDays: 3 },
        notifications: {
          // MT_NO_ADMIN_EMAILS=1: the fallback (every Admin user), for the settings page check
          ...(process.env.MT_NO_ADMIN_EMAILS === "1" ? {} : { adminEmails: ["ops@e2e.test"] }),
          // The example storefront's payment page (integration-tests/storefront.mjs serves it on 9410)
          paymentUrl: process.env.MT_PAYMENT_URL || "http://localhost:9410/transfer/{order_id}?token={token}",
        },
      },
    },
  ],
  modules: [
    { resolve: "@medusajs/medusa/event-bus-redis", options: { redisUrl } },
    { resolve: "@medusajs/medusa/workflow-engine-redis", options: { redis: { redisUrl } } },
    {
      resolve: "@medusajs/medusa/payment",
      options: {
        providers: [
          {
            resolve: path.join(pluginDir, ".medusa/server/src/providers/manual-transfer"),
            id: "manual-transfer",
            options: { referencePrefix: "TEST", timezone: "Asia/Jakarta", deadlineBusinessDays: 3 },
          },
        ],
      },
    },
    {
      resolve: "@medusajs/medusa/notification",
      options: {
        providers: [
          {
            // Writes every e-mail (HTML, text, attachments) to MT_EMAIL_DIR instead of sending it
            resolve: path.join(pluginDir, ".medusa/server/src/providers/email-preview"),
            id: "email-preview",
            options: { channels: ["email"], dir: process.env.MT_EMAIL_DIR },
          },
        ],
      },
    },
  ],
})
