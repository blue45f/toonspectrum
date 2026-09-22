// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StudioSkiaDocumentSurface } from "./StudioSkiaDocumentSurface";
import { createStudioLiveTransformDraftStore } from "../studio-live-transform-draft-store";
import type { StudioRenderSurfaceAuthority } from "./StudioRenderSurface";
import type { DrawEl, El } from "../studio-element-model";
import type { SkiaDocumentFrame, SkiaDocumentReceipt } from "@toonspectrum/studio-engine-skia";

const mocked = vi.hoisted(() => ({ create: vi.fn(), present: vi.fn(), dispose: vi.fn() }));
vi.mock("@toonspectrum/studio-engine-skia", () => ({ createSkiaDocumentRenderer: mocked.create }));
const requests: Array<{ frame: SkiaDocumentFrame; finish: (result: SkiaDocumentReceipt) => void }> = [];
beforeEach(() => {
  requests.length = 0; mocked.create.mockReset(); mocked.present.mockReset(); mocked.dispose.mockReset();
  mocked.present.mockImplementation((frame: SkiaDocumentFrame) => new Promise((finish) => { requests.push({ frame, finish }); }));
  mocked.create.mockImplementation(() => ({ present: mocked.present, dispose: mocked.dispose }));
});
afterEach(() => { cleanup(); document.body.replaceChildren(); });
function setup() {
  const parent = document.createElement("div"); parent.innerHTML = '<div class="konvajs-content"><canvas></canvas><canvas></canvas></div>';
  document.body.append(parent);
  const report = vi.fn<(state: StudioRenderSurfaceAuthority) => void>();
  const props = { enabled: true, visible: false, mountParent: parent, width: 200, height: 180,
    documentWidth: 800, documentHeight: 600, dpr: 1, elements: [], sceneRevision: {}, onAuthorityChange: report };
  return { parent, props, report };
}
const success = (frame: SkiaDocumentFrame): SkiaDocumentReceipt => ({ status: "presented", revision: frame.revision,
  stats: { compiledBatches: 0, cachedBatches: 0, paintedItems: 0, presentation: "cached", retainedSnapshotBytes: 0, compiledItems: 0, cachedItems: 0, pictureBytes: 32, gpuCacheBytes: null, imageTextureBytes: 0, cachedImages: 0, frameMs: 1, interactiveReadbacks: 0 } });
const pen = (): El => ({ id: "ink", type: "draw", mode: "pen", kind: "freehand", brush: "pen",
  points: [10, 10, 30, 20, 60, 40], pressures: [0.3, 0.6, 1], stroke: "#234567", strokeWidth: 12,
  sampleSpacing: 0, pressureModel: "linear-residual-path-v3", paintModel: "layered-flow-v1", opacity: 0.4,
} as El);
it("publishes exact receipts and waits for the owning stage before exposing pixels", async () => {
  const h = setup(); const view = render(<StudioSkiaDocumentSurface {...h.props} />);
  await waitFor(() => expect(requests).toHaveLength(1));
  const canvas = h.parent.querySelector<HTMLCanvasElement>('[data-studio-skia-document-surface]')!;
  expect(canvas.style.visibility).toBe("hidden");
  await act(async () => { requests[0]!.finish(success(requests[0]!.frame)); });
  expect(h.report).toHaveBeenLastCalledWith(expect.objectContaining({ status: "active", sceneRevision: h.props.sceneRevision }));
  expect(canvas.style.visibility).toBe("hidden");
  view.rerender(<StudioSkiaDocumentSurface {...h.props} visible />);
  expect(canvas.style.visibility).toBe("visible");
  const next = { ...h.props, sceneRevision: {} }; view.rerender(<StudioSkiaDocumentSurface {...next} visible />);
  expect(canvas.style.visibility).toBe("hidden");
  await act(async () => { requests[1]!.finish(success(requests[1]!.frame)); });
  view.rerender(<StudioSkiaDocumentSurface {...next} visible />);
  expect(canvas.style.visibility).toBe("visible");
  view.unmount(); expect(mocked.dispose).toHaveBeenCalledOnce();
  expect(h.parent.querySelector('[data-studio-skia-document-surface]')).toBeNull();
  expect(h.parent.querySelectorAll('canvas')).toHaveLength(2);
});

