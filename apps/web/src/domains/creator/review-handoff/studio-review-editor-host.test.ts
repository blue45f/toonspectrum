import { createHash } from "node:crypto";
import { canonicalJson, createStudioReviewSpatialAnchor } from "@toonspectrum/studio-project-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { persistSession } from "@/compat/auth-session-state";

import { selectStudioEditorCommentTarget } from "../studio-comment-editor-selection";
import type { StudioEditorMutationTicket } from "../studio-editor-scope";
import type { StudioReviewCaptureHostBindings } from "../review-capture/studio-review-capture-host-context";

import { StudioReviewEditorError, StudioReviewEditorHandoff, type StudioReviewEditorDependencies } from "./studio-review-editor-handoff";
import { studioReviewEditorHostBindings, type StudioReviewEditorHostNavigation } from "./studio-review-editor-host";
import { reviewEditorFixture } from "./studio-review-editor-test-fixture";

const digestForTest = (value: Record<string, unknown>) => createHash("sha256").update(canonicalJson(value)).digest("hex");

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
function fixture() {
  const data = reviewEditorFixture(digestForTest);
  let ticket: StudioEditorMutationTicket = { authScopeKey: "actor", workId: "work", accessGeneration: 1, documentGeneration: 1 };
  let pageId = "p1";
  const applied = vi.fn(), missing = vi.fn();
  const editorMountedRef: { current: boolean } = { current: true };
  const bindings = {
    studioAuthUserId: "actor", workId: "work", available: true, editorMountedRef,
    studioRevisionProjectGenerationRef: { current: 1 }, drawingRef: { current: null as unknown },
    pendingStrokeCommitsRef: { current: null as unknown }, captureStudioMutationTicket: () => ticket,
    canApplyStudioMutation: vi.fn(() => true), getSnapshot: () => data.snapshot, canvasWidth: 800,
    isDurableMask: () => false, save: vi.fn(async () => {}), captureAll: vi.fn(async () => []),
  } satisfies StudioReviewCaptureHostBindings;
  const changePage = vi.fn((id: string) => { pageId = id; data.snapshot.currentPageId = id; return true; });
  const navigation: StudioReviewEditorHostNavigation = {
    search: "", getCurrentPageId: () => pageId, hasActivePointer: vi.fn(() => false),
    select: (target, current) => selectStudioEditorCommentTarget(target, {
      getPages: () => data.snapshot.pagesList, getMasterElements: () => data.snapshot.master?.elements ?? [],
      getCurrentPageId: () => pageId, changePage, applySelection: applied, onMissing: missing,
    }, current),
  };
  const deps: StudioReviewEditorDependencies = {
    ...studioReviewEditorHostBindings(bindings, navigation),
    readAuthority: vi.fn(async () => data.authority), readSaved: vi.fn(async () => data.saved),
    digest: vi.fn(async (doc) => digestForTest(doc)), now: Date.now,
  };
  const controller = new StudioReviewEditorHandoff(deps);
  return { ...data, data, bindings, navigation, deps, controller, changePage, applied,
    ticket: (patch: Partial<StudioEditorMutationTicket>) => { ticket = { ...ticket, ...patch }; },
    move: () => { pageId = "p2"; } };
}
beforeEach(() => { persistSession({ user: { id: "actor" } }); });
afterEach(() => { persistSession(null); });

