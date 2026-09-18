import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  DEFAULT_STUDIO_PUBLISH_PACKAGE_SETTINGS,
  STUDIO_PUBLISH_PACKAGE_SCHEMA,
  STUDIO_PUBLISH_PACKAGE_VERSION,
  STUDIO_PUBLISH_PLATFORM_PRESETS,
  planStudioPublishPackage,
  type StudioPublishPackageDestination,
  type StudioPublishPackagePlanInput,
  type StudioPublishRenderedImageMetadata,
  type StudioPublishThumbnailMetadata,
} from "../apps/web/src/domains/creator/studio-publish-package";
import {
  finalizeStudioPublishPackageManifest,
  serializeStudioPublishPackageManifest,
  type StudioPublishPackageActualArtifact,
} from "../apps/web/src/domains/creator/studio-publish-package-manifest-runtime";

export const STUDIO_PUBLISH_GOLDEN_SCHEMA_VERSION = 1 as const;
export const STUDIO_PUBLISH_GOLDEN_GENERATED_AT = "2026-09-17T00:00:00.000Z";
export const STUDIO_PUBLISH_GOLDEN_DIRECTORY = "tests/corpus/publish-packages";

const DESTINATIONS = ["generic", "webtoon", "tapas"] as const;
const INTERNAL_MARKERS = [
  "canvas-internal-",
  "render-internal-",
  "thumbnail-internal-",
  "/Users/creator/",
  "do-not-publish",
] as const;

export interface StudioPublishPackageGoldenReceipt {
  readonly schemaVersion: typeof STUDIO_PUBLISH_GOLDEN_SCHEMA_VERSION;
  readonly destination: StudioPublishPackageDestination;
  readonly policySnapshotDate: string;
  readonly presetRevision: string;
  readonly generatedAt: typeof STUDIO_PUBLISH_GOLDEN_GENERATED_AT;
  readonly canExport: true;
  readonly errorCodes: readonly string[];
  readonly warningCodes: readonly string[];
  readonly artifactOrder: readonly string[];
  readonly manifestSha256: string;
  readonly privacyMarkersAbsent: true;
  readonly manifest: ReturnType<typeof finalizeStudioPublishPackageManifest>;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    );
  }
  return value;
}

export function stableJson(value: unknown): string {
  return `${JSON.stringify(stableValue(value), null, 2)}\n`;
}

function destinationGeometry(destination: StudioPublishPackageDestination): {
  readonly width: number;
  readonly heights: readonly [number, number];
  readonly thumbnail: { readonly width: number; readonly height: number; readonly byteSize: number };
} {
  if (destination === "webtoon") {
    return {
      width: 800,
      heights: [1_280, 960],
      thumbnail: { width: 202, height: 142, byteSize: 120_000 },
    };
  }
  if (destination === "tapas") {
    return {
      width: 940,
      heights: [1_600, 1_200],
      thumbnail: { width: 300, height: 300, byteSize: 420_000 },
    };
  }
  return {
    width: 1_200,
    heights: [1_600, 1_200],
    thumbnail: { width: 1_200, height: 630, byteSize: 600_000 },
  };
}

export function createStudioPublishGoldenInput(
  destination: StudioPublishPackageDestination,
): StudioPublishPackagePlanInput {
  const geometry = destinationGeometry(destination);
  const canvases = geometry.heights.map((height, index) => ({
    id: `canvas-internal-${index + 1}`,
    width: geometry.width,
    height,
  }));
  const episodeImages: StudioPublishRenderedImageMetadata[] = geometry.heights.map(
    (height, index) => ({
      id: `render-internal-${index + 1}`,
      sourceCanvasId: canvases[index]!.id,
      mimeType: "image/jpeg",
      width: geometry.width,
      height,
      byteSize: 900_000 + index * 100_000,
      sha256: sha256(`${destination}:episode:${index + 1}`),
      fileName: `../../do-not-publish-${index + 1}.jpg`,
      localPath: `/Users/creator/private/page-${index + 1}.psd`,
    }),
  );
  const thumbnails: StudioPublishThumbnailMetadata[] = [{
    id: "thumbnail-internal-episode",
    slot: "episode",
    mimeType: "image/jpeg",
    width: geometry.thumbnail.width,
    height: geometry.thumbnail.height,
    byteSize: geometry.thumbnail.byteSize,
    sha256: sha256(`${destination}:thumbnail:episode`),
    fileName: "../../do-not-publish-thumbnail.jpg",
    localPath: "/Users/creator/private/thumbnail.psd",
  }];

  return {
    settings: {
      ...DEFAULT_STUDIO_PUBLISH_PACKAGE_SETTINGS,
      destination,
      outputFormat: "jpeg",
      requestedThumbnailSlots: ["episode"],
      includeReviewPdf: true,
      reviewPdfProfile: "image-only",
      includeCredits: true,
      aiUsage: "assisted",
      aiDisclosure: "색상 아이디어에 AI 보조를 사용하고 창작자가 최종 검수했습니다.",
      policyReviewConfirmed: true,
      thumbnailSafetyConfirmed: true,
    },
    seriesTitle: "별빛 탐정단",
    episodeTitle: "첫 번째 단서",
    episodeNumber: 7,
    canvases,
    episodeImages,
    thumbnails,
    creditsText: "글·그림: ToonStudio 기준 프로젝트\n배경 자료: 직접 제작",
    generatedAt: STUDIO_PUBLISH_GOLDEN_GENERATED_AT,
  };
}

