import { describe, expect, it } from "vitest";
import {
  inspectSpecialistGlbImages,
  inspectSpecialistImage,
  SPECIALIST_IMAGE_LIMITS,
} from "./specialist-image-budget";
import { preflightSpecialistGlb } from "./specialist-gltf";

function png(width: number, height: number) {
  const bytes = new Uint8Array(57);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set(new TextEncoder().encode("IHDR"), 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes[24] = 8;
  bytes[25] = 6;
  bytes.set(new TextEncoder().encode("IDAT"), 37);
  bytes.set(new TextEncoder().encode("IEND"), 49);
  return bytes;
}
function glb(images: Uint8Array[]) {
  let offset = 0;
  const ranges = images.map((bytes) => {
    const range = { buffer: 0, byteOffset: offset, byteLength: bytes.length };
    offset += Math.ceil(bytes.length / 4) * 4;
    return range;
  });
  const json = {
    asset: { version: "2.0" },
    buffers: [{ byteLength: offset }],
    bufferViews: ranges,
    images: images.map((_, i) => ({ mimeType: "image/png", bufferView: i })),
  };
  const raw = new TextEncoder().encode(JSON.stringify(json));
  const size = Math.ceil(raw.length / 4) * 4;
  const bytes = new Uint8Array(28 + size + offset);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.length, true);
  view.setUint32(12, size, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.fill(32, 20, 20 + size);
  bytes.set(raw, 20);
  view.setUint32(20 + size, offset, true);
  view.setUint32(24 + size, 0x004e4942, true);
  images.forEach((image, i) =>
    bytes.set(image, 28 + size + ranges[i]!.byteOffset),
  );
  return bytes;
}
describe("decoder-free specialist texture memory fence", () => {
  it("admits bounded embedded textures without decoding", () => {
    expect(inspectSpecialistImage(png(128, 256), "image/png")).toMatchObject({
      width: 128,
      height: 256,
      decodedBytes: 128 * 256 * 4,
    });
    expect(inspectSpecialistGlbImages(glb([png(128, 256)]))).toHaveLength(1);
  });
  it("rejects a tiny encoded file declaring an explosive image before GLTFLoader can run", () => {
    const source = glb([png(65535, 65535)]);
    expect(source.length).toBeLessThan(1024);
    expect(() => preflightSpecialistGlb(source)).toThrow(/Texture dimensions/);
    expect(() => inspectSpecialistGlbImages(source)).toThrow(
      /Texture dimensions/,
    );
  });
  it("accounts for aggregate texture bytes, including duplicated entries", () => {
    expect(() =>
      inspectSpecialistGlbImages(glb([png(4096, 4096), png(1, 1)])),
    ).toThrow(/combined/);
    expect(SPECIALIST_IMAGE_LIMITS.totalRgbaBytes).toBe(64 * 1024 * 1024);
  });
  it("rejects unsupported formats and truncated/missing texture metadata", () => {
    expect(() =>
      inspectSpecialistImage(new Uint8Array(64), "image/png"),
    ).toThrow();
    expect(() =>
      inspectSpecialistImage(new Uint8Array(64), "image/svg+xml"),
    ).toThrow();
    expect(() => inspectSpecialistGlbImages(new Uint8Array(2))).toThrow();
  });
});
