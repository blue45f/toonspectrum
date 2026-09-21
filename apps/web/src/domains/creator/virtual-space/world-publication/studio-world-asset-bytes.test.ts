import { createHash, webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STUDIO_WORLD_ASSET_FILE_MAX_BYTES, STUDIO_WORLD_ASSET_TOTAL_MAX_BYTES } from "@toonspectrum/studio-project-model/world-publication";
import { readStudioWorldAssetBytes } from "./studio-world-asset-bytes";

beforeEach(() => vi.stubGlobal("crypto", webcrypto)); afterEach(() => vi.unstubAllGlobals());
const bytes = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jMxkAAAAASUVORK5CYII="), (value) => value.charCodeAt(0));
const pin = { url: "/image.webp", sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length, mediaType: "image/png" as const };
function response(body = bytes, type = "image/png") { return new Response(body, { headers: { "content-type": type } }); }
describe("bounded world image admission", () => {
  it("hashes actual bytes and counts shared decoded-stream bytes before decoding", async () => {
    const budget = { bytes: 0 }, result = await readStudioWorldAssetBytes(response(), new AbortController().signal, budget, pin);
    expect(result.sha256).toBe(pin.sha256); expect(result.blob.size).toBe(bytes.length); expect(budget.bytes).toBe(bytes.length);
  });
  it.each(["text/html", "image/svg+xml", "image/gif", "application/json"])("rejects unexpected content type %s", async (type) => {
    await expect(readStudioWorldAssetBytes(response(bytes, type), new AbortController().signal, { bytes: 0 })).rejects.toThrow("Unsupported");
  });
  it("rejects status failure, truncated and changed bytes", async () => {
    const signal = new AbortController().signal;
    await expect(readStudioWorldAssetBytes(new Response(bytes, { status: 403 }), signal, { bytes: 0 }, pin)).rejects.toThrow();
    await expect(readStudioWorldAssetBytes(response(bytes.slice(1)), signal, { bytes: 0 }, pin)).rejects.toThrow("size");
    await expect(readStudioWorldAssetBytes(response(bytes.map((value, index) => index === 0 ? value + 1 : value)), signal, { bytes: 0 }, pin)).rejects.toThrow("changed");
  });
  it("rejects oversized decoded images and aggregate pixel pressure before decoder allocation", async () => {
    const huge = bytes.slice(), view = new DataView(huge.buffer); view.setUint32(16, 16384); view.setUint32(20, 16384);
    await expect(readStudioWorldAssetBytes(response(huge), new AbortController().signal, { bytes: 0 })).rejects.toThrow("pixel budget");
    await expect(readStudioWorldAssetBytes(response(), new AbortController().signal, { bytes: 0, pixels: 67_108_864 })).rejects.toThrow("pixel budget");
  });
  it("rejects an excessive advertised response before reading its body", async () => {
    const body = new ReadableStream({ start(controller) { controller.close(); } });
    const value = new Response(body, { headers: { "content-type": "image/webp", "content-length": String(STUDIO_WORLD_ASSET_FILE_MAX_BYTES + 1) } });
    await expect(readStudioWorldAssetBytes(value, new AbortController().signal, { bytes: 0 })).rejects.toThrow("budget");
  });
  it("enforces shared aggregate budget even when Content-Length is absent", async () => {
    await expect(readStudioWorldAssetBytes(response(), new AbortController().signal, { bytes: STUDIO_WORLD_ASSET_TOTAL_MAX_BYTES - 1 })).rejects.toThrow("budget");
  });
  it("cancels pending streams and rejects an already-cancelled operation", async () => {
    const cancel = vi.fn(), abort = new AbortController();
    const pending = new Response(new ReadableStream({ cancel }), { headers: { "content-type": "image/webp" } });
    const promise = readStudioWorldAssetBytes(pending, abort.signal, { bytes: 0 });
    abort.abort(); await expect(promise).rejects.toMatchObject({ name: "AbortError" }); expect(cancel).toHaveBeenCalled();
    await expect(readStudioWorldAssetBytes(response(), abort.signal, { bytes: 0 })).rejects.toMatchObject({ name: "AbortError" });
  });
});
