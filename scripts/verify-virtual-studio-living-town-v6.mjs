#!/usr/bin/env node
import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(fileURLToPath(new URL("..", import.meta.url)));
const root = resolve(repo, "apps/web/public/assets/virtual-studio/living-town-v6");
const manifestPath = resolve(root, "art-v6-manifest.json");
const styles = ["sky-island", "webtoon", "pastel", "retro", "ink", "neon"];
const expectedFiles = 48;
const requiredConcepts = [
  "b3dd757d-9cf7-423e-88fb-809d52da1a05",
  "d12f918a-1026-49dc-be5f-0ed7385a2878",
  "bd92455c-4d04-4cef-8319-287a332d4bd9",
];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function walk(directory) {
  const values = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) values.push(...await walk(path));
    else if (entry.isFile() && path !== manifestPath) values.push(path);
  }
  return values;
}
export async function verifyVirtualStudioLivingTownV6() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const errors = [];
  if (manifest.version !== 6) errors.push("living-town manifest version must be 6");
  if (!String(manifest.sourceTechnique).includes("Image Generation 2.5")) errors.push("Image Generation 2.5 provenance is missing");
  if (JSON.stringify(manifest.imageGeneration25ConceptIds) !== JSON.stringify(requiredConcepts)) errors.push("Image Generation 2.5 concept IDs differ");
  if (JSON.stringify(manifest.styles) !== JSON.stringify(styles)) errors.push("living-town style list differs");
  if (!Array.isArray(manifest.files) || manifest.files.length !== expectedFiles) errors.push(`expected ${expectedFiles} manifest records`);

  const files = await walk(root);
  if (files.length !== expectedFiles) errors.push(`expected ${expectedFiles} files, got ${files.length}`);
  const records = new Map((manifest.files ?? []).map((item) => [item.file, item]));
  const seen = new Set();
  let bytes = 0;
  for (const path of files) {
    const stat = await lstat(path);
    const name = relative(root, path).split(sep).join("/");
    if (stat.isSymbolicLink()) { errors.push(`symlink forbidden: ${name}`); continue; }
    const record = records.get(name);
    if (!record) { errors.push(`missing manifest record: ${name}`); continue; }
    const data = await readFile(path);
    seen.add(name); bytes += data.length;
    if (record.bytes !== data.length) errors.push(`byte length mismatch: ${name}`);
    if (record.sha256 !== sha256(data)) errors.push(`sha256 mismatch: ${name}`);
    if (data.length > 10 * 1024 * 1024) errors.push(`oversized asset: ${name}`);
  }
  for (const name of records.keys()) if (!seen.has(name)) errors.push(`missing file: ${name}`);
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

  const runtime = await readFile(resolve(repo, "apps/web/src/domains/creator/virtual-space/StudioVirtualSpacePhaserCanvas.tsx"), "utf8");
  if (!runtime.includes("studioVirtualLivingTownAssetUrl")) errors.push("runtime does not load living-town v6 assets");
  if (!runtime.includes("studioTownTraversalProfile")) errors.push("runtime does not enforce authored paths");
  const css = await readFile(resolve(repo, "apps/web/src/domains/creator/virtual-space/studio-virtual-space.css"), "utf8");
  if (/data-art-style=[^\n]*canvas\s*\{[^}]*filter\s*:/u.test(css)) errors.push("style-specific canvas filters are forbidden");
  if (errors.length) throw new Error(errors.join("\n"));
  return { files: files.length, bytes };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await verifyVirtualStudioLivingTownV6();
  console.log(`Virtual Studio living town v6 OK: ${result.files} assets, ${result.bytes.toLocaleString()} bytes`);
}
