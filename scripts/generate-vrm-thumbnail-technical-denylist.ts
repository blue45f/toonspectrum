import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  isStudioVrmProductionThumbnailUrl,
} from "../apps/web/src/domains/creator/vrm/studio-vrm-thumbnail-quality";
import { SAMPLE_VRMS } from "../apps/web/src/domains/creator/vrm/vrm-library";

type Dimensions = Readonly<{ width: number; height: number }>;

const LFS_POINTER_PREFIX = "version https://git-lfs.github.com/spec/v1";

function isGitLfsPointer(bytes: Buffer): boolean {
  return bytes.length < 4_096 && bytes.toString("utf8", 0, Math.min(bytes.length, 200))
    .startsWith(LFS_POINTER_PREFIX);
}

function dimensions(bytes: Buffer): Dimensions | null {
  if (
    bytes.length >= 24
    && bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a"
  ) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    const frames = new Set([
      0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
    ]);
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      if (marker === undefined || marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x00 || marker === 0xff || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += marker >= 0xd0 && marker <= 0xd7 ? 2 : 1;
        continue;
      }
      const length = bytes.readUInt16BE(offset + 2);
      if (length < 2 || offset + length + 2 > bytes.length) break;
      if (frames.has(marker)) {
        return {
          height: bytes.readUInt16BE(offset + 5),
          width: bytes.readUInt16BE(offset + 7),
        };
      }
      offset += length + 2;
    }
  }
  if (
    bytes.length >= 30
    && bytes.subarray(0, 4).toString("ascii") === "RIFF"
    && bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    const chunk = bytes.subarray(12, 16).toString("ascii");
    if (chunk === "VP8X") {
      return {
        width: 1 + bytes.readUIntLE(24, 3),
        height: 1 + bytes.readUIntLE(27, 3),
      };
    }
    if (chunk === "VP8 " && bytes.subarray(23, 26).toString("hex") === "9d012a") {
      return {
        width: bytes.readUInt16LE(26) & 0x3fff,
        height: bytes.readUInt16LE(28) & 0x3fff,
      };
    }
    if (chunk === "VP8L" && bytes[20] === 0x2f) {
      const first = bytes[21] ?? 0;
      const second = bytes[22] ?? 0;
      const third = bytes[23] ?? 0;
      const fourth = bytes[24] ?? 0;
      return {
        width: 1 + first + ((second & 0x3f) << 8),
        height: 1 + (second >> 6) + (third << 2) + ((fourth & 0x0f) << 10),
      };
    }
  }
  return null;
}

function reject(
  rejected: Map<string, string>,
  reports: Record<string, unknown>,
  id: string,
  thumbnail: string | undefined,
  reason: string,
  details: Record<string, unknown> = {},
): void {
  rejected.set(id, reason);
  reports[id] = { thumbnail, ...details, rejection: reason };
}

function main(): void {
  const rejected = new Map<string, string>();
  const hashes = new Map<string, string>();
  const reports: Record<string, unknown> = {};
  const sorted = [...SAMPLE_VRMS].sort((left, right) => left.id.localeCompare(right.id));

  for (const sample of sorted) {
    if (sample.visibility === "legacy") continue;
    const thumbnail = sample.thumbnailUrl;
    if (!isStudioVrmProductionThumbnailUrl(thumbnail)) {
      reject(rejected, reports, sample.id, thumbnail, "missing-or-unsafe-production-thumbnail");
      continue;
    }
    const filePath = path.join(process.cwd(), "apps/web/public", thumbnail.slice(1));
    if (!existsSync(filePath)) {
      reject(rejected, reports, sample.id, thumbnail, "thumbnail-file-missing");
      continue;
    }
    const stat = statSync(filePath);
    if (!stat.isFile()) {
      reject(rejected, reports, sample.id, thumbnail, "thumbnail-file-not-regular");
      continue;
    }
    const bytes = readFileSync(filePath);
    if (isGitLfsPointer(bytes)) {
      reject(
        rejected,
        reports,
        sample.id,
        thumbnail,
        "thumbnail-git-lfs-pointer",
        { byteSize: bytes.length },
      );
      continue;
    }
    if (stat.size < 4_096) {
      reject(
        rejected,
        reports,
        sample.id,
        thumbnail,
        "thumbnail-file-too-small",
        { byteSize: stat.size },
      );
      continue;
    }
    const size = dimensions(bytes);
    if (!size) {
      reject(
        rejected,
        reports,
        sample.id,
        thumbnail,
        "thumbnail-format-or-header-invalid",
        { byteSize: bytes.length },
      );
      continue;
    }
    const aspect = size.width / size.height;
    if (size.width < 256 || size.height < 256) {
      reject(
        rejected,
        reports,
        sample.id,
        thumbnail,
        `thumbnail-resolution-${size.width}x${size.height}`,
        { byteSize: bytes.length, ...size, aspect },
      );
      continue;
    }
    if (aspect < 0.5 || aspect > 2) {
      reject(
        rejected,
        reports,
        sample.id,
        thumbnail,
        `thumbnail-aspect-${aspect.toFixed(3)}`,
        { byteSize: bytes.length, ...size, aspect },
      );
      continue;
    }
    const hash = createHash("sha256").update(bytes).digest("hex");
    const duplicateOf = hashes.get(hash);
    if (duplicateOf) {
      reject(
        rejected,
        reports,
        sample.id,
        thumbnail,
        `duplicate-thumbnail-of-${duplicateOf}`,
        { byteSize: bytes.length, ...size, aspect, duplicateOf },
      );
      continue;
    }
    hashes.set(hash, sample.id);
    reports[sample.id] = {
      thumbnail,
      byteSize: bytes.length,
      ...size,
      aspect,
      rejection: null,
    };
  }

  const entries = [...rejected.entries()];
  const lines = entries.map(
    ([id, reason]) => `  ${JSON.stringify(id)}: ${JSON.stringify(reason)},`,
  );
  const output = `/** Generated from deployment-owned thumbnail files. */\n`
    + `export const STUDIO_VRM_TECHNICAL_THUMBNAIL_REJECTIONS = Object.freeze({\n`
    + `${lines.join("\n")}\n} as const);\n\n`
    + `const REJECTED_IDS = new Set<string>(\n`
    + `  Object.keys(STUDIO_VRM_TECHNICAL_THUMBNAIL_REJECTIONS),\n);\n\n`
    + `export function isStudioVrmTechnicallyAdmittedThumbnail(id: string): boolean {\n`
    + `  return !REJECTED_IDS.has(id);\n}\n`;

  mkdirSync("artifacts", { recursive: true });
  writeFileSync(
    "apps/web/src/domains/creator/vrm/studio-vrm-thumbnail-technical-denylist.generated.ts",
    output,
  );
  writeFileSync(
    "artifacts/studio-vrm-thumbnail-quality-report.json",
    `${JSON.stringify({ schemaVersion: 1, scanned: Object.keys(reports).length, rejected: Object.fromEntries(entries), reports }, null, 2)}\n`,
  );
  console.log(JSON.stringify({ scanned: Object.keys(reports).length, rejected: Object.fromEntries(entries) }, null, 2));
}

main();
