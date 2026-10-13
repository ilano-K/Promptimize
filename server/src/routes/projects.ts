import { Hono } from "hono";
import { db } from "../db";
import { projects } from "../db/schemas";
import { desc, eq } from "drizzle-orm";
import { validateJson } from "../lib/validate";
import { createProjectBody, updateProjectBody } from "@promptimize/shared";
import { ApiError } from "../errors";

export const projectRoutes = new Hono();

// List all projects
projectRoutes.get("/", async (c) => {
  const rows = await db
    .select()
    .from(projects)
    .orderBy(desc(projects.id))
    .all();
  return c.json(rows);
});

// Create project
projectRoutes.post("/", validateJson(createProjectBody), async (c) => {
  const data = c.req.valid("json");

  try {
    const [project] = await db.insert(projects).values(data).returning();

    return c.json(project, 201);
  } catch (error: any) {
    // On duplicate project name
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      throw new ApiError(
        409,
        "DUPLICATE_NAME",
        "A project with this name already exists",
      );
    }
    throw error;
  }
});

projectRoutes.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));

  validateId(id);
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, id),
  });

  if (!project) {
    throw new ApiError(404, "NOT_FOUND", "Project not found");
  }

  return c.json(project, 200);
});

// Edit project
projectRoutes.patch("/:id", validateJson(updateProjectBody), async (c) => {
  const id = Number(c.req.param("id"));
  const data = c.req.valid("json");
  validateId(id);

  const [project] = await db
    .update(projects)
    .set(data)
    .where(eq(projects.id, id))
    .returning();

  if (!project) {
    throw new ApiError(404, "NOT_FOUND", "Project not found");
  }

  return c.json(project, 200);
});

projectRoutes.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  validateId(id);

  await db.delete(projects).where(eq(projects.id, id));
  return c.body(null, 204);
});

function validateId(id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new ApiError(400, "VALIDATION_ERROR", "Invalid project ID");
  }
}
