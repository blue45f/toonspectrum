import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { STUDIO_VIRTUAL_BACKDROPS, studioVirtualBackdropUrl } from "../apps/web/src/domains/creator/virtual-space/studio-virtual-space-environment-preference.ts";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pack = resolve(repo, "apps/web/public/assets/virtual-studio/imagegen25-v7");
const manifestPath = resolve(pack, "manifest.json");

const sha256 = (data) => createHash("sha256").update(data).digest("hex");

async function readWebpSize(path) {
  const data = await readFile(path);
  if (data.toString("ascii", 0, 4) !== "RIFF" || data.toString("ascii", 8, 12) !== "WEBP") {
    throw new Error(`not a WebP file: ${path}`);
  }
  const type = data.toString("ascii", 12, 16);
  if (type === "VP8X") {
    return [data.readUIntLE(24, 3) + 1, data.readUIntLE(27, 3) + 1];
  }
  if (type === "VP8 ") {
    return [data.readUInt16LE(26) & 0x3fff, data.readUInt16LE(28) & 0x3fff];
  }
  if (type === "VP8L") {
    const bits = data.readUInt32LE(21);
    return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1];
  }
  throw new Error(`unsupported WebP chunk ${type}: ${path}`);
}

function safeRelativePath(value) {
  return typeof value === "string"
    && /^[a-z0-9][a-z0-9/_-]*\.webp$/u.test(value)
    && !value.includes("..")
    && !value.startsWith("/");
}

// 배경은 v8로 이관됐지만 실제 선택 경로와 파일의 무결성은 계속 검증한다.
export async function verifyVirtualStudioRuntimeBackdrops(resolveBackdrop = studioVirtualBackdropUrl) {
  const root = resolve(repo, "apps/web/public/assets/virtual-studio/experience-v8");
  const manifest = JSON.parse(await readFile(resolve(root, "art-manifest.json"), "utf8"));
  const records = new Map(manifest.assets.map((record) => [record.file, record]));
  const seen = new Set();
  const hashes = new Set();
  for (const style of ["sky-island", "webtoon", "pastel", "retro", "ink", "neon"]) {
    for (const backdrop of STUDIO_VIRTUAL_BACKDROPS) {
      const url = resolveBackdrop(backdrop, style);
      const prefix = "/assets/virtual-studio/experience-v8/";
      if (typeof url !== "string" || !url.startsWith(prefix)) throw new Error("runtime backdrop must use the declared v8 pack");
      const file = url.slice(prefix.length);
      if (!/^[a-z0-9-]+[.]png$/u.test(file)) throw new Error("unsafe runtime backdrop path");
      if (seen.has(file)) throw new Error("runtime backdrop styles must retain independent assets");
      seen.add(file);
      const record = records.get(file);
      if (!record) throw new Error("runtime backdrop is absent from the source manifest: " + file);
      const path = resolve(root, file);
      if ((await lstat(path)).isSymbolicLink()) throw new Error("runtime backdrop symlink is forbidden");
      const data = await readFile(path);
      const hash = sha256(data);
      if (record.bytes !== data.length || record.sha256 !== hash) throw new Error("runtime backdrop integrity mismatch: " + file);
      if (hashes.has(hash)) throw new Error("runtime backdrop styles must not duplicate the same pixels");
      hashes.add(hash);
      if (data.readUInt32BE(0) !== 0x89504e47 || data.toString("ascii", 12, 16) !== "IHDR"
        || data.readUInt32BE(16) < 1024 || data.readUInt32BE(20) < 768) {
        throw new Error("runtime backdrop must preserve its production PNG dimensions: " + file);
      }
    }
  }
  return { backdrops: seen.size };
}

