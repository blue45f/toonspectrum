import { describe, expect, it, vi } from "vitest";

import {
  STUDIO_PRODUCTION_INVALIDATION_TYPE,
  STUDIO_PRODUCTION_NAMESPACE,
  createDemoProductionWorkspace,
  createEmptyProductionWorkspace,
  createStudioProductionWorkspaceInvalidation,
  createStudioProductionWorkspaceRepository,
  parseProductionWorkspace,
  parseStudioProductionWorkspaceInvalidation,
  productionWorkspaceHasContent,
  resolveStudioProductionWorkspaceMode,
  studioProductionWorkspaceCapabilities,
} from "./studio-production-workspace";

const NOW = "2026-09-07T00:00:00.000Z";

function createDatabase(initial: Record<string, string> = {}) {
  const rows = new Map(Object.entries(initial));
  return {
    rows,
    kvGet: vi.fn(async (namespace: string, key: string) =>
      rows.get(`${namespace}:${key}`) ?? null),
    kvSet: vi.fn(async (namespace: string, key: string, value: string) => {
      rows.set(`${namespace}:${key}`, value);
    }),
  };
}

describe("studio production workspace", () => {
  it("keeps real scopes empty and confines seeded content to explicit demo mode", () => {
    const draft = createEmptyProductionWorkspace("draft", NOW);
    const work = createEmptyProductionWorkspace("work:chapter-1", NOW);
    const demo = createDemoProductionWorkspace(NOW);

    expect(productionWorkspaceHasContent(draft)).toBe(false);
    expect(productionWorkspaceHasContent(work)).toBe(false);
    expect(work.inviteToken).toBeNull();
    expect(productionWorkspaceHasContent(demo)).toBe(true);
    expect(demo.title).toContain("샘플");
  });

  it("resolves local, linked, server, cache and explicit demo modes", () => {
    expect(resolveStudioProductionWorkspaceMode({ scopeKey: "draft" })).toBe("local-draft");
    expect(resolveStudioProductionWorkspaceMode({
      scopeKey: "draft",
      search: "?demo=1",
    })).toBe("demo");
    expect(resolveStudioProductionWorkspaceMode({
      scopeKey: "work:chapter-1",
      search: "?demo=1",
    })).toBe("linked-local");
    expect(resolveStudioProductionWorkspaceMode({
      scopeKey: "work:chapter-1",
      serverBacked: true,
    })).toBe("server-work");
    expect(resolveStudioProductionWorkspaceMode({
      scopeKey: "work:chapter-1",
      cacheOnly: true,
    })).toBe("read-only-cache");
  });

  it("fails closed for invite, approval and publish capabilities outside server mode", () => {
    for (const mode of ["local-draft", "linked-local", "demo", "read-only-cache"] as const) {
      expect(studioProductionWorkspaceCapabilities(mode)).toMatchObject({
        canInvite: false,
        canApprove: false,
        canPublish: false,
        serverAuthoritative: false,
      });
    }
    expect(studioProductionWorkspaceCapabilities("server-work")).toMatchObject({
      canInvite: true,
      canApprove: true,
      canPublish: true,
      serverAuthoritative: true,
    });
  });

  it("migrates legacy version-one rows without treating their token as server authority", () => {
    const legacy = JSON.stringify({
      schemaVersion: 1,
      scopeKey: "work:chapter-1",
      title: "기존 제작 운영",
      updatedAt: NOW,
      tasks: [],
      reviews: [],
      versions: [],
      slides: [],
      members: [],
      inviteToken: "ts-legacy-token",
    });

    expect(parseProductionWorkspace(legacy, "work:chapter-1")).toEqual({
      schemaVersion: 2,
      revision: 0,
      scopeKey: "work:chapter-1",
      title: "기존 제작 운영",
      updatedAt: NOW,
      tasks: [],
      reviews: [],
      versions: [],
      slides: [],
      members: [],
      inviteToken: "ts-legacy-token",
    });
  });

  it("serializes concurrent commits through the repository and advances revisions", async () => {
    const database = createDatabase();
    let lockTail = Promise.resolve();
    const repository = createStudioProductionWorkspaceRepository({
      acquireDatabase: async () => database,
      now: () => NOW,
      lock: async (_name, operation) => {
        const run = lockTail.then(operation);
        lockTail = run.then(() => undefined, () => undefined);
        return run;
      },
    });
    const fallback = createEmptyProductionWorkspace("work:chapter-1", NOW);

    const first = repository.commit("work:chapter-1", fallback, (workspace) => ({
      ...workspace,
      tasks: [{
        id: "task-1",
        title: "콘티 확정",
        owner: "작가",
        due: "2026-09-08",
        progress: 0,
        status: "todo",
      }],
    }));
    const second = repository.commit("work:chapter-1", fallback, (workspace) => ({
      ...workspace,
      reviews: [{
        id: "review-1",
        title: "시선 방향 확인",
        assignee: "편집자",
        severity: "major",
        status: "open",
      }],
    }));

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult.revision).toBe(1);
    expect(secondResult.revision).toBe(2);
    expect(secondResult.tasks).toHaveLength(1);
    expect(secondResult.reviews).toHaveLength(1);
    expect(database.kvSet).toHaveBeenCalledTimes(2);

    const stored = parseProductionWorkspace(
      database.rows.get(`${STUDIO_PRODUCTION_NAMESPACE}:work:chapter-1`) ?? null,
      "work:chapter-1",
    );
    expect(stored).toMatchObject({ revision: 2 });
  });

  it("does not replace corrupt persisted data with the fallback workspace", async () => {
    const database = createDatabase({
      [`${STUDIO_PRODUCTION_NAMESPACE}:work:chapter-1`]: "{corrupt",
    });
    const repository = createStudioProductionWorkspaceRepository({
      acquireDatabase: async () => database,
      now: () => NOW,
      lock: async (_name, operation) => operation(),
    });

    await expect(repository.commit(
      "work:chapter-1",
      createEmptyProductionWorkspace("work:chapter-1", NOW),
      (workspace) => workspace,
    )).rejects.toThrow(/읽을 수 없습니다/u);
    expect(database.kvSet).not.toHaveBeenCalled();
  });

  it("broadcasts invalidation receipts rather than complete workspaces", () => {
    const receipt = createStudioProductionWorkspaceInvalidation({
      scopeKey: "work:chapter-1",
      revision: 3,
      sourceClientId: "client-1",
    });
    expect(receipt.type).toBe(STUDIO_PRODUCTION_INVALIDATION_TYPE);
    expect(parseStudioProductionWorkspaceInvalidation(receipt)).toEqual(receipt);
    expect(parseStudioProductionWorkspaceInvalidation(
      createDemoProductionWorkspace(NOW),
    )).toBeNull();
  });
});
