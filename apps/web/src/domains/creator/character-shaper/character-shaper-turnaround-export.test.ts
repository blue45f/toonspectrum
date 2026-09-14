import { Box3, PerspectiveCamera, Scene, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";

import { resolveStudioBg3dShotContactSheetLayout } from "../bg3d/studio-bg3d-shot-contact-sheet-contract";

import { exportCharacterTurnaround } from "./character-shaper-turnaround-export";

import type { CharacterTurnaroundDependencies, CharacterTurnaroundExportInput } from "./character-shaper-turnaround-export";
import type { StudioBg3dShotContactSheetImage } from "../bg3d/studio-bg3d-shot-contact-sheet-contract";
import type { StudioBg3dShotContactSheetWorkerOptions } from "../bg3d/studio-bg3d-shot-contact-sheet-worker-client";
import type { WebGLRenderer } from "three";

function fixture(count: 4 | 8 = 4) {
  const controller = new AbortController();
  const camera = new PerspectiveCamera();
  camera.position.set(0, 1, 3);
  camera.lookAt(0, 1, 0);
  const input: CharacterTurnaroundExportInput = {
    camera, scene: new Scene(), gl: {} as WebGLRenderer, count,
    signal: controller.signal, assertCurrent: vi.fn(), onCaptured: vi.fn(), onProgress: vi.fn(),
  };
  const bounds = new Box3(new Vector3(-0.5, 0, -0.2), new Vector3(0.5, 2, 0.2));
  const measure = vi.fn(async () => bounds);
  const capture = vi.fn(async () => new Uint8ClampedArray(4));
  const encode = vi.fn(async () => new Blob(["pixels"], { type: "image/png" }));
  const assemble = vi.fn(async (images: readonly StudioBg3dShotContactSheetImage[], options: StudioBg3dShotContactSheetWorkerOptions = {}) => {
    const layout = resolveStudioBg3dShotContactSheetLayout(images.length, options.layout);
    return { layout, sheets: [{ sheetNumber: 1, fileName: "sheet.png", width: layout.sheetWidth,
      height: layout.sheetHeight, shotIds: images.map((image) => image.shotId), png: new Blob(["sheet"], { type: "image/png" }) }] };
  });
  const dependencies: CharacterTurnaroundDependencies = { measure, capture, encode, assemble };
  return { input, controller, dependencies, measure, capture, encode, assemble };
}

describe("character turnaround transaction", () => {
  it.each([4, 8] as const)("renders %s views sequentially and assembles one labelled sheet", async (count) => {
    const f = fixture(count);
    const position = f.input.camera.position.clone();
    const result = await exportCharacterTurnaround(f.input, f.dependencies);
    expect(f.capture).toHaveBeenCalledTimes(count);
    expect(f.encode).toHaveBeenCalledTimes(count);
    expect(f.assemble).toHaveBeenCalledTimes(1);
    expect(f.input.onCaptured).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ width: count === 4 ? 1600 : 3168, height: 2192, count });
    expect(result.width * result.height).toBeLessThan(8_000_000);
    const images = f.assemble.mock.calls[0]![0];
    expect(images.map((image) => image.shotId)).toEqual(Array.from({ length: count }, (_, index) => `angle-${index * 360 / count}`));
    expect(images.every((image) => image.width === 768 && image.height === 1024)).toBe(true);
    expect(f.input.camera.position.equals(position)).toBe(true);
    for (let index = 1; index < count; index += 1) {
      expect(f.capture.mock.invocationCallOrder[index]).toBeGreaterThan(f.encode.mock.invocationCallOrder[index - 1]!);
    }
  });
  it("cancels after capture without encoding or emitting a partial sheet", async () => {
    const f = fixture(8);
    f.capture.mockImplementationOnce(async () => { f.controller.abort(); return new Uint8ClampedArray(4); });
    await expect(exportCharacterTurnaround(f.input, f.dependencies)).rejects.toMatchObject({ name: "AbortError" });
    expect(f.capture).toHaveBeenCalledTimes(1);
    expect(f.encode).not.toHaveBeenCalled();
    expect(f.assemble).not.toHaveBeenCalled();
  });
  it("rejects changed scene authority after encoding", async () => {
    const f = fixture();
    f.encode.mockImplementationOnce(async () => {
      vi.mocked(f.input.assertCurrent).mockImplementation(() => { throw new Error("stale scene"); });
      return new Blob(["pixels"]);
    });
    await expect(exportCharacterTurnaround(f.input, f.dependencies)).rejects.toThrow("stale scene");
    expect(f.assemble).not.toHaveBeenCalled();
  });
  it("propagates failed captures and never assembles an incomplete set", async () => {
    const f = fixture();
    f.capture.mockResolvedValueOnce(new Uint8ClampedArray(4)).mockRejectedValueOnce(new Error("context lost"));
    await expect(exportCharacterTurnaround(f.input, f.dependencies)).rejects.toThrow("context lost");
    expect(f.capture).toHaveBeenCalledTimes(2);
    expect(f.assemble).not.toHaveBeenCalled();
    expect(f.input.onCaptured).not.toHaveBeenCalled();
  });
  it("enforces retained PNG memory before worker composition", async () => {
    const f = fixture();
    const oversized = new Blob(["large"]);
    Object.defineProperty(oversized, "size", { value: 41 * 1024 * 1024 });
    f.encode.mockResolvedValueOnce(oversized);
    await expect(exportCharacterTurnaround(f.input, f.dependencies)).rejects.toThrow("메모리 예산");
    expect(f.assemble).not.toHaveBeenCalled();
  });
  it("reports worker failure after restoring helpers", async () => {
    const f = fixture();
    f.assemble.mockRejectedValueOnce(new Error("worker failed"));
    await expect(exportCharacterTurnaround(f.input, f.dependencies)).rejects.toThrow("worker failed");
    expect(f.input.onCaptured).toHaveBeenCalledTimes(1);
  });
  it("rejects pre-aborted requests before touching the scene", async () => {
    const f = fixture();
    f.controller.abort();
    await expect(exportCharacterTurnaround(f.input, f.dependencies)).rejects.toMatchObject({ name: "AbortError" });
    expect(f.measure).not.toHaveBeenCalled();
  });
});
