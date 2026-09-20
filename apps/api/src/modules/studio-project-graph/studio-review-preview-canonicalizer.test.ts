import { createHash } from "node:crypto";
import { crc32, deflateSync } from "node:zlib";
import { Image, decodePng, encodePng } from "image-js";
import { describe, expect, it } from "vitest";
import { canonicalizeStudioReviewPreview, STUDIO_REVIEW_PREVIEW_MAX_BYTES } from "./studio-review-preview-canonicalizer";

const identity = `${"a".repeat(64)}:0`;
const pixels = new Uint8Array([10, 20, 30, 40, 255, 0, 127, 0]);
function png() { return Buffer.from(encodePng(new Image(2, 1, { data: pixels, colorModel: "RGBA" }))); }
function chunk(type: string, bytes: Uint8Array) {
  const output = Buffer.alloc(bytes.byteLength + 12);
  output.writeUInt32BE(bytes.byteLength, 0); output.write(type, 4); output.set(bytes, 8);
  output.writeUInt32BE(crc32(output.subarray(4, -4)), output.length - 4);
  return output;
}
function insert(source: Buffer, type: string, data: Uint8Array) {
  return Buffer.concat([source.subarray(0, 33), chunk(type, data), source.subarray(33)]);
}

describe("server-owned review PNG reconstruction", () => {
  it("really decodes and re-encodes identical dimensions, RGB values and straight alpha including transparent pixels", async () => {
    const source = png();
    const result = await canonicalizeStudioReviewPreview(source, identity);
    const decoded = decodePng(result.bytes);
    expect([result.width, result.height, decoded.width, decoded.height]).toEqual([2, 1, 2, 1]);
    expect([...decoded.getRawImage().data]).toEqual([...pixels]);
    expect(result.sha256).toBe(createHash("sha256").update(result.bytes).digest("hex"));
    expect(result.inputSha256).toBe(createHash("sha256").update(source).digest("hex"));
    expect(result.validator).toBe("server-srgb-png-reconstruction-v1");
    expect(source).toEqual(png());
  });

  it("strips untrusted ancillary payload while retaining repeated identical page pixels as distinct pinned ordinals", async () => {
    const source = insert(png(), "tEXt", Buffer.from("Comment\0untrusted-script-payload"));
    const first = await canonicalizeStudioReviewPreview(source, identity);
    const replay = await canonicalizeStudioReviewPreview(source, identity);
    const next = await canonicalizeStudioReviewPreview(source, `${"a".repeat(64)}:1`);
    expect(first.bytes.includes(Buffer.from("untrusted-script-payload"))).toBe(false);
    expect(first.bytes.equals(replay.bytes)).toBe(true);
    expect(first.sha256).not.toBe(next.sha256);
    expect([...decodePng(first.bytes).getRawImage().data]).toEqual([...decodePng(next.bytes).getRawImage().data]);
  });

  it("preserves an RGB-only canvas export without adding an alpha channel or changing sRGB samples", async () => {
    const samples = Uint8Array.from([0, 127, 255, 23, 45, 67]);
    const source = Buffer.from(encodePng(new Image(2, 1, { data: samples, colorModel: "RGB" })));
    const result = await canonicalizeStudioReviewPreview(insert(source, "sRGB", Uint8Array.of(0)), identity);
    const decoded = decodePng(result.bytes);
    expect([decoded.width, decoded.height, decoded.colorModel, decoded.channels, decoded.bitDepth]).toEqual([2, 1, "RGB", 3, 8]);
    expect([...decoded.getRawImage().data]).toEqual([...samples]);
  });

  it("rejects unsupported color profiles rather than silently changing appearance", async () => {
    for (const [type, data] of [["iCCP", Buffer.from("profile\0bytes")], ["gAMA", Buffer.from([0, 0, 0, 1])]] as const) {
      await expect(canonicalizeStudioReviewPreview(insert(png(), type, data), identity))
        .rejects.toMatchObject({ code: "preview-color-profile-unsupported" });
    }
  });

  it("rejects animation, corrupt CRC, and trailing content", async () => {
    await expect(canonicalizeStudioReviewPreview(insert(png(), "acTL", Buffer.alloc(8)), identity))
      .rejects.toMatchObject({ code: "preview-animation-unsupported" });
    const corrupt = png(); corrupt[32] ^= 1;
    await expect(canonicalizeStudioReviewPreview(corrupt, identity)).rejects.toMatchObject({ code: "preview-png-invalid" });
    await expect(canonicalizeStudioReviewPreview(Buffer.concat([png(), Buffer.from("appended executable")]), identity))
      .rejects.toMatchObject({ code: "preview-png-invalid" });
  });

  it("bounds encoded bytes and dimensions before decoding, without a downsample fallback", async () => {
    await expect(canonicalizeStudioReviewPreview(Buffer.alloc(STUDIO_REVIEW_PREVIEW_MAX_BYTES + 1), identity))
      .rejects.toMatchObject({ code: "preview-byte-budget-exceeded" });
    const source = png();
    const header = Buffer.from(source.subarray(16, 29)); header.writeUInt32BE(16_385, 0);
    const excessive = Buffer.concat([source.subarray(0, 8), chunk("IHDR", header), source.subarray(33)]);
    await expect(canonicalizeStudioReviewPreview(excessive, identity)).rejects.toMatchObject({ code: "preview-pixel-budget-exceeded" });
  });

  it("rejects an inflated IDAT bomb against the exact declared scanline budget", async () => {
    const source = png();
    const bomb = Buffer.concat([source.subarray(0, 33), chunk("IDAT", deflateSync(Buffer.alloc(1024 * 1024))), chunk("IEND", Buffer.alloc(0))]);
    await expect(canonicalizeStudioReviewPreview(bomb, identity)).rejects.toMatchObject({ code: "preview-png-invalid" });
  });

  it("actually terminates decoding on deadline and abort, and releases the bounded worker slot", async () => {
    await expect(canonicalizeStudioReviewPreview(png(), identity, { timeoutMs: 1 })).rejects.toMatchObject({ code: "preview-decode-timeout" });
    const abort = new AbortController();
    const pending = canonicalizeStudioReviewPreview(png(), identity, { signal: abort.signal });
    abort.abort();
    await expect(pending).rejects.toMatchObject({ code: "preview-cancelled" });
    await expect(canonicalizeStudioReviewPreview(png(), identity)).resolves.toMatchObject({ width: 2, height: 1 });
  });
});
