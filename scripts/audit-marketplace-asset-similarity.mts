import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";

import { chromium } from "playwright";

import { parseStudioCc0Catalog } from "../apps/web/src/domains/creator/studio-cc0-asset-delivery";
import {
  isStudioCc0MarketplaceCandidate,
  isStudioCc0MarketplaceReady,
  STUDIO_CC0_MARKETPLACE_PERCEPTUAL_DUPLICATE_IDS,
} from "../apps/web/src/domains/creator/studio-cc0-curation";

const ROOT = resolve(import.meta.dirname, "..");
const PUBLIC_ROOT = resolve(ROOT, "apps/web/public");
const DELIVERY_PREFIX = "assets/studio/cc0-20260906/";
const MANIFEST_PATH = resolve(PUBLIC_ROOT, DELIVERY_PREFIX, "manifest.json");
const strict = process.argv.includes("--strict");
const catalog = parseStudioCc0Catalog(JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as unknown);
const marketplaceCandidates = catalog.filter(isStudioCc0MarketplaceCandidate);
const marketplaceReadyIds = new Set(
  marketplaceCandidates.filter(isStudioCc0MarketplaceReady).map((asset) => asset.id),
);

interface Fingerprint {
  readonly id: string;
  readonly kind: string;
  readonly sourcePath: string;
  readonly sourceHash: string;
  readonly width: number;
  readonly height: number;
  readonly dHash: string;
  readonly aHash: string;
  readonly signature: readonly number[];
}

function mime(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".webp": return "image/webp";
    default: return "application/octet-stream";
  }
}
const server = createServer((request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    if (!relative) {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end("<!doctype html><title>asset similarity audit</title>");
      return;
    }
    const file = resolve(PUBLIC_ROOT, relative);
    if (file !== PUBLIC_ROOT && !file.startsWith(PUBLIC_ROOT + sep)) {
      response.writeHead(403).end();
      return;
    }
    const bytes = readFileSync(file);
    response.writeHead(200, {
      "content-type": mime(file),
      "cache-control": "no-store",
      "content-length": String(bytes.byteLength),
    });
    response.end(bytes);
  } catch {
    response.writeHead(404).end();
  }
});

await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
const address = server.address();
if (!address || typeof address === "string") throw new Error("Similarity audit server did not bind.");
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(origin + "/");
const fingerprints: Fingerprint[] = [];
try {
  for (const asset of marketplaceCandidates) {
    const sourcePath = asset.kind === "model" ? asset.previewPath : asset.path;
    if (!sourcePath) throw new Error(`${asset.id}: missing preview path`);
    const url = `${origin}/${DELIVERY_PREFIX}${sourcePath}`;
    const fingerprint = await page.evaluate(`(async () => {
      const imageUrl = ${JSON.stringify(url)};
      const response = await fetch(imageUrl);
      if (!response.ok) throw new Error("HTTP " + response.status);
      const bitmap = await createImageBitmap(await response.blob());
      const sample = (sampleWidth, sampleHeight) => {
        const canvas = document.createElement("canvas");
        canvas.width = sampleWidth;
        canvas.height = sampleHeight;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("2D canvas unavailable");
        context.drawImage(bitmap, 0, 0, sampleWidth, sampleHeight);
        return context.getImageData(0, 0, sampleWidth, sampleHeight).data;
      };
      const luminance = (data, pixel) => {
        const offset = pixel * 4;
        return ((data[offset] || 0) * 299 + (data[offset + 1] || 0) * 587
          + (data[offset + 2] || 0) * 114) / 1000;
      };
      const asHex = (bits) => {
        let output = "";
        for (let index = 0; index < bits.length; index += 4) {
          let nibble = 0;
          for (let bit = 0; bit < 4; bit += 1) {
            nibble = (nibble << 1) | (bits[index + bit] ? 1 : 0);
          }
          output += nibble.toString(16);
        }
        return output;
      };
      const differential = sample(9, 8);
      const dBits = [];
      for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) {
        dBits.push(luminance(differential, y * 9 + x) > luminance(differential, y * 9 + x + 1));
      }
      const average = sample(8, 8);
      const levels = Array.from({ length: 64 }, (_, index) => luminance(average, index));
      const mean = levels.reduce((sum, value) => sum + value, 0) / levels.length;
      const detailed = sample(16, 16);
      const signature = Array.from({ length: 256 }, (_, index) => {
        const offset = index * 4;
        const alpha = (detailed[offset + 3] || 0) / 255;
        const grey = luminance(detailed, index);
        const composited = alpha * grey + (1 - alpha) * 127.5;
        return Math.round(composited * 0.75 + alpha * 255 * 0.25);
      });
      const result = {
        width: bitmap.width,
        height: bitmap.height,
        dHash: asHex(dBits),
        aHash: asHex(levels.map((value) => value >= mean)),
        signature,
      };
      bitmap.close();
      return result;
    })()`) as {
      readonly width: number;
      readonly height: number;
      readonly dHash: string;
      readonly aHash: string;
      readonly signature: readonly number[];
    };
    fingerprints.push({
      id: asset.id,
      kind: asset.kind,
      sourcePath,
      sourceHash: asset.sha256,
      ...fingerprint,
    });
  }
} finally {
  await browser.close();
  await new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done()));
}

