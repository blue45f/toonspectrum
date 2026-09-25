import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);
const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
  .split("\n").filter(Boolean);

function magicKind(buffer) {
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpg";
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "webp";
  if (["GIF87a", "GIF89a"].includes(buffer.toString("ascii", 0, 6))) return "gif";
  return "unknown";
}

function pngDimensions(buffer) {
  if (buffer.length < 24 || magicKind(buffer) !== "png") return null;
  return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
}
function jpegDimensions(buffer) {
  if (magicKind(buffer) !== "jpg") return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    const marker = buffer[offset + 1];
    if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2) break;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return [buffer.readUInt16BE(offset + 7), buffer.readUInt16BE(offset + 5)];
    }
    offset += 2 + length;
  }
  return null;
}

function webpDimensions(buffer) {
  if (magicKind(buffer) !== "webp" || buffer.length < 30) return null;
  const chunk = buffer.toString("ascii", 12, 16);
  if (chunk === "VP8X") {
    const width = 1 + buffer.readUIntLE(24, 3);
    const height = 1 + buffer.readUIntLE(27, 3);
    return [width, height];
  }
  if (chunk === "VP8 ") {
    const marker = buffer.indexOf(Buffer.from([0x9d, 0x01, 0x2a]), 20);
    if (marker >= 0 && marker + 7 <= buffer.length) {
      return [buffer.readUInt16LE(marker + 3) & 0x3fff, buffer.readUInt16LE(marker + 5) & 0x3fff];
    }
  }
  if (chunk === "VP8L" && buffer[20] === 0x2f) {
    const b0 = buffer[21], b1 = buffer[22], b2 = buffer[23], b3 = buffer[24];
    return [1 + (((b1 & 0x3f) << 8) | b0), 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | (b1 >> 6))];
  }
  return null;
}

function dimensions(buffer, kind) {
  if (kind === "png") return pngDimensions(buffer);
  if (kind === "jpg") return jpegDimensions(buffer);
  if (kind === "webp") return webpDimensions(buffer);
  if (kind === "gif" && buffer.length >= 10) return [buffer.readUInt16LE(6), buffer.readUInt16LE(8)];
  return null;
}

const BRAND_ALIAS_PATH = /^(?:apps\/web\/public\/(?:brand\/spectrum-ribbon-v2\/)?(?:apple-touch-icon\.png|favicon-(?:32|96)\.png|favicon\.svg|icon-(?:192|512)\.png|icon-maskable-(?:192|512)\.png|icon-maskable\.svg|safari-pinned-tab\.svg)|apps\/mobile\/shell\/icon-192\.png)$/u;
const LEGACY_BACKGROUND_ALIAS = /^apps\/web\/public\/assets\/studio\/backgrounds\/(webtoon_[a-z0-9_]+)\.(?:jpg|png)$/u;
const KNOWN_ASSEMBLY_PREVIEW_COLLISION = new Set([
  "apps/web/public/assets/studio/cc0-20260906/previews/kenney-nature-cliff-block-cave-rock.png",
  "apps/web/public/assets/studio/cc0-20260906/previews/kenney-nature-cliff-block-rock.png",
]);

function intentionalDuplicateReason(group) {
  const paths = group.map((asset) => asset.path).toSorted();
  if (paths.every((value) => /^apps\/mobile\/android\/app\/src\/main\/res\/drawable[^/]*\/splash\.png$/u.test(value))) {
    return "android-density-theme-splash-contract";
  }
  if (paths.every((value) => value.startsWith("apps/mobile/ios/App/App/Assets.xcassets/Splash.imageset/"))) {
    return "ios-splash-appearance-scale-contract";
  }
  if (paths.every((value) => BRAND_ALIAS_PATH.test(value))) {
    return "brand-and-install-surface-alias-contract";
  }
  const legacyMatches = paths.map((value) => value.match(LEGACY_BACKGROUND_ALIAS));
  if (
    paths.length === 2
    && legacyMatches.every(Boolean)
    && legacyMatches[0][1] === legacyMatches[1][1]
    && paths.some((value) => value.endsWith(".jpg"))
    && paths.some((value) => value.endsWith(".png"))
  ) {
    return "legacy-background-url-compatibility";
  }
  if (
    paths.length === KNOWN_ASSEMBLY_PREVIEW_COLLISION.size
    && paths.every((value) => KNOWN_ASSEMBLY_PREVIEW_COLLISION.has(value))
  ) {
    return "reviewed-assembly-model-preview-collision";
  }
  return null;
}

const assets = [];
const byHash = new Map();
for (const relativePath of tracked) {
  const extension = path.extname(relativePath).toLowerCase();
  if (!EXTENSIONS.has(extension)) continue;
  const absolutePath = path.join(ROOT, relativePath);
  const buffer = readFileSync(absolutePath);
  const hash = createHash("sha256").update(buffer).digest("hex");
  const expectedKind = extension === ".jpeg" ? "jpg" : extension.slice(1);
  const actualKind = extension === ".svg" ? "svg" : magicKind(buffer);
  const size = dimensions(buffer, actualKind);
  const asset = {
    path: relativePath,
    bytes: statSync(absolutePath).size,
    expectedKind,
    actualKind,
    width: size?.[0] ?? null,
    height: size?.[1] ?? null,
    hash,
  };
  assets.push(asset);
  const group = byHash.get(hash) ?? [];
  group.push(asset);
  byHash.set(hash, group);
}

const duplicates = [...byHash.values()].filter((group) => group.length > 1);
const duplicateClassifications = duplicates.map((group) => ({
  reason: intentionalDuplicateReason(group),
  files: group.map((asset) => asset.path).toSorted(),
}));
const intentionalDuplicateGroups = duplicateClassifications.filter((group) => group.reason !== null);
const unexpectedDuplicateGroups = duplicateClassifications.filter((group) => group.reason === null);
const mismatches = assets.filter((asset) => asset.expectedKind !== asset.actualKind);
const lowResolution = assets.filter((asset) => asset.width && asset.height && (asset.width < 256 || asset.height < 256));
const legacyAliasMismatches = mismatches.filter((asset) => {
  if (asset.expectedKind !== "png" || asset.actualKind !== "jpg") return false;
  const jpgPath = asset.path.replace(/\.png$/u, ".jpg");
  return (byHash.get(asset.hash) ?? []).some((peer) => peer.path === jpgPath);
});
const unexpectedMismatches = mismatches.filter((asset) => !legacyAliasMismatches.includes(asset));

const report = {
  generatedAt: new Date().toISOString(),
  totals: {
    assets: assets.length,
    duplicateGroups: duplicates.length,
    duplicateFiles: duplicates.reduce((sum, group) => sum + group.length, 0),
    intentionalDuplicateGroups: intentionalDuplicateGroups.length,
    unexpectedDuplicateGroups: unexpectedDuplicateGroups.length,
    lowResolution: lowResolution.length,
    extensionMismatches: mismatches.length,
    legacyAliasMismatches: legacyAliasMismatches.length,
    unexpectedMismatches: unexpectedMismatches.length,
  },
  unexpectedMismatches,
  legacyAliasMismatches,
  lowResolution,
  duplicateGroups: duplicateClassifications,
  unexpectedDuplicateGroups,
};

console.log(JSON.stringify(report, null, 2));
if (
  process.argv.includes("--strict")
  && (unexpectedMismatches.length > 0 || unexpectedDuplicateGroups.length > 0)
) {
  process.exitCode = 1;
}
