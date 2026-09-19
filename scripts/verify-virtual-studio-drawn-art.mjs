import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_ROOT = path.join(ROOT, "apps/web/public");
export const DRAWN_ART_DIRECTORY = path.join(PUBLIC_ROOT, "assets/virtual-studio/drawn-characters-v1");
const SKINS = ["pink", "silver", "dark", "purple"];
const STATES = ["walk-down", "walk-left", "walk-right", "walk-up", "sit", "wave"];
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** Decode the verified pack's bounded 8-bit non-interlaced RGBA PNGs, without native dependencies. */
export function decodeDrawnArtPng(bytes) {
  assert(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), "drawn art must be PNG");
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  assert(width > 0 && height > 0 && width * height <= 4_000_000, "drawn PNG dimensions exceed decode budget");
  assert.equal(bytes.toString("ascii", 12, 16), "IHDR");
  assert.deepEqual([...bytes.subarray(24, 29)], [8, 6, 0, 0, 0], "drawn PNG must use non-interlaced 8-bit RGBA");
  const compressed = [];
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(offset), end = offset + length + 12;
    assert(end <= bytes.length, "truncated drawn PNG chunk");
    if (bytes.toString("ascii", offset + 4, offset + 8) === "IDAT") compressed.push(bytes.subarray(offset + 8, end - 4));
    offset = end;
  }
  assert(compressed.length > 0, "truncated drawn PNG image data");
  const stride = width * 4;
  const filtered = inflateSync(Buffer.concat(compressed), { maxOutputLength: height * (stride + 1) });
  assert.equal(filtered.length, height * (stride + 1));
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const filter = filtered[y * (stride + 1)];
    assert(filter <= 4, "invalid PNG row filter");
    for (let x = 0; x < stride; x++) {
      const i = y * stride + x;
      const left = x >= 4 ? rgba[i - 4] : 0, up = y ? rgba[i - stride] : 0;
      const corner = y && x >= 4 ? rgba[i - stride - 4] : 0;
      const p = left + up - corner, a = Math.abs(p - left), b = Math.abs(p - up), c = Math.abs(p - corner);
      const predictor = filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2)
        : filter === 4 ? a <= b && a <= c ? left : b <= c ? up : corner : 0;
      rgba[i] = filtered[y * (stride + 1) + x + 1] + predictor;
    }
  }
  return { width, height, rgba };
}

export function verifyDrawnArtFramePixels(decoded, asset) {
  const { width, height, rgba } = decoded;
  assert.deepEqual([width, height], asset.dimensions);
  const fw = asset.frameWidth, fh = asset.frameHeight;
  assert.equal(width, fw * 2); assert.equal(height, fh * 2);
  assert.equal(asset.alphaThreshold, 64);
  const hashes = [];
  for (let frame = 0; frame < 4; frame++) {
    const pixels = Buffer.alloc(fw * fh * 4);
    const bounds = [fw, fh, 0, 0]; let transparent = 0;
    for (let y = 0; y < fh; y++) {
      const begin = (((frame >> 1) * fh + y) * width + (frame % 2) * fw) * 4;
      rgba.copy(pixels, y * fw * 4, begin, begin + fw * 4);
      for (let x = 0; x < fw; x++) {
        const alpha = pixels[(y * fw + x) * 4 + 3];
        if (alpha === 0) transparent++;
        if (alpha >= asset.alphaThreshold) {
          bounds[0] = Math.min(bounds[0], x); bounds[1] = Math.min(bounds[1], y);
          bounds[2] = Math.max(bounds[2], x + 1); bounds[3] = Math.max(bounds[3], y + 1);
        }
      }
    }
    assert.deepEqual(bounds, asset.alphaBounds[frame], `${asset.url} frame ${frame} alpha bounds drifted`);
    assert.equal(transparent, asset.transparentPixels[frame]);
    assert(transparent > fw * fh * .15 && bounds[0] > 0 && bounds[1] > 0 && bounds[2] < fw && bounds[3] < fh,
      `${asset.url} frame ${frame} needs transparent margins and a complete figure`);
    hashes.push(digest(pixels));
    const geometry = asset.frames[frame];
    assert(geometry && [geometry.originX, geometry.originY].every((n) => Number.isFinite(n) && n >= 0 && n <= 1));
    assert(Number.isFinite(geometry.displayHeightRatio) && geometry.displayHeightRatio > .5 && geometry.displayHeightRatio < 1.5);
    assert(Math.abs(geometry.originY * fh - bounds[3]) < .01, "feet origin must match reviewed alpha baseline");
    if (asset.state === "sit") assert(geometry.seatOriginY > 0 && geometry.seatOriginY < geometry.originY);
  }
  assert.deepEqual(hashes, asset.frameRgbaSha256, `${asset.url} decoded frame pixels drifted`);
  assert.equal(new Set(hashes).size, 4, "drawn sheet cannot duplicate a frame");
}

