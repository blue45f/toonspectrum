// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStudioLiveAdjustment } from "../studio-live-adjustment";
import { readStudioLiveAdjustmentStatus } from "../studio-live-adjustment-status";
import { snapshotStudioMountedRasterImagePresentations, waitForStudioRasterImagePresentations } from "../render/studio-raster-image-presentation";
import { prepareStudioRasterCapture, refreshStudioRasterPresentationCaches } from "../render/studio-raster-presentation-cache";
import { StudioLiveAdjustmentGroup } from "./StudioLiveAdjustmentGroup";
import type Konva from "konva";
import type { StudioImageDataLike } from "../studio-filters";

const scene = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  let filters: Array<(image: StudioImageDataLike) => void> = [];
  const state = {
    source: new Uint8ClampedArray([10, 20, 30, 128]),
    output: new Uint8ClampedArray(),
    stage: {},
    density: 1,
    cacheFailure: false,
    draws: 0,
    layer: { on: (_event: string, callback: () => void) => listeners.add(callback), off: (_event: string, callback: () => void) => listeners.delete(callback), batchDraw: vi.fn() },
    draw: () => { state.draws++; for (const callback of listeners) callback(); },
    node: {
      getLayer: () => state.layer, getStage: () => state.stage, getParent: () => null, isVisible: () => true,
      isCached: () => true, clearCache: vi.fn(),
      filters: (next: typeof filters) => { filters = next; },
      cache: (options: { pixelRatio: number }) => {
        if (state.cacheFailure) throw new Error("cache allocation failed");
        state.density = options.pixelRatio;
        state.output = new Uint8ClampedArray(state.density * state.density * 4);
        for (let offset = 0; offset < state.output.length; offset += 4) state.output.set(state.source, offset);
      },
      toCanvas: () => { for (const filter of filters) filter({ width: state.density, height: state.density, data: state.output }); return { width: 1, height: 1 }; },
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
    await act(async () => { await vi.dynamicImportSettled(); });
    await waitFor(() => expect(readStudioLiveAdjustmentStatus("adjustment")?.state).toBe("ready"));
    expect([...scene.output]).toEqual([245, 235, 225, 128]);
    expect([...scene.source]).toEqual([10, 20, 30, 128]);
    expect(completed).toBe(false);
    act(() => scene.draw()); await captured;
    expect(completed).toBe(true);
    expect(view.getByText("editable original")).toBeTruthy();
  }, 15_000);
  it("rebuilds the real parent compositor when a late image Worker publishes newer pixels", async () => {
    render(mount());
    await act(async () => { await vi.dynamicImportSettled(); });
    await waitFor(() => expect(readStudioLiveAdjustmentStatus("adjustment")?.state).toBe("ready"));
    scene.source = new Uint8ClampedArray([100, 120, 140, 255]);
    const imageNode = { getParent: () => scene.node } as unknown as Konva.Node;
    expect(refreshStudioRasterPresentationCaches(imageNode)).toBe(true);
    expect([...scene.output]).toEqual([155, 135, 115, 255]);
    await waitForStudioRasterImagePresentations(snapshotStudioMountedRasterImagePresentations(), () => scene.draw());
  });
  it("keys a changed graph separately and ignores the old receipt during immediate export", async () => {
    const view = render(mount());
    await act(async () => { await vi.dynamicImportSettled(); });
    await waitFor(() => expect(readStudioLiveAdjustmentStatus("adjustment")?.state).toBe("ready"));
    const old = snapshotStudioMountedRasterImagePresentations()[0]!;
    view.rerender(mount({ ...adjustment(), opacity: 0 }, "opacity-zero"));
    const next = snapshotStudioMountedRasterImagePresentations()[0]!;
    expect(next.requestKey).not.toBe(old.requestKey);
    let completed = false;
    const fence = waitForStudioRasterImagePresentations([next], () => scene.draw()).then(() => { completed = true; });
    expect(completed).toBe(false);
    await act(async () => { await vi.dynamicImportSettled(); });
    await waitFor(() => expect(readStudioLiveAdjustmentStatus("adjustment")?.state).toBe("ready"));
    expect([...scene.output]).toEqual([...scene.source]);
    act(() => scene.draw()); await fence;
  });
  it("reports a cache failure, refuses export and retries on a new graph without accepting stale pixels", async () => {
    scene.cacheFailure = true;
    const view = render(mount());
    await act(async () => { await vi.dynamicImportSettled(); });
    await waitFor(() => expect(readStudioLiveAdjustmentStatus("adjustment")?.state).toBe("error"));
    const controller = new AbortController();
    const fence = waitForStudioRasterImagePresentations(snapshotStudioMountedRasterImagePresentations(), () => scene.draw(), controller.signal);
    controller.abort(new Error("capture cancelled"));
    await expect(fence).rejects.toThrow("capture cancelled");
    scene.cacheFailure = false;
    view.rerender(mount({ ...adjustment(), opacity: 0.5 }, "retry"));
    await act(async () => { await vi.dynamicImportSettled(); });
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
    await act(async () => { await vi.dynamicImportSettled(); });
    await waitFor(() => expect(readStudioLiveAdjustmentStatus("adjustment")?.state).toBe("ready"));
    expect([...scene.output]).toEqual([85, 85, 85, 191]);
    expect([...scene.source]).toEqual([128, 128, 128, 255]);
    await waitForStudioRasterImagePresentations(snapshotStudioMountedRasterImagePresentations(), () => scene.draw());
  });
  it("fails capture when a durable mask has not hydrated instead of applying an unmasked effect", async () => {
    const element = { ...adjustment(), filterMaskSurfaceId: "filter-mask:v1:10000000-0000-4000-8000-000000000001" };
    render(mount(element));
    await act(async () => { await vi.dynamicImportSettled(); });
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


describe("density-aware live adjustment captures", () => {
  it("bounds preview zoom independently from the artist's requested export density", async () => {
    render(<StudioLiveAdjustmentGroup element={adjustment()} cacheKey="zoomed" width={1} height={1} sourceIds={["source"]} pixelRatio={99} children={null} />);
    await act(async () => { await vi.dynamicImportSettled(); });
    await waitFor(() => expect(readStudioLiveAdjustmentStatus("adjustment")?.state).toBe("ready"));
    expect(scene.density).toBe(2);
    const restore = prepareStudioRasterCapture(scene.stage, 3);
    expect(scene.density).toBe(3);
    restore();
    expect(scene.density).toBe(2);
  });
  it("recomputes the actual filter at output density and restores preview pixels", async () => {
    render(mount());
    await act(async () => { await vi.dynamicImportSettled(); });
    await waitFor(() => expect(readStudioLiveAdjustmentStatus("adjustment")?.state).toBe("ready"));
    const restore = prepareStudioRasterCapture(scene.stage, 3);
    expect(scene.density).toBe(3);
    expect(scene.output).toHaveLength(36);
    expect([...scene.output.slice(0, 4)]).toEqual([245, 235, 225, 128]);
    restore();
    expect(scene.density).toBe(1);
    expect([...scene.output]).toEqual([245, 235, 225, 128]);
  });
  it("blocks an over-budget high-resolution capture and restores the usable preview", async () => {
    render(mount());
    await act(async () => { await vi.dynamicImportSettled(); });
    await waitFor(() => expect(readStudioLiveAdjustmentStatus("adjustment")?.state).toBe("ready"));
    expect(() => prepareStudioRasterCapture(scene.stage, 10000)).toThrow(/출력 배율/);
    expect(scene.density).toBe(1);
    expect([...scene.output]).toEqual([245, 235, 225, 128]);
  });
  it("does not retain capture owners after the adjustment unmounts", async () => {
    const view = render(mount());
    await act(async () => { await vi.dynamicImportSettled(); });
    view.unmount();
    const previous = scene.density;
    prepareStudioRasterCapture(scene.stage, 2)();
    expect(scene.density).toBe(previous);
  });
});
