import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Hono } from "hono";

// The built frontend is one directory of static files. Its location differs
// between the repo (web/dist) and the published package (the same path inside
// the tarball), so resolve by looking for index.html instead of hardcoding.
const here = path.dirname(fileURLToPath(import.meta.url));

const candidates = [
  path.resolve(here, "../../web/dist"), // bundled: server/dist -> <pkg>/web/dist
  path.resolve(here, "../../../web/dist"), // dev: server/src/lib -> web/dist
];

export function frontendRoot(): string | undefined {
  return candidates.find((dir) => fs.existsSync(path.join(dir, "index.html")));
}

/**
 * Serves the built app at "/", keeping /api/* for the routes registered before
 * this call. Returns false when the frontend has not been built, so the caller
 * can say so instead of returning a bare 404 for every page.
 */
export function serveFrontend(app: Hono): boolean {
  const root = frontendRoot();
  if (!root) return false;

  // Assets keep their hashed names, so nothing needs rewriting but the root.
  app.use(
    "/*",
    serveStatic({
      root,
      rewriteRequestPath: (p) => (p === "/" ? "/index.html" : p),
    }),
  );
  return true;
}
