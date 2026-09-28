import { describe, expect, it } from "vitest";

import {
  STUDIO_VIRTUAL_CUSTOM_FURNITURE_MAX_BYTES,
  STUDIO_VIRTUAL_CUSTOM_FURNITURE_MAX_EDGE,
  STUDIO_VIRTUAL_CUSTOM_FURNITURE_NAME_MAX,
  admitStudioVirtualCustomFurniture,
  detectFurnitureMime,
  readPngDimensions,
  readWebpDimensions,
} from "./studio-virtual-custom-furniture-contract";

function png(width: number, height: number, size = 64): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

function webp(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(30);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(4, 22, true);
  bytes.set([0x57, 0x45, 0x42, 0x50], 8);
  bytes.set([0x56, 0x50, 0x38, 0x58], 12);
  view.setUint32(16, 10, true);
  bytes[24] = (width - 1) & 0xff;
  bytes[25] = ((width - 1) >> 8) & 0xff;
  bytes[26] = ((width - 1) >> 16) & 0xff;
  bytes[27] = (height - 1) & 0xff;
  bytes[28] = ((height - 1) >> 8) & 0xff;
  bytes[29] = ((height - 1) >> 16) & 0xff;
  return bytes;
}

const admit = (over: Partial<Parameters<typeof admitStudioVirtualCustomFurniture>[0]> = {}) =>
  admitStudioVirtualCustomFurniture({
    declaredMime: "image/png",
    name: "나무 의자",
    bytes: png(64, 64),
    ...over,
  });

describe("declared format", () => {
  it("refuses anything that is not PNG or WebP", () => {
    for (const mime of ["image/jpeg", "image/svg+xml", "application/pdf", "text/html", "", null, 7]) {
      expect(admit({ declaredMime: mime })).toMatchObject({ ok: false, reason: "mime" });
    }
  });
});

describe("name", () => {
  it("keeps a short readable name", () => {
    expect(admit()).toEqual({ ok: true, mime: "image/png", name: "나무 의자" });
  });

  it("refuses an empty or whitespace only name", () => {
    expect(admit({ name: "   " })).toMatchObject({ ok: false, reason: "name" });
    expect(admit({ name: "" })).toMatchObject({ ok: false, reason: "name" });
  });

  it("strips control characters so a name cannot forge log lines", () => {
    const result = admit({ name: "의자\u001b[31m\u0007" });

    expect(result.ok && result.name).toBe("의자 [31m");
  });

  it("truncates a very long name to the stored limit", () => {
    const result = admit({ name: "가".repeat(200) });

    expect(result.ok && [...result.name]).toHaveLength(STUDIO_VIRTUAL_CUSTOM_FURNITURE_NAME_MAX);
  });
});

describe("byte size", () => {
  it("refuses an empty file", () => {
    expect(admit({ bytes: new Uint8Array(0) })).toMatchObject({ ok: false });
  });

  it("refuses a file over the cap even when the image is tiny", () => {
    const huge = png(8, 8, STUDIO_VIRTUAL_CUSTOM_FURNITURE_MAX_BYTES + 1);

    expect(admit({ bytes: huge })).toMatchObject({ ok: false, reason: "bytes" });
  });
});

describe("signature is the truth, not the client", () => {
  it("refuses a file whose bytes are not an image at all", () => {
    const notImage = new Uint8Array(64).fill(0x41);

    expect(admit({ bytes: notImage })).toMatchObject({ ok: false, reason: "signature" });
  });

  it("refuses a WebP file that was declared as PNG", () => {
    expect(admit({ declaredMime: "image/png", bytes: webp(32, 32) })).toMatchObject({
      ok: false,
      reason: "signature",
    });
  });

  it("refuses a PNG file that was declared as WebP", () => {
    expect(admit({ declaredMime: "image/webp", bytes: png(32, 32) })).toMatchObject({
      ok: false,
      reason: "signature",
    });
  });

  it("detects both supported formats from bytes alone", () => {
    expect(detectFurnitureMime(png(8, 8))).toBe("image/png");
    expect(detectFurnitureMime(webp(8, 8))).toBe("image/webp");
    expect(detectFurnitureMime(new Uint8Array(8))).toBeNull();
  });
});

describe("dimensions", () => {
  it("accepts a WebP declared correctly", () => {
    expect(admit({ declaredMime: "image/webp", bytes: webp(64, 64) })).toMatchObject({
      ok: true,
      mime: "image/webp",
    });
  });

  it("refuses an image wider than the edge cap", () => {
    const wide = png(STUDIO_VIRTUAL_CUSTOM_FURNITURE_MAX_EDGE + 1, 32);

    expect(admit({ bytes: wide })).toMatchObject({ ok: false, reason: "dimensions" });
  });

  it("refuses an image taller than the edge cap", () => {
    const tall = webp(32, STUDIO_VIRTUAL_CUSTOM_FURNITURE_MAX_EDGE + 1);

    expect(admit({ declaredMime: "image/webp", bytes: tall })).toMatchObject({
      ok: false,
      reason: "dimensions",
    });
  });

  it("accepts the edge cap itself", () => {
    expect(admit({ bytes: png(STUDIO_VIRTUAL_CUSTOM_FURNITURE_MAX_EDGE, 8) })).toMatchObject({ ok: true });
  });

  it("reads back the dimensions it admitted", () => {
    expect(readPngDimensions(png(120, 80))).toEqual({ width: 120, height: 80 });
    expect(readWebpDimensions(webp(120, 80))).toEqual({ width: 120, height: 80 });
  });
});
