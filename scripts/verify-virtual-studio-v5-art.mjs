#!/usr/bin/env node
import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)), "apps/web/public/assets/virtual-studio/style-packs-v5");
const manifestPath = resolve(root, "art-v5-manifest.json");
const styles = ["sky-island", "webtoon", "pastel", "retro", "ink", "neon"];
const expectedCount = 1872;

async function walk(directory) {
  const values = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) values.push(...await walk(path));
    else if (entry.isFile() && path !== manifestPath) values.push(path);
  }
  return values;
}

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

export async function verifyVirtualStudioV5Art() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const errors = [];
  if (manifest.version !== 5 || manifest.independentSource !== true) errors.push("v5 independent-source contract is missing");
  if (!String(manifest.sourceTechnique).includes("no cross-style pixel reuse")) errors.push("v5 cross-style source technique is not explicit");
  if (manifest.sourceProvenance?.["sky-island"] !== "approved style-packs/sky-island source art") errors.push("v5 sky-island provenance is missing");
  if (JSON.stringify(manifest.styles) !== JSON.stringify(styles)) errors.push("v5 style list is invalid");
  if (!Array.isArray(manifest.files) || manifest.files.length !== expectedCount) errors.push(`expected ${expectedCount} manifest files`);
  const files = await walk(root);
  if (files.length !== expectedCount) errors.push(`expected ${expectedCount} generated files, got ${files.length}`);
  const records = new Map((manifest.files ?? []).map((item) => [item.file, item]));
  const seen = new Set();
  for (const path of files) {
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) { errors.push(`symlink is forbidden: ${path}`); continue; }
    const name = relative(root, path).split(sep).join("/");
    const record = records.get(name);
    if (!record) { errors.push(`file missing from manifest: ${name}`); continue; }
    seen.add(name);
    const bytes = await readFile(path);
    if (bytes.length !== record.bytes) errors.push(`byte length mismatch: ${name}`);
    if (digest(bytes) !== record.sha256) errors.push(`sha256 mismatch: ${name}`);
    if (bytes.length > 10 * 1024 * 1024) errors.push(`oversized art file: ${name}`);
  }
  for (const name of records.keys()) if (!seen.has(name)) errors.push(`manifest points to missing file: ${name}`);
  const byStyle = new Map(styles.map((style) => [style, new Set()]));
  for (const name of records.keys()) {
    const [style, ...rest] = name.split("/");
    byStyle.get(style)?.add(rest.join("/"));
  }
  const baseline = [...byStyle.get(styles[0]) ?? []].sort();
  for (const style of styles.slice(1)) {
    const coverage = [...byStyle.get(style) ?? []].sort();
    if (JSON.stringify(coverage) !== JSON.stringify(baseline)) errors.push(`style coverage differs: ${style}`);
  }
  const signatureSubjects = [
    "players/player-pink-direction-down.webp",
    "npcs/npc-concierge-direction-down.webp",
    "world/world-base.webp",
    "world/terrain-atlas.webp",
  ];
  for (const subject of signatureSubjects) {
    const signatures = new Set(styles.map((style) => records.get(`${style}/${subject}`)?.visualSignature));
    signatures.delete(undefined);
    if (signatures.size !== styles.length) errors.push(`art styles are not visually independent: ${subject}`);
  }
  const css = await readFile(resolve(root, "../../../../src/domains/creator/virtual-space/studio-virtual-space.css"), "utf8");
  if (/data-art-style=[^\n]*canvas\s*\{[^}]*filter\s*:/u.test(css)) errors.push("style-specific canvas filters are forbidden");
  const runtime = await readFile(resolve(root, "../../../../src/domains/creator/virtual-space/studio-virtual-space-art-style.ts"), "utf8");
  if (!runtime.includes("style-packs-v5")) errors.push("runtime does not select v5 art packs");
  if (errors.length) throw new Error(errors.join("\n"));
  return { fileCount: files.length, bytes: files.reduce((sum, path) => sum + Number(records.get(relative(root, path).split(sep).join("/"))?.bytes ?? 0), 0) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await verifyVirtualStudioV5Art();
  console.log(`Virtual Studio v5 independent art OK: ${result.fileCount} assets, ${result.bytes.toLocaleString()} bytes`);
}
