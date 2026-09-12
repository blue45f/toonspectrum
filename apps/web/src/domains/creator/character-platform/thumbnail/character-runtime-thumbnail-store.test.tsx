// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CharacterRuntimeThumbnailRecorder, clearCharacterRuntimeThumbnails, useCharacterRuntimeThumbnail } from "./character-runtime-thumbnail-store";

import type { CharacterShaperBinding } from "../../character-shaper/character-shaper-ui-contract";
import type { StudioVrmPoserHost } from "../../vrm/StudioVrmPoserHost";

const capture = vi.hoisted(() => ({
  read: vi.fn(), encode: vi.fn(), acquire: vi.fn(), releaseOperation: vi.fn(),
  lease: vi.fn(), release: vi.fn(), createUrl: vi.fn(), revokeUrl: vi.fn(),
}));
vi.mock("../../vrm/studio-vrm-raster-capture", () => ({
  captureStudioVrmRgba: capture.read,
  encodeStudioVrmCapturePngBlob: capture.encode,
}));

function host(overrides: StudioVrmPoserHost = {}): StudioVrmPoserHost {
  return {
    activeModelId: "model", status: "ready", avatarForgeState: { hair: { length: 0.5 } },
    captureRef: { current: { gl: {}, scene: {}, camera: {} } },
    acquireVrmCaptureOperation: capture.acquire,
    releaseVrmCaptureOperation: capture.releaseOperation,
    acquireVrmCaptureHelperLease: capture.lease,
    ...overrides,
  };
}
const binding = { recipe: { slots: { eyes: "eyes:round" } } } as unknown as CharacterShaperBinding;
function Preview() { return <output>{useCharacterRuntimeThumbnail("eyes:round") ?? "empty"}</output>; }
function fixture(h: StudioVrmPoserHost, value = binding) {
  return <><CharacterRuntimeThumbnailRecorder h={h} binding={value} /><Preview /></>;
}
async function settleCapture() { await act(async () => { await vi.advanceTimersByTimeAsync(180); }); }

