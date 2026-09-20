// @vitest-environment jsdom
import { act, cleanup, configure, renderHook, waitFor } from "@testing-library/react";
import { StrictMode, type PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useStudioReviewCapture } from "./useStudioReviewCapture";

import type { StudioSharedDocument } from "../studio-shared-document-client";
import type { StudioReviewCaptureIntent } from "../virtual-space/studio-virtual-space-review-producer";
import type { StudioReviewCaptureContext } from "./studio-review-capture-bridge";

const api = vi.hoisted(() => ({ read: vi.fn(), prepare: vi.fn(), produce: vi.fn(), cancel: vi.fn() }));
vi.mock("../studio-shared-document-client", () => ({ getStudioSharedDocument: api.read }));
vi.mock("../virtual-space/studio-virtual-space-review-producer", () => ({
  studioReviewCaptureContentDigest: async (doc: unknown) => JSON.stringify(doc),
  prepareStudioVirtualSpaceReviewCapture: api.prepare, produceStudioVirtualSpaceReviewCapture: api.produce,
  cancelStudioVirtualSpaceReviewCapture: api.cancel,
}));

const subject = { schemaVersion: 1 as const, projectId: "graph", workId: "work", artifactId: "artifact",
  reviewId: "review", revisionId: "revision", rootGraphHash: "a".repeat(64) };
function fixture() {
  let context: StudioReviewCaptureContext = { workId: "work", scopeKey: "user:work", generation: 1, available: true };
  const saved: StudioSharedDocument = { workId: "work", role: "owner", status: "active", capabilities: { view: true, edit: true },
    access: "edit", revision: 7, crdtServerSequence: "0", updatedAt: "2026-09-20T00:00:00.000Z",
    document: { title: "Source", description: "", tags: [], titleId: null, seriesId: null, challengeId: null,
      episodeNo: null, remixFromId: null, cover: "", pages: [], format: "cuttoon", status: "draft",
      doc: { pagesList: [{ id: "p1" }] } } };
  api.read.mockResolvedValue(saved);
  api.prepare.mockImplementation(async (input) => ({ ...input, projectId: "graph", artifactId: "artifact",
    expectedHeadRevisionId: "head", expectedHeadRootGraphHash: "b".repeat(64) }));
  api.produce.mockResolvedValue(subject);
  api.cancel.mockResolvedValue({ status: "cancelled" });
  const png = new Blob(["png"], { type: "image/png" });
  const bindings = {
    getContext: () => context,
    projectRuntime: vi.fn(async () => ({ doc: saved.document.doc, title: "Source", description: "", tags: [],
      titleId: null, seriesId: null, challengeId: null, pageCount: 1 })),
    save: vi.fn(async () => {}),
    captureAll: vi.fn(async () => [{ width: 10, height: 20, toBlob: (callback: BlobCallback) => callback(png) }] as HTMLCanvasElement[]),
  };
  return { bindings, saved, context: (next: Partial<StudioReviewCaptureContext>) => { context = { ...context, ...next }; } };
}
beforeEach(() => { vi.resetAllMocks(); configure({ asyncUtilTimeout: 5_000 }); });
afterEach(cleanup);