it("uses retained settled ink instead of the first compatibility draw and receipts only visible GPU pixels", async () => {
  const h = setup();
  const sceneRevision = { pageId: "page-a", projectGeneration: 3 };
  const beforePublish = vi.fn(async () => undefined);
  const canPublishOverSettledInk = vi.fn(() => true);
  const onVisiblePresentation = vi.fn();
  const props = {
    ...h.props,
    elements: [pen()],
    sceneRevision,
    beforePublish,
    canPublishOverSettledInk,
    onVisiblePresentation,
  };
  const view = render(<StudioSkiaDocumentSurface {...props} />);
  await waitFor(() => expect(requests).toHaveLength(1));
  expect(canPublishOverSettledInk).toHaveBeenCalledWith({
    sceneRevision,
    ownedDocumentIds: ["ink"],
  });
  const canvas = h.parent.querySelector<HTMLCanvasElement>('[data-studio-skia-document-surface]')!;
  expect(canvas.dataset.studioSkiaSourceFence).toBe("settled-ink");
  expect(beforePublish).not.toHaveBeenCalled();
  await act(async () => { requests[0]!.finish(success(requests[0]!.frame)); });
  expect(onVisiblePresentation).not.toHaveBeenCalled();
  view.rerender(<StudioSkiaDocumentSurface {...props} visible />);
  await waitFor(() => expect(canvas.style.visibility).toBe("visible"));
  expect(beforePublish).toHaveBeenCalledOnce();
  expect(onVisiblePresentation).toHaveBeenCalledOnce();
  expect(onVisiblePresentation).toHaveBeenCalledWith({
    sceneRevision,
    ownedDocumentIds: ["ink"],
  });
  view.unmount();
});

it("ignores superseded frame receipts", async () => {
  const h = setup(); const view = render(<StudioSkiaDocumentSurface {...h.props} />);
  await waitFor(() => expect(requests).toHaveLength(1));
  const next = { ...h.props, sceneRevision: {} }; view.rerender(<StudioSkiaDocumentSurface {...next} />);
  await act(async () => { requests[0]!.finish(success(requests[0]!.frame)); });
  expect(h.report.mock.calls.filter(([state]) => state.status === "active")).toHaveLength(0);
  view.unmount(); const count = h.report.mock.calls.length;
  await act(async () => { requests[1]!.finish(success(requests[1]!.frame)); });
  expect(h.report).toHaveBeenCalledTimes(count);
});
it("releases inactive surfaces and clears their reported ownership", async () => {
  const h = setup(); const view = render(<StudioSkiaDocumentSurface {...h.props} />);
  await waitFor(() => expect(requests).toHaveLength(1));
  view.rerender(<StudioSkiaDocumentSurface {...h.props} enabled={false} />);
  expect(h.report).toHaveBeenLastCalledWith(expect.objectContaining({ status: "disabled", backendId: null }));
  expect(h.parent.querySelector('[data-studio-skia-document-surface]')).toBeNull();
  expect(mocked.dispose).toHaveBeenCalledOnce();
});

it("cannot republish an old successful frame after device loss while its commit fence is pending", async () => {
  const h = setup(); let finishFence!: () => void;
  const fence = new Promise<void>((resolve) => { finishFence = resolve; });
  const view = render(<StudioSkiaDocumentSurface {...h.props} beforePublish={() => fence} />);
  await waitFor(() => expect(requests).toHaveLength(1));
  await act(async () => { requests[0]!.finish(success(requests[0]!.frame)); });
  expect(h.report.mock.calls.filter(([state]) => state.status === "active")).toHaveLength(0);
  act(() => { mocked.create.mock.calls[0]![1].onContextLost(); });
  await act(async () => { finishFence(); });
  expect(h.report).toHaveBeenLastCalledWith(expect.objectContaining({ status: "unavailable" }));
  expect(h.report.mock.calls.filter(([state]) => state.status === "active")).toHaveLength(0);
  expect(h.parent.querySelector<HTMLCanvasElement>('[data-studio-skia-document-surface]')!.style.visibility).toBe("hidden");
  view.unmount(); expect(mocked.dispose).toHaveBeenCalledOnce();
});

it("rejects a renderer receipt for a different document revision without hiding valid source pixels", async () => {
  const h = setup(); render(<StudioSkiaDocumentSurface {...h.props} />);
  await waitFor(() => expect(requests).toHaveLength(1));
  await act(async () => { requests[0]!.finish({ ...success(requests[0]!.frame), revision: {} }); });
  expect(h.report).toHaveBeenLastCalledWith(expect.objectContaining({ status: "unavailable", ownedDocumentIds: [],
    reason: expect.stringContaining("revision") }));
  expect(h.report.mock.calls.some(([state]) => state.status === "active")).toBe(false);
});