beforeEach(() => {
  vi.useFakeTimers();
  capture.read.mockReset().mockReturnValue(new Uint8ClampedArray(4));
  capture.encode.mockReset().mockResolvedValue(new Blob(["png"]));
  capture.acquire.mockReset().mockReturnValue(true);
  capture.releaseOperation.mockReset();
  capture.lease.mockReset().mockReturnValue(capture.release);
  capture.release.mockReset();
  capture.createUrl.mockReset().mockReturnValue("blob:thumbnail");
  capture.revokeUrl.mockReset();
  vi.stubGlobal("URL", { createObjectURL: capture.createUrl, revokeObjectURL: capture.revokeUrl });
  clearCharacterRuntimeThumbnails();
});
afterEach(() => { cleanup(); clearCharacterRuntimeThumbnails(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("runtime character thumbnail lifecycle", () => {
  it("publishes the completed capture after StrictMode setup cleanup setup", async () => {
    render(<StrictMode>{fixture(host())}</StrictMode>);
    await settleCapture();
    expect(screen.getByRole("status").textContent).toBe("blob:thumbnail");
    expect(capture.encode).toHaveBeenCalledTimes(1);
    expect(capture.release).toHaveBeenCalledTimes(1);
  });

  it("restores helpers and releases capture authority before asynchronous PNG encoding", async () => {
    const pending = Promise.withResolvers<Blob>();
    capture.encode.mockReturnValue(pending.promise);
    render(fixture(host()));
    await settleCapture();
    expect(capture.acquire).toHaveBeenCalledWith("thumbnail");
    expect(capture.lease).toHaveBeenCalledWith({ subjectOnly: true });
    expect(capture.release).toHaveBeenCalledOnce();
    expect(capture.releaseOperation).toHaveBeenCalledWith("thumbnail");
    expect(capture.read.mock.invocationCallOrder[0]).toBeLessThan(capture.release.mock.invocationCallOrder[0]!);
    expect(capture.release.mock.invocationCallOrder[0]).toBeLessThan(capture.releaseOperation.mock.invocationCallOrder[0]!);
    expect(capture.releaseOperation.mock.invocationCallOrder[0]).toBeLessThan(capture.encode.mock.invocationCallOrder[0]!);
    expect(screen.getByRole("status").textContent).toBe("empty");
    await act(async () => { pending.resolve(new Blob(["ready"])); await pending.promise; });
    expect(screen.getByRole("status").textContent).toBe("blob:thumbnail");
  });

  it("never hides the export environment when a cooperative PNG already owns capture authority", async () => {
    capture.acquire.mockReturnValue(false);
    const h = host();
    const view = render(fixture(h));
    await settleCapture();
    expect(capture.lease).not.toHaveBeenCalled();
    expect(capture.read).not.toHaveBeenCalled();
    expect(capture.encode).not.toHaveBeenCalled();
    expect(capture.releaseOperation).not.toHaveBeenCalled();
    // Export state changes cause a new idle capture attempt, after its owner releases.
    view.rerender(fixture({ ...h, isCapturing: true }));
    capture.acquire.mockReturnValue(true);
    view.rerender(fixture(h));
    await settleCapture();
    expect(capture.read).toHaveBeenCalledOnce();
  });

  it.each(["readback", "helper acquisition", "helper restoration"])("releases shared authority if %s fails", async (failure) => {
    if (failure === "readback") capture.read.mockImplementation(() => { throw new Error("readback"); });
    if (failure === "helper acquisition") capture.lease.mockImplementation(() => { throw new Error("lease"); });
    if (failure === "helper restoration") capture.release.mockImplementation(() => { throw new Error("restore"); });
    render(fixture(host()));
    await settleCapture();
    expect(capture.releaseOperation).toHaveBeenCalledExactlyOnceWith("thumbnail");
    expect(capture.encode).not.toHaveBeenCalled();
    expect(capture.createUrl).not.toHaveBeenCalled();
    if (failure !== "helper acquisition") expect(capture.release).toHaveBeenCalledOnce();
  });

  it.each([
    { previewEntryId: "hair:audition" }, { compareActive: true }, { busyReason: "출력 중" },
  ])("hides the committed image and skips capture while a transient state is active: %j", async (transient) => {
    const h = host();
    const view = render(fixture(h));
    await settleCapture();
    view.rerender(fixture(h, { ...binding, ...transient }));
    expect(screen.getByRole("status").textContent).toBe("empty");
    await settleCapture();
    expect(capture.read).toHaveBeenCalledOnce();
    view.rerender(fixture(h));
    expect(screen.getByRole("status").textContent).toBe("blob:thumbnail");
  });

  it("invalidates a detailed appearance change even when the same preset remains selected", async () => {
    const h = host();
    const view = render(fixture(h));
    await settleCapture();
    capture.createUrl.mockReturnValue("blob:new-length");
    view.rerender(fixture({ ...h, avatarForgeState: { hair: { length: 0.8 } } }));
    expect(screen.getByRole("status").textContent).toBe("empty");
    await settleCapture();
    expect(screen.getByRole("status").textContent).toBe("blob:new-length");
    expect(capture.revokeUrl).toHaveBeenCalledWith("blob:thumbnail");
  });

  it("includes full pose and accessory state outside the recipe in appearance identity", async () => {
    const captureFullState = vi.fn().mockReturnValue({ fingerEdits: { leftIndex: 0.2 } });
    const h = host({ captureFullState });
    const view = render(fixture(h));
    await settleCapture();
    captureFullState.mockReturnValue({ fingerEdits: { leftIndex: 0.9 } });
    view.rerender(fixture({ ...h }));
    expect(screen.getByRole("status").textContent).toBe("empty");
    await settleCapture();
    expect(capture.read).toHaveBeenCalledTimes(2);
  });

  it("rejects an encode superseded by a new appearance before creating an object URL", async () => {
    const pending = Promise.withResolvers<Blob>();
    capture.encode.mockReturnValueOnce(pending.promise);
    const h = host();
    const view = render(fixture(h));
    await settleCapture();
    const signal = capture.encode.mock.calls[0]![2].signal as AbortSignal;
    view.rerender(fixture({ ...h, avatarForgeState: { hair: { length: 0.8 } } }));
    expect(signal.aborted).toBe(true);
    await act(async () => { pending.resolve(new Blob(["obsolete"])); await pending.promise; });
    expect(capture.createUrl).not.toHaveBeenCalled();
    await settleCapture();
    expect(capture.createUrl).toHaveBeenCalledOnce();
  });

  it("does not reuse a previous model instance's image after reloading the same model ID", async () => {
    const h = host({ vrm: {} });
    const view = render(fixture(h));
    await settleCapture();
    view.rerender(fixture({ ...h, vrm: {} }));
    expect(screen.getByRole("status").textContent).toBe("empty");
    await settleCapture();
    expect(capture.read).toHaveBeenCalledTimes(2);
  });

  it("rejects camera replacement inside the mutable capture ref during encoding", async () => {
    const pending = Promise.withResolvers<Blob>();
    capture.encode.mockReturnValueOnce(pending.promise);
    const h = host();
    render(fixture(h));
    await settleCapture();
    h.captureRef.current.camera = {};
    await act(async () => { pending.resolve(new Blob(["old-camera"])); await pending.promise; });
    expect(capture.createUrl).not.toHaveBeenCalled();
  });

  it.each([[16 / 9, 320, 180], [9 / 16, 180, 320]])("preserves a %s camera aspect within the thumbnail pixel budget", async (aspect, width, height) => {
    const camera = { isPerspectiveCamera: true, aspect };
    render(fixture(host({ captureRef: { current: { gl: {}, scene: {}, camera } } })));
    await settleCapture();
    expect(capture.read).toHaveBeenCalledWith(expect.anything(), expect.anything(), camera, { width, height }, { alpha: 0 });
    expect(capture.encode).toHaveBeenCalledWith(expect.any(Uint8ClampedArray), { width, height }, { signal: expect.any(AbortSignal) });
    expect(camera.aspect).toBe(aspect);
  });

  it("does not publish an encode that completes after a real unmount", async () => {
    const pending = Promise.withResolvers<Blob>();
    capture.encode.mockReturnValue(pending.promise);
    const view = render(<StrictMode>{fixture(host())}</StrictMode>);
    await settleCapture();
    view.unmount();
    expect(capture.encode.mock.calls[0]![2].signal.aborted).toBe(true);
    await act(async () => { pending.resolve(new Blob(["late"])); await pending.promise; });
    expect(capture.createUrl).not.toHaveBeenCalled();
    expect(capture.release).toHaveBeenCalledTimes(1);
  });
});
