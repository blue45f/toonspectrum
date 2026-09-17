import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname, join } from "node:path";

const root = process.cwd();
const check = process.argv.includes("--check");
const json = process.argv.includes("--json");
const visualExtensions = new Set([".svg", ".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif", ".ico"]);
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".css", ".scss"]);
const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim().split("\n").filter(Boolean);
const visuals = tracked.filter((file) => visualExtensions.has(extname(file).toLowerCase()));
const sources = tracked.filter((file) => sourceExtensions.has(extname(file).toLowerCase()));

function dimensions(bytes) {
  if (bytes.length >= 24 && bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), format: "png" };
  }
  if (bytes.length >= 30 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") {
    const chunk = bytes.subarray(12, 16).toString("ascii");
    if (chunk === "VP8X") return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3), format: "webp" };
    if (chunk === "VP8 " && bytes.subarray(23, 26).toString("hex") === "9d012a") return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff, format: "webp" };
  }
  return null;
}

const hashes = new Map();
const raster = [];
const svg = [];
for (const file of visuals) {
  const path = join(root, file);
  const bytes = readFileSync(path);
  const digest = createHash("sha256").update(bytes).digest("hex");
  const group = hashes.get(digest) ?? [];
  group.push(file);
  hashes.set(digest, group);
  const ext = extname(file).toLowerCase();
  if (ext === ".svg") {
    const text = bytes.toString("utf8");
    svg.push({
      file,
      bytes: bytes.length,
      hasViewBox: /\bviewBox\s*=/.test(text),
      primitives: (text.match(/<(?:path|circle|ellipse|rect|polygon|polyline)\b/g) ?? []).length,
      embeddedRaster: /<image\b/i.test(text),
    });
  } else {
    const size = dimensions(bytes);
    if (size) raster.push({ file, bytes: bytes.length, ...size });
  }
}

const duplicateGroups = [...hashes.values()].filter((group) => group.length > 1);
const inlineSvg = [];
const emojiVisuals = [];
const emojiPattern = /\p{Extended_Pictographic}/gu;
for (const file of sources) {
  const text = readFileSync(join(root, file), "utf8");
  const svgCount = (text.match(/<svg\b/g) ?? []).length;
  const emojiCount = (text.match(emojiPattern) ?? []).length;
  if (svgCount > 0) inlineSvg.push({ file, count: svgCount });
  if (emojiCount > 0) emojiVisuals.push({ file, count: emojiCount });
}

const libraryPath = "apps/web/src/domains/creator/vrm/vrm-library.ts";
const libraryText = readFileSync(join(root, libraryPath), "utf8");
const thumbnailUrls = [...libraryText.matchAll(/thumbnailUrl:\s*"([^"]+)"/g)].map((match) => match[1]);
const activeVrmThumbnails = thumbnailUrls.map((url) => {
  const file = `apps/web/public/${url.slice(1)}`;
  try {
    const bytes = readFileSync(join(root, file));
    return { url, file, bytes: bytes.length, dimensions: dimensions(bytes) };
  } catch {
    return { url, file, bytes: 0, dimensions: null };
  }
});

const violations = [];
for (const entry of activeVrmThumbnails) {
  if (!entry.dimensions) {
    violations.push(`${entry.url}: missing or unsupported production thumbnail`);
    continue;
  }
  if (Math.min(entry.dimensions.width, entry.dimensions.height) < 768) {
    violations.push(`${entry.url}: active VRM thumbnail is ${entry.dimensions.width}x${entry.dimensions.height}, expected >=768`);
  }
}
const wardrobePanel = readFileSync(join(root, "apps/web/src/domains/creator/vrm/StudioVrmPoserPanelBodyB.tsx"), "utf8");
if (/\{(?:set|item|p)\.emoji\}/.test(wardrobePanel)) {
  violations.push("StudioVrmPoserPanelBodyB.tsx still renders OS emoji for wardrobe/costume catalogue visuals");
}
const expressionPanel = readFileSync(join(root, "apps/web/src/domains/creator/vrm/StudioVrmPoserPanelBodyA.tsx"), "utf8");
if (/\{preset\.emoji\}/.test(expressionPanel)) {
  violations.push("StudioVrmPoserPanelBodyA.tsx still renders OS emoji for expression preset visuals");
}
const scenePropPanel = readFileSync(join(root, "apps/web/src/domains/creator/vrm/StudioVrmPoserPanelBodyD.tsx"), "utf8");
if (/\{prop\.emoji\}/.test(scenePropPanel)) {
  violations.push("StudioVrmPoserPanelBodyD.tsx still renders OS emoji for scene prop visuals");
}

const extensionCounts = Object.fromEntries(
  [...visualExtensions].map((ext) => [ext, visuals.filter((file) => extname(file).toLowerCase() === ext).length]).filter(([, count]) => count > 0),
);

const report = {
  trackedVisualAssets: visuals.length,
  extensionCounts,
  exactDuplicateGroups: duplicateGroups.length,
  filesInExactDuplicateGroups: duplicateGroups.reduce((sum, group) => sum + group.length, 0),
  svg: {
    files: svg.length,
    missingViewBox: svg.filter((entry) => !entry.hasViewBox).map((entry) => entry.file),
    embeddedRaster: svg.filter((entry) => entry.embeddedRaster).map((entry) => entry.file),
    lowComplexityCandidates: svg.filter((entry) => entry.primitives <= 4).map(({ file, primitives, bytes }) => ({ file, primitives, bytes })),
  },
  inlineSvg: { files: inlineSvg.length, occurrences: inlineSvg.reduce((sum, entry) => sum + entry.count, 0), top: inlineSvg.toSorted((a, b) => b.count - a.count).slice(0, 30) },
  emojiVisuals: { files: emojiVisuals.length, occurrences: emojiVisuals.reduce((sum, entry) => sum + entry.count, 0), top: emojiVisuals.toSorted((a, b) => b.count - a.count).slice(0, 30) },
  activeVrmThumbnails: {
    total: activeVrmThumbnails.length,
    atLeast768: activeVrmThumbnails.filter((entry) => entry.dimensions && Math.min(entry.dimensions.width, entry.dimensions.height) >= 768).length,
    below768: activeVrmThumbnails.filter((entry) => entry.dimensions && Math.min(entry.dimensions.width, entry.dimensions.height) < 768).map((entry) => ({ url: entry.url, ...entry.dimensions })),
  },
  violations,
};

if (json) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`Visual assets: ${report.trackedVisualAssets} ${JSON.stringify(report.extensionCounts)}`);
  console.log(`Exact duplicates: ${report.exactDuplicateGroups} groups / ${report.filesInExactDuplicateGroups} files`);
  console.log(`Inline SVG: ${report.inlineSvg.occurrences} occurrences in ${report.inlineSvg.files} files`);
  console.log(`Emoji visuals: ${report.emojiVisuals.occurrences} occurrences in ${report.emojiVisuals.files} files`);
  console.log(`Active VRM thumbnails >=768: ${report.activeVrmThumbnails.atLeast768}/${report.activeVrmThumbnails.total}`);
  for (const violation of violations) console.error(`VIOLATION ${violation}`);
}
if (check && violations.length > 0) process.exitCode = 1;