export async function verifyVirtualStudioDrawnArt({ artDirectory = DRAWN_ART_DIRECTORY } = {}) {
  const manifest = JSON.parse(await readFile(path.join(artDirectory, "art-manifest.json"), "utf8"));
  assert.equal(manifest.version, 1); assert.deepEqual(manifest.skins, SKINS);
  assert.equal(Object.keys(manifest.assets).length, 24);
  assert(manifest.limitations.some((text) => text.includes("held poses")));
  let totalBytes = 0;
  const expectedFiles = ["art-manifest.json"];
  for (const skin of SKINS) for (const state of STATES) {
    const asset = manifest.assets[`${skin}/${state}`];
    assert(asset && asset.skin === skin && asset.state === state, `missing drawn capability ${skin}/${state}`);
    const name = `player-${skin}-${state}.png`; expectedFiles.push(name);
    assert.equal(asset.url, `/assets/virtual-studio/drawn-characters-v1/${name}`);
    const assetPath = path.join(artDirectory, name), stat = await lstat(assetPath);
    assert(stat.isFile() && !stat.isSymbolicLink());
    const bytes = await readFile(assetPath); totalBytes += bytes.length;
    assert.equal(bytes.length, asset.bytes); assert.equal(digest(bytes), asset.sha256, `${name} SHA-256 drifted`);
    verifyDrawnArtFramePixels(decodeDrawnArtPng(bytes), asset);
    assert.equal(asset.frames.length, 4);
    for (const reference of asset.authoredReferences) {
      assert(/^production-v2\/player-(pink|silver|dark|purple)-direction-(down|right|left|up)\.png$/u.test(reference));
      assert.equal(digest(await readFile(path.join(artDirectory, "..", reference))), asset.authoredReferenceSha256[reference], "preserved identity reference drifted");
    }
  }
  assert.deepEqual((await readdir(artDirectory)).sort(), expectedFiles.sort(), "unregistered drawn artwork");
  const source = await readFile(path.join(ROOT, "apps/web/src/domains/creator/virtual-space/studio-virtual-space-character-drawn-art.ts"), "utf8");
  const registry = await readFile(path.join(ROOT, "apps/web/src/domains/creator/virtual-space/studio-virtual-space-character-skins.ts"), "utf8");
  for (const skin of SKINS) {
    for (const [suffix, states] of [["WALKS", STATES.slice(0, 4)], ["POSES", ["sit", "wave"]]]) {
      const symbol = `${skin.toUpperCase()}_DRAWN_${suffix}`;
      assert(registry.includes(`${suffix === "WALKS" ? "clips" : "poses"}: ${symbol}`), `${symbol} is not bound to skin registry`);
      const match = source.match(new RegExp(`export const ${symbol} = ([\\s\\S]*?) satisfies Record`));
      assert(match, `missing ${symbol}`); const bindings = JSON.parse(match[1]);
      for (const state of states) {
        const asset = manifest.assets[`${skin}/${state}`], binding = bindings[state];
        assert.equal(binding.textureUrl, asset.url); assert.equal(binding.frameWidth, asset.frameWidth); assert.equal(binding.frameHeight, asset.frameHeight);
        assert.deepEqual(binding.frames, asset.frames);
        if (suffix === "WALKS") { assert.equal(binding.start, 0); assert.equal(binding.end, 3); assert.equal(binding.technique, "drawn"); }
        else assert.deepEqual(binding.directionFrames, { down: 0, right: 1, left: 2, up: 3 });
      }
    }
  }
  return { assetCount: 24, frameCount: 96, totalBytes, decodedPixelsVerified: true, registryBindingsVerified: true };
}
