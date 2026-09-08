import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createDemoProductionWorkspace, createEmptyProductionWorkspace,
  createStudioProductionClientId, createStudioProductionWorkspaceInvalidation,
  createStudioProductionWorkspaceRepository, isStudioProductionScopeKey,
  parseProductionWorkspace, parseStudioProductionWorkspaceInvalidation,
  productionWorkspaceHasContent, projectProductionWorkspaceMutation,
  resolveStudioProductionWorkspaceMode, serializeProductionWorkspace,
  STUDIO_PRODUCTION_NAMESPACE, studioProductionWorkspaceCapabilities,
  studioProductionWorkspaceModeLabel,
} from "./studio-production-workspace-runtime";

const NOW = "2026-09-07T00:00:00.000Z";
const SCOPE = "work:production-runtime-tests";
const task = { id: "task-1", title: "제작 작업", owner: "", due: "2026-09-08", progress: 25.4, status: "doing" };
const review = { id: "review-1", title: "검수", assignee: "", severity: "major", status: "open" };
const slide = { id: "slide-1", title: "소개", body: "본문" };
function stored(patch: Record<string, unknown> = {}) {
  return JSON.stringify({ ...createEmptyProductionWorkspace(SCOPE, NOW), ...patch });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("production durable document admission", () => {
  it.each([undefined, 1, "work", "other:x", "work:", "work:..", "work: x", "work:a\\b", "work:a\u0000b", "work:a\u007fb", `work:${"x".repeat(161)}`])(
    "refuses unsafe scope %j before any database access", async (scope) => {
      expect(isStudioProductionScopeKey(scope)).toBe(false);
      expect(() => createEmptyProductionWorkspace(String(scope))).toThrow(/scope/);
      const acquire = vi.fn();
      const repository = createStudioProductionWorkspaceRepository({ acquireDatabase: acquire });
      await expect(repository.load(String(scope))).rejects.toThrow(/scope/);
      expect(acquire).not.toHaveBeenCalled();
    },
  );

  it("normalizes a complete document and its snapshot without losing lists or opaque identities", () => {
    const raw = stored({ title: "  작품 소개  ", tasks: [{ ...task, owner: null }], reviews: [{ ...review, assignee: null }],
      slides: [{ ...slide, body: "  본문  " }], members: [" 작가 ", "편집자"],
      versions: [{ id: "checkpoint-1", name: "첫 검수본", createdAt: "2026-09-07T09:00:00+09:00", tasks: [task], reviews: [review] }],
      inviteToken: "legacy-local-token", revision: 9 });
    const parsed = parseProductionWorkspace(raw, SCOPE)!;
    expect(parsed).toMatchObject({ title: "작품 소개", revision: 9, members: ["작가", "편집자"], inviteToken: "legacy-local-token",
      tasks: [{ ...task, progress: 25 }], slides: [{ ...slide, body: "본문" }],
      versions: [{ createdAt: NOW, tasks: [{ ...task, progress: 25 }], reviews: [review] }] });
    expect(parseProductionWorkspace(serializeProductionWorkspace(parsed), SCOPE)).toEqual(parsed);
    expect(productionWorkspaceHasContent(parsed)).toBe(true);
  });

  it.each([
    ["invalid JSON", "{"], ["array root", "[]"], ["unsupported version", stored({ schemaVersion: 3 })],
    ["cross scope", stored({ scopeKey: "remix:other" })], ["missing title", stored({ title: " " })],
    ["invalid time", stored({ updatedAt: "yesterday" })], ["negative revision", stored({ revision: -1 })],
    ["fractional revision", stored({ revision: 1.2 })], ["missing tasks", stored({ tasks: null })],
    ["too many tasks", stored({ tasks: Array.from({ length: 1001 }, () => task) })],
    ["missing reviews", stored({ reviews: null })], ["missing versions", stored({ versions: null })],
    ["too many versions", stored({ versions: Array(201).fill(null) })], ["missing slides", stored({ slides: null })],
    ["too many slides", stored({ slides: Array(201).fill(null) })],
    ["invalid task object", stored({ tasks: [null] })], ["invalid task date", stored({ tasks: [{ ...task, due: "soon" }] })],
    ["out of range progress", stored({ tasks: [{ ...task, progress: 101 }] })], ["unknown task state", stored({ tasks: [{ ...task, status: "published" }] })],
    ["invalid review", stored({ reviews: [null] })], ["invalid review severity", stored({ reviews: [{ ...review, severity: "fatal" }] })],
    ["invalid review state", stored({ reviews: [{ ...review, status: "approved" }] })],
    ["invalid slide", stored({ slides: [null] })], ["oversized slide", stored({ slides: [{ ...slide, body: "x".repeat(4001) }] })],
    ["invalid checkpoint", stored({ versions: [null] })],
    ["missing checkpoint lists", stored({ versions: [{ id: "v", name: "v", createdAt: NOW, tasks: [], reviews: null }] })],
    ["corrupt checkpoint task", stored({ versions: [{ id: "v", name: "v", createdAt: NOW, tasks: [null], reviews: [] }] })],
    ["missing members", stored({ members: null })], ["invalid member", stored({ members: [" "] })],
    ["too many members", stored({ members: Array(201).fill("작가") })],
    ["unsafe old invite", stored({ inviteToken: "../\\secret" })], ["oversized bytes", " ".repeat(2_000_001)],
  ])("rejects %s instead of dropping data", (_label, raw) => {
    expect(() => parseProductionWorkspace(raw, SCOPE)).toThrow();
  });

  it("enforces the same admission on commits and leaves the acknowledged row untouched", async () => {
    const rows = new Map([[SCOPE, stored({ tasks: [{ ...task, progress: 25 }] })]]);
    const database = { kvGet: vi.fn(async (_namespace: string, key: string) => rows.get(key) ?? null),
      kvSet: vi.fn(async (_namespace: string, key: string, value: string) => { rows.set(key, value); }) };
    const repository = createStudioProductionWorkspaceRepository({ acquireDatabase: async () => database, now: () => NOW });
    const fallback = createEmptyProductionWorkspace(SCOPE, NOW);
    const before = rows.get(SCOPE);
    await expect(repository.commit(SCOPE, fallback, (current) => ({ ...current, title: " " }))).rejects.toThrow();
    await expect(repository.commit(SCOPE, fallback, (current) => ({ ...current, scopeKey: "work:other" }))).rejects.toThrow(/scopes/);
    expect(rows.get(SCOPE)).toBe(before);
    expect(database.kvSet).not.toHaveBeenCalled();
    const corrected = await repository.commit(SCOPE, fallback, (current) => ({ ...current, title: "수정한 제목" }));
    expect(corrected).toMatchObject({ title: "수정한 제목", revision: 1, tasks: [{ id: "task-1" }] });
    expect(await repository.load(SCOPE)).toEqual(corrected);
  });

  it("queues same-scope writes after failures while allowing another scope to progress", async () => {
    vi.stubGlobal("navigator", {});
    const first = deferred<void>();
    const rows = new Map<string, string>();
    let writes = 0;
    const database = { kvGet: async (_namespace: string, key: string) => rows.get(key) ?? null,
      kvSet: vi.fn(async (_namespace: string, key: string, raw: string) => {
        if (key === SCOPE && ++writes === 1) { await first.promise; throw new Error("disk full"); }
        rows.set(key, raw);
      }) };
    const repository = createStudioProductionWorkspaceRepository({ acquireDatabase: async () => database, now: () => NOW });
    const fallback = createEmptyProductionWorkspace(SCOPE, NOW);
    const failed = repository.commit(SCOPE, fallback, (current) => ({ ...current, title: "失敗" }));
    const checkFailed = expect(failed).rejects.toThrow("disk full");
    const next = repository.commit(SCOPE, fallback, (current) => ({ ...current, title: "재시도" }));
    const other = await repository.commit("work:parallel", createEmptyProductionWorkspace("work:parallel", NOW), (current) => ({ ...current, title: "다른 작품" }));
    expect(other.revision).toBe(1);
    first.resolve();
    await checkFailed;
    expect(await next).toMatchObject({ title: "재시도", revision: 1 });
    expect(database.kvSet).toHaveBeenCalledTimes(3);
  });

  it("uses the browser exclusive lock and rejects identity mismatch before entering it", async () => {
    const request = vi.fn(async (_name: string, _options: { mode: string }, operation: () => Promise<unknown>) => operation());
    vi.stubGlobal("navigator", { locks: { request } });
    const database = { kvGet: async () => null, kvSet: vi.fn(async () => undefined) };
    const repository = createStudioProductionWorkspaceRepository({ acquireDatabase: async () => database, now: () => NOW });
    await expect(repository.commit(SCOPE, createEmptyProductionWorkspace("draft", NOW), (current) => current)).rejects.toThrow(/scope/);
    expect(request).not.toHaveBeenCalled();
    await repository.commit(SCOPE, createEmptyProductionWorkspace(SCOPE, NOW), (current) => current);
    expect(request).toHaveBeenCalledWith(`${STUDIO_PRODUCTION_NAMESPACE}:${SCOPE}`, { mode: "exclusive" }, expect.any(Function));
  });

  it("rejects invalid clocks and unsafe revision increments", () => {
    expect(() => createEmptyProductionWorkspace(SCOPE, "invalid")).toThrow(/timestamp/);
    expect(() => projectProductionWorkspaceMutation(createEmptyProductionWorkspace(SCOPE), (current) => current, "invalid")).toThrow(/timestamp/);
    const last = { ...createEmptyProductionWorkspace(SCOPE), revision: Number.MAX_SAFE_INTEGER };
    expect(() => projectProductionWorkspaceMutation(last, (current) => current, NOW)).toThrow();
  });
});

describe("production mode and broadcast authority", () => {
  it.each(["tasks", "reviews", "versions", "slides", "members"] as const)("recognizes %s-only content", (key) => {
    const values = { tasks: [task], reviews: [review], versions: [{ id: "v1", name: "검수본", createdAt: NOW, tasks: [], reviews: [] }], slides: [slide], members: ["작가"] };
    expect(productionWorkspaceHasContent({ ...createEmptyProductionWorkspace(SCOPE), [key]: values[key] })).toBe(true);
  });
  it("does not elevate demo/remix/cache parameters to server authority", () => {
    expect(resolveStudioProductionWorkspaceMode({ scopeKey: "draft", search: new URLSearchParams("demo=1&demo=1") })).toBe("local-draft");
    expect(resolveStudioProductionWorkspaceMode({ scopeKey: "remix:x", serverBacked: true })).toBe("linked-local");
    expect(resolveStudioProductionWorkspaceMode({ scopeKey: "work:x", serverBacked: true, cacheOnly: true })).toBe("read-only-cache");
    expect(studioProductionWorkspaceCapabilities("read-only-cache")).toEqual({ canEdit: false, canPersistLocally: false, canInvite: false, canApprove: false, canPublish: false, serverAuthoritative: false });
    expect(() => resolveStudioProductionWorkspaceMode({ scopeKey: "other:x" })).toThrow();
    for (const mode of ["local-draft", "linked-local", "server-work", "read-only-cache", "demo"] as const) expect(studioProductionWorkspaceModeLabel(mode)).toBeTruthy();
    expect(createDemoProductionWorkspace().scopeKey).toBe("draft");
  });
  it("validates receipt identities and generates distinct fallback client IDs", () => {
    vi.stubGlobal("crypto", {});
    expect(createStudioProductionClientId()).not.toBe(createStudioProductionClientId());
    for (const patch of [{ scopeKey: "invalid" }, { revision: -1 }, { revision: 0.5 }, { sourceClientId: ".." }, { sourceClientId: 0 }]) {
      const receipt = { type: "studio-production-workspace-invalidated", scopeKey: SCOPE, revision: 1, sourceClientId: "peer", ...patch };
      expect(parseStudioProductionWorkspaceInvalidation(receipt)).toBeNull();
    }
    expect(() => createStudioProductionWorkspaceInvalidation({ scopeKey: SCOPE, revision: -1, sourceClientId: "peer" })).toThrow();
  });
});
