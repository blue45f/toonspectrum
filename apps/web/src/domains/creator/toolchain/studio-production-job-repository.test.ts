import { describe, expect, it } from "vitest";

import { createStudioProductionJob } from "./studio-production-jobs";
import {
  createStudioProductionJobRepository,
  STUDIO_PRODUCTION_JOB_NAMESPACE,
} from "./studio-production-job-repository";

import type { StudioLocalDatabase } from "../studio-local-database";

function memoryDatabase() {
  const values = new Map<string, string>();
  const database = {
    async kvGet(namespace: string, key: string) {
      return values.get(`${namespace}:${key}`) ?? null;
    },
    async kvSet(namespace: string, key: string, value: string) {
      values.set(`${namespace}:${key}`, value);
    },
    async kvDelete(namespace: string, key: string) {
      values.delete(`${namespace}:${key}`);
    },
  } as unknown as StudioLocalDatabase;
  return { database, values };
}

function job(id: string) {
  return createStudioProductionJob({
    id,
    now: () => new Date("2026-09-15T00:00:00.000Z"),
    profile: "open",
    toolId: "tesseract",
    operationId: "ocr-text",
  });
}

describe("Studio production job repository", () => {
  it("persists independent global and project scopes in SQLite KV", async () => {
    const memory = memoryDatabase();
    const repository = createStudioProductionJobRepository({
      acquireDatabase: async () => memory.database,
    });

    await repository.save([job("job_global01")]);
    await repository.save([job("job_project1")], "project-a");

    expect((await repository.load()).map(({ id }) => id)).toEqual(["job_global01"]);
    expect((await repository.load("project-a")).map(({ id }) => id)).toEqual(["job_project1"]);
    expect(memory.values.has(`${STUDIO_PRODUCTION_JOB_NAMESPACE}:global`)).toBe(true);
    expect(memory.values.has(`${STUDIO_PRODUCTION_JOB_NAMESPACE}:project:project-a`)).toBe(true);
  });

  it("removes a single job without clearing sibling history", async () => {
    const memory = memoryDatabase();
    const repository = createStudioProductionJobRepository({
      acquireDatabase: async () => memory.database,
    });
    await repository.save([job("job_00000001"), job("job_00000002")], "project-a");

    const remaining = await repository.remove("job_00000001", "project-a");
    expect(remaining.map(({ id }) => id)).toEqual(["job_00000002"]);
    expect((await repository.load("project-a")).map(({ id }) => id)).toEqual(["job_00000002"]);
  });

  it("fails closed when persisted JSON is corrupt", async () => {
    const memory = memoryDatabase();
    memory.values.set(`${STUDIO_PRODUCTION_JOB_NAMESPACE}:global`, "{not-json");
    const repository = createStudioProductionJobRepository({
      acquireDatabase: async () => memory.database,
    });
    await expect(repository.load()).rejects.toThrow();
  });

  it("rejects unsafe project scopes", async () => {
    const memory = memoryDatabase();
    const repository = createStudioProductionJobRepository({
      acquireDatabase: async () => memory.database,
    });
    await expect(repository.load(".."))
      .rejects.toThrow(/유효한 프로젝트/u);
    await expect(repository.save([], "path\\escape"))
      .rejects.toThrow(/유효한 프로젝트/u);
  });
});
