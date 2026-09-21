// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StudioSkiaDocumentSurface } from "./StudioSkiaDocumentSurface";
import type { StudioRenderSurfaceAuthority } from "./StudioRenderSurface";
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
  stats: { compiledBatches: 0, cachedBatches: 0, paintedItems: 0, presentation: "cached", retainedSnapshotBytes: 0, compiledItems: 0, cachedItems: 0, pictureBytes: 32, gpuCacheBytes: null, frameMs: 1, interactiveReadbacks: 0 } });
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
  const animation = vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => { scheduled = callback; return 1; });
  const cancel = vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => undefined);
  const count = h.report.mock.calls.length;
  try {
    act(() => { camera = { ...camera, offsetX: -100 }; notify(); camera = { ...camera, offsetY: -200 }; notify(); });
    expect(h.parent.querySelector<HTMLCanvasElement>("[data-studio-skia-document-surface]")!.style.visibility).toBe("hidden");
    act(() => scheduled(0));
    expect(requests).toHaveLength(2);
    expect(requests[1]!.frame.camera).toMatchObject({ offsetX: -100, offsetY: -200 });
    await act(async () => { requests[1]!.finish(success(requests[1]!.frame)); });
    expect(beforePublish).toHaveBeenCalledTimes(2);
    expect(h.report).toHaveBeenCalledTimes(count);
    expect(h.parent.querySelector<HTMLCanvasElement>("[data-studio-skia-document-surface]")!.style.visibility).toBe("visible");
    view.unmount(); expect(unsubscribe).toHaveBeenCalledOnce();
  } finally { animation.mockRestore(); cancel.mockRestore(); }
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
