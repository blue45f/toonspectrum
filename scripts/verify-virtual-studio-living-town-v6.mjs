#!/usr/bin/env node
import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(fileURLToPath(new URL("..", import.meta.url)));
const root = resolve(repo, "apps/web/public/assets/virtual-studio/living-town-v6");
const manifestPath = resolve(root, "art-v6-manifest.json");
const imagegenManifestPath = resolve(root, "imagegen25-source-manifest.json");
const styles = ["sky-island", "webtoon", "pastel", "retro", "ink", "neon"];
const expectedFiles = 48;
const requiredConcepts = [
  "66b20001-32fd-4d90-9a6f-14b676399191",
  "9ffa2971-6d20-49bd-a8b3-aaa3da97d83f",
  "22beabfc-ecd4-47a7-8925-1c83b56003c2",
];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const canonicalName = (path) => relative(root, path).split(sep).join("/");
async function walk(directory) {
  const values = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) values.push(...await walk(path));
    else if (entry.isFile()) values.push(path);
  }
  return values;
}

async function verifyRecord(path, record, errors) {
  const stat = await lstat(path);
  const name = canonicalName(path);
  if (stat.isSymbolicLink()) { errors.push(`symlink forbidden: ${name}`); return 0; }
  const data = await readFile(path);
  if (!record) { errors.push(`missing manifest record: ${name}`); return data.length; }
  if (record.bytes !== data.length) errors.push(`byte length mismatch: ${name}`);
  if (record.sha256 !== sha256(data)) errors.push(`sha256 mismatch: ${name}`);
  if (data.length > 10 * 1024 * 1024) errors.push(`oversized asset: ${name}`);
  return data.length;
}

