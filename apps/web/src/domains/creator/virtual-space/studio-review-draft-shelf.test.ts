import { describe, expect, it, vi } from "vitest";
import { createReviewDraftRepository, draftNoteInputSchema, parseReviewDraftShelf, reviewDraftScopeKey, type ReviewDraftScope } from "./studio-review-draft-shelf";
import { publishReviewDrafts } from "./studio-review-draft-publish";
import type { StudioVirtualSpaceReviewVerification } from "./studio-virtual-space-review-invitation";
import type { StudioReviewComment, StudioReviewCommentCreateInput } from "../project-graph/studio-project-graph-contract";

const scope: ReviewDraftScope = { actorId: "artist-a", subject: { schemaVersion: 1, workId: "work", projectId: "graph", artifactId: "artifact", reviewId: "review", revisionId: "revision", rootGraphHash: "a".repeat(64) } };
const input = (id = "draft-a") => draftNoteInputSchema.parse({ id, body: `본문 ${id}`, severity: "note", anchor: { kind: "artifact", artifactId: "artifact", revisionId: "revision", scope: { projectId: "graph" } } });
function fixture() {
  const rows = new Map<string, string>(), tails = new Map<string, Promise<unknown>>();
  const store = { get: vi.fn(async (key: string) => rows.get(key) ?? null), set: vi.fn(async (key: string, value: string) => { rows.set(key, value); }), delete: vi.fn(async (key: string) => { rows.delete(key); }) };
  const lock = <T,>(key: string, action: () => Promise<T>): Promise<T> => { const result = (tails.get(key) ?? Promise.resolve()).then(action); tails.set(key, result.catch(() => undefined)); return result; };
  const repository = createReviewDraftRepository(store, lock), comments: StudioReviewComment[] = [];
  const verify = vi.fn(async (): Promise<StudioVirtualSpaceReviewVerification> => ({ ok: true, subject: scope.subject,
    verifiedAt: Date.now(), expiresAt: Date.now() + 15_000, href: "/review",
    project: { access: { view: true, comment: true } }, revision: { id: "revision", rootGraphHash: "a".repeat(64) },
    review: { status: "open", comments: [...comments] },
  } as unknown as StudioVirtualSpaceReviewVerification));
  const create = vi.fn(async (_reviewId: string, raw: StudioReviewCommentCreateInput) => {
    const note = draftNoteInputSchema.parse(raw);
    comments.push({ ...note, reviewId: "review", authorUserId: "artist-a", dueAt: note.dueAt ?? null, status: "open", resolutionRevisionId: null, resolvedBy: null, createdAt: "2026-09-21T00:00:00Z", updatedAt: "2026-09-21T00:00:00Z" });
    return { id: note.id, reviewId: "review", status: "open" as const, anchor: note.anchor, createdAt: "2026-09-21T00:00:00Z" };
  });
  return { repository, rows, store, comments, dependencies: { verify, create } };
}
describe("private draft storage", () => {
  it("persists only scoped draft input and deduplicates repeated content", async () => {
    const f = fixture(); await f.repository.add(scope, input(), () => true);
    await f.repository.add(scope, { ...input(), id: "different-id" }, () => true);
    expect(await f.repository.list(scope)).toHaveLength(1);
    expect(await f.repository.list({ ...scope, actorId: "artist-b" })).toEqual([]);
    expect(await f.repository.list({ ...scope, subject: { ...scope.subject, reviewId: "other-review" } })).toEqual([]);
    expect(f.rows.get(reviewDraftScopeKey(scope))).not.toContain("url");
  });
  it("edits only unpublished text, keeping original identity and anchor", async () => {
    const f = fixture(); await f.repository.add(scope, input(), () => true);
    const edited = await f.repository.reviseBody(scope, "draft-a", "수정한 초안", () => true);
    expect(edited[0]?.input).toEqual({ ...input(), body: "수정한 초안" });
    await f.repository.markAttempt(scope, "draft-a", () => true);
    await expect(f.repository.reviseBody(scope, "draft-a", "변경", () => true)).rejects.toThrow();
    await expect(f.repository.remove(scope, "draft-a", () => true)).rejects.toThrow();
  });
  it("rejects scope mismatch, unreadable storage and invalidating operations without overwriting", async () => {
    const f = fixture(), key = reviewDraftScopeKey(scope);
    await expect(f.repository.add(scope, { ...input(), anchor: { ...input().anchor, revisionId: "other" } }, () => true)).rejects.toThrow();
    expect(f.store.set).not.toHaveBeenCalled();
    f.rows.set(key, "unreadable"); await expect(f.repository.add(scope, input(), () => true)).rejects.toThrow();
    expect(f.rows.get(key)).toBe("unreadable"); f.rows.delete(key);
    await expect(f.repository.add(scope, input(), () => false)).rejects.toThrow();
    expect(f.store.set).not.toHaveBeenCalled();
  });
  it("keeps existing drafts when capacity or write acknowledgement fails", async () => {
    const f = fixture(); for (let i = 0; i < 20; i++) await f.repository.add(scope, input(`draft-${i}`), () => true);
    const before = f.rows.get(reviewDraftScopeKey(scope));
    await expect(f.repository.add(scope, input("overflow"), () => true)).rejects.toThrow();
    expect(f.rows.get(reviewDraftScopeKey(scope))).toBe(before);
    f.store.set.mockRejectedValueOnce(new Error("storage failure"));
    await expect(f.repository.reviseBody(scope, "draft-0", "new", () => true)).rejects.toThrow();
    expect(f.rows.get(reviewDraftScopeKey(scope))).toBe(before);
    expect(() => parseReviewDraftShelf("x".repeat(1_000_001), scope)).toThrow();
  });
});
describe("explicit per-note publication", () => {
  it("persists attempt identities before sending and removes only server-confirmed notes", async () => {
    const f = fixture(); await f.repository.add(scope, input(), () => true);
    const create = f.dependencies.create.getMockImplementation()!;
    f.dependencies.create.mockImplementation(async (reviewId, note) => {
      expect((await f.repository.list(scope))[0]?.state).toBe("attempted");
      return create(reviewId, note);
    });
    expect(await publishReviewDrafts(scope, ["draft-a"], f.repository, () => true, f.dependencies)).toEqual({ confirmed: ["draft-a"], stopped: null });
    expect(await f.repository.list(scope)).toEqual([]); expect(f.comments).toHaveLength(1);
  });
  it("reconciles a lost response using the same ID without sending a duplicate", async () => {
    const f = fixture(); await f.repository.add(scope, input(), () => true);
    const create = f.dependencies.create.getMockImplementation()!;
    f.dependencies.create.mockImplementationOnce(async (reviewId, note) => { await create(reviewId, note); throw new Error("response lost"); });
    expect(await publishReviewDrafts(scope, ["draft-a"], f.repository, () => true, f.dependencies)).toEqual({ confirmed: [], stopped: "draft-a" });
    expect((await f.repository.list(scope))[0]?.state).toBe("attempted");
    expect(await publishReviewDrafts(scope, ["draft-a"], f.repository, () => true, f.dependencies)).toEqual({ confirmed: ["draft-a"], stopped: null });
    expect(f.dependencies.create).toHaveBeenCalledTimes(1); expect(await f.repository.list(scope)).toEqual([]);
  });
  it("reports partial publication and preserves the remaining original IDs", async () => {
    const f = fixture(); for (const id of ["draft-a", "draft-b", "draft-c"]) await f.repository.add(scope, input(id), () => true);
    const create = f.dependencies.create.getMockImplementation()!;
    f.dependencies.create.mockImplementation(async (reviewId, note) => { if (note.id === "draft-b") throw new Error("unavailable"); return create(reviewId, note); });
    expect(await publishReviewDrafts(scope, ["draft-a", "draft-b", "draft-c"], f.repository, () => true, f.dependencies)).toEqual({ confirmed: ["draft-a"], stopped: "draft-b" });
    expect((await f.repository.list(scope)).map((entry) => [entry.input.id, entry.state])).toEqual([["draft-b", "attempted"], ["draft-c", "draft"]]);
    expect(f.dependencies.create).toHaveBeenCalledTimes(2);
  });
  it.each(["denied", "expired", "different-source", "closed"])("does not send for %s verification", async (mode) => {
    const f = fixture(); await f.repository.add(scope, input(), () => true);
    const original = await f.dependencies.verify(); if (!original.ok) throw new Error("fixture");
    f.dependencies.verify.mockResolvedValue(mode === "denied" ? { ok: false, reason: "access-denied" }
      : mode === "expired" ? { ...original, expiresAt: 0 }
        : mode === "different-source" ? { ...original, revision: { ...original.revision, rootGraphHash: "b".repeat(64) } }
          : { ...original, review: { ...original.review, status: "approved" } });
    const outcome = await publishReviewDrafts(scope, ["draft-a"], f.repository, () => true, f.dependencies);
    expect(outcome.confirmed).toEqual([]); expect(f.dependencies.create).not.toHaveBeenCalled();
    expect((await f.repository.list(scope))[0]?.state).toBe("draft");
  });
  it("does not send when durable attempt storage fails", async () => {
    const f = fixture(); await f.repository.add(scope, input(), () => true);
    f.store.set.mockRejectedValueOnce(new Error("quota"));
    expect((await publishReviewDrafts(scope, ["draft-a"], f.repository, () => true, f.dependencies)).confirmed).toEqual([]);
    expect(f.dependencies.create).not.toHaveBeenCalled();
  });
  it("does not accept another actor's matching note as this draft's receipt", async () => {
    const f = fixture(); await f.repository.add(scope, input(), () => true);
    await f.dependencies.create("review", input()); f.comments[0] = { ...f.comments[0]!, authorUserId: "someone-else" };
    f.dependencies.create.mockClear();
    const outcome = await publishReviewDrafts(scope, ["draft-a"], f.repository, () => true, f.dependencies);
    expect(outcome.confirmed).toEqual([]); expect(await f.repository.list(scope)).toHaveLength(1);
    expect(f.dependencies.create).not.toHaveBeenCalled();
  });
  it("stops after a context change and rejects duplicate batch selection", async () => {
    const f = fixture(); await f.repository.add(scope, input(), () => true);
    let active = true; const original = await f.dependencies.verify();
    f.dependencies.verify.mockImplementation(async () => { active = false; return original; });
    expect(await publishReviewDrafts(scope, ["draft-a"], f.repository, () => active, f.dependencies)).toEqual({ confirmed: [], stopped: "cancelled" });
    expect(f.dependencies.create).not.toHaveBeenCalled();
    await expect(publishReviewDrafts(scope, ["draft-a", "draft-a"], f.repository, () => true, f.dependencies)).rejects.toThrow();
  });
});
