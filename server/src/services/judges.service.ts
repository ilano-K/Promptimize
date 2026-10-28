import type {
  CreateJudgeBody,
  Judge,
  UpdateJudgeBody,
} from "@promptimize/shared";
import { db } from "../db";
import { judges } from "../db/schemas";
import { desc, eq } from "drizzle-orm";
import { translateDbError, type DomainErrorsByCode } from "../db/errors";
import { DuplicateNameError, NotFoundError } from "../errors/domain";
import { getProject } from "./projects.service";
import { assertModelConfigured } from "../llm/models";

export function listJudges(projectId: number): Judge[] {
  getProject(projectId);
  const rows = db
    .select()
    .from(judges)
    .where(eq(judges.projectId, projectId))
    .orderBy(desc(judges.id))
    .all();

  return rows;
}

export function createJudge(projectId: number, data: CreateJudgeBody): Judge {
  getProject(projectId);
  assertModelConfigured(data.model);
  const map: DomainErrorsByCode = data.name
    ? { DUPLICATE_NAME: new DuplicateNameError("judge", data.name) }
    : {};

  const formattedData = { ...data, projectId: projectId };

  try {
    const [judge] = db.insert(judges).values(formattedData).returning().all();
    return judge;
  } catch (error) {
    throw translateDbError(error, map);
  }
}

export function getJudge(id: number) {
  const [judge] = db.select().from(judges).where(eq(judges.id, id)).all();
  if (!judge) {
    throw new NotFoundError("judge", id);
  }
  return judge;
}

export function updateJudge(id: number, data: UpdateJudgeBody): Judge {
  const map: DomainErrorsByCode = data.name
    ? { DUPLICATE_NAME: new DuplicateNameError("judge", data.name) }
    : {};

  if (data.model) {
    assertModelConfigured(data.model);
  }

  try {
    const [judge] = db
      .update(judges)
      .set(data)
      .where(eq(judges.id, id))
      .returning()
      .all();

    if (!judge) {
      throw new NotFoundError("judge", id);
    }
    return judge;
  } catch (error) {
    throw translateDbError(error, map);
  }
}

export function deleteJudge(id: number): void {
  getJudge(id);
  db.delete(judges).where(eq(judges.id, id)).run();
}
