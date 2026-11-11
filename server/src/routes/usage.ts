import { Hono } from "hono";
import { modelUsage } from "../services/usage.service";

export const usageRoutes = new Hono();

// Which prompts and judges use each configured model. The settings screen
// needs this before it can warn about removing a model or provider.
usageRoutes.get("/", (c) => c.json(modelUsage(), 200));
