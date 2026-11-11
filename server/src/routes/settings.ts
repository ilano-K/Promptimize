import { Hono } from "hono";
import {
  createProviderBody,
  providerConnectionBody,
  updateProviderBody,
} from "@promptimize/shared";
import { validateJson } from "../lib/validate";
import {
  createProvider,
  deleteProvider,
  fetchProviderModels,
  readSettings,
  testProviderConnection,
  updateProvider,
} from "../services/settings.service";

export const settingsRoutes = new Hono();

// READ settings
settingsRoutes.get("/", (c) => {
  const settings = readSettings();
  return c.json(settings, 200);
});

// CREATE provider
settingsRoutes.post("/", validateJson(createProviderBody), (c) => {
  const data = c.req.valid("json");
  const provider = createProvider(data);
  return c.json(provider, 201);
});

// Update provider
settingsRoutes.patch("/:id", validateJson(updateProviderBody), (c) => {
  const id = c.req.param("id");
  const data = c.req.valid("json");
  const provider = updateProvider(id, data);
  return c.json(provider, 200);
});

// Remove provider
settingsRoutes.delete("/:id", (c) => {
  const id = c.req.param("id");
  deleteProvider(id);
  return c.body(null, 204);
});

// Test connection by passing model kind and api key with optional base url
settingsRoutes.post(
  "/test-connection",
  validateJson(providerConnectionBody),
  async (c) => {
    const data = c.req.valid("json");
    const result = await testProviderConnection(data);
    return c.json(result);
  },
);

settingsRoutes.post(
  "/fetch-models",
  validateJson(providerConnectionBody),
  async (c) => {
    const data = c.req.valid("json");
    const result = await fetchProviderModels(data);
    return c.json(result);
  },
);