it("coalesces imperative camera movement and does not rebuild the React display fence", async () => {
  const h = setup(); let notify!: () => void; let scheduled!: FrameRequestCallback;
  let camera = { scaleX: 1, scaleY: 1, rotation: 0, offsetX: 0, offsetY: 0 };
  const unsubscribe = vi.fn();
  const cameraSource = { read: () => camera, subscribe: (callback: () => void) => { notify = callback; return unsubscribe; } };
  const beforePublish = vi.fn(async () => undefined);
  const view = render(<StudioSkiaDocumentSurface {...h.props} beforePublish={beforePublish} cameraSource={cameraSource} />);
  await waitFor(() => expect(requests).toHaveLength(1));
  await act(async () => { requests[0]!.finish(success(requests[0]!.frame)); });
  view.rerender(<StudioSkiaDocumentSurface {...h.props} visible beforePublish={beforePublish} cameraSource={cameraSource} />);
  await waitFor(() => expect(h.parent.querySelector<HTMLCanvasElement>("[data-studio-skia-document-surface]")!.style.visibility).toBe("visible"));
  const animation = vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => { scheduled = callback; return 1; });
  const cancel = vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => undefined);
  const count = h.report.mock.calls.length;
  try {
    act(() => { camera = { ...camera, offsetX: -100 }; notify(); camera = { ...camera, offsetY: -200 }; notify(); });
    const canvas = h.parent.querySelector<HTMLCanvasElement>("[data-studio-skia-document-surface]")!;
    expect(canvas.style.visibility).toBe("visible");
    expect(canvas.style.transform).toBe("translate3d(-100px, -200px, 0)");
    expect(canvas.dataset.studioSkiaCameraBridge).toBe("retained-translation");
    act(() => scheduled(0));
    expect(requests).toHaveLength(2);
    expect(requests[1]!.frame.camera).toMatchObject({ offsetX: -100, offsetY: -200 });
    await act(async () => { requests[1]!.finish(success(requests[1]!.frame)); });
    expect(beforePublish).toHaveBeenCalledTimes(2);
    expect(h.report).toHaveBeenCalledTimes(count);
    expect(canvas.style.visibility).toBe("visible");
    expect(canvas.style.transform).toBe("");
    expect(canvas.dataset.studioSkiaCameraBridge).toBeUndefined();
    view.unmount(); expect(unsubscribe).toHaveBeenCalledOnce();
  } finally { animation.mockRestore(); cancel.mockRestore(); }
});

it("rebases the retained scroll bridge when an intermediate GPU frame finishes late", async () => {
  const h = setup(); let notify!: () => void;
  const scheduled: FrameRequestCallback[] = [];
  let camera = { scaleX: 1, scaleY: 1, rotation: 0, offsetX: 0, offsetY: 0 };
  const cameraSource = { read: () => camera, subscribe: (callback: () => void) => { notify = callback; return () => undefined; } };
  const view = render(<StudioSkiaDocumentSurface {...h.props} cameraSource={cameraSource} />);
  await waitFor(() => expect(requests).toHaveLength(1));
  await act(async () => { requests[0]!.finish(success(requests[0]!.frame)); });
  view.rerender(<StudioSkiaDocumentSurface {...h.props} visible cameraSource={cameraSource} />);
  const canvas = h.parent.querySelector<HTMLCanvasElement>("[data-studio-skia-document-surface]")!;
  await waitFor(() => expect(canvas.style.visibility).toBe("visible"));
  const animation = vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => {
    scheduled.push(callback); return scheduled.length;
  });
  const cancel = vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => undefined);
  try {
    act(() => { camera = { ...camera, offsetX: -100 }; notify(); });
    expect(canvas.style.transform).toBe("translate3d(-100px, 0px, 0)");
    act(() => scheduled.shift()!(0));
    expect(requests).toHaveLength(2);

    act(() => { camera = { ...camera, offsetX: -200 }; notify(); });
    expect(canvas.style.transform).toBe("translate3d(-200px, 0px, 0)");
    await act(async () => { requests[1]!.finish(success(requests[1]!.frame)); });
    expect(canvas.style.visibility).toBe("visible");
    expect(canvas.style.transform).toBe("translate3d(-100px, 0px, 0)");

    act(() => scheduled.shift()!(16));
    expect(requests).toHaveLength(3);
    await act(async () => { requests[2]!.finish(success(requests[2]!.frame)); });
    expect(canvas.style.visibility).toBe("visible");
    expect(canvas.style.transform).toBe("");
  } finally { view.unmount(); animation.mockRestore(); cancel.mockRestore(); }
});

