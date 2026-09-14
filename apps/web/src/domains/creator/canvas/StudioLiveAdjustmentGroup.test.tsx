// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStudioLiveAdjustment } from "../studio-live-adjustment";
import { readStudioLiveAdjustmentStatus } from "../studio-live-adjustment-status";
import { snapshotStudioMountedRasterImagePresentations, waitForStudioRasterImagePresentations } from "../render/studio-raster-image-presentation";
import { refreshStudioRasterPresentationCaches } from "../render/studio-raster-presentation-cache";
import { StudioLiveAdjustmentGroup } from "./StudioLiveAdjustmentGroup";
import type Konva from "konva";
import type { StudioImageDataLike } from "../studio-filters";

const scene = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  let filters: Array<(image: StudioImageDataLike) => void> = [];
  const state = {
    source: new Uint8ClampedArray([10, 20, 30, 128]),
    output: new Uint8ClampedArray(),
    cacheFailure: false,
    draws: 0,
    layer: { on: (_event: string, callback: () => void) => listeners.add(callback), off: (_event: string, callback: () => void) => listeners.delete(callback), batchDraw: vi.fn() },
    draw: () => { state.draws++; for (const callback of listeners) callback(); },
    node: {
      getLayer: () => state.layer, getParent: () => null, isVisible: () => true,
      isCached: () => true, clearCache: vi.fn(),
      filters: (next: typeof filters) => { filters = next; },
      cache: () => { if (state.cacheFailure) throw new Error("cache allocation failed"); state.output = state.source.slice(); },
      toCanvas: () => { for (const filter of filters) filter({ width: 1, height: 1, data: state.output }); return { width: 1, height: 1 }; },
    },
  };
  return state;
});
vi.mock("react-konva/lib/ReactKonvaCore", async () => {
  const React = await import("react");
  return { Group: React.forwardRef(({ children }: { children?: React.ReactNode }, ref) => {
    React.useImperativeHandle(ref, () => scene.node);
    return <div>{children}</div>;
  }) };
});
const adjustment = () => ({ ...createStudioLiveAdjustment("adjustment", 1, 1), smartFilters: { version: 1 as const, entries: [{ id: "invert", engine: "invert" as const, enabled: true, params: {} }] } });
const mount = (element = adjustment(), cacheKey = "initial") => <StudioLiveAdjustmentGroup element={element} cacheKey={cacheKey} width={1} height={1} sourceIds={["source"]}><span>editable original</span></StudioLiveAdjustmentGroup>;
beforeEach(() => { scene.source = new Uint8ClampedArray([10, 20, 30, 128]); scene.cacheFailure = false; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("live adjustment actual runtime and capture fence", () => {
  it("cannot export after mount until the current graph completes a real layer draw", async () => {
    const view = render(mount());
    const identities = snapshotStudioMountedRasterImagePresentations();
    expect(identities).toHaveLength(1);
    let completed = false;
    const captured = waitForStudioRasterImagePresentations(identities, () => scene.draw()).then(() => { completed = true; });
    expect(completed).toBe(false);
    await waitFor(() => expect(readStudioLiveAdjustmentStatus("adjustment")?.state).toBe("ready"));
    expect([...scene.output]).toEqual([245, 235, 225, 128]);
    expect([...scene.source]).toEqual([10, 20, 30, 128]);
    expect(completed).toBe(false);
    act(() => scene.draw()); await captured;
    expect(completed).toBe(true);
    expect(view.getByText("editable original")).toBeTruthy();
  });
  it("rebuilds the real parent compositor when a late image Worker publishes newer pixels", async () => {
    render(mount());
    await waitFor(() => expect(readStudioLiveAdjustmentStatus("adjustment")?.state).toBe("ready"));
    scene.source = new Uint8ClampedArray([100, 120, 140, 255]);
    const imageNode = { getParent: () => scene.node } as unknown as Konva.Node;
    expect(refreshStudioRasterPresentationCaches(imageNode)).toBe(true);
    expect([...scene.output]).toEqual([155, 135, 115, 255]);
    await waitForStudioRasterImagePresentations(snapshotStudioMountedRasterImagePresentations(), () => scene.draw());
  });
  it("keys a changed graph separately and ignores the old receipt during immediate export", async () => {
    const view = render(mount());
    await waitFor(() => expect(readStudioLiveAdjustmentStatus("adjustment")?.state).toBe("ready"));
    const old = snapshotStudioMountedRasterImagePresentations()[0]!;
    view.rerender(mount({ ...adjustment(), opacity: 0 }, "opacity-zero"));
    const next = snapshotStudioMountedRasterImagePresentations()[0]!;
    expect(next.requestKey).not.toBe(old.requestKey);
    let completed = false;
    const fence = waitForStudioRasterImagePresentations([next], () => scene.draw()).then(() => { completed = true; });
    expect(completed).toBe(false);
    await waitFor(() => expect(readStudioLiveAdjustmentStatus("adjustment")?.state).toBe("ready"));
    expect([...scene.output]).toEqual([...scene.source]);
    act(() => scene.draw()); await fence;
  });
  it("reports a cache failure, refuses export and retries on a new graph without accepting stale pixels", async () => {
    scene.cacheFailure = true;
    const view = render(mount());
    await waitFor(() => expect(readStudioLiveAdjustmentStatus("adjustment")?.state).toBe("error"));
    const controller = new AbortController();
    const fence = waitForStudioRasterImagePresentations(snapshotStudioMountedRasterImagePresentations(), () => scene.draw(), controller.signal);
    controller.abort(new Error("capture cancelled"));
    await expect(fence).rejects.toThrow("capture cancelled");
    scene.cacheFailure = false;
    view.rerender(mount({ ...adjustment(), opacity: 0.5 }, "retry"));
    await waitFor(() => expect(readStudioLiveAdjustmentStatus("adjustment")?.state).toBe("ready"));
    expect([...scene.output]).toEqual([128, 128, 128, 128]);
    await waitForStudioRasterImagePresentations(snapshotStudioMountedRasterImagePresentations(), () => scene.draw());
  });
  it("uses decoded grayscale mask coverage and premultiplied alpha in the actual cached graph", async () => {
    scene.source = new Uint8ClampedArray([128, 128, 128, 255]);
    vi.stubGlobal("Image", class {
      onload: (() => void) | null = null; onerror: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
      removeAttribute() {}
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      translate: vi.fn(), rotate: vi.fn(), scale: vi.fn(), drawImage: vi.fn(),
      getImageData: () => ({ data: new Uint8ClampedArray([128, 128, 128, 255]) }),
    } as unknown as ReturnType<typeof HTMLCanvasElement.prototype.getContext>);
    const element = { ...createStudioLiveAdjustment("adjustment", 1, 1), filterMaskSrc: "data:image/png;base64,mask", smartFilters: { version: 1 as const, entries: [{ id: "remove-white", engine: "color-to-alpha" as const, enabled: true, params: { keyColor: "#ffffff", strength: 100 } }] } };
    render(<StudioLiveAdjustmentGroup element={element} cacheKey="masked" width={1} height={1} sourceIds={["source"]} children={null} />);
    await waitFor(() => expect(readStudioLiveAdjustmentStatus("adjustment")?.state).toBe("ready"));
    expect([...scene.output]).toEqual([85, 85, 85, 191]);
    expect([...scene.source]).toEqual([128, 128, 128, 255]);
    await waitForStudioRasterImagePresentations(snapshotStudioMountedRasterImagePresentations(), () => scene.draw());
  });
  it("fails capture when a durable mask has not hydrated instead of applying an unmasked effect", async () => {
    const element = { ...adjustment(), filterMaskSurfaceId: "filter-mask:v1:10000000-0000-4000-8000-000000000001" };
    render(mount(element));
    await waitFor(() => expect(readStudioLiveAdjustmentStatus("adjustment")?.state).toBe("error"));
    expect(readStudioLiveAdjustmentStatus("adjustment")?.message).toMatch(/복원/);
    const controller = new AbortController();
    const fence = waitForStudioRasterImagePresentations(snapshotStudioMountedRasterImagePresentations(), () => scene.draw(), controller.signal);
    controller.abort(new Error("cancelled")); await expect(fence).rejects.toThrow("cancelled");
  });
  it("unmount cancels pending work and unregisters the page's graph identity", async () => {
    const view = render(mount()); view.unmount();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(snapshotStudioMountedRasterImagePresentations()).toHaveLength(0);
    expect(readStudioLiveAdjustmentStatus("adjustment")).toBeUndefined();
  });
});
