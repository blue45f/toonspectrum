// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CharacterRuntimeThumbnailRecorder, clearCharacterRuntimeThumbnails, useCharacterRuntimeThumbnail } from "./character-runtime-thumbnail-store";

import type { CharacterShaperBinding } from "../../character-shaper/character-shaper-ui-contract";
import type { StudioVrmPoserHost } from "../../vrm/StudioVrmPoserHost";

const capture = vi.hoisted(() => ({ encode: vi.fn(), release: vi.fn(), createUrl: vi.fn(), revokeUrl: vi.fn() }));
vi.mock("../../vrm/studio-vrm-raster-capture", () => ({
  captureStudioVrmRgba: () => new Uint8Array(4),
  encodeStudioVrmCapturePngBlob: capture.encode,
}));
const h = { activeModelId: "model", status: "ready", captureRef: { current: { gl: {}, scene: {}, camera: {} } }, acquireVrmCaptureHelperLease: () => capture.release } as unknown as StudioVrmPoserHost;
const binding = { recipe: { slots: { eyes: "eyes:round" } } } as unknown as CharacterShaperBinding;
function Preview() { return <output>{useCharacterRuntimeThumbnail("eyes:round") ?? "empty"}</output>; }

beforeEach(() => {
  vi.useFakeTimers();
  capture.encode.mockReset().mockResolvedValue(new Blob(["png"]));
  capture.release.mockReset();
  capture.createUrl.mockReset().mockReturnValue("blob:thumbnail");
  capture.revokeUrl.mockReset();
  vi.stubGlobal("URL", { createObjectURL: capture.createUrl, revokeObjectURL: capture.revokeUrl });
  clearCharacterRuntimeThumbnails();
});
afterEach(() => { cleanup(); clearCharacterRuntimeThumbnails(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("runtime character thumbnail lifecycle", () => {
  it("publishes the completed capture after StrictMode setup cleanup setup", async () => {
    render(<StrictMode><CharacterRuntimeThumbnailRecorder h={h} binding={binding} /><Preview /></StrictMode>);
    await act(async () => { await vi.advanceTimersByTimeAsync(180); });
    expect(screen.getByRole("status").textContent).toBe("blob:thumbnail");
    expect(capture.encode).toHaveBeenCalledTimes(1);
    expect(capture.release).toHaveBeenCalledTimes(1);
  });

  it("does not publish an encode that completes after a real unmount", async () => {
    const pending = Promise.withResolvers<Blob>();
    capture.encode.mockReturnValue(pending.promise);
    const view = render(<StrictMode><CharacterRuntimeThumbnailRecorder h={h} binding={binding} /><Preview /></StrictMode>);
    await act(async () => { await vi.advanceTimersByTimeAsync(180); });
    view.unmount();
    await act(async () => { pending.resolve(new Blob(["late"])); await pending.promise; });
    expect(capture.createUrl).not.toHaveBeenCalled();
    expect(capture.release).toHaveBeenCalledTimes(1);
  });
});