export async function verifyVirtualStudioLivingTownV6() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const errors = [];
  if (manifest.version !== 6) errors.push("living-town manifest version must be 6");
  if (!String(manifest.sourceTechnique).includes("Image Generation 2.5")) errors.push("Image Generation 2.5 provenance is missing");
  if (JSON.stringify(manifest.imageGeneration25ConceptIds) !== JSON.stringify(requiredConcepts)) errors.push("Image Generation 2.5 concept IDs differ");
  if (manifest.imageGeneration25SourceManifest !== "imagegen25-source-manifest.json") errors.push("ImageGen source manifest is not bound");
  if (JSON.stringify(manifest.styles) !== JSON.stringify(styles)) errors.push("living-town style list differs");
  if (!Array.isArray(manifest.files) || manifest.files.length !== expectedFiles) errors.push(`expected ${expectedFiles} manifest records`);

  const files = (await Promise.all(styles.map((style) => walk(resolve(root, style))))).flat();
  if (files.length !== expectedFiles) errors.push(`expected ${expectedFiles} style files, got ${files.length}`);
  const records = new Map((manifest.files ?? []).map((item) => [item.file, item]));
  const seen = new Set();
  let bytes = 0;
  for (const path of files) {
    const name = canonicalName(path);
    seen.add(name);
    bytes += await verifyRecord(path, records.get(name), errors);
  }
  for (const name of records.keys()) if (!seen.has(name)) errors.push(`missing style file: ${name}`);

  const coverage = new Map(styles.map((style) => [style, []]));
  for (const name of records.keys()) {
    const [style, ...rest] = name.split("/");
    coverage.get(style)?.push(rest.join("/"));
  }
  const baseline = coverage.get(styles[0]).sort();
  for (const style of styles.slice(1)) {
    if (JSON.stringify(coverage.get(style).sort()) !== JSON.stringify(baseline)) errors.push(`style coverage differs: ${style}`);
  }
  for (const subject of ["path-overlay.webp", "terrain-tile-atlas.webp", "waterfall-sheet.webp", "decor-sheet.webp"]) {
    const signatures = new Set(styles.map((style) => records.get(`${style}/${subject}`)?.visualSignature));
    signatures.delete(undefined);
    if (signatures.size !== styles.length) errors.push(`style signatures are not independent: ${subject}`);
  }
  const waterfall = records.get("sky-island/waterfall-sheet.webp");
  if (JSON.stringify(waterfall?.size) !== JSON.stringify([1024, 192])) errors.push("waterfall sheet must contain eight 128x192 frames");
  const decor = records.get("sky-island/decor-sheet.webp");
  if (JSON.stringify(decor?.size) !== JSON.stringify([1536, 128])) errors.push("decor sheet must contain twelve 128px frames");

  const imagegen = JSON.parse(await readFile(imagegenManifestPath, "utf8"));
  if (imagegen.version !== 1 || !String(imagegen.generator).includes("Image Generation 2.5")) errors.push("ImageGen source contract is invalid");
  if (JSON.stringify(imagegen.sessionGenerationIds) !== JSON.stringify(requiredConcepts)) errors.push("ImageGen session IDs differ");
  for (const source of imagegen.sourceFiles ?? []) {
    const path = resolve(root, source.file);
    const data = await readFile(path);
    if (source.bytes !== data.length || source.sha256 !== sha256(data)) errors.push(`ImageGen source mismatch: ${source.file}`);
    if (!data.includes(Buffer.from("gpt-image")) || !data.includes(Buffer.from("trainedAlgorithmicMedia"))) {
      errors.push(`C2PA ImageGen provenance missing: ${source.file}`);
    }
  }
  let imagegenBytes = 0;
  for (const record of imagegen.files ?? []) {
    const path = resolve(root, record.file);
    imagegenBytes += await verifyRecord(path, record, errors);
  }
  if ((imagegen.files ?? []).length !== 29) errors.push("ImageGen runtime extraction must contain 29 files");
  const districtPreview = imagegen.files?.find((item) => item.file === "sky-island/district-preview-sheet.webp");
  if (JSON.stringify(districtPreview?.size) !== JSON.stringify([2240, 180])) errors.push("district preview sheet must contain seven concept-art districts");
  const generatedDirections = ["down", "left", "right", "up"].map((facing) =>
    imagegen.files?.find((item) => item.file === `imagegen25-character/player-imagegen25-direction-${facing}.webp`));
  if (generatedDirections.some((item) => JSON.stringify(item?.size) !== JSON.stringify([160, 160]))) {
    errors.push("ImageGen character directions must use the 160px runtime cell");
  }
  if (new Set(generatedDirections.map((item) => item?.visualSignature).filter(Boolean)).size !== 4) {
    errors.push("ImageGen 캐릭터 방향 파일의 visualSignature 네 개가 서로 달라야 합니다");
  }

  const runtime = await readFile(resolve(repo, "apps/web/src/domains/creator/virtual-space/StudioVirtualSpacePhaserCanvas.tsx"), "utf8");
  if (!runtime.includes("studioVirtualLivingTownAssetUrl")) errors.push("runtime does not load living-town v6 assets");
  if (!runtime.includes("studioTownTraversalProfile")) errors.push("runtime does not enforce authored paths");
  if (!runtime.includes("triggerEnvironmentEffect")) errors.push("runtime does not trigger environment interaction effects");
  const skins = await readFile(resolve(repo, "apps/web/src/domains/creator/virtual-space/studio-virtual-space-character-skins.ts"), "utf8");
  if (!skins.includes('key: "imagegen25"') || !skins.includes("living-town-v6/imagegen25-character")) {
    errors.push("ImageGen 2.5 character pack is not selectable");
  }
  const css = await readFile(resolve(repo, "apps/web/src/domains/creator/virtual-space/studio-virtual-space.css"), "utf8");
  if (/data-art-style=[^\n]*canvas\s*\{[^}]*filter\s*:/u.test(css)) errors.push("style-specific canvas filters are forbidden");
  if (errors.length) throw new Error(errors.join("\n"));
  return { files: files.length, bytes, imagegenFiles: imagegen.files.length, imagegenBytes };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await verifyVirtualStudioLivingTownV6();
  console.log(`Virtual Studio living town v6 OK: ${result.files} style assets + ${result.imagegenFiles} ImageGen assets, ${(result.bytes + result.imagegenBytes).toLocaleString()} bytes`);
}
