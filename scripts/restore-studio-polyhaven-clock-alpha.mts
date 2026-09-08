import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

const stage = path.resolve(process.argv[2] ?? "artifacts/studio-asset-expansion/pbr-20260908");
const manifest = JSON.parse(await readFile(path.join(stage, "manifest.json"), "utf8"));
const slugs = ["alarm_clock_01", "vintage_grandfather_clock_01", "vintage_telephone_wall_clock"];
const digest = (bytes: Uint8Array, algorithm = "sha256") => createHash(algorithm).update(bytes).digest("hex");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const derived = [];
try {
  const page = await browser.newPage();
  for (const slug of slugs) {
    const id = `polyhaven-${slug.replaceAll("_", "-")}`;
    const entry = manifest.assets.find((candidate: { id: string }) => candidate.id === id);
    assert(entry?.kind === "model");
    const sourceBytes = await readFile(path.join(stage, entry.path));
    assert.equal(digest(sourceBytes), entry.sha256, `${id}: original acquired source changed`);
    const jsonLength = sourceBytes.readUInt32LE(12);
    const json = JSON.parse(sourceBytes.subarray(20, 20 + jsonLength).toString("utf8"));
    const binary = sourceBytes.subarray(28 + jsonLength);
    const originalStructure = JSON.stringify({ nodes: json.nodes, meshes: json.meshes, accessors: json.accessors, animations: json.animations, skins: json.skins });
    const glass = json.materials.filter((material: { name?: string }) => /_glass$/iu.test(material.name ?? ""));
    assert.equal(glass.length, 1, `${id}: expected exactly one authored glass material`);
    const material = glass[0];
    assert.equal(material.alphaMode, "BLEND");
    const sourceTexture = json.textures[material.pbrMetallicRoughness.baseColorTexture.index];
    const sourceImage = json.images[sourceTexture.source];
    const imageView = json.bufferViews[sourceImage.bufferView];
    const colorBytes = binary.subarray(imageView.byteOffset ?? 0, (imageView.byteOffset ?? 0) + imageView.byteLength);
    const apiUrl = `https://api.polyhaven.com/files/${slug}`;
    const response = await fetch(apiUrl);
    assert(response.ok, `${id}: official API ${response.status}`);
    const api = await response.json();
    const maskRole = Object.keys(api).find((key) => /^(opacity|alpha)$/iu.test(key));
    assert(maskRole, `${id}: official opacity/alpha source absent`);
    const source = api[maskRole]["2k"].png;
    assert(source?.url && source.md5, `${id}: verified official native 2K PNG required`);
    const maskResponse = await fetch(source.url);
    assert(maskResponse.ok, `${id}: opacity PNG ${maskResponse.status}`);
    const maskBytes = Buffer.from(await maskResponse.arrayBuffer());
    assert.equal(maskBytes.byteLength, source.size);
    assert.equal(digest(maskBytes, "md5"), source.md5, `${id}: official opacity checksum mismatch`);
    const sourceDirectory = path.join(stage, "_source", id, "alpha-restoration-v1");
    await mkdir(sourceDirectory, { recursive: true });
    const maskPath = path.join(sourceDirectory, `${slug}_${maskRole.toLowerCase()}_2k.png`);
    await writeFile(maskPath, maskBytes);
    const composite = await page.evaluate(async ({ color, opacity }) => {
      const colorImage = new Image();
      colorImage.src = color;
      await colorImage.decode();
      const maskImage = new Image();
      maskImage.src = opacity;
      await maskImage.decode();
      if (colorImage.width !== maskImage.width || colorImage.height !== maskImage.height || colorImage.width !== 2048) throw new Error("Author opacity and diffuse dimensions must match native 2K");
      const canvas = document.createElement("canvas");
      canvas.width = colorImage.width;
      canvas.height = colorImage.height;
      const context = canvas.getContext("2d", { willReadFrequently: true, colorSpace: "srgb" })!;
      context.drawImage(colorImage, 0, 0);
      const rgba = context.getImageData(0, 0, canvas.width, canvas.height);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(maskImage, 0, 0);
      const mask = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let alphaMin = 255;
      let alphaMax = 0;
      let nonOpaquePixels = 0;
      for (let offset = 0; offset < rgba.data.length; offset += 4) {
        const alpha = mask[offset];
        rgba.data[offset + 3] = alpha;
        alphaMin = Math.min(alphaMin, alpha);
        alphaMax = Math.max(alphaMax, alpha);
        if (alpha < 255) nonOpaquePixels += 1;
      }
      if (nonOpaquePixels === 0) throw new Error("Author mask has no transparency");
      context.putImageData(rgba, 0, 0);
      return { pngBase64: canvas.toDataURL("image/png").split(",")[1], width: canvas.width, height: canvas.height, alphaMin, alphaMax, nonOpaquePixels };
    }, { color: `data:${sourceImage.mimeType};base64,${colorBytes.toString("base64")}`, opacity: `data:image/png;base64,${maskBytes.toString("base64")}` });
    const pngBytes = Buffer.from(composite.pngBase64, "base64");
    const padding = Buffer.alloc((4 - binary.length % 4) % 4);
    const imageOffset = binary.length + padding.length;
    const newBinaryRaw = Buffer.concat([binary, padding, pngBytes]);
    const newBinary = Buffer.concat([newBinaryRaw, Buffer.alloc((4 - newBinaryRaw.length % 4) % 4)]);
    const viewIndex = json.bufferViews.push({ buffer: 0, byteOffset: imageOffset, byteLength: pngBytes.length }) - 1;
    const imageIndex = json.images.push({ name: `${slug}_diff_author_opacity_restored_v1`, mimeType: "image/png", bufferView: viewIndex }) - 1;
    const textureIndex = json.textures.push({ ...sourceTexture, source: imageIndex }) - 1;
    material.pbrMetallicRoughness.baseColorTexture.index = textureIndex;
    json.buffers[0].byteLength = newBinaryRaw.length;
    assert.equal(JSON.stringify({ nodes: json.nodes, meshes: json.meshes, accessors: json.accessors, animations: json.animations, skins: json.skins }), originalStructure, "Model geometry or hierarchy changed");
    assert(newBinary.subarray(0, binary.length).equals(binary), "Original binary payload changed");
    const jsonRaw = Buffer.from(JSON.stringify(json));
    const jsonChunk = Buffer.concat([jsonRaw, Buffer.alloc((4 - jsonRaw.length % 4) % 4, 0x20)]);
    const header = Buffer.alloc(20);
    header.writeUInt32LE(0x46546c67, 0);
    header.writeUInt32LE(2, 4);
    header.writeUInt32LE(28 + jsonChunk.length + newBinary.length, 8);
    header.writeUInt32LE(jsonChunk.length, 12);
    header.writeUInt32LE(0x4e4f534a, 16);
    const binHeader = Buffer.alloc(8);
    binHeader.writeUInt32LE(newBinary.length, 0);
    binHeader.writeUInt32LE(0x004e4942, 4);
    const outputBytes = Buffer.concat([header, jsonChunk, binHeader, newBinary]);
    const outputPath = `assets/${id}/${slug}-alpha-restored-v1.glb`;
    await writeFile(path.join(stage, outputPath), outputBytes);
    const { pngBase64: _png, ...alphaEvidence } = composite;
    derived.push({ ...entry, path: outputPath, sha256: digest(outputBytes), bytes: outputBytes.length, browserRenderVerified: false, studioRuntimeVerified: false, visualReviewed: false, curationStatus: "candidate", previewPath: undefined, browserVerification: undefined,
      derivation: { kind: "author-opacity-restoration", originalPath: entry.path, originalSha256: entry.sha256, geometrySha256: entry.geometrySha256, originalBinaryUnchanged: true, changedMaterial: material.name, changedProperty: "baseColorTexture alpha only", opacitySource: { apiUrl, url: source.url, role: maskRole, md5: source.md5, sha256: digest(maskBytes), bytes: maskBytes.length, localPath: path.relative(stage, maskPath) }, restoredTextureSha256: digest(pngBytes), ...alphaEvidence },
    });
    process.stdout.write(`${id}: original geometry/binary preserved; author alpha ${composite.alphaMin}..${composite.alphaMax}; ${outputBytes.length} bytes\n`);
  }
  await writeFile(path.join(stage, "clock-alpha-restoration-manifest.json"), `${JSON.stringify({ schema: "toonstudio-acquired-assets/v1", assets: derived }, null, 2)}\n`);
} finally {
  await browser.close();
}
