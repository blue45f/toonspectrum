import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { createStudioProductionWorkspace, resolveStudioProductionScope } from "./studio-production-model";
import {
  createStudioProductionSqlitePersistence,
  decodeCanonicalStudioProductionWorkspace,
  normalizeStudioProductionScopeKey,
  serializeCanonicalStudioProductionWorkspace,
  STUDIO_PRODUCTION_SQLITE_NAMESPACE,
} from "./studio-production-sqlite-persistence";

import type { StudioLocalDatabase } from "../studio-local-database";

const NOW = "2026-09-05T03:00:00.000Z";

function memoryDatabase(initial: Readonly<Record<string, string>> = {}): {
  readonly database: StudioLocalDatabase;
  readonly rows: Map<string, string>;
  readonly writes: string[];
} {
  const rows = new Map(Object.entries(initial));
  const writes: string[] = [];
  const rowKey = (namespace: string, key: string) => `${namespace}:${key}`;
  return {
    rows,
    writes,
    database: {
      async kvGet(namespace, key) {
        return rows.get(rowKey(namespace, key)) ?? null;
      },
      async kvSet(namespace, key, value) {
        writes.push(value);
        rows.set(rowKey(namespace, key), value);
      },
      async kvDelete(namespace, key) {
        rows.delete(rowKey(namespace, key));
      },
    } as StudioLocalDatabase,
  };
}

describe("Studio production SQLite/OPFS persistence", () => {
  it("writes and reopens a strict canonical workspace in the shared V12 namespace", async () => {
    const fixture = memoryDatabase();
    const repository = createStudioProductionSqlitePersistence({
      acquireDatabase: async () => fixture.database,
    });
    const scope = resolveStudioProductionScope("/studio/work/work-1/review");
    const workspace = createStudioProductionWorkspace(scope, NOW);

    await expect(repository.save(workspace)).resolves.toMatchObject({
      backend: "sqlite",
      persisted: true,
    });
    const reopened = await repository.load(scope.key);
    expect(reopened).toMatchObject({ backend: "sqlite", persisted: true });
    expect(reopened.workspace).toEqual(workspace);
    expect(fixture.rows.has(`${STUDIO_PRODUCTION_SQLITE_NAMESPACE}:${scope.key}`)).toBe(true);
  });

  it("serializes overlapping saves in invocation order so the newest complete document wins", async () => {
    const fixture = memoryDatabase();
    const repository = createStudioProductionSqlitePersistence({
      acquireDatabase: async () => fixture.database,
    });
    const scope = resolveStudioProductionScope("/studio/projects");
    const base = createStudioProductionWorkspace(scope, NOW);
    const first = { ...base, title: "첫 저장", updatedAt: "2026-09-05T04:00:00.000Z" };
    const second = { ...base, title: "두 번째 저장", updatedAt: "2026-09-05T05:00:00.000Z" };

    await Promise.all([repository.save(first), repository.save(second)]);
    expect(fixture.writes).toHaveLength(2);
    expect(JSON.parse(fixture.writes[0]!) as unknown).toMatchObject({ title: "첫 저장" });
    expect(JSON.parse(fixture.writes[1]!) as unknown).toMatchObject({ title: "두 번째 저장" });
    await expect(repository.load(scope.key)).resolves.toMatchObject({
      workspace: { title: "두 번째 저장" },
    });
  });

  it("fails closed for corrupt, non-canonical, oversized, and cross-scope rows", async () => {
    const scope = resolveStudioProductionScope("/studio/projects");
    const workspace = createStudioProductionWorkspace(scope, NOW);
    expect(decodeCanonicalStudioProductionWorkspace("not-json")).toMatchObject({ ok: false });
    expect(decodeCanonicalStudioProductionWorkspace(JSON.stringify(workspace, null, 2))).toMatchObject({ ok: false });
    expect(decodeCanonicalStudioProductionWorkspace(`"${"x".repeat(8_000_001)}"`)).toMatchObject({ ok: false });

    const fixture = memoryDatabase({
      [`${STUDIO_PRODUCTION_SQLITE_NAMESPACE}:${scope.key}`]: serializeCanonicalStudioProductionWorkspace({
        ...workspace,
        scopeKey: "work:other",
      }),
    });
    const repository = createStudioProductionSqlitePersistence({
      acquireDatabase: async () => fixture.database,
    });
    await expect(repository.load(scope.key)).resolves.toMatchObject({
      backend: "unavailable",
      persisted: false,
      workspace: null,
    });
  });

  it("labels SQLite failures as in-session memory recovery instead of claiming durability", async () => {
    const scope = resolveStudioProductionScope("/studio/projects");
    const workspace = createStudioProductionWorkspace(scope, NOW);
    const repository = createStudioProductionSqlitePersistence({
      acquireDatabase: async () => {
        throw new Error("OPFS denied");
      },
    });
    const saved = await repository.save(workspace);
    expect(saved).toMatchObject({ backend: "memory", persisted: false, workspace });
    expect(saved.warning).toContain("세션");
    const loaded = await repository.load(scope.key);
    expect(loaded).toMatchObject({ backend: "memory", persisted: false, workspace });
    expect(loaded.warning).toContain("마지막 정상본");
  });

  it("normalizes storage keys and keeps forbidden browser KV fallbacks out of product code", () => {
    expect(normalizeStudioProductionScopeKey(" work:one ")).toBe("work:one");
    expect(normalizeStudioProductionScopeKey("")).toBeNull();
    expect(normalizeStudioProductionScopeKey(`work:${"x".repeat(241)}`)).toBeNull();
    const source = readFileSync(
      resolve(process.cwd(), "src/domains/creator/studio-production/studio-production-sqlite-persistence.ts"),
      "utf8",
    );
    expect(source).toContain("acquireStudioLocalDatabase");
    expect(source).toContain("kvSet");
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("indexedDB");
  });
});
