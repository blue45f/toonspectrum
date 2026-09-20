import { describe, expect, it, vi } from "vitest";

import { StudioReviewCaptureBridge, type StudioReviewCaptureBridgeDependencies,
  type StudioReviewCaptureContext } from "./studio-review-capture-bridge";

import type { StudioSharedDocument } from "../studio-shared-document-client";
import type { StudioReviewCaptureIntent } from "../virtual-space/studio-virtual-space-review-producer";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function fixture() {
  let context: StudioReviewCaptureContext = { workId: "work", scopeKey: "user:work", generation: 1, available: true };
  let saved: StudioSharedDocument = {
    workId: "work", role: "owner", status: "active", capabilities: { view: true, edit: true },
    access: "edit", revision: 7, crdtServerSequence: "0", updatedAt: "2026-09-20T00:00:00.000Z",
    document: { title: "Pages", description: "", tags: [], titleId: null, seriesId: null,
      challengeId: null, episodeNo: null, remixFromId: null, cover: "", pages: [],
      format: "cuttoon", status: "draft", doc: { pagesList: [{ id: "p1" }, { id: "p2" }] } },
  };
  let runtimeDoc = saved.document.doc;
  const pngs = [new Blob(["png1"], { type: "image/png" }), new Blob(["png2"], { type: "image/png" })];
  const subject = { schemaVersion: 1 as const, projectId: "graph", workId: "work", artifactId: "artifact",
    reviewId: "review", revisionId: "revision", rootGraphHash: "a".repeat(64) };
  const calls: string[] = [];
  const deps: StudioReviewCaptureBridgeDependencies = {
    getContext: () => context,
    readSaved: vi.fn(async () => { calls.push("read"); return saved; }),
    projectRuntime: vi.fn(async () => ({ doc: runtimeDoc, title: "Pages", description: "", tags: [],
      titleId: null, seriesId: null, challengeId: null, pageCount: 2 })),
    digest: vi.fn(async (doc) => JSON.stringify(doc)),
    save: vi.fn(async () => {}),
    captureAll: vi.fn(async () => { calls.push("capture"); return [{ width: 100, height: 200 },
      { width: 100, height: 200 }] as HTMLCanvasElement[]; }),
    encodePng: vi.fn().mockResolvedValueOnce(pngs[0]).mockResolvedValueOnce(pngs[1]),
    makeInputId: vi.fn(() => "intent-1"), getDeviceId: () => "device", now: () => "2026-09-20T00:00:00.000Z",
    prepare: vi.fn(async (input) => { calls.push("prepare"); return { ...input,
      projectId: "graph", artifactId: "artifact", expectedHeadRevisionId: "head", expectedHeadRootGraphHash: "b".repeat(64) }; }),
    produce: vi.fn(async () => { calls.push("produce"); return subject; }),
    cancelRemote: vi.fn(async () => ({ status: "cancelled" as const })),
  };
  const bridge = new StudioReviewCaptureBridge(deps);
  return { bridge, deps, calls, pngs, subject,
    context: (patch: Partial<StudioReviewCaptureContext>) => { context = { ...context, ...patch }; },
    source: (patch: Partial<StudioSharedDocument>) => { saved = { ...saved, ...patch }; },
    unsaved: () => { runtimeDoc = { pagesList: [{ id: "p1", ink: "new" }, { id: "p2" }] }; },
    acknowledgeSave: () => { saved = { ...saved, revision: 8, document: { ...saved.document, doc: runtimeDoc } };
      context = { ...context, generation: 2 }; },
  };
}