function actualArtifacts(
  destination: StudioPublishPackageDestination,
  artifacts: ReturnType<typeof planStudioPublishPackage>["manifest"]["artifacts"],
): readonly StudioPublishPackageActualArtifact[] {
  return artifacts
    .filter((artifact) => artifact.role !== "manifest")
    .map((artifact, index) => ({
      fileName: artifact.fileName,
      mimeType: artifact.mimeType ?? "application/octet-stream",
      byteSize: artifact.byteSize ?? 2_000 + index,
      sha256: artifact.sha256 ?? sha256(`${destination}:${artifact.fileName}:${index}`),
    }));
}

export function createStudioPublishPackageGolden(
  destination: StudioPublishPackageDestination,
): StudioPublishPackageGoldenReceipt {
  const plan = planStudioPublishPackage(createStudioPublishGoldenInput(destination));
  if (!plan.canExport || plan.errors.length > 0) {
    throw new Error(
      `${destination} publish golden is not exportable: ${plan.errors.map((issue) => issue.code).join(", ")}`,
    );
  }
  const manifest = finalizeStudioPublishPackageManifest(
    plan.manifest,
    actualArtifacts(destination, plan.manifest.artifacts),
  );
  const serializedManifest = serializeStudioPublishPackageManifest(manifest);
  for (const marker of INTERNAL_MARKERS) {
    if (serializedManifest.includes(marker)) {
      throw new Error(`${destination} public manifest leaked internal marker: ${marker}`);
    }
  }
  if (
    manifest.schema !== STUDIO_PUBLISH_PACKAGE_SCHEMA
    || manifest.version !== STUDIO_PUBLISH_PACKAGE_VERSION
    || manifest.destination !== destination
  ) {
    throw new Error(`${destination} public manifest identity is inconsistent`);
  }
  if (
    manifest.artifacts.some((artifact) =>
      artifact.role !== "manifest"
      && (artifact.state !== "ready" || !artifact.sha256 || !artifact.byteSize))
  ) {
    throw new Error(`${destination} public manifest contains an unfinished artifact`);
  }

  const preset = STUDIO_PUBLISH_PLATFORM_PRESETS[destination];
  return Object.freeze({
    schemaVersion: STUDIO_PUBLISH_GOLDEN_SCHEMA_VERSION,
    destination,
    policySnapshotDate: preset.policySnapshotDate,
    presetRevision: preset.revision,
    generatedAt: STUDIO_PUBLISH_GOLDEN_GENERATED_AT,
    canExport: true,
    errorCodes: Object.freeze(plan.errors.map((issue) => issue.code)),
    warningCodes: Object.freeze(plan.warnings.map((issue) => issue.code)),
    artifactOrder: Object.freeze(
      manifest.artifacts.map((artifact) =>
        artifact.slot ? `${artifact.role}:${artifact.slot}` : artifact.role),
    ),
    manifestSha256: sha256(serializedManifest),
    privacyMarkersAbsent: true,
    manifest,
  });
}

function goldenPath(root: string, destination: StudioPublishPackageDestination): string {
  return resolve(root, STUDIO_PUBLISH_GOLDEN_DIRECTORY, `${destination}.json`);
}

export async function verifyStudioPublishPackageGoldens(
  root = process.cwd(),
  options: { readonly write?: boolean } = {},
): Promise<{
  readonly destinations: number;
  readonly artifacts: number;
  readonly changed: readonly string[];
}> {
  const directory = resolve(root, STUDIO_PUBLISH_GOLDEN_DIRECTORY);
  await mkdir(directory, { recursive: true });
  const changed: string[] = [];
  let artifacts = 0;

  for (const destination of DESTINATIONS) {
    const receipt = createStudioPublishPackageGolden(destination);
    artifacts += receipt.manifest.artifacts.length;
    const body = stableJson(receipt);
    const path = goldenPath(root, destination);
    if (options.write) {
      let previous = "";
      try {
        previous = await readFile(path, "utf8");
      } catch {
        // First generation.
      }
      if (previous !== body) {
        await writeFile(path, body, "utf8");
        changed.push(relative(root, path));
      }
      continue;
    }
    let committed: string;
    try {
      committed = await readFile(path, "utf8");
    } catch {
      throw new Error(`missing publish golden: ${relative(root, path)}`);
    }
    if (committed !== body) {
      throw new Error(
        `publish golden drifted: ${relative(root, path)}; run pnpm run update:studio-publish-goldens`,
      );
    }
  }

  const actualFiles = (await readdir(directory))
    .filter((name) => name.endsWith(".json"))
    .sort();
  const expectedFiles = DESTINATIONS.map((destination) => `${destination}.json`).sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error(
      `publish golden directory must contain exactly ${expectedFiles.join(", ")}; got ${actualFiles.join(", ")}`,
    );
  }

  return Object.freeze({
    destinations: DESTINATIONS.length,
    artifacts,
    changed: Object.freeze(changed),
  });
}

async function main(): Promise<void> {
  const write = process.argv.includes("--write");
  const result = await verifyStudioPublishPackageGoldens(process.cwd(), { write });
  process.stdout.write(
    `Studio publish package goldens ${write ? "updated" : "verified"}: ${result.destinations} destinations · ${result.artifacts} artifacts${result.changed.length ? ` · changed ${result.changed.join(", ")}` : ""}\n`,
  );
}

const entryUrl = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : "";
if (entryUrl === import.meta.url) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
