import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

const gltfFunctionsPackagePath = join(
  process.cwd(),
  "node_modules",
  "@gltf-transform",
  "functions",
  "package.json",
);
const gltfFunctionsRequire = createRequire(gltfFunctionsPackagePath);
const ndarrayPixelsEntry = gltfFunctionsRequire.resolve("ndarray-pixels");
const ndarrayPixelsRequire = createRequire(ndarrayPixelsEntry);
const ndarray = ndarrayPixelsRequire("ndarray");
const sharpEntry = ndarrayPixelsRequire.resolve("sharp");
const sharpPackage = JSON.parse(
  readFileSync(join(dirname(sharpEntry), "..", "package.json"), "utf8"),
);
const { getPixels, savePixels } = await import(
  pathToFileURL(ndarrayPixelsEntry).href
);

function createRgbaFixture() {
  const width = 3;
  const height = 2;
  const data = new Uint8Array([
    255, 0, 0, 255,
    0, 255, 0, 128,
    0, 0, 255, 0,
    12, 34, 56, 255,
    78, 90, 123, 192,
    210, 180, 140, 64,
  ]);
  return {
    data,
    height,
    pixels: ndarray(
      data,
      [width, height, 4],
      [4, 4 * width, 1],
      0,
    ),
    width,
  };
}

function readRgba(pixels) {
  const [width, height] = pixels.shape;
  const values = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      for (let channel = 0; channel < 4; channel += 1) {
        values.push(pixels.get(x, y, channel));
      }
    }
  }
  return values;
}

describe("ndarray-pixels with the security-patched sharp runtime", () => {
  it("resolves the reviewed sharp version through the real glTF dependency path", () => {
    expect(sharpPackage.version).toBe("0.35.2");
  });

  it("round-trips odd-width RGBA pixels through lossless PNG", async () => {
    const fixture = createRgbaFixture();
    const encoded = await savePixels(fixture.pixels, {
      type: "image/png",
      quality: 1,
    });
    const decoded = await getPixels(encoded, "image/png");

    expect(encoded.byteLength).toBeGreaterThan(40);
    expect(decoded.shape).toEqual([fixture.width, fixture.height, 4]);
    expect(readRgba(decoded)).toEqual([...fixture.data]);
  });

  it.each(["image/jpeg", "image/webp"])(
    "encodes and decodes %s using the narrow API consumed by glTF Transform",
    async (type) => {
      const fixture = createRgbaFixture();
      const encoded = await savePixels(fixture.pixels, {
        type,
        quality: 0.85,
      });
      const decoded = await getPixels(encoded, type);

      expect(encoded.byteLength).toBeGreaterThan(20);
      expect(decoded.shape).toEqual([fixture.width, fixture.height, 4]);
    },
  );

  it("rejects malformed image bytes instead of returning partial pixels", async () => {
    await expect(
      getPixels(new Uint8Array([0, 1, 2, 3]), "image/png"),
    ).rejects.toThrow();
  });
});
