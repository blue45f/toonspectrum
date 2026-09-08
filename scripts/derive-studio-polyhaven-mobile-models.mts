import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

import { DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES, validateStudioBg3dGlb } from "../apps/web/src/domains/creator/bg3d/studio-bg3d-glb-validation";

const stage = path.resolve(process.argv[2] ?? "artifacts/studio-asset-expansion/pbr-20260908");
const manifest = JSON.parse(await readFile(path.join(stage, "manifest.json"), "utf8"));
const ids = ["polyhaven-cassette-player", "polyhaven-brass-goblets", "polyhaven-korean-fire-extinguisher-01"];
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const admit = (bytes: Buffer) => validateStudioBg3dGlb(new Uint8Array(bytes), {
  declared: { byteSize: bytes.length, sha256: `sha256:${hash(bytes)}` },
  cumulative: { usedBytes: 0, maximumBytes: 64 * 1024 * 1024 }, profile: "mobile", budgets: DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES,
  digest: async (input) => hash(input),
});
const summarize = (admission: Awaited<ReturnType<typeof admit>>) => Object.fromEntries(Object.entries(admission).filter(([key, value]) => key === "metrics" || ["string", "boolean", "number"].includes(typeof value)));
function pack(json: Record<string, unknown>, binary: Buffer): Buffer {
  const jsonRaw = Buffer.from(JSON.stringify(json));
  const jsonChunk = Buffer.concat([jsonRaw, Buffer.alloc((4 - jsonRaw.length % 4) % 4, 0x20)]);
  const binChunk = Buffer.concat([binary, Buffer.alloc((4 - binary.length % 4) % 4)]);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + jsonChunk.length + binChunk.length, 8);
  header.writeUInt32LE(jsonChunk.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binChunk.length, 0); binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonChunk, binHeader, binChunk]);
}
const browser = await chromium.launch({ channel: "chrome", headless: true });
const derived = [];
try {
  const page = await browser.newPage();
  for (const id of ids) {
    const entry = manifest.assets.find((asset: { id: string }) => asset.id === id);
    assert(entry?.kind === "model");
    const original = await readFile(path.join(stage, entry.path));
    assert.equal(hash(original), entry.sha256);
    const jsonLength = original.readUInt32LE(12);
    const json = JSON.parse(original.subarray(20, 20 + jsonLength).toString("utf8"));
    const originalBinary = original.subarray(28 + jsonLength);
    let binary = originalBinary;
    const geometry = JSON.stringify({ nodes: json.nodes, meshes: json.meshes, accessors: json.accessors, skins: json.skins, animations: json.animations });
    const originalImageCount = json.images.length;
    const imageBytes: Buffer[] = json.images.map((image: { bufferView: number }) => {
      const view = json.bufferViews[image.bufferView];
      return binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    });
    const metadata = await page.evaluate(async (images) => {
      const results = [];
      for (const src of images) {
        const image = new Image(); image.src = src; await image.decode();
        results.push({ width: image.width, height: image.height });
      }
      return results;
    }, imageBytes.map((bytes, index) => `data:${json.images[index].mimeType};base64,${bytes.toString("base64")}`));
    const beforeDecodedBytes = metadata.reduce((total, image) => total + image.width * image.height * 4, 0);
    const uniqueImages = [];
    const uniqueBytes: Buffer[] = [];
    const uniqueMetadata: { width: number; height: number }[] = [];
    const imageByHash = new Map<string, number>();
    const imageRemap: number[] = [];
    for (let index = 0; index < json.images.length; index += 1) {
      const key = `${json.images[index].mimeType}:${hash(imageBytes[index])}`;
      let mapped = imageByHash.get(key);
      if (mapped === undefined) {
        mapped = uniqueImages.length; imageByHash.set(key, mapped);
        uniqueImages.push(json.images[index]); uniqueBytes.push(imageBytes[index]); uniqueMetadata.push(metadata[index]);
      }
      imageRemap.push(mapped);
    }
    json.images = uniqueImages;
    const uniqueTextures = [];
    const textureKeys = new Map<string, number>();
    const textureRemap: number[] = [];
    for (const texture of json.textures) {
      const mappedTexture = { ...texture, source: imageRemap[texture.source] };
      const key = JSON.stringify(mappedTexture);
      let mapped = textureKeys.get(key);
      if (mapped === undefined) { mapped = uniqueTextures.length; textureKeys.set(key, mapped); uniqueTextures.push(mappedTexture); }
      textureRemap.push(mapped);
    }
    json.textures = uniqueTextures;
    for (const material of json.materials) {
      for (const holder of [material, material.pbrMetallicRoughness]) {
        for (const [key, value] of Object.entries(holder ?? {})) {
          if (key.endsWith("Texture") && value && typeof value === "object" && "index" in value) value.index = textureRemap[value.index as number];
        }
      }
    }
    const materialParameters = JSON.stringify(json.materials);
    const operations: Record<string, unknown>[] = [];
    let output = pack(json, binary);
    const beforeAdmission = await admit(original);
    let admission = await admit(output);
    const baseColorImages = new Set<number>(json.materials.map((material: { pbrMetallicRoughness: { baseColorTexture?: { index: number } } }) => {
      const index = material.pbrMetallicRoughness.baseColorTexture?.index;
      return index === undefined ? -1 : json.textures[index].source;
    }));
    for (const role of ["ORM", "normal"] as const) {
      if (admission.ok) break;
      assert.equal(admission.code, "texture-byte-budget-exceeded", `${id}: non-texture admission failure cannot be repaired by resizing`);
      const targets = new Set<number>();
      for (const material of json.materials) {
        const textureInfo = role === "ORM" ? material.pbrMetallicRoughness.metallicRoughnessTexture : material.normalTexture;
        if (textureInfo) targets.add(json.textures[textureInfo.index].source);
      }
      for (const imageIndex of targets) {
        assert(!baseColorImages.has(imageIndex), "Base color must retain native 2K bytes");
        const dimensions = uniqueMetadata[imageIndex];
        if (Math.max(dimensions.width, dimensions.height) <= 1024) continue;
        const source = uniqueBytes[imageIndex];
        const resized = await page.evaluate(async ({ src, normal }) => {
          const image = new Image(); image.src = src; await image.decode();
          if (image.width !== 2048 || image.height !== 2048) throw new Error("Expected native 2K data map");
          const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
          const context = canvas.getContext("2d", { willReadFrequently: true, colorSpace: "srgb" })!;
          context.drawImage(image, 0, 0);
          const input = context.getImageData(0, 0, 2048, 2048).data;
          const target = context.createImageData(1024, 1024);
          for (let y = 0; y < 1024; y += 1) {
            for (let x = 0; x < 1024; x += 1) {
              const sourceOffset = (y * 2 * 2048 + x * 2) * 4;
              const targetOffset = (y * 1024 + x) * 4;
              for (let channel = 0; channel < 3; channel += 1) target.data[targetOffset + channel] = Math.round((input[sourceOffset + channel] + input[sourceOffset + 4 + channel] + input[sourceOffset + 8192 + channel] + input[sourceOffset + 8196 + channel]) / 4);
              if (normal) {
                const nx = target.data[targetOffset] / 127.5 - 1;
                const ny = target.data[targetOffset + 1] / 127.5 - 1;
                const nz = target.data[targetOffset + 2] / 127.5 - 1;
                const length = Math.hypot(nx, ny, nz) || 1;
                target.data[targetOffset] = Math.round((nx / length + 1) * 127.5);
                target.data[targetOffset + 1] = Math.round((ny / length + 1) * 127.5);
                target.data[targetOffset + 2] = Math.round((nz / length + 1) * 127.5);
              }
              target.data[targetOffset + 3] = 255;
            }
          }
          canvas.width = 1024; canvas.height = 1024;
          context.putImageData(target, 0, 0);
          return canvas.toDataURL("image/png").split(",")[1];
        }, { src: `data:${json.images[imageIndex].mimeType};base64,${source.toString("base64")}`, normal: role === "normal" });
        const bytes = Buffer.from(resized, "base64");
        const offset = binary.length + (4 - binary.length % 4) % 4;
        binary = Buffer.concat([binary, Buffer.alloc(offset - binary.length), bytes]);
        const bufferView = json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length }) - 1;
        json.images[imageIndex] = { ...json.images[imageIndex], bufferView, mimeType: "image/png" };
        operations.push({ image: json.images[imageIndex].name, role, sourceSha256: hash(source), exportSha256: hash(bytes), before: dimensions, after: { width: 1024, height: 1024 }, filter: role === "normal" ? "2x2 byte-space average with tangent-normal renormalization" : "2x2 byte-space arithmetic average; lossless PNG encoding" });
        uniqueMetadata[imageIndex] = { width: 1024, height: 1024 };
      }
      json.buffers[0].byteLength = binary.length;
      output = pack(json, binary);
      admission = await admit(output);
    }
    assert(admission.ok, `${id}: mobile admission still fails: ${admission.code}`);
    assert.equal(JSON.stringify(json.materials), materialParameters, "Authored PBR parameters changed during texture resizing");
    assert.equal(JSON.stringify({ nodes: json.nodes, meshes: json.meshes, accessors: json.accessors, skins: json.skins, animations: json.animations }), geometry, "Geometry, UVs or skin changed");
    assert(binary.subarray(0, originalBinary.length).equals(originalBinary), "Original binary payload changed");
    const outputPath = entry.path.replace(/\.glb$/u, "-mobile-v1.glb");
    await writeFile(path.join(stage, outputPath), output);
    const afterDecodedBytes = uniqueMetadata.reduce((total, image) => total + image.width * image.height * 4, 0);
    derived.push({ ...entry, path: outputPath, bytes: output.length, sha256: hash(output), browserRenderVerified: false, studioRuntimeVerified: false, visualReviewed: false, curationStatus: "candidate", previewPath: undefined, browserVerification: undefined,
      derivation: { kind: "mobile-texture-budget", originalPath: entry.path, originalSha256: entry.sha256, geometrySha256: entry.geometrySha256, originalBinaryUnchanged: true, baseColorBytesUnchanged: true, beforeImageCount: originalImageCount, afterImageCount: json.images.length, beforeDecodedBytes, afterDecodedBytes, beforeMaxDimension: Math.max(...metadata.flatMap((item) => [item.width, item.height])), afterMaxDimension: Math.max(...uniqueMetadata.flatMap((item) => [item.width, item.height])), operations, beforeAdmission: summarize(beforeAdmission), afterAdmission: summarize(admission) },
    });
    process.stdout.write(`${id}: ${originalImageCount}->${json.images.length} images; ${(beforeDecodedBytes / 1048576).toFixed(0)}->${(afterDecodedBytes / 1048576).toFixed(0)} MiB decoded; resized ${operations.length}; mobile PASS\n`);
  }
  await writeFile(path.join(stage, "mobile-ready-manifest.json"), `${JSON.stringify({ schema: "toonstudio-acquired-assets/v1", assets: derived }, null, 2)}\n`);
} finally { await browser.close(); }