it("keeps non-translation camera changes on the guarded hidden handoff", async () => {
  const h = setup(); let notify!: () => void; let scheduled!: FrameRequestCallback;
  let camera = { scaleX: 1, scaleY: 1, rotation: 0, offsetX: 0, offsetY: 0 };
  const cameraSource = { read: () => camera, subscribe: (callback: () => void) => { notify = callback; return () => undefined; } };
  const view = render(<StudioSkiaDocumentSurface {...h.props} cameraSource={cameraSource} />);
  await waitFor(() => expect(requests).toHaveLength(1));
  await act(async () => { requests[0]!.finish(success(requests[0]!.frame)); });
  view.rerender(<StudioSkiaDocumentSurface {...h.props} visible cameraSource={cameraSource} />);
  const canvas = h.parent.querySelector<HTMLCanvasElement>("[data-studio-skia-document-surface]")!;
  await waitFor(() => expect(canvas.style.visibility).toBe("visible"));
  const animation = vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => { scheduled = callback; return 1; });
  const cancel = vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => undefined);
  try {
    act(() => { camera = { ...camera, scaleX: 2 }; notify(); });
    expect(canvas.style.visibility).toBe("hidden");
    expect(canvas.style.transform).toBe("");
    act(() => scheduled(0));
    await act(async () => { requests[1]!.finish(success(requests[1]!.frame)); });
    expect(canvas.style.visibility).toBe("visible");
  } finally { view.unmount(); animation.mockRestore(); cancel.mockRestore(); }
});

it("waits for the parent's hidden-document paint before revealing the completed GPU frame", async () => {
  const h = setup(); const fences: Array<() => void> = [];
  const beforePublish = vi.fn(() => new Promise<void>((resolve) => { fences.push(resolve); }));
  const view = render(<StudioSkiaDocumentSurface {...h.props} beforePublish={beforePublish} />);
  await waitFor(() => expect(requests).toHaveLength(1));
  await waitFor(() => expect(fences).toHaveLength(1));
  await act(async () => { requests[0]!.finish(success(requests[0]!.frame)); fences[0]!(); });
  expect(h.report).toHaveBeenLastCalledWith(expect.objectContaining({ status: "active" }));
  view.rerender(<StudioSkiaDocumentSurface {...h.props} visible beforePublish={beforePublish} />);
  await waitFor(() => expect(fences).toHaveLength(2));
  const canvas = h.parent.querySelector<HTMLCanvasElement>('[data-studio-skia-document-surface]')!;
  expect(canvas.style.visibility).toBe("hidden");
  await act(async () => { fences[1]!(); });
  expect(canvas.style.visibility).toBe("visible");
  view.unmount();
});

it("invalidates a pending source-hide acknowledgement when the live camera moves", async () => {
  const h = setup(); const fences: Array<() => void> = []; let notify!: () => void;
  let scheduled!: FrameRequestCallback;
  const beforePublish = vi.fn(() => new Promise<void>((resolve) => { fences.push(resolve); }));
  const cameraSource = { read: () => null, subscribe: (callback: () => void) => { notify = callback; return () => undefined; } };
  const view = render(<StudioSkiaDocumentSurface {...h.props} beforePublish={beforePublish} cameraSource={cameraSource} />);
  await waitFor(() => expect(fences).toHaveLength(1));
  await act(async () => { requests[0]!.finish(success(requests[0]!.frame)); fences[0]!(); });
  view.rerender(<StudioSkiaDocumentSurface {...h.props} visible beforePublish={beforePublish} cameraSource={cameraSource} />);
  await waitFor(() => expect(fences).toHaveLength(2));
  const animation = vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => { scheduled = callback; return 1; });
  const cancel = vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => undefined);
  try {
    act(() => notify());
    await act(async () => { fences[1]!(); });
    expect(h.parent.querySelector<HTMLCanvasElement>('[data-studio-skia-document-surface]')!.style.visibility).toBe("hidden");
    await act(async () => { scheduled(0); });
    expect(beforePublish).toHaveBeenCalledTimes(3);
    expect(requests).toHaveLength(2);
  } finally { view.unmount(); animation.mockRestore(); cancel.mockRestore(); }
});