const POPCOUNT = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4] as const;
function hamming(left: string, right: string): number {
  if (left.length !== right.length) return Number.POSITIVE_INFINITY;
  let distance = 0;
  for (let index = 0; index < left.length; index += 1) {
    distance += POPCOUNT[
      Number.parseInt(left[index] ?? "0", 16) ^ Number.parseInt(right[index] ?? "0", 16)
    ] ?? 0;
  }
  return distance;
}

function signatureDistance(left: readonly number[], right: readonly number[]): number {
  if (left.length !== right.length || left.length === 0) return Number.POSITIVE_INFINITY;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference += Math.abs((left[index] ?? 0) - (right[index] ?? 0));
  }
  return difference / (left.length * 255);
}
const nearDuplicates: {
  readonly left: string;
  readonly right: string;
  readonly kind: string;
  readonly dHashDistance: number;
  readonly aHashDistance: number;
  readonly signatureDistance: number;
}[] = [];

for (let leftIndex = 0; leftIndex < fingerprints.length; leftIndex += 1) {
  const left = fingerprints[leftIndex]!;
  for (let rightIndex = leftIndex + 1; rightIndex < fingerprints.length; rightIndex += 1) {
    const right = fingerprints[rightIndex]!;
    if (left.kind !== right.kind || left.sourceHash === right.sourceHash) continue;
    const dHashDistance = hamming(left.dHash, right.dHash);
    const aHashDistance = hamming(left.aHash, right.aHash);
    const visualDistance = signatureDistance(left.signature, right.signature);
    if (dHashDistance <= 2 && aHashDistance <= 4 && visualDistance <= 0.001) {
      nearDuplicates.push({
        left: left.id,
        right: right.id,
        kind: left.kind,
        dHashDistance,
        aHashDistance,
        signatureDistance: Number(visualDistance.toFixed(6)),
      });
    }
  }
}
nearDuplicates.sort((a, b) =>
  a.dHashDistance + a.aHashDistance - b.dHashDistance - b.aHashDistance
  || a.left.localeCompare(b.left, "en")
  || a.right.localeCompare(b.right, "en"));

const unexpectedNearDuplicates = nearDuplicates.filter(
  ({ left, right }) => marketplaceReadyIds.has(left) && marketplaceReadyIds.has(right),
);
const unanchoredExclusions = STUDIO_CC0_MARKETPLACE_PERCEPTUAL_DUPLICATE_IDS.filter((id) =>
  !nearDuplicates.some(({ left, right }) =>
    (left === id && marketplaceReadyIds.has(right))
    || (right === id && marketplaceReadyIds.has(left)),
  ),
);

const report = {
  schema: "toonspectrum.marketplace-asset-similarity.v1",
  candidates: fingerprints.length,
  marketplaceReady: marketplaceReadyIds.size,
  threshold: { dHashDistance: 2, aHashDistance: 4, signatureDistance: 0.001 },
  nearDuplicates,
  unexpectedNearDuplicates,
  excludedIds: STUDIO_CC0_MARKETPLACE_PERCEPTUAL_DUPLICATE_IDS,
  unanchoredExclusions,
};
console.log(JSON.stringify(report, null, 2));
if (strict && (unexpectedNearDuplicates.length > 0 || unanchoredExclusions.length > 0)) {
  process.exitCode = 1;
}
