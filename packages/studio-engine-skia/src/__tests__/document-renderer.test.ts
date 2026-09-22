// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { createSkiaDocumentRenderer, type SkiaDocumentFrame } from "../document-renderer";

import type { CanvasKit } from "canvaskit-wasm";

function harness() {
  const pictures: Array<{ delete: ReturnType<typeof vi.fn>; approximateBytesUsed(): number }> = [];
  const output = { clear: vi.fn(), save: vi.fn(), restore: vi.fn(), scale: vi.fn(), translate: vi.fn(), rotate: vi.fn(), clipRect: vi.fn(), drawPicture: vi.fn(), drawImage: vi.fn() };
  const surface = { getCanvas: () => output, flush: vi.fn(), delete: vi.fn(), makeImageSnapshot: () => ({
    delete: vi.fn(),
    encodeToBytes: vi.fn(() => Uint8Array.of(0x89, 0x50, 0x4e, 0x47)),
  }) };
  const context = { setResourceCacheLimitBytes: vi.fn(), getResourceCacheUsageBytes: () => 512, delete: vi.fn() };
  const recorders: Array<{ delete: ReturnType<typeof vi.fn> }> = [];
  class PictureRecorder {
    delete = vi.fn();
    constructor() { recorders.push(this); }
    beginRecording() { return { drawPicture: vi.fn() }; }
    finishRecordingAsPicture() {
      const picture = { delete: vi.fn(), approximateBytesUsed: () => 32 };
      pictures.push(picture); return picture;
    }
  }
  const ck = { PictureRecorder, GetWebGLContext: vi.fn(() => 1), MakeWebGLContext: vi.fn(() => context),
    MakeOnScreenGLSurface: vi.fn(() => surface), deleteContext: vi.fn(), setCurrentContext: vi.fn(() => true), ColorSpace: { SRGB: {} }, ClipOp: { Intersect: 1 }, ImageFormat: { PNG: 1 }, TRANSPARENT: new Float32Array(4),
  } as unknown as CanvasKit;
  const canvas = document.createElement("canvas");
  const frame: SkiaDocumentFrame = { revision: {}, width: 200, height: 200, dpr: 1, documentWidth: 1000, documentHeight: 1000,
    camera: { scaleX: 1, scaleY: 1, rotation: 0, offsetX: 0, offsetY: 0 }, items: [{ id: "a", revision: {}, nodes: [] }] };
  return { canvas, ck, frame, output, surface, context, pictures, recorders };
}

