import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import { inputs } from "../db/schemas";
import type {
  CreateInputBody,
  Input,
  UpdateInputBody,
} from "@promptimize/shared";
import { NotFoundError } from "../errors/domain";
import { getProject } from "./projects.service";

// LIST inputs
export function listInputs(projectId: number): Input[] {
  getProject(projectId);
  return db
    .select()
    .from(inputs)
    .where(eq(inputs.projectId, projectId))
    .orderBy(desc(inputs.id))
    .all();
}

// CREATE input
export function createInput(projectId: number, data: CreateInputBody): Input {
  getProject(projectId);

  const formattedData = { ...data, projectId: projectId };
  const [input] = db.insert(inputs).values(formattedData).returning().all();
  return input;
}

// GET input
export function getInput(id: number): Input {
  const input = db.select().from(inputs).where(eq(inputs.id, id)).get();
  if (!input) {
    throw new NotFoundError("input", id);
  }
  return input;
}

// EDIT input
export function updateInput(id: number, data: UpdateInputBody): Input {
  const [input] = db
    .update(inputs)
    .set(data)
    .where(eq(inputs.id, id))
    .returning()
    .all();
  if (!input) {
    throw new NotFoundError("input", id);
  }

  return input;
}

export function deleteInput(id: number): void {
  getInput(id);
  db.delete(inputs).where(eq(inputs.id, id)).run();
}
