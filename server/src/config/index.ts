import fs from "node:fs";
import path from "node:path";
import envPaths from "env-paths";
import type { Config } from "./schema";
import { ConfigSchema } from "./schema";
import z from "zod";

// Per-user config folder. Holds API keys.
const dir = envPaths("promptimize", { suffix: "" }).config;
const file = path.join(dir, "config.json");

// In-memory copy so routes never re-read the file. Set by loadConfig().
let current: Config | undefined;

// Call once at startup. Reads and validates the file, or creates it with defaults.
export function loadConfig(): Config {
  fs.mkdirSync(dir, { recursive: true });

  // First start: write defaults. Needs every schema field to have a default, or parse({}) throws.
  if (!fs.existsSync(file)) {
    current = ConfigSchema.parse({});
    writeAtomic(current);
    return current;
  }

  // Throw instead of overwriting: the file may be hand-edited and holds the user's keys.
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (e) {
    throw new Error(
      `Config at ${file} is not valid JSON: ${(e as Error).message}`,
    );
  }

  const result = ConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(
      `Config at ${file} is invalid:\n${z.prettifyError(result.error)}`,
    );
  }
  current = result.data;
  return current;
}

export function getConfig(): Config {
  if (!current) throw new Error("loadConfig() was not called at startup");
  return current;
}

export function saveConfig(next: Config): Config {
  current = ConfigSchema.parse(next);
  writeAtomic(current);
  return current;
}

// Write to a temp file, then rename: a crash mid-write can't corrupt config.json.
function writeAtomic(config: Config) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2), {
    mode: 0o600,
  });
  fs.renameSync(tmp, file);
}
