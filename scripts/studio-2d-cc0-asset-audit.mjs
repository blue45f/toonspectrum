import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const STUDIO_2D_CC0_MANIFEST_PATH = "apps/web/src/domains/creator/studio-2d-cc0-scene-manifest.json";
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SOURCE_PREFIX = "/assets/studio/cc0-20260906/assets/";
const WEB_PUBLIC = path.join(ROOT, "apps", "web", "public");
const WEBP_SIGNATURE = Buffer.from("WEBP", "ascii");

function uint24le(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

/** Reads lossless, lossy, and extended WebP canvas dimensions without native dependencies. */
export function readWebpDimensions(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 30 || bytes.toString("ascii", 0, 4) !== "RIFF"
    || !bytes.subarray(8, 12).equals(WEBP_SIGNATURE)) throw new Error("Invalid WebP header");
  const chunk = bytes.toString("ascii", 12, 16);
  let width;
  let height;
  if (chunk === "VP8 ") {
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) throw new Error("Invalid VP8 frame");
    width = bytes.readUInt16LE(26) & 0x3fff;
    height = bytes.readUInt16LE(28) & 0x3fff;
  } else if (chunk === "VP8L") {
    if (bytes[20] !== 0x2f || bytes.length < 25) throw new Error("Invalid VP8L frame");
    width = 1 + (((bytes[22] & 0x3f) << 8) | bytes[21]);
    height = 1 + (((bytes[24] & 0x0f) << 10) | (bytes[23] << 2) | ((bytes[22] & 0xc0) >> 6));
  } else if (chunk === "VP8X") {
    if (bytes.length < 30) throw new Error("Truncated VP8X frame");
    width = 1 + uint24le(bytes, 24);
    height = 1 + uint24le(bytes, 27);
  } else throw new Error("Unsupported WebP frame type");
  if (width < 1 || height < 1 || width > 8192 || height > 8192 || width * height > 36_000_000) {
    throw new Error("WebP dimensions exceed the asset safety budget");
  }
  return { width, height, mediaType: "image/webp" };
}

export function auditStudio2dCc0Assets(root = ROOT, input) { // NOSONAR javascript:S3776
  const manifest = input ?? JSON.parse(readFileSync(path.join(root, STUDIO_2D_CC0_MANIFEST_PATH), "utf8"));
  const assets = Array.isArray(manifest?.assets) ? manifest.assets : [];
  const errors = [];
  const ids = new Set();
  const sources = new Set();
  const hashes = new Set();
  const allowedRoot = realpathSync(path.join(root, "apps/web/public/assets/studio/cc0-20260906/assets")) + path.sep;
  if (manifest?.version !== 1 || assets.length === 0) errors.push("Expected a nonempty version-1 CC0 manifest");
  let totalBytes = 0;
  for (const asset of assets) {
    const id = asset?.id ?? "unknown";
    try {
      if (!/^polyhaven-background-[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(id) || ids.has(id)) throw new Error("Invalid or duplicate ID");
      ids.add(id);
      const folderPrefix = `${SOURCE_PREFIX}${id}/`;
      if (typeof asset.src !== "string" || asset.src !== `${folderPrefix}background.webp`
        || typeof asset.sourceManifest !== "string" || asset.sourceManifest !== `${folderPrefix}SOURCE.json`) {
        throw new Error("Unsafe or mismatched asset paths");
      }
      if (sources.has(asset.src)) throw new Error("Duplicate source file");
      sources.add(asset.src);
      const filePath = path.join(WEB_PUBLIC, asset.src);
      const sourcePath = path.join(WEB_PUBLIC, asset.sourceManifest);
      for (const candidate of [filePath, sourcePath]) {
        if (lstatSync(candidate).isSymbolicLink() || !realpathSync(candidate).startsWith(allowedRoot)) throw new Error("Symlink or escaped source is not allowed");
      }
      const bytes = readFileSync(filePath);
      if (bytes.length > 20 * 1024 * 1024) throw new Error("Source exceeds 20 MiB");
      const dimensions = readWebpDimensions(bytes);
      if (asset.mediaType !== dimensions.mediaType || dimensions.width !== asset.width || dimensions.height !== asset.height) {
        throw new Error("Declared dimensions or media type do not match the original");
      }
      if (asset.width < 1600 || asset.height < 900) throw new Error("Curated default background is below the quality floor");
      if (asset.bytes !== bytes.length) throw new Error("Declared file size is stale");
      const hash = createHash("sha256").update(bytes).digest("hex");
      if (asset.sha256 !== hash) throw new Error("Source SHA-256 does not match the reviewed original");
      if (hashes.has(hash)) throw new Error("Duplicate image counted as a distinct scene");
      hashes.add(hash);
      if (!asset.label?.includes("CC0 포토 레퍼런스") || !asset.title?.trim() || !asset.genre?.trim()
        || !Array.isArray(asset.tags) || asset.tags.length < 4) throw new Error("Missing discovery metadata");
      if (!['실내', '실외'].includes(asset.environment) || !['낮', '노을', '밤'].includes(asset.timeOfDay)
        || typeof asset.containsPeople !== "boolean" || typeof asset.containsText !== "boolean") throw new Error("Missing content review flags");
      if (!asset.recommended || asset.review?.method !== "full-image" || asset.review?.status !== "usable"
        || asset.review?.reviewedAt !== "2026-09-16" || !Array.isArray(asset.review?.notes)) throw new Error("Missing full-image review evidence");
      if (asset.style !== "photographic-reference" || asset.legacySrc !== null) throw new Error("Invalid curated scene classification");
      const source = JSON.parse(readFileSync(sourcePath, "utf8"));
      const license = source?.license;
      if (license?.id !== "CC0-1.0" || license?.provider !== "Poly Haven"
        || license?.commercialUse !== true || license?.redistributionAllowed !== true
        || !/^https:\/\/polyhaven\.com\/a\/[a-z0-9_]+$/u.test(license?.sourceUrl ?? "")) throw new Error("SOURCE.json is not a verified Poly Haven CC0 record");
      if (asset.provenance?.kind !== "poly-haven-cc0" || asset.provenance?.licenseStatus !== "cc0-verified"
        || asset.provenance?.licenseId !== license.id || asset.provenance?.provider !== license.provider
        || asset.provenance?.sourceUrl !== license.sourceUrl || asset.provenance?.checkedOn !== license.checkedOn) {
        throw new Error("Manifest provenance differs from SOURCE.json");
      }
      totalBytes += bytes.length;
    } catch (error) {
      errors.push(`${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { ok: errors.length === 0, assetCount: assets.length, totalBytes, errors };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = auditStudio2dCc0Assets();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
