// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { encodeStudioLosslessCanvasSource } from "./studio-lossless-canvas-source";

describe("original PNG encoding", () => {
  it("uses asynchronous PNG encoding once, never a lossy or resized intermediate", async () => {
    const toDataURL = vi.fn(() => "data:image/webp;base64,WRONG");
    const toBlob = vi.fn((callback: BlobCallback, mime?: string) => {
      expect(mime).toBe("image/png");
      callback(new Blob(["original-pixels"], { type: "image/png" }));
    });
    const source = await encodeStudioLosslessCanvasSource({ toBlob, toDataURL });
    expect(source).toBe(`data:image/png;base64,${btoa("original-pixels")}`);
    expect(toBlob).toHaveBeenCalledTimes(1);
    expect(toDataURL).not.toHaveBeenCalled();
  });

  it("supports canvas adapters that only expose lossless toDataURL", async () => {
    const toDataURL = vi.fn(() => "data:image/png;base64,ORIGINAL");
    await expect(encodeStudioLosslessCanvasSource({ toDataURL })).resolves.toBe("data:image/png;base64,ORIGINAL");
    expect(toDataURL).toHaveBeenCalledWith("image/png");
  });

  it.each([null, new Blob([], { type: "image/png" }), new Blob(["lossy"], { type: "image/webp" })])("rejects an empty or non-PNG result without replacing original pixels", async (blob) => {
    const toDataURL = vi.fn(() => "data:image/webp;base64,WRONG");
    const toBlob = (callback: BlobCallback) => callback(blob);
    await expect(encodeStudioLosslessCanvasSource({ toBlob, toDataURL })).rejects.toThrow("PNG");
    expect(toDataURL).not.toHaveBeenCalled();
  });

  it("cancels encoding and ignores a late browser callback", async () => {
    const controller = new AbortController();
    let late!: BlobCallback;
    const toDataURL = vi.fn();
    const pending = encodeStudioLosslessCanvasSource({
      toDataURL, toBlob: (callback) => { late = callback; },
    }, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    late(new Blob(["late"], { type: "image/png" }));
    expect(toDataURL).not.toHaveBeenCalled();
  });

  it("does no encoding when already cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const toDataURL = vi.fn();
    const toBlob = vi.fn();
    await expect(encodeStudioLosslessCanvasSource({ toDataURL, toBlob }, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(toDataURL).not.toHaveBeenCalled();
    expect(toBlob).not.toHaveBeenCalled();
  });

  it("rejects a failed FileReader constructor instead of leaving a pending import", async () => {
    vi.stubGlobal("FileReader", class { constructor() { throw new Error("unavailable"); } });
    try {
      await expect(encodeStudioLosslessCanvasSource({
        toDataURL: vi.fn(),
        toBlob: (callback) => callback(new Blob(["png"], { type: "image/png" })),
      })).rejects.toThrow("PNG 읽기");
    } finally { vi.unstubAllGlobals(); }
  });
});
