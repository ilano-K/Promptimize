import { parseArgs } from "node:util";
import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { runMigrations } from "./db/index.js";
import { loadConfig } from "./config/index.js";

const { values } = parseArgs({
  options: { port: { type: "string", default: "4477" } },
});
const port = Number(values.port);

loadConfig();
runMigrations();

serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, () => {
  console.log(`Promptimize running at http://127.0.0.1:${port}`);
});
