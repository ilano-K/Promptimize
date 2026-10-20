import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import { projects } from "../db/schemas";
import type {
  CreateProjectBody,
  Project,
  UpdateProjectBody,
} from "@promptimize/shared";
import { translateDbError } from "../db/errors";
import { DuplicateNameError, NotFoundError } from "../errors/domain";

// List projects
export function listProjects(): Project[] {
  const rows = db.select().from(projects).orderBy(desc(projects.id)).all();

  return rows;
}

// Create project
export function createProject(data: CreateProjectBody): Project {
  try {
    const project = db.insert(projects).values(data).returning().get();
    return project;
  } catch (error) {
    throw translateDbError(error, {
      DUPLICATE_NAME: new DuplicateNameError("project", data.name),
    });
  }
}

// Get project
export function getProject(id: number): Project {
  const project = db.select().from(projects).where(eq(projects.id, id)).get();
  if (!project) {
    throw new NotFoundError("project", id);
  }
  return project;
}

//  UPDATE project
export function updateProject(id: number, data: UpdateProjectBody): Project {
  try {
    const project = db
      .update(projects)
      .set(data)
      .where(eq(projects.id, id))
      .returning()
      .get();

    if (!project) {
      throw new NotFoundError("project", id);
    }
    return project;
  } catch (error) {
    if (data.name) {
      throw translateDbError(error, {
        DUPLICATE_NAME: new DuplicateNameError("project", data.name),
      });
    }
    throw error;
  }
}

// DELETE project
export function deleteProject(id: number): void {
  getProject(id);
  db.delete(projects).where(eq(projects.id, id)).run();
}
