import path from "node:path"
import { ExecArgs } from "@medusajs/framework/types"

// Runs one of the plugin's scheduled jobs now: medusa exec ./src/scripts/run-mt-job.ts <job-file-name>
export default async function runJob({ container, args }: ExecArgs) {
  const pluginDir = process.env.MT_PLUGIN_DIR || path.resolve(__dirname, "../../../..")
  const job = await import(path.join(pluginDir, ".medusa/server/src/jobs", `${args[0]}.js`))
  const run = typeof job.default === "function" ? job.default : job.default.default
  await run(container)
  // Workflows release their events after they finish; a long-lived worker has
  // time for that, this short process waits for it before exiting
  await new Promise((resolve) => setTimeout(resolve, 3000))
  console.log(`job ${args[0]} done`)
}
