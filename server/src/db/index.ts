import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import envPaths from "env-paths";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "./schemas/index.js";

// Per-user data dir (Windows: %LOCALAPPDATA%\promptimize\Data). SQLite won't create the folder itself.
const dataDir = envPaths("promptimize", { suffix: "" }).data;
fs.mkdirSync(dataDir, { recursive: true });

const sqlite = new Database(path.join(dataDir, "promptimize.db"));
// SQLite ignores foreign keys unless this is set on every connection.
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

// server/drizzle, relative to this file. Must change once the server is bundled into dist/.
const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../drizzle",
);

// Applies only migrations not yet recorded in __drizzle_migrations. Synchronous; call before serve().
export function runMigrations() {
  migrate(db, { migrationsFolder });
}