describe("review handoff through the actual Host authority/save projection/selection adapters", () => {
  it("does no work until explicit selection, reads authority twice and selects the exact saved cut", async () => {
    const f = fixture();
    expect(f.deps.readSaved).not.toHaveBeenCalled(); expect(f.changePage).not.toHaveBeenCalled();
    await f.controller.start(f.request);
    expect(f.controller.getSnapshot()).toEqual({ phase: "selected", reason: null, extent: "cut" });
    expect(f.deps.readAuthority).toHaveBeenCalledTimes(2); expect(f.deps.readSaved).toHaveBeenCalledTimes(2);
    expect(f.changePage).toHaveBeenCalledWith("p2");
    expect(f.applied).toHaveBeenCalledWith({ elementId: "cut-2", master: false, point: null });
    expect(f.bindings.save).not.toHaveBeenCalled(); expect(f.bindings.captureAll).not.toHaveBeenCalled();
    expect(f.data.saved.document.doc).not.toHaveProperty("newHistory");
  });
  it.each(["dirty-ink", "dirty-title", "saved-revision", "saved-digest", "missing-cut", "wrong-anchor-revision"])("never navigates for %s", async (reason) => {
    const f = fixture();
    if (reason === "dirty-ink") f.data.snapshot.pagesList[1]!.bg = "#000000";
    if (reason === "dirty-title") f.data.snapshot.title = "Unsaved title";
    if (reason === "saved-revision") f.data.saved = { ...f.saved, revision: 8 };
    if (reason === "saved-digest") f.data.saved = { ...f.saved, document: { ...f.saved.document, doc: { ...f.saved.document.doc, unknownExtension: true } } };
    if (reason === "missing-cut") f.data.snapshot.pagesList[1]!.elements = [];
    if (reason === "wrong-anchor-revision") f.data.authority = { ...f.authority, anchor: { ...f.authority.anchor, revisionId: "different" } };
    await f.controller.start(f.request);
    expect(f.controller.getSnapshot().phase).toBe("failed"); expect(f.changePage).not.toHaveBeenCalled(); expect(f.applied).not.toHaveBeenCalled();
  });
  it.each(["unmounted", "locked", "pending-stroke", "drawing", "pointer", "actor"])("fails closed for current %s before any read", async (reason) => {
    const f = fixture();
    if (reason === "unmounted") f.bindings.editorMountedRef.current = false;
    if (reason === "locked") f.bindings.canApplyStudioMutation.mockReturnValue(false);
    if (reason === "pending-stroke") f.bindings.pendingStrokeCommitsRef.current = { pageId: "p1" };
    if (reason === "drawing") f.bindings.drawingRef.current = {};
    if (reason === "pointer") vi.mocked(f.navigation.hasActivePointer).mockReturnValue(true);
    if (reason === "actor") persistSession({ user: { id: "other" } });
    await f.controller.start(f.request);
    expect(f.controller.getSnapshot().phase).toBe("failed"); expect(f.deps.readSaved).not.toHaveBeenCalled(); expect(f.applied).not.toHaveBeenCalled();
  });
  it.each(["actor", "auth-renewal", "document", "access", "revision-generation", "page", "pending-stroke", "unmount"])("fences %s changes while hashing without waiting for a render", async (reason) => {
    const f = fixture(), gate = deferred<string>();
    vi.mocked(f.deps.digest).mockReturnValueOnce(gate.promise);
    const start = f.controller.start(f.request);
    await vi.waitFor(() => expect(f.deps.digest).toHaveBeenCalled());
    if (reason === "actor") persistSession({ user: { id: "other" } });
    if (reason === "auth-renewal") persistSession({ user: { id: "actor", name: "renewed" } });
    if (reason === "document") f.ticket({ documentGeneration: 2 });
    if (reason === "access") f.ticket({ accessGeneration: 2 });
    if (reason === "revision-generation") f.bindings.studioRevisionProjectGenerationRef.current++;
    if (reason === "page") f.move();
    if (reason === "pending-stroke") f.bindings.pendingStrokeCommitsRef.current = {};
    if (reason === "unmount") f.bindings.editorMountedRef.current = false;
    gate.resolve(f.request.subject.rootGraphHash); await start;
    expect(f.controller.getSnapshot().reason).toBe("context-changed"); expect(f.changePage).not.toHaveBeenCalled(); expect(f.applied).not.toHaveBeenCalled();
  });
  it("rechecks live edit permissions after hashing and never trusts an initial grant", async () => {
    const f = fixture();
    vi.mocked(f.deps.readAuthority).mockResolvedValueOnce(f.authority).mockRejectedValueOnce(new StudioReviewEditorError("access-denied"));
    await f.controller.start(f.request);
    expect(f.controller.getSnapshot().reason).toBe("access-denied"); expect(f.changePage).not.toHaveBeenCalled();
  });
  it("detects unrendered metadata edits in the final synchronous projection", async () => {
    const f = fixture();
    vi.mocked(f.deps.readSaved).mockResolvedValueOnce(f.saved).mockImplementationOnce(async () => {
      f.data.snapshot.title = "Changed while renewing ACL"; return f.saved;
    });
    await f.controller.start(f.request);
    expect(f.controller.getSnapshot().reason).toBe("unsaved"); expect(f.changePage).not.toHaveBeenCalled();
  });
  it("does not select when the real page transport refuses a change", async () => {
    const f = fixture(); f.changePage.mockReturnValue(false);
    await f.controller.start(f.request);
    expect(f.controller.getSnapshot().reason).toBe("navigation-rejected"); expect(f.applied).not.toHaveBeenCalled();
  });
  it("retains the exact master ownership instead of interpreting it as a page cut", async () => {
    const f = fixture(), spatial = createStudioReviewSpatialAnchor(f.authority.mapping, { kind: "object", elementId: "logo" });
    if (!spatial) throw new Error("Fixture mapping unavailable");
    f.data.authority = { ...f.authority, anchor: { ...f.authority.anchor, ...spatial } };
    await f.controller.start(f.request);
    expect(f.applied).toHaveBeenCalledWith({ elementId: "logo", master: true, point: null });
    expect(f.controller.getSnapshot().extent).toBe("object");
  });
  it.each(["coordinate", "region"] as const)("selects only the exact page for a %s without an explicit cut", async (kind) => {
    const f = fixture(), spatial = createStudioReviewSpatialAnchor(f.authority.mapping, {
      kind, x: 20, y: 30, ...(kind === "region" ? { width: 10, height: 20 } : {}),
    });
    if (!spatial) throw new Error("Fixture mapping unavailable");
    f.data.authority = { ...f.authority, anchor: { ...f.authority.anchor, ...spatial } };
    await f.controller.start(f.request);
    expect(f.applied).toHaveBeenCalledWith({ elementId: null, master: false, point: null });
    expect(f.controller.getSnapshot().extent).toBe("page");
  });
  it("coalesces a double click, cancels late results, and explicitly retries with fresh reads", async () => {
    const f = fixture(), gate = deferred<typeof f.saved>();
    vi.mocked(f.deps.readSaved).mockReturnValueOnce(gate.promise);
    const first = f.controller.start(f.request), duplicate = f.controller.start(f.request);
    expect(first).toBe(duplicate);
    await vi.waitFor(() => expect(f.deps.readSaved).toHaveBeenCalledOnce());
    f.controller.cancel(); gate.resolve(f.saved); await first;
    expect(f.applied).not.toHaveBeenCalled(); expect(f.controller.getSnapshot().phase).toBe("cancelled");
    await f.controller.start(f.request);
    expect(f.applied).toHaveBeenCalledOnce(); expect(f.deps.readSaved).toHaveBeenCalledTimes(3);
  });
  it("does not apply after disposal or an expired permission lease", async () => {
    const f = fixture(); f.data.authority = { ...f.authority, expiresAt: Date.now() - 1 };
    await f.controller.start(f.request); expect(f.changePage).not.toHaveBeenCalled();
    f.controller.dispose(); await f.controller.start(f.request); expect(f.applied).not.toHaveBeenCalled();
  });
  it("cancels an older request when a different comment replaces it instead of selecting the old target", async () => {
    const f = fixture(), gate = deferred<typeof f.authority>();
    vi.mocked(f.deps.readAuthority).mockReturnValueOnce(gate.promise)
      .mockRejectedValueOnce(new StudioReviewEditorError("unmapped"));
    const first = f.controller.start(f.request);
    await vi.waitFor(() => expect(f.deps.readAuthority).toHaveBeenCalledOnce());
    await f.controller.start({ ...f.request, commentId: "other-comment" });
    gate.resolve(f.authority); await first;
    expect(f.controller.getSnapshot().reason).toBe("unmapped"); expect(f.applied).not.toHaveBeenCalled();
    expect(f.deps.readAuthority).toHaveBeenNthCalledWith(2, { ...f.request, commentId: "other-comment" }, expect.any(AbortSignal));
  });
  it("uses source frame identity even when graph scope has a distinct panel ID", async () => {
    const f = fixture();
    f.data.authority = { ...f.authority, anchor: { ...f.authority.anchor, scope: { projectId: "graph", panelId: "different-graph-panel" } } };
    await f.controller.start(f.request);
    expect(f.applied).toHaveBeenCalledWith({ elementId: "cut-2", master: false, point: null });
  });
  it("uses the freshly renewed identical-source lease after a long digest instead of rejecting a large manuscript", async () => {
    const f = fixture();
    vi.mocked(f.deps.readAuthority).mockResolvedValueOnce({ ...f.authority, expiresAt: Date.now() - 1 }).mockResolvedValueOnce(f.authority);
    await f.controller.start(f.request);
    expect(f.controller.getSnapshot().phase).toBe("selected"); expect(f.applied).toHaveBeenCalledOnce();
  });
});