describe("Studio review capture bridge", () => {
  it("starts only on explicit intent, pins before all-page capture and verifies the source again before upload", async () => {
    const f = fixture();
    expect(f.calls).toEqual([]);
    await f.bridge.start();
    expect(f.calls).toEqual(["read", "prepare", "capture", "read", "produce"]);
    expect(f.deps.produce).toHaveBeenCalledWith(expect.objectContaining({ sourceServerRevision: 7,
      expectedHeadRevisionId: "head" }), f.pngs, expect.any(AbortSignal), expect.any(Function));
    expect(f.bridge.getSnapshot().subject).toEqual(f.subject);
  });
  it("requires explicit save for local edits and does not treat a resolved save Promise as confirmation", async () => {
    const f = fixture(); f.unsaved();
    await f.bridge.start();
    expect(f.bridge.getSnapshot().phase).toBe("needs-save");
    expect(f.deps.save).not.toHaveBeenCalled();
    await f.bridge.saveAndStart();
    expect(f.deps.save).toHaveBeenCalledWith("draft");
    expect(f.bridge.getSnapshot().phase).toBe("needs-save");
    expect(f.deps.captureAll).not.toHaveBeenCalled();
    expect(f.deps.prepare).not.toHaveBeenCalled();
  });
  it("captures only after a fresh read confirms the saved runtime and new revision", async () => {
    const f = fixture(); f.unsaved();
    vi.mocked(f.deps.save).mockImplementation(async () => f.acknowledgeSave());
    await f.bridge.saveAndStart();
    expect(f.deps.prepare).toHaveBeenCalledWith(expect.objectContaining({ sourceServerRevision: 8 }), expect.any(AbortSignal));
    expect(f.bridge.getSnapshot().phase).toBe("completed");
  });
  it("does not demote a published owner document when saving for review", async () => {
    const f = fixture(); f.unsaved();
    const saved = await f.deps.readSaved("work", new AbortController().signal);
    f.source({ document: { ...saved.document, status: "published" } });
    await f.bridge.saveAndStart();
    expect(f.deps.save).toHaveBeenCalledWith("published");
  });
  it("keeps local-only save choice intact without manufacturing a saved work", async () => {
    const f = fixture(); f.context({ workId: null });
    await f.bridge.start();
    await f.bridge.saveAndStart();
    expect(f.deps.save).toHaveBeenCalledOnce();
    expect(f.deps.readSaved).not.toHaveBeenCalled();
    expect(f.deps.prepare).not.toHaveBeenCalled();
    expect(f.deps.captureAll).not.toHaveBeenCalled();
  });
  it("fences source changes during actual capture and releases the prepared intent", async () => {
    const f = fixture();
    vi.mocked(f.deps.captureAll).mockImplementation(async () => {
      f.source({ revision: 8 }); return [{}, {}] as HTMLCanvasElement[];
    });
    await f.bridge.start();
    expect(f.deps.produce).not.toHaveBeenCalled();
    expect(f.deps.cancelRemote).toHaveBeenCalledWith(expect.objectContaining({ intentId: "intent-1" }));
    expect(f.bridge.getSnapshot()).toMatchObject({ phase: "cancelled", reason: "changed" });
  });
  it("blocks an auth or document switch while the source read is pending", async () => {
    const f = fixture();
    const saved = await f.deps.readSaved("work", new AbortController().signal);
    const pending = deferred<StudioSharedDocument>();
    vi.mocked(f.deps.readSaved).mockReturnValue(pending.promise);
    const start = f.bridge.start();
    f.context({ scopeKey: "other-user:work" }); pending.resolve(saved); await start;
    expect(f.deps.prepare).not.toHaveBeenCalled();
    expect(f.bridge.getSnapshot().reason).toBe("changed");
  });
  it("reconciles uncertain uploads using the exact original intent and Blob objects", async () => {
    const f = fixture();
    vi.mocked(f.deps.produce).mockRejectedValueOnce({ ambiguous: true });
    await f.bridge.start();
    expect(f.bridge.getSnapshot().phase).toBe("uncertain");
    const first = vi.mocked(f.deps.produce).mock.calls[0]!;
    await f.bridge.retry();
    const retry = vi.mocked(f.deps.produce).mock.calls[1]!;
    expect(retry[0]).toBe(first[0]); expect(retry[1]).toBe(first[1]);
    expect(retry[1][0]).toBe(f.pngs[0]);
    expect(f.deps.makeInputId).toHaveBeenCalledOnce();
    expect(f.deps.captureAll).toHaveBeenCalledOnce();
    expect(f.deps.prepare).toHaveBeenCalledOnce();
  });
  it("retries a lost prepare response with the same input before producing any PNG", async () => {
    const f = fixture();
    vi.mocked(f.deps.prepare).mockRejectedValueOnce({ ambiguous: true });
    await f.bridge.start();
    const first = vi.mocked(f.deps.prepare).mock.calls[0]![0];
    expect(f.deps.captureAll).not.toHaveBeenCalled();
    await f.bridge.retry();
    expect(vi.mocked(f.deps.prepare).mock.calls[1]![0]).toBe(first);
    expect(f.deps.makeInputId).toHaveBeenCalledOnce();
    expect(f.bridge.getSnapshot().phase).toBe("completed");
  });
  it("does not resume old uploads after editing and reports an already finalized cancellation accurately", async () => {
    const f = fixture();
    vi.mocked(f.deps.produce).mockRejectedValueOnce({ ambiguous: true });
    vi.mocked(f.deps.cancelRemote).mockResolvedValue({ status: "completed", subject: f.subject });
    await f.bridge.start(); f.context({ generation: 2 }); await f.bridge.retry();
    expect(f.deps.produce).toHaveBeenCalledOnce();
    expect(f.bridge.getSnapshot()).toMatchObject({ phase: "completed", subject: f.subject });
  });
  it("cancels pending prepare and ignores its late response after unmount", async () => {
    const f = fixture(); const pending = deferred<StudioReviewCaptureIntent>();
    // Keep the actual input to resolve the transport even after its AbortSignal is ignored.
    vi.mocked(f.deps.prepare).mockReturnValue(pending.promise);
    const start = f.bridge.start();
    await vi.waitFor(() => expect(f.deps.prepare).toHaveBeenCalledOnce());
    const input = vi.mocked(f.deps.prepare).mock.calls[0]![0];
    f.bridge.dispose();
    pending.resolve({ ...input, projectId: "graph", artifactId: "artifact", expectedHeadRevisionId: "head",
      expectedHeadRootGraphHash: "b".repeat(64) });
    await start;
    expect(f.deps.captureAll).not.toHaveBeenCalled();
    expect(f.deps.cancelRemote).toHaveBeenCalledWith(input);
  });
  it("does not start duplicate captures when the explicit action fires twice", async () => {
    const f = fixture();
    await Promise.all([f.bridge.start(), f.bridge.start()]);
    expect(f.deps.prepare).toHaveBeenCalledOnce(); expect(f.deps.captureAll).toHaveBeenCalledOnce();
  });
  it("retries cancellation only, without uploading, when the cancellation response was lost", async () => {
    const f = fixture();
    vi.mocked(f.deps.produce).mockRejectedValueOnce({ ambiguous: true });
    vi.mocked(f.deps.cancelRemote).mockRejectedValueOnce(new Error("offline"));
    await f.bridge.start(); await f.bridge.cancel();
    expect(f.bridge.getSnapshot().phase).toBe("cancel-uncertain");
    await f.bridge.retry();
    expect(f.deps.cancelRemote).toHaveBeenCalledTimes(2); expect(f.deps.produce).toHaveBeenCalledOnce();
    expect(f.bridge.getSnapshot().phase).toBe("cancelled");
  });
  it("does not publish a truncated capture or a non-PNG export", async () => {
    const f = fixture();
    vi.mocked(f.deps.encodePng).mockReset().mockResolvedValue(new Blob(["jpg"], { type: "image/jpeg" }));
    await f.bridge.start();
    expect(f.deps.produce).not.toHaveBeenCalled(); expect(f.deps.cancelRemote).toHaveBeenCalledOnce();
  });
  it("keeps cleanup pending distinct from uncertain cancellation and retries only the same tombstoned intent", async () => {
    const f = fixture();
    vi.mocked(f.deps.produce).mockRejectedValueOnce({ ambiguous: true });
    vi.mocked(f.deps.cancelRemote).mockResolvedValueOnce({ status: "cancelled", cleanupPending: true });
    vi.mocked(f.deps.cancelRemote).mockRejectedValueOnce(new Error("cleanup offline"));
    await f.bridge.start(); await f.bridge.cancel();
    expect(f.bridge.getSnapshot()).toMatchObject({ phase: "cleanup-pending", canRetry: true, subject: null });
    const cancelledIntent = vi.mocked(f.deps.cancelRemote).mock.calls[0]![0];
    f.context({ generation: 2 }); f.bridge.checkScope();
    expect(f.deps.cancelRemote).toHaveBeenCalledOnce();
    await f.bridge.retry();
    expect(vi.mocked(f.deps.cancelRemote).mock.calls[1]![0]).toBe(cancelledIntent);
    expect(f.bridge.getSnapshot()).toMatchObject({ phase: "cleanup-pending", canRetry: true });
    await f.bridge.retry();
    expect(vi.mocked(f.deps.cancelRemote).mock.calls[2]![0]).toBe(cancelledIntent);
    expect(f.deps.produce).toHaveBeenCalledOnce(); expect(f.deps.captureAll).toHaveBeenCalledOnce();
    expect(f.bridge.getSnapshot()).toMatchObject({ phase: "cancelled", canRetry: false });
  });
});