describe("persistent CanvasKit document renderer", () => {
  it("reuses compiled geometry on camera/resize and compiles only changed items", async () => {
    const h = harness(); const renderer = createSkiaDocumentRenderer(h.canvas, { loadCanvasKit: async () => h.ck });
    expect(await renderer.present(h.frame)).toMatchObject({ status: "presented", stats: { compiledItems: 1, interactiveReadbacks: 0 } });
    const camera = { ...h.frame.camera, scaleX: -2, scaleY: 2, rotation: 90, offsetX: 150 };
    expect(await renderer.present({ ...h.frame, revision: {}, width: 250, camera })).toMatchObject({ status: "presented", stats: { compiledItems: 0 } });
    expect(h.output.rotate).toHaveBeenLastCalledWith(90, 0, 0);
    expect(h.output.scale).toHaveBeenLastCalledWith(-2, 2);
    const second = { id: "b", revision: {}, nodes: [] };
    expect(await renderer.present({ ...h.frame, revision: {}, items: [...h.frame.items, second] })).toMatchObject({ status: "presented", stats: { compiledItems: 1, cachedItems: 2 } });
    renderer.dispose(); renderer.dispose();
    expect(h.pictures.every((picture) => picture.delete.mock.calls.length === 1)).toBe(true);
    expect(h.recorders.every((recorder) => recorder.delete.mock.calls.length === 1)).toBe(true);
    expect(h.context.delete).toHaveBeenCalledOnce();
    expect(h.ck.deleteContext).toHaveBeenCalledOnce();
  });

  it("snapshots only the exact currently presented revision", async () => {
    const h = harness();
    const renderer = createSkiaDocumentRenderer(h.canvas, { loadCanvasKit: async () => h.ck });
    expect(renderer.snapshotPng(h.frame.revision)).toBeNull();
    const receipt = await renderer.present(h.frame);
    expect(receipt).toMatchObject({ status: "presented", revision: h.frame.revision });
    expect(renderer.snapshotPng({})).toBeNull();
    expect(renderer.snapshotPng(h.frame.revision)).toEqual(Uint8Array.of(0x89, 0x50, 0x4e, 0x47));
    renderer.dispose();
    expect(renderer.snapshotPng(h.frame.revision)).toBeNull();
  });
  it("coalesces only unpresented frames during async loading and settles every waiter", async () => {
    const h = harness(); let load!: (ck: CanvasKit) => void;
    const renderer = createSkiaDocumentRenderer(h.canvas, { loadCanvasKit: () => new Promise((resolve) => { load = resolve; }) });
    const a = renderer.present(h.frame); const b = renderer.present({ ...h.frame, revision: {} });
    const last = { ...h.frame, revision: {} }; const c = renderer.present(last); load(h.ck);
    expect(await a).toMatchObject({ status: "superseded" }); expect(await b).toMatchObject({ status: "superseded" });
    expect(await c).toMatchObject({ status: "presented", revision: last.revision });
    expect(h.surface.flush).toHaveBeenCalledOnce(); renderer.dispose();
  });
  it("never initializes a disposed pending session or leaks allocations", async () => {
    const h = harness(); let load!: (ck: CanvasKit) => void;
    const renderer = createSkiaDocumentRenderer(h.canvas, { loadCanvasKit: () => new Promise((resolve) => { load = resolve; }) });
    const pending = renderer.present(h.frame); renderer.dispose(); load(h.ck);
    expect(await pending).toMatchObject({ status: "disposed" });
    expect(h.ck.GetWebGLContext).not.toHaveBeenCalled();
  });
  it("fails visibly on GPU loss without trying another renderer", async () => {
    const h = harness(); const lost = vi.fn();
    const renderer = createSkiaDocumentRenderer(h.canvas, { loadCanvasKit: async () => h.ck, onContextLost: lost });
    await renderer.present(h.frame);
    const event = new Event("webglcontextlost", { cancelable: true }); h.canvas.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true); expect(lost).toHaveBeenCalledOnce();
    expect(await renderer.present({ ...h.frame, revision: {} })).toMatchObject({ status: "unavailable" });
    expect(h.surface.flush).toHaveBeenCalledOnce(); expect(h.ck.GetWebGLContext).toHaveBeenCalledOnce();
    renderer.dispose();
  });
  it("rejects duplicate ids, invalid size and budget exhaustion without incomplete presentation", async () => {
    for (const frame of [
      { ...harness().frame, width: 100_000 },
      { ...harness().frame, items: [{ id: "a", revision: {}, nodes: [] }, { id: "a", revision: {}, nodes: [] }] },
    ]) {
      const h = harness(); const renderer = createSkiaDocumentRenderer(h.canvas, { loadCanvasKit: async () => h.ck });
      expect(await renderer.present(frame)).toMatchObject({ status: "unavailable" });
      expect(h.surface.flush).not.toHaveBeenCalled(); renderer.dispose();
    }
    const h = harness(); const renderer = createSkiaDocumentRenderer(h.canvas, { loadCanvasKit: async () => h.ck, maxPictureBytes: 16 });
    expect(await renderer.present(h.frame)).toMatchObject({ status: "unavailable" });
    expect(h.surface.flush).not.toHaveBeenCalled(); renderer.dispose();
    expect(h.pictures.every((picture) => picture.delete.mock.calls.length === 1)).toBe(true);
  });
  it("settles loading failures and refuses implicit software surfaces", async () => {
    const h = harness();
    const failed = createSkiaDocumentRenderer(h.canvas, { loadCanvasKit: async () => { throw new Error("wasm offline"); } });
    expect(await failed.present(h.frame)).toMatchObject({ status: "unavailable", reason: "wasm offline" }); failed.dispose();
    vi.mocked(h.ck.GetWebGLContext).mockReturnValue(0);
    const renderer = createSkiaDocumentRenderer(h.canvas, { loadCanvasKit: async () => h.ck });
    expect(await renderer.present(h.frame)).toMatchObject({ status: "unavailable", reason: expect.stringContaining("software fallback is disabled") });
    expect(h.ck.MakeOnScreenGLSurface).not.toHaveBeenCalled(); renderer.dispose();
  });
});