describe("review capture hook integration", () => {
  it("does not capture from mounting, StrictMode or renders; the explicit opener starts one intent", async () => {
    const f = fixture();
    const wrapper = ({ children }: PropsWithChildren) => <StrictMode>{children}</StrictMode>;
    const hook = renderHook(() => useStudioReviewCapture("user:work", f.bindings), { wrapper });
    hook.rerender();
    expect(api.prepare).not.toHaveBeenCalled(); expect(f.bindings.captureAll).not.toHaveBeenCalled();
    act(() => { expect(hook.result.current.open()).toBe(true); expect(hook.result.current.open()).toBe(false); });
    await waitFor(() => expect(hook.result.current.snapshot).toMatchObject({ phase: "completed" }));
    expect(api.prepare).toHaveBeenCalledOnce(); expect(f.bindings.captureAll).toHaveBeenCalledOnce();
    expect(hook.result.current.visible).toBe(true);
  });
  it("hides the old scope and fences a delayed source read on document replacement", async () => {
    const f = fixture();
    let resolve!: (saved: StudioSharedDocument) => void;
    api.read.mockReturnValue(new Promise<StudioSharedDocument>((done) => { resolve = done; }));
    const hook = renderHook(({ scope }) => useStudioReviewCapture(scope, f.bindings), { initialProps: { scope: "user:work" } });
    act(() => hook.result.current.open());
    await waitFor(() => expect(api.read).toHaveBeenCalled());
    f.context({ workId: "next", scopeKey: "user:next" }); hook.rerender({ scope: "user:next" });
    await act(async () => { resolve(f.saved); });
    expect(hook.result.current.visible).toBe(false); expect(hook.result.current.snapshot.subject).toBeNull();
    expect(api.prepare).not.toHaveBeenCalled(); expect(f.bindings.captureAll).not.toHaveBeenCalled();
  });
  it("cancels a pending prepared capture when the ref-backed edit generation changes", async () => {
    const f = fixture(); let resolve!: (intent: StudioReviewCaptureIntent) => void;
    api.prepare.mockReturnValue(new Promise<StudioReviewCaptureIntent>((done) => { resolve = done; }));
    const hook = renderHook(() => useStudioReviewCapture("user:work", f.bindings));
    act(() => hook.result.current.open());
    await waitFor(() => expect(api.prepare).toHaveBeenCalled());
    const input = api.prepare.mock.calls[0]![0];
    f.context({ generation: 2 });
    await waitFor(() => expect(api.cancel).toHaveBeenCalledWith(input));
    await act(async () => resolve({ ...input, projectId: "graph", artifactId: "artifact", expectedHeadRevisionId: "head",
      expectedHeadRootGraphHash: "b".repeat(64) }));
    expect(f.bindings.captureAll).not.toHaveBeenCalled(); expect(api.produce).not.toHaveBeenCalled();
    expect(hook.result.current.snapshot.reason).toBe("changed");
  });
  it("reopening an uncertain request preserves its PNGs and retries only on explicit action", async () => {
    const f = fixture(); api.produce.mockRejectedValueOnce({ ambiguous: true });
    const hook = renderHook(() => useStudioReviewCapture("user:work", f.bindings));
    act(() => hook.result.current.open());
    await waitFor(() => expect(hook.result.current.snapshot.phase).toBe("uncertain"));
    act(() => { expect(hook.result.current.open()).toBe(false); }); hook.rerender();
    expect(api.produce).toHaveBeenCalledOnce();
    act(() => hook.result.current.retry());
    await waitFor(() => expect(hook.result.current.snapshot.phase).toBe("completed"));
    expect(api.produce.mock.calls[1]![0]).toBe(api.produce.mock.calls[0]![0]);
    expect(api.produce.mock.calls[1]![1]).toBe(api.produce.mock.calls[0]![1]);
    expect(f.bindings.captureAll).toHaveBeenCalledOnce();
    act(() => { expect(hook.result.current.open()).toBe(true); });
  });
  it("keeps the cancellation dialog open when its outcome is unknown", async () => {
    const f = fixture(); api.produce.mockRejectedValueOnce({ ambiguous: true }); api.cancel.mockRejectedValueOnce(new Error("offline"));
    const hook = renderHook(() => useStudioReviewCapture("user:work", f.bindings));
    act(() => hook.result.current.open());
    await waitFor(() => expect(hook.result.current.snapshot.phase).toBe("uncertain"));
    await act(async () => hook.result.current.close());
    expect(hook.result.current.visible).toBe(true); expect(hook.result.current.snapshot.phase).toBe("cancel-uncertain");
    act(() => hook.result.current.retry());
    await waitFor(() => expect(hook.result.current.snapshot.phase).toBe("cancelled"));
    expect(api.produce).toHaveBeenCalledOnce();
  });
});
