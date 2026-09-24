#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readImageDimensions } from "./verify-virtual-studio-art-manifest.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
export const VIRTUAL_STUDIO_V4_ROOT = path.resolve(scriptDirectory, "../apps/web/public/assets/virtual-studio");
const SHA = /^[a-f0-9]{64}$/u;
const ROLES = ["concierge", "producer", "editor", "artist", "archivist", "cafe", "security", "host"];
const STYLES = ["webtoon", "sky-island", "pastel", "retro", "ink", "neon"];
const DIRECTIONS = ["down", "left", "right", "up"];

function requireCondition(value, message) {
  if (!value) throw new Error(message);
}

function safePath(value) {
  requireCondition(typeof value === "string" && value.length > 0, "v4 file path must be non-empty");
  requireCondition(!path.isAbsolute(value) && !value.includes("\\"), `invalid v4 file path: ${value}`);
  const normalized = path.posix.normalize(value);
  requireCondition(normalized === value && !normalized.startsWith("../"), `v4 file path escapes root: ${value}`);
  return value;
}

export async function verifyVirtualStudioV4Art({ root = VIRTUAL_STUDIO_V4_ROOT } = {}) {
  const manifestPath = path.join(root, "art-v4-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  requireCondition(manifest.version === 4, "Virtual Studio v4 manifest version must be 4");
  requireCondition(/generated source art/u.test(manifest.sourceTechnique), "v4 source technique must disclose generated source art");
  requireCondition(JSON.stringify(manifest.roles) === JSON.stringify(ROLES), "v4 role order is invalid");
  requireCondition(JSON.stringify(manifest.styles) === JSON.stringify(STYLES), "v4 style coverage is invalid");
  requireCondition(manifest.frame?.width === 128 && manifest.frame?.height === 128 && manifest.frame?.countPerDirection === 4,
    "v4 frame contract is invalid");
  requireCondition(Array.isArray(manifest.files) && manifest.files.length >= 400, "v4 manifest coverage is incomplete");

  const declared = new Map();
  let totalBytes = 0;
  for (const [index, record] of manifest.files.entries()) {
    const relative = safePath(record.file);
    requireCondition(!declared.has(relative), `duplicate v4 file: ${relative}`);
    requireCondition(Number.isSafeInteger(record.bytes) && record.bytes > 0 && record.bytes <= 16 * 1024 * 1024,
      `invalid v4 byte length: ${relative}`);
    requireCondition(typeof record.sha256 === "string" && SHA.test(record.sha256), `invalid v4 hash: ${relative}`);
    requireCondition(Array.isArray(record.size) && record.size.length === 2
      && record.size.every((value) => Number.isSafeInteger(value) && value > 0), `invalid v4 size: ${relative}`);
    const absolute = path.join(root, relative);
    const stat = await lstat(absolute);
    requireCondition(stat.isFile() && !stat.isSymbolicLink(), `v4 asset must be a regular file: ${relative}`);
    const bytes = await readFile(absolute);
    requireCondition(bytes.length === record.bytes, `v4 byte length mismatch: ${relative}`);
    requireCondition(createHash("sha256").update(bytes).digest("hex") === record.sha256, `v4 hash mismatch: ${relative}`);
    const dimensions = readImageDimensions(bytes, relative).dimensions;
    requireCondition(dimensions[0] === record.size[0] && dimensions[1] === record.size[1], `v4 dimension mismatch: ${relative}`);
    declared.set(relative, record);
    totalBytes += bytes.length;
    requireCondition(index < 10_000, "v4 manifest exceeds safety budget");
  }

  const worldHashes = new Set();
  for (const style of STYLES) {
    const world = declared.get(`art-v4/world/${style}.webp`);
    const runtime = declared.get(`style-packs/${style}/tiles/world-base.webp`);
    requireCondition(world, `missing v4 world: ${style}`);
    requireCondition(runtime, `missing v4 runtime world copy: ${style}`);
    requireCondition(world.size[0] >= 1024 && world.size[1] >= 768, `v4 world is below the production resolution floor: ${style}`);
    requireCondition(runtime.sha256 === world.sha256, `runtime world copy differs from its authored v4 world: ${style}`);
    worldHashes.add(world.sha256);
  }
  requireCondition(worldHashes.size === STYLES.length, "every v4 art direction must ship a materially distinct world image");
  for (const atlas of ["tile-atlas.webp", "props-atlas.webp", "room-modules.webp"])
    requireCondition(declared.has(`art-v4/authoring/${atlas}`), `missing v4 authoring atlas: ${atlas}`);
  const roleSheetHashes = new Set();
  for (const role of ROLES) {
    const sheet = declared.get(`npc-cast-v4/npc-${role}-sheet.webp`);
    requireCondition(sheet, `missing v4 generated source sheet: ${role}`);
    roleSheetHashes.add(sheet.sha256);
    for (const direction of DIRECTIONS) {
      requireCondition(declared.has(`npc-cast-v4/npc-${role}-direction-${direction}.webp`), `missing v4 idle: ${role}/${direction}`);
      requireCondition(declared.has(`npc-cast-v4/npc-${role}-walk-${direction}.webp`), `missing v4 walk: ${role}/${direction}`);
      const styleHashes = new Set([
        declared.get(`npc-cast-v4/npc-${role}-walk-${direction}.webp`)?.sha256,
      ]);
      for (const style of STYLES.slice(1)) {
        const idle = declared.get(`style-packs/${style}/npc-cast-v4/npc-${role}-direction-${direction}.webp`);
        const walk = declared.get(`style-packs/${style}/npc-cast-v4/npc-${role}-walk-${direction}.webp`);
        requireCondition(idle, `missing v4 styled idle: ${style}/${role}/${direction}`);
        requireCondition(walk, `missing v4 styled walk: ${style}/${role}/${direction}`);
        styleHashes.add(walk.sha256);
      }
      requireCondition(styleHashes.size === STYLES.length,
        `NPC art directions are not materially distinct: ${role}/${direction}`);
    }
  }
  requireCondition(roleSheetHashes.size === ROLES.length, "each v4 NPC role must have an independent source sheet");

  return Object.freeze({ assetCount: declared.size, totalBytes, worldStyleCount: worldHashes.size, npcRoleCount: roleSheetHashes.size });
}

async function main() {
  const result = await verifyVirtualStudioV4Art();
  console.log(`Virtual Studio v4 art integrity OK: ${result.assetCount} generated-art assets, ${result.totalBytes} bytes.`);
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
