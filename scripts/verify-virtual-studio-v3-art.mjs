#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readImageDimensions } from "./verify-virtual-studio-art-manifest.mjs";

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const STYLE_KEYS = ["sky-island", "pastel", "retro", "ink", "neon"];
const NPC_ROLES = ["concierge", "producer", "editor", "artist", "archivist", "cafe", "security", "host"];
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
export const VIRTUAL_STUDIO_V3_ROOT = path.resolve(scriptDirectory, "../apps/web/public/assets/virtual-studio");

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function safeRelativeFile(value, label) {
  requireCondition(typeof value === "string" && value.length > 0, `${label} must be a non-empty path`);
  requireCondition(!path.isAbsolute(value) && !value.includes("\\"), `${label} must be a portable relative path`);
  const normalized = path.posix.normalize(value);
  requireCondition(normalized === value && normalized !== ".." && !normalized.startsWith("../"), `${label} escapes its asset pack`);
  return value;
}

async function listRegularFiles(root, current = root) {
  const values = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const absolute = path.join(current, entry.name);
    const stat = await lstat(absolute);
    requireCondition(!stat.isSymbolicLink(), `asset pack contains symbolic link: ${absolute}`);
    if (entry.isDirectory()) values.push(...await listRegularFiles(root, absolute));
    else if (entry.isFile()) values.push(path.relative(root, absolute).split(path.sep).join("/"));
  }
  return values.sort();
}

async function verifyImageManifestDirectory({ root, expectedVersion, expectedCount, validateManifest }) {
  const manifestPath = path.join(root, "art-manifest.json");
  const manifestStat = await lstat(manifestPath);
  requireCondition(manifestStat.isFile() && !manifestStat.isSymbolicLink(), `${manifestPath} must be a regular file`);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  requireCondition(manifest.version === expectedVersion, `${manifestPath} version must be ${expectedVersion}`);
  requireCondition(Array.isArray(manifest.files), `${manifestPath} files must be an array`);
  requireCondition(manifest.files.length === expectedCount, `${manifestPath} must describe ${expectedCount} files`);
  validateManifest(manifest);

  const declared = new Set();
  let totalBytes = 0;
  for (const [index, metadata] of manifest.files.entries()) {
    requireCondition(metadata && typeof metadata === "object" && !Array.isArray(metadata), `files[${index}] must be an object`);
    const relative = safeRelativeFile(metadata.file, `files[${index}].file`);
    requireCondition(!declared.has(relative), `duplicate manifest path: ${relative}`);
    declared.add(relative);
    requireCondition(Number.isSafeInteger(metadata.bytes) && metadata.bytes > 0 && metadata.bytes <= 32 * 1024 * 1024,
      `${relative} byte length is invalid`);
    requireCondition(typeof metadata.sha256 === "string" && SHA256_PATTERN.test(metadata.sha256), `${relative} SHA-256 is invalid`);
    requireCondition(Array.isArray(metadata.size) && metadata.size.length === 2
      && metadata.size.every((value) => Number.isSafeInteger(value) && value > 0), `${relative} dimensions are invalid`);

    const absolute = path.join(root, relative);
    const stat = await lstat(absolute);
    requireCondition(stat.isFile() && !stat.isSymbolicLink(), `${relative} must be a regular file`);
    const bytes = await readFile(absolute);
    requireCondition(bytes.length === metadata.bytes, `${relative} byte length does not match its manifest`);
    requireCondition(createHash("sha256").update(bytes).digest("hex") === metadata.sha256,
      `${relative} SHA-256 does not match its manifest`);
    const image = readImageDimensions(bytes, relative);
    requireCondition(image.dimensions[0] === metadata.size[0] && image.dimensions[1] === metadata.size[1],
      `${relative} dimensions do not match its manifest`);
    totalBytes += bytes.length;
  }

  // Virtual Studio v4 owns the nested NPC pack through art-v4-manifest.json. Keep the v3
  // style-pack manifest exact for its own files without duplicating v4 integrity ownership.
  const actual = (await listRegularFiles(root)).filter(
    (file) => file !== "art-manifest.json" && !file.startsWith("npc-cast-v4/"),
  );
  requireCondition(JSON.stringify(actual) === JSON.stringify([...declared].sort()), `${manifestPath} does not exactly cover its asset directory`);
  return Object.freeze({ manifest, files: actual, totalBytes });
}

export async function verifyVirtualStudioV3Art({ root = VIRTUAL_STUDIO_V3_ROOT } = {}) {
  const npcRoot = path.join(root, "npc-cast-v3");
  const npc = await verifyImageManifestDirectory({
    root: npcRoot,
    expectedVersion: 3,
    expectedCount: 69,
    validateManifest(manifest) {
      requireCondition(manifest.playerSpriteReuse === false, "npc-cast-v3 must not reuse player sprite bytes");
      requireCondition(manifest.derivedFromSelectableStyle === true, "npc-cast-v3 must disclose its compatible style grammar");
      requireCondition(manifest.roles && typeof manifest.roles === "object" && !Array.isArray(manifest.roles), "npc-cast-v3 roles are required");
      requireCondition(JSON.stringify(Object.keys(manifest.roles).sort()) === JSON.stringify([...NPC_ROLES].sort()),
        "npc-cast-v3 must contain exactly the eight production roles");
    },
  });
  for (const role of NPC_ROLES) {
    for (const direction of ["down", "left", "right", "up"]) {
      requireCondition(npc.files.includes(`npc-${role}-direction-${direction}.png`), `npc ${role} lacks ${direction} idle art`);
      requireCondition(npc.files.includes(`npc-${role}-walk-${direction}.png`), `npc ${role} lacks ${direction} walk art`);
    }
  }

  const styles = [];
  let referenceFiles = null;
  for (const style of STYLE_KEYS) {
    const result = await verifyImageManifestDirectory({
      root: path.join(root, "style-packs", style),
      expectedVersion: 3,
      expectedCount: 142,
      validateManifest(manifest) {
        requireCondition(manifest.style === style, `${style} manifest identifies another style`);
      },
    });
    for (const required of [
      "tiles/world-base.webp",
      "tiles/floor-texture.png",
      "tiles/path-texture.png",
      "tiles/water-texture.png",
      "tiles/cloud-texture.png",
      "production-v2/player-pink-direction-down.webp",
      "drawn-characters-v1/player-pink-walk-down.webp",
      "npc-cast-v3/npc-concierge-direction-down.webp",
      "npc-cast-v3/npc-host-walk-up.webp",
    ]) requireCondition(result.files.includes(required), `${style} pack is missing ${required}`);
    if (referenceFiles === null) referenceFiles = result.files;
    else requireCondition(JSON.stringify(result.files) === JSON.stringify(referenceFiles), `${style} pack has incomplete cross-style coverage`);
    styles.push(Object.freeze({ style, ...result }));
  }

  return Object.freeze({
    npc,
    styles: Object.freeze(styles),
    assetCount: npc.files.length + styles.reduce((sum, result) => sum + result.files.length, 0),
    totalBytes: npc.totalBytes + styles.reduce((sum, result) => sum + result.totalBytes, 0),
  });
}

async function main() {
  const result = await verifyVirtualStudioV3Art();
  console.log(`Virtual Studio v3 art integrity OK: ${result.assetCount} images, ${result.totalBytes} bytes; NPC v3 and five complete style packs match recorded SHA-256, lengths and dimensions.`);
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