it("records only the affected composite batch rather than replaying the document on append", async () => {
  const h = harness(); const renderer = createSkiaDocumentRenderer(h.canvas, { loadCanvasKit: async () => h.ck });
  const items = Array.from({ length: 1024 }, (_, index) => ({ id: `ink-${index}`, revision: {}, nodes: [] }));
  expect(await renderer.present({ ...h.frame, items })).toMatchObject({ status: "presented", stats: { compiledItems: 1024, compiledBatches: 8 } });
  const next = [...items, { id: "next", revision: {}, nodes: [] }];
  expect(await renderer.present({ ...h.frame, revision: {}, items: next })).toMatchObject({ status: "presented", stats: {
    compiledItems: 1, compiledBatches: 1, cachedBatches: 9, paintedItems: 1, presentation: "append",
  } });
  const edited = next.map((item, index) => index === 500 ? { ...item, revision: {} } : item);
  expect(await renderer.present({ ...h.frame, revision: {}, items: edited })).toMatchObject({ status: "presented", stats: { compiledItems: 1, compiledBatches: 1 } });
  renderer.dispose();
  expect(h.pictures.every((picture) => picture.delete.mock.calls.length === 1)).toBe(true);
});

it("bounds retained viewport images and releases GPU resources on repeated camera changes", async () => {
  const h = harness(); const images: Array<{ delete: ReturnType<typeof vi.fn> }> = [];
  h.surface.makeImageSnapshot = () => { const image = { delete: vi.fn() }; images.push(image); return image; };
  const abandon = vi.fn(); Object.assign(h.context, { releaseResourcesAndAbandonContext: abandon });
  const renderer = createSkiaDocumentRenderer(h.canvas, { loadCanvasKit: async () => h.ck });
  for (let index = 0; index < 40; index++) {
    const result = await renderer.present({ ...h.frame, revision: {}, camera: { ...h.frame.camera, offsetX: index } });
    expect(result).toMatchObject({ status: "presented" });
    expect(images.filter((image) => image.delete.mock.calls.length === 0).length).toBeLessThanOrEqual(3);
  }
  renderer.dispose(); renderer.dispose();
  expect(images.every((image) => image.delete.mock.calls.length === 1)).toBe(true);
  expect(abandon).toHaveBeenCalledOnce();
});


it("repaints an externally reset backing store instead of acknowledging an empty cached frame", async () => {
  const h = harness(); const renderer = createSkiaDocumentRenderer(h.canvas, { loadCanvasKit: async () => h.ck });
  await renderer.present(h.frame); h.canvas.width = 1;
  expect(await renderer.present({ ...h.frame, revision: {} })).toMatchObject({ status: "presented", stats: { compiledItems: 0, presentation: "full", paintedItems: 1 } });
  expect(h.canvas.width).toBe(200); expect(h.surface.flush).toHaveBeenCalledTimes(2); renderer.dispose();
});

it("latches runtime loading failure until the explicit creation of a fresh renderer", async () => {
  const h = harness(); const load = vi.fn(async () => { throw new Error("offline"); });
  const renderer = createSkiaDocumentRenderer(h.canvas, { loadCanvasKit: load });
  expect(await renderer.present(h.frame)).toMatchObject({ status: "unavailable" });
  expect(await renderer.present({ ...h.frame, revision: {} })).toMatchObject({ status: "unavailable" });
  expect(load).toHaveBeenCalledOnce(); renderer.dispose();
});

it("recreates an externally resized backing store even when the source revision is unchanged", async () => {
  const h = harness(); const renderer = createSkiaDocumentRenderer(h.canvas, { loadCanvasKit: async () => h.ck });
  await renderer.present(h.frame);
  h.canvas.width = 1; h.canvas.height = 1;
  expect(await renderer.present(h.frame)).toMatchObject({ status: "presented", stats: { presentation: "full", compiledItems: 0 } });
  expect(h.canvas.width).toBe(h.frame.width); expect(h.canvas.height).toBe(h.frame.height);
  expect(h.ck.MakeOnScreenGLSurface).toHaveBeenCalledTimes(2);
  expect(h.surface.flush).toHaveBeenCalledTimes(2);
  renderer.dispose();
});


it("does not restore viewport textures from a previous backing-store generation", async () => {
  const h = harness(); const renderer = createSkiaDocumentRenderer(h.canvas, { loadCanvasKit: async () => h.ck });
  await renderer.present(h.frame);
  await renderer.present({ ...h.frame, revision: {}, camera: { ...h.frame.camera, offsetX: 10 } });
  await renderer.present({ ...h.frame, revision: {}, width: 400, height: 300, dpr: 2 });
  h.output.drawImage.mockClear();
  expect(await renderer.present({ ...h.frame, revision: {} })).toMatchObject({ status: "presented", stats: { presentation: "full", compiledItems: 0 } });
  expect(h.output.drawImage).not.toHaveBeenCalled();
  renderer.dispose();
});