export async function verifyVirtualStudioImagegen25V7() {
  const errors = [];
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.version !== 7) errors.push("ImageGen pack version must be 7");
  if (!String(manifest.generator).includes("Image Generation 2.5")) errors.push("Image Generation 2.5 generator is missing");
  if (!String(manifest.sourceTechnique).includes("no CSS recolour")) errors.push("independent source-art policy is missing");
  if (!Array.isArray(manifest.sessionGenerationIds) || manifest.sessionGenerationIds.length !== 3) {
    errors.push("ImageGen generation IDs are incomplete");
  }

  for (const source of manifest.sourceFiles ?? []) {
    const path = resolve(repo, source.file);
    const data = await readFile(path);
    if (source.bytes !== data.length || source.sha256 !== sha256(data)) errors.push(`source mismatch: ${source.file}`);
    if (!data.includes(Buffer.from("gpt-image")) || !data.includes(Buffer.from("trainedAlgorithmicMedia"))) {
      errors.push(`C2PA ImageGen provenance missing: ${source.file}`);
    }
  }

  const fileRecords = new Map();
  let totalBytes = 0;
  for (const record of manifest.files ?? []) {
    if (!safeRelativePath(record.file)) {
      errors.push(`unsafe runtime path: ${String(record.file)}`);
      continue;
    }
    if (fileRecords.has(record.file)) errors.push(`duplicate runtime path: ${record.file}`);
    fileRecords.set(record.file, record);
    const path = resolve(pack, record.file);
    const data = await readFile(path);
    totalBytes += data.length;
    if (record.bytes !== data.length || record.sha256 !== sha256(data)) errors.push(`runtime mismatch: ${record.file}`);
    const size = await readWebpSize(path);
    if (JSON.stringify(size) !== JSON.stringify(record.size)) errors.push(`dimension mismatch: ${record.file}`);
  }
  if (fileRecords.size !== 19) errors.push(`expected 19 runtime assets, found ${fileRecords.size}`);

  const places = manifest.places ?? [];
  if (places.length !== 14) errors.push(`expected 14 places, found ${places.length}`);
  if (new Set(places.map((place) => place.id)).size !== places.length) errors.push("place IDs must be unique");
  const requiredPlaces = ["skyport", "creator-plaza", "personal-atelier", "story-lab", "creator-cafe", "team-meeting", "tree-library", "review-gallery", "garden", "observatory", "arcade", "beach", "event-stage", "production-control"];
  for (const id of requiredPlaces) {
    const place = places.find((candidate) => candidate.id === id);
    if (!place || !fileRecords.has(place.preview)) errors.push(`place preview missing: ${id}`);
  }

  const backdrops = manifest.backdrops ?? {};
  for (const id of ["sky", "coast", "forest", "city"]) {
    if (!fileRecords.has(backdrops[id])) errors.push(`backdrop missing: ${id}`);
  }
  const tile = manifest.tile;
  if (!tile || tile.frameWidth !== 128 || tile.frameHeight !== 128 || tile.columns !== 4 || tile.rows !== 4) {
    errors.push("terrain atlas contract must be 4x4 128px frames");
  }
  if (!fileRecords.has(tile?.asset) || JSON.stringify(fileRecords.get(tile?.asset)?.size) !== JSON.stringify([512, 512])) {
    errors.push("terrain atlas asset is invalid");
  }

  const catalog = await readFile(resolve(repo, "apps/web/src/domains/creator/virtual-space/studio-virtual-space-place-catalog.ts"), "utf8");
  if (!catalog.includes("/assets/virtual-studio/imagegen25-v7/places")) errors.push("runtime place catalog is not connected");
  const runtimeBackdrops = await verifyVirtualStudioRuntimeBackdrops();
  const canvas = await readFile(resolve(repo, "apps/web/src/domains/creator/virtual-space/StudioVirtualSpacePhaserCanvas.tsx"), "utf8");
  const backdropAdapter = await readFile(resolve(repo, "apps/web/src/domains/creator/virtual-space/experience/studio-cinematic-art.ts"), "utf8");
  // 지형 타일 로딩은 living world 런타임이 담당한다. terrain 로드를 캔버스에
  // 남겨두지 않아 이 check가 실제 로더를 보게 한다.
  const livingWorld = await readFile(resolve(repo, "apps/web/src/domains/creator/virtual-space/studio-virtual-space-living-world.ts"), "utf8");
  if (!canvas.includes("studioCinematicBackdropUrl(environmentPreference.backdrop, artStyle,")
    || !canvas.includes("this.load.image(horizonTextureKey, horizonUrl)")
    || !backdropAdapter.includes("return studioVirtualBackdropUrl(backdrop, style);")
    || !livingWorld.includes("load.spritesheet(keys.terrain,")
    || !livingWorld.includes("/assets/virtual-studio/imagegen25-v7/tiles/terrain-atlas.webp")) {
    errors.push("Phaser runtime does not load ImageGen backdrops and terrain tiles");
  }

  if (errors.length) throw new Error(errors.join("\n"));
  return { files: fileRecords.size, places: places.length, bytes: totalBytes, runtimeBackdrops: runtimeBackdrops.backdrops };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await verifyVirtualStudioImagegen25V7();
  console.log(`Virtual Studio ImageGen 2.5 v7 OK: ${result.places} places, ${result.files} assets, ${result.bytes.toLocaleString()} bytes`);
}