it("reports image admission failure as legacy without showing a GPU failure state", async () => {
  const h = setup();
  render(<StudioSkiaDocumentSurface {...h.props} />);
  await waitFor(() => expect(requests).toHaveLength(1));
  await act(async () => {
    requests[0]!.finish({
      status: "unsupported",
      revision: requests[0]!.frame.revision,
      reason: "image source stays on compatibility",
    });
  });
  expect(h.report).toHaveBeenLastCalledWith(expect.objectContaining({
    status: "legacy",
    backendId: null,
    ownedDocumentIds: [],
    reason: "image source stays on compatibility",
  }));
  expect(h.report.mock.calls.some(([state]) => state.status === "unavailable")).toBe(false);
});

it("updates only transform source ownership without rebuilding on every exact draft frame", async () => {
  const h = setup();
  const store = createStudioLiveTransformDraftStore();
  const original = pen();
  const props = {
    ...h.props,
    visible: true,
    elements: [original],
    liveTransformDraftStore: store,
    liveTransformDraftScope: "page:p1",
  };
  const view = render(<StudioSkiaDocumentSurface {...props} />);
  await waitFor(() => expect(requests).toHaveLength(1));
  await act(async () => { requests[0]!.finish(success(requests[0]!.frame)); });
  const claim = store.claim("page:p1", ["ink"]);
  expect(claim).not.toBeNull();
  const moved = { ...original, points: [40, 10, 60, 20, 90, 40] } as El;
  act(() => claim!.present([{ element: moved as DrawEl, clip: null }]));
  await waitFor(() => expect(requests).toHaveLength(2));
  expect(requests[1]!.frame.items).toEqual([]);
  await act(async () => { requests[1]!.finish(success(requests[1]!.frame)); });
  act(() => claim!.present([{
    element: { ...moved, points: [44, 10, 64, 20, 94, 40] } as DrawEl,
    clip: null,
  }]));
  expect(requests).toHaveLength(2);
  act(() => { expect(claim!.release()).toBe(true); });
  await waitFor(() => expect(requests).toHaveLength(3));
  expect(requests[2]!.frame.items.map((item) => item.id)).toEqual(["ink"]);
  view.unmount();
});


it("hides a superseded camera frame when transform projection ownership changes", async () => {
  const h = setup();
  const store = createStudioLiveTransformDraftStore();
  const original = pen();
  let notify!: () => void;
  let scheduled!: FrameRequestCallback;
  let camera = { scaleX: 1, scaleY: 1, rotation: 0, offsetX: 0, offsetY: 0 };
  const cameraSource = {
    read: () => camera,
    subscribe: (callback: () => void) => {
      notify = callback;
      return () => undefined;
    },
  };
  const props = {
    ...h.props,
    elements: [original],
    cameraSource,
    liveTransformDraftStore: store,
    liveTransformDraftScope: "page:p1",
  };
  const view = render(<StudioSkiaDocumentSurface {...props} />);
  await waitFor(() => expect(requests).toHaveLength(1));
  await act(async () => { requests[0]!.finish(success(requests[0]!.frame)); });
  view.rerender(<StudioSkiaDocumentSurface {...props} visible />);
  const canvas = h.parent.querySelector<HTMLCanvasElement>("[data-studio-skia-document-surface]")!;
  await waitFor(() => expect(canvas.style.visibility).toBe("visible"));
  const animation = vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => {
    scheduled = callback;
    return 1;
  });
  const cancel = vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => undefined);
  const claim = store.claim("page:p1", ["ink"]);
  expect(claim).not.toBeNull();
  try {
    act(() => {
      camera = { ...camera, offsetX: -40 };
      notify();
      scheduled(0);
    });
    await waitFor(() => expect(requests).toHaveLength(2));
    act(() => claim!.present([{
      element: { ...original, points: [40, 10, 60, 20, 90, 40] } as DrawEl,
      clip: null,
    }]));
    await waitFor(() => expect(requests).toHaveLength(3));
    expect(requests[1]!.frame.items.map((item) => item.id)).toEqual(["ink"]);
    expect(requests[2]!.frame.items).toEqual([]);
    await act(async () => { requests[1]!.finish(success(requests[1]!.frame)); });
    expect(canvas.style.visibility).toBe("hidden");
    await act(async () => { requests[2]!.finish(success(requests[2]!.frame)); });
    expect(h.report).toHaveBeenLastCalledWith(expect.objectContaining({ status: "active" }));
    view.rerender(<StudioSkiaDocumentSurface {...props} />);
    view.rerender(<StudioSkiaDocumentSurface {...props} visible />);
    await waitFor(() => expect(canvas.style.visibility).toBe("visible"));
  } finally {
    view.unmount();
    claim?.release();
    animation.mockRestore();
    cancel.mockRestore();
  }
});
