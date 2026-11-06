import { parseArgs } from "node:util";
import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { runMigrations } from "./db/index.js";
import { loadConfig } from "./config/index.js";
import { interruptLeftoverRuns } from "./services/runs.service.js";

const { values } = parseArgs({
  options: { port: { type: "string", default: "4477" } },
});
const port = Number(values.port);

loadConfig();
runMigrations();

const interrupted = interruptLeftoverRuns();
if (interrupted.length > 0) {
  console.log(`interrupted ${interrupted.length} leftover run(s): ${interrupted.join(", ")}`);
}

serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, () => {
  console.log(`Promptimize running at http://127.0.0.1:${port}`);
});
