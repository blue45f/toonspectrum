import { crc32 } from "node:zlib";

import { describe, expect, it } from "vitest";

import { createStudioBg3dTextureFixture } from "../../../../../../scripts/lib/studio-bg3d-texture-fixture";

import { preflightStudioBg3dBabylonTextures } from "./studio-bg3d-babylon-texture-preflight";

function material(root: Record<string, unknown>) {
  return (root.materials as Record<string, unknown>[])[0]!;
}
function imageView(root: Record<string, unknown>) {
  return (root.bufferViews as Record<string, unknown>[])[4]!;
}
function inspect(options: Parameters<typeof createStudioBg3dTextureFixture>[0] = {}) {
  const { bytes, root } = createStudioBg3dTextureFixture(options);
  return preflightStudioBg3dBabylonTextures(bytes, root);
}

describe("Babylon embedded PNG texture admission", () => {
  it.each([true, false])("admits real sRGB RGBA PNG bytes with unlit=%s and accounts for decoded allocation", (unlit) => {
    expect(inspect({ unlit })).toEqual({ textureBytes: 256, textureInstances: 1, maxDimension: 4,
      bindings: [{ pointer: `/materials/0/${unlit ? "" : "pbrMetallicRoughness/"}baseColorTexture`, width: 4, height: 4, mipLevels: 1, maxInstances: 1 }] });
  });
  it.each([9728, 9729, 9984, 9985, 9986, 9987])("budgets sampler minification %i including non-square mips", (minFilter) => {
    const plan = inspect({ width: 8, height: 4, minFilter });
    const mips = minFilter === 9728 || minFilter === 9729 ? 1 : 4;
    expect(plan.bindings[0]?.mipLevels).toBe(mips);
    expect(plan.textureBytes).toBe((mips === 1 ? 32 : 32 + 8 + 2 + 1) * 16);
  });
  it("counts loader texture instances when multiple materials reuse an encoded image", () => {
    const plan = inspect({ mutate(root) {
      const materials = root.materials as Record<string, unknown>[];
      materials.push(structuredClone(materials[0]!));
      const primitives = (root.meshes as { primitives: Record<string, unknown>[] }[])[0]!.primitives;
      primitives.push({ ...primitives[0], material: 1 });
    } });
    expect(plan.textureInstances).toBe(2);
    expect(plan.textureBytes).toBe(512);
    expect(plan.bindings.map((binding) => binding.pointer)).toEqual(["/materials/0/baseColorTexture", "/materials/1/baseColorTexture"]);
  });
  it.each([
    ["external image", (root: Record<string, unknown>) => { (root.images as Record<string, unknown>[])[0]!.uri = "https://example.invalid/a.png"; }],
    ["view outside BIN", (root: Record<string, unknown>) => { imageView(root).byteOffset = 1_000_000; }],
    ["integer overflow", (root: Record<string, unknown>) => { imageView(root).byteOffset = Number.MAX_SAFE_INTEGER; }],
    ["fractional view", (root: Record<string, unknown>) => { imageView(root).byteLength = 1.5; }],
    ["foreign buffer", (root: Record<string, unknown>) => { imageView(root).buffer = 1; }],
    ["invalid source", (root: Record<string, unknown>) => { (root.textures as Record<string, unknown>[])[0]!.source = 10; }],
    ["invalid sampler", (root: Record<string, unknown>) => { (root.samplers as Record<string, unknown>[])[0]!.wrapS = 0; }],
  ] as const)("rejects %s before image decoding", (_label, mutate) => {
    expect(() => inspect({ mutate })).toThrow(expect.objectContaining({ code: "unsafe-glb" }));
  });
  it.each(["MASK", "BLEND"])("keeps %s alpha unsupported so IDs cannot disagree with beauty", (alphaMode) => {
    expect(() => inspect({ mutate(root) { material(root).alphaMode = alphaMode; } }))
      .toThrow(expect.objectContaining({ code: "unsupported-scene-feature" }));
  });
  it.each([
    ["JPEG", (root: Record<string, unknown>) => { (root.images as Record<string, unknown>[])[0]!.mimeType = "image/jpeg"; }],
    ["UV1", (root: Record<string, unknown>) => { (material(root).pbrMetallicRoughness as Record<string, unknown>).baseColorTexture = { index: 0, texCoord: 1 }; }],
    ["normal map", (root: Record<string, unknown>) => { material(root).normalTexture = { index: 0 }; }],
    ["animation", (root: Record<string, unknown>) => { root.animations = [{}]; }],
    ["texture transform", (root: Record<string, unknown>) => { root.extensionsUsed = ["KHR_texture_transform"]; }],
  ] as const)("keeps %s explicitly unsupported", (_label, mutate) => {
    expect(() => inspect({ mutate })).toThrow(expect.objectContaining({ code: "unsupported-scene-feature" }));
  });
  it("rejects corrupt PNG CRC and oversized declared pixels without allocating the decoded image", () => {
    expect(() => inspect({ mutate(_root, png) { png[20] = png[20]! ^ 1; } }))
      .toThrow(expect.objectContaining({ code: "unsafe-glb" }));
    expect(() => inspect({ mutate(_root, png) {
      const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
      view.setUint32(16, 1_000_000);
      view.setUint32(29, crc32(png.subarray(12, 29)));
    } })).toThrow(expect.objectContaining({ code: "resource-budget-exceeded" }));
  });
  it("rejects a PNG view that crosses into legal GLB BIN padding", () => {
    expect(() => inspect({ mutate(root) { imageView(root).byteLength = Number(imageView(root).byteLength) + 1; } }))
      .toThrow(expect.objectContaining({ code: "unsafe-glb" }));
  });
});
