// Longest name the create bodies accept (prompts are capped at 100; judges are
// uncapped, so this is the safe upper bound for anything we generate).
const MAX_NAME_LENGTH = 100;

const RESTORED = "restored";

// Names are unique per project, so restoring "Clarity check" into a project that
// already has one must produce a free variant instead of a DUPLICATE_NAME.
// Taken names are compared case-insensitively, matching how providers are
// checked, even though the DB index is case-sensitive.
export function uniqueName(base: string, taken: readonly string[]): string {
  const used = new Set(taken.map((name) => name.trim().toLowerCase()));
  // snapshots come from the DB, which only guarantees a string; a blank base
  // would generate " (restored)", which no create body accepts
  const trimmed = base.trim() || "Restored";

  if (!used.has(trimmed.toLowerCase())) return trimmed;

  let candidate = appendSuffix(trimmed, ` (${RESTORED})`);
  let number = 2;

  while (used.has(candidate.toLowerCase())) {
    candidate = appendSuffix(trimmed, ` (${RESTORED} ${number})`);
    number++;
  }

  return candidate;
}

// Keeps the generated name within the column's accepted length by trimming the
// base, never the suffix (the suffix is what makes the name unique).
function appendSuffix(base: string, suffix: string): string {
  const room = MAX_NAME_LENGTH - suffix.length;
  const truncated = base.slice(0, Math.max(room, 0)).trimEnd();
  return `${truncated}${suffix}`;
}
