import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dataDir } from "../lib/app-dirs";
import * as schema from "./schemas/index.js";

// Per-user data dir (Windows: %LOCALAPPDATA%\promptimize). SQLite won't create the folder itself.
fs.mkdirSync(dataDir, { recursive: true });

const sqlite = new Database(path.join(dataDir, "promptimize.db"));
// SQLite ignores foreign keys unless this is set on every connection.
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

// Migrations ship next to the build: server/drizzle in the repo and in the
// package (dist/ and drizzle/ are siblings), so check the layouts instead of
// hardcoding one depth.
const here = path.dirname(fileURLToPath(import.meta.url));

function migrationsFolder(): string {
  const candidates = [
    path.resolve(here, "../drizzle"), // bundled: server/dist -> server/drizzle
    path.resolve(here, "../../drizzle"), // dev: server/src/db -> server/drizzle
    path.resolve(here, "drizzle"), // if the build copies them into dist/
  ];

  const found = candidates.find((dir) => fs.existsSync(path.join(dir, "meta", "_journal.json")));
  if (!found) {
    throw new Error("Migration files not found. Reinstall promptimize.");
  }
  return found;
}

// Applies only migrations not yet recorded in __drizzle_migrations. Synchronous; call before serve().
export function runMigrations() {
  migrate(db, { migrationsFolder: migrationsFolder() });
}
