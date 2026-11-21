import { parseArgs } from "node:util";
import { serve } from "@hono/node-server";
import open from "open";
import { app } from "./app.js";
import { runMigrations } from "./db/index.js";
import { loadConfig } from "./config/index.js";
import { interruptLeftoverRuns } from "./services/runs.service.js";
import { serveFrontend } from "./lib/static.js";
import { log } from "./lib/log.js";

const { values } = parseArgs({
  options: {
    port: { type: "string", default: "4477" },
    "no-open": { type: "boolean", default: false },
  },
});

const port = Number(values.port);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`Not a valid port: ${values.port}`);
  process.exit(1);
}

loadConfig();
runMigrations();

const interrupted = interruptLeftoverRuns();
if (interrupted.length > 0) {
  console.log(`interrupted ${interrupted.length} leftover run(s): ${interrupted.join(", ")}`);
}

// Static files are registered last so they never shadow an API route.
if (!serveFrontend(app)) {
  console.warn("web/dist not found: serving the API only. Run `npm run build` to get the app.");
}

const url = `http://127.0.0.1:${port}`;

const server = serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, () => {
  console.log(`Promptimize running at ${url}`);
  log("INFO", "server.start", { port, host: "127.0.0.1" });
  // Opening the browser is a convenience: a headless machine still gets a
  // working server, so a failure here is not an error.
  if (!values["no-open"]) void open(url).catch(() => {});
});

server.on("error", (e) => {
  if ((e as NodeJS.ErrnoException).code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use. Try: promptimize --port ${port + 1}`);
    process.exit(1);
  }
  throw e;
});
