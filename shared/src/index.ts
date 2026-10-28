// Types shared by web and server: Experiment, Run, Snapshot, API request/response shapes.
export * from "./projects.js";
export * from "./statuses.js";
export * from "./error.js";
export * from "./json-schema.js";
export * from "./settings.js";
export * from "./prompts.js";
export * from "./inputs.js";
export * from "./judges.js";

export type Health = { ok: true };