it("releases retained GPU resources on loss without waiting for the editor to unmount", async () => {
  const h = harness();
  const images: Array<{ delete: ReturnType<typeof vi.fn> }> = [];
  h.surface.makeImageSnapshot = () => {
    const image = { delete: vi.fn() }; images.push(image); return image;
  };
  const abandon = vi.fn();
  Object.assign(h.context, { releaseResourcesAndAbandonContext: abandon });
  const renderer = createSkiaDocumentRenderer(h.canvas, { loadCanvasKit: async () => h.ck,
    onContextLost: () => { throw new Error("observer failed"); } });
  await renderer.present(h.frame);
  await renderer.present({ ...h.frame, camera: { ...h.frame.camera, offsetX: 10 } });
  h.canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
  await Promise.resolve();
  expect(h.pictures.every((picture) => picture.delete.mock.calls.length === 1)).toBe(true);
  expect(images.length).toBeGreaterThan(0);
  expect(images.every((image) => image.delete.mock.calls.length === 1)).toBe(true);
  expect(h.surface.delete).toHaveBeenCalledOnce();
  expect(abandon).toHaveBeenCalledOnce();
  expect(h.ck.deleteContext).toHaveBeenCalledOnce();
  expect(await renderer.present(h.frame)).toMatchObject({ status: "unavailable" });
  renderer.dispose(); renderer.dispose();
  expect(h.context.delete).toHaveBeenCalledOnce();
  expect(h.ck.deleteContext).toHaveBeenCalledOnce();
});

it("releases old and partially compiled pictures when a later frame exceeds the budget", async () => {
  const h = harness();
  const renderer = createSkiaDocumentRenderer(h.canvas, { loadCanvasKit: async () => h.ck, maxPictureBytes: 96 });
  const items = [...h.frame.items, { id: "b", revision: {}, nodes: [] }];
  expect(await renderer.present(h.frame)).toMatchObject({ status: "presented" });
  expect(await renderer.present({ ...h.frame, items })).toMatchObject({ status: "presented" });
  const result = await renderer.present({ ...h.frame, items: [...items, { id: "c", revision: {}, nodes: [] }] });
  expect(result).toMatchObject({ status: "unavailable", reason: expect.stringContaining("budget") });
  expect(h.surface.flush).toHaveBeenCalledTimes(2);
  expect(h.pictures.every((picture) => picture.delete.mock.calls.length === 1)).toBe(true);
  expect(h.context.delete).toHaveBeenCalledOnce();
  expect(await renderer.present(h.frame)).toMatchObject({ status: "unavailable" });
  renderer.dispose();
  expect(h.ck.deleteContext).toHaveBeenCalledOnce();
});

it("releases the context when GPU surface creation fails", async () => {
  const h = harness(); vi.mocked(h.ck.MakeOnScreenGLSurface).mockReturnValue(null);
  const renderer = createSkiaDocumentRenderer(h.canvas, { loadCanvasKit: async () => h.ck });
  expect(await renderer.present(h.frame)).toMatchObject({ status: "unavailable" });
  expect(h.context.delete).toHaveBeenCalledOnce();
  expect(h.ck.deleteContext).toHaveBeenCalledOnce();
  renderer.dispose();
  expect(h.ck.deleteContext).toHaveBeenCalledOnce();
});

it("keeps source-specific image admission failures on the compatibility boundary", async () => {
  const h = harness();
  const imageFrame: SkiaDocumentFrame = {
    ...h.frame,
    revision: {},
    items: [{
      id: "image",
      revision: {},
      image: {
        src: "https://example.invalid/source.png",
        x: 10, y: 20, width: 40, height: 30, rotation: 0,
        opacity: 1, flipX: false, flipY: false,
        skewX: 0, skewY: 0, cornerRadius: 0, blendMode: "source-over",
      },
    }],
  };
  const renderer = createSkiaDocumentRenderer(h.canvas, {
    loadCanvasKit: async () => h.ck,
    loadImageBitmap: async () => { throw new Error("cors denied"); },
  });
  expect(await renderer.present(imageFrame)).toMatchObject({
    status: "unsupported",
    reason: "cors denied",
  });
  expect(await renderer.present({ ...h.frame, revision: {} })).toMatchObject({
    status: "presented",
  });
  expect(h.ck.GetWebGLContext).toHaveBeenCalledOnce();
  renderer.dispose();
});
