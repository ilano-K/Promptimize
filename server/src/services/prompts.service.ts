import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import { prompts } from "../db/schemas";
import { DuplicateNameError, NotFoundError } from "../errors/domain";
import { getProject } from "./projects.service";
import { assertModelConfigured } from "../llm/models";
import { translateDbError, type DomainErrorsByCode } from "../db/errors";
import type {
  CreatePromptBody,
  Prompt,
  UpdatePromptBody,
} from "@promptimize/shared";

// LIST prompts
export function listPrompts(projectId: number): Prompt[] {
  getProject(projectId);
  const rows = db
    .select()
    .from(prompts)
    .where(eq(prompts.projectId, projectId))
    .orderBy(desc(prompts.id))
    .all();
  return rows;
}

// CREATE prompt
export function createPrompt(
  projectId: number,
  data: CreatePromptBody,
): Prompt {
  getProject(projectId);
  assertModelConfigured(data.model);
  const map: DomainErrorsByCode = {
    DUPLICATE_NAME: new DuplicateNameError("prompt", data.name),
  };
  try {
    const formattedData = { ...data, projectId: projectId };
    const [prompt] = db.insert(prompts).values(formattedData).returning().all();
    return prompt;
  } catch (error) {
    throw translateDbError(error, map);
  }
}

// GET prompt
export function getPrompt(id: number): Prompt {
  const prompt = db.select().from(prompts).where(eq(prompts.id, id)).get();

  if (!prompt) {
    throw new NotFoundError("prompt", id);
  }

  return prompt;
}

// UPDATE prompt
export function updatePrompt(id: number, data: UpdatePromptBody): Prompt {
  const map: DomainErrorsByCode = data.name
    ? { DUPLICATE_NAME: new DuplicateNameError("prompt", data.name) }
    : {};
  if (data.model) assertModelConfigured(data.model);
  try {
    const [prompt] = db
      .update(prompts)
      .set(data)
      .where(eq(prompts.id, id))
      .returning()
      .all();

    if (!prompt) {
      throw new NotFoundError("prompt", id);
    }
    return prompt;
  } catch (error) {
    throw translateDbError(error, map);
  }
}

export function deletePrompt(id: number): void {
  getPrompt(id);
  db.delete(prompts).where(eq(prompts.id, id)).run();
}
