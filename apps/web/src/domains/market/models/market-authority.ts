import {
  CREATOR_MARKETPLACE_RUNTIME_BY_KIND,
  CreatorMarketplacePortablePayloadSchema,
  CreatorMarketplaceResourceManifestSchema,
  canonicalizeCreatorMarketplaceJson,
  creatorMarketplaceJsonByteSize,
  type CreatorMarketplaceJsonValue,
  type CreatorMarketplaceResourceEngine,
  type CreatorMarketplaceResourceLicense,
  type CreatorMarketplaceResourceManifest,
} from "@/shared/lib/creator-marketplace-resource-contract";

export type MarketManifestParseResult =
  | Readonly<{ state: "empty"; manifest: null; message: string }>
  | Readonly<{ state: "invalid"; manifest: null; message: string }>
  | Readonly<{
      state: "valid";
      manifest: CreatorMarketplaceResourceManifest;
      message: string;
    }>;

export interface PreparedAuthoritativeMarketManifest {
  readonly manifest: CreatorMarketplaceResourceManifest;
  readonly convertedFromAuthoring: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function boundedText(value: string, max: number): string {
  return Array.from(value.trim()).slice(0, max).join("");
}

function uniqueTags(value: unknown): string[] {
  return [...new Set(strings(value)
    .map((tag) => boundedText(tag.replace(/^#/u, ""), 24))
    .filter(Boolean))]
    .slice(0, 8);
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function authoringPackageId(title: string): Promise<string> {
  const normalizedTitle = title.normalize("NFKC").trim().toLowerCase();
  const slug = normalizedTitle
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 64) || "brush";
  const digest = await sha256Hex(`brush\u0000${normalizedTitle}`);
  return `community/brush/${slug}-${digest.slice(0, 12)}`;
}

function authoringLicense(value: unknown): CreatorMarketplaceResourceLicense {
  if (
    value === "toonspectrum-standard"
    || value === "cc0-1.0"
    || value === "cc-by-4.0"
    || value === "cc-by-nc-4.0"
  ) return value;
  return "toonspectrum-standard";
}

function authoringEngines(value: unknown): CreatorMarketplaceResourceEngine[] {
  const compatibility = isRecord(value) ? value : {};
  const engines: CreatorMarketplaceResourceEngine[] = [];
  if (compatibility.canvas2d === true) engines.push("canvas2d");
  if (compatibility.webgl2 === true) engines.push("webgl2");
  if (compatibility.webgpu === true) engines.push("webgpu");
  return engines.length > 0 ? engines : ["canvas2d"];
}

function authoringBrushSnapshot(value: Record<string, unknown>): CreatorMarketplaceJsonValue {
  const brush = isRecord(value.brush) ? value.brush : {};
  const source = isRecord(value.source) ? value.source : {};
  const originalSnapshot = brush.studioSnapshot ?? source.studioSnapshot;
  if (isRecord(originalSnapshot) && Object.keys(originalSnapshot).length > 0) {
    return originalSnapshot as CreatorMarketplaceJsonValue;
  }

  const snapshot = {
    schemaVersion: 2,
    deterministicSeed: brush.deterministicSeed ?? 0,
    presetFamily: text(brush.presetFamily) || "custom",
    intendedUse: strings(brush.intendedUse),
    engineNodes: Array.isArray(brush.engineNodes) ? brush.engineNodes : [],
    enginePrograms: Array.isArray(brush.enginePrograms) ? brush.enginePrograms : [],
  } satisfies Record<string, CreatorMarketplaceJsonValue>;
  return snapshot;
}

async function convertAuthoringEnvelope(
  value: Record<string, unknown>,
): Promise<CreatorMarketplaceResourceManifest> {
  if (
    value.format !== "toonspectrum.creator-marketplace-authoring"
    || value.schemaVersion !== 2
  ) {
    throw new Error("지원하는 Studio 저작 envelope가 아닙니다.");
  }

  const resource = isRecord(value.resource) ? value.resource : {};
  if (resource.kind !== "brush") {
    throw new Error(
      "이 저작 envelope 종류는 아직 공개 manifest 자동 변환을 지원하지 않습니다. Studio에서 해당 종류의 공개 manifest를 내보내 주세요.",
    );
  }
  const rights = isRecord(value.rights) ? value.rights : {};
  if (rights.originalWorkAttested !== true || rights.previewRightsAttested !== true) {
    throw new Error("워크숍에서 원본 제작 권리와 미리보기 미디어 권리를 모두 확인해 주세요.");
  }
  if (rights.containsThirdPartyContent === true) {
    throw new Error(
      "제3자 콘텐츠가 포함된 저작 초안은 출처 URL과 원본 사용권 URL을 갖춘 공개 manifest로 별도 내보내야 합니다.",
    );
  }

  const title = boundedText(text(resource.title), 80);
  if (!title) throw new Error("워크숍 에셋 이름을 입력해 주세요.");
  const release = isRecord(value.release) ? value.release : {};
  const compatibility = isRecord(value.compatibility) ? value.compatibility : {};
  const technical = isRecord(value.technical) ? value.technical : {};
  const payload = CreatorMarketplacePortablePayloadSchema.parse({
    schemaVersion: 1,
    resourceKind: "brush",
    runtime: CREATOR_MARKETPLACE_RUNTIME_BY_KIND.brush,
    definition: {
      snapshot: authoringBrushSnapshot(value),
    },
  });
  const canonicalPayload = canonicalizeCreatorMarketplaceJson(payload);
  const releaseNotes = boundedText(text(release.changelog), 2_000);
  const description = boundedText(
    [text(resource.summary), text(resource.description)].filter(Boolean).join("\n\n"),
    1_000,
  );

  return CreatorMarketplaceResourceManifestSchema.parse({
    schemaVersion: 1,
    packageId: await authoringPackageId(title),
    name: title,
    description,
    ...(releaseNotes ? { releaseNotes } : {}),
    kind: "brush",
    resourceVersion: text(release.version) || "1.0.0",
    minimumStudioVersion: text(compatibility.minAppVersion) || "1.0.0",
    tags: uniqueTags(resource.tags),
    license: authoringLicense(rights.license),
    attributionText: "",
    containsAi: technical.containsAi === true,
    rightsConfirmed: true,
    provenance: { origin: "original", authoredByPublisher: true },
    compatibility: { engines: authoringEngines(compatibility) },
    entries: [{
      id: "brush/main",
      kind: "brush",
      name: title,
      delivery: {
        mode: "portable-json",
        mediaType: "application/vnd.toonspectrum.brush+json",
        payload,
        byteSize: creatorMarketplaceJsonByteSize(payload),
        sha256: await sha256Hex(canonicalPayload),
      },
    }],
  });
}

/**
 * Public marketplace authority belongs to the server. This parser accepts only a complete,
 * contract-valid immutable release manifest; browser-only records are never promoted implicitly.
 */
export function parseAuthoritativeMarketManifest(
  source: string,
): MarketManifestParseResult {
  const normalized = source.trim();
  if (!normalized) {
    return {
      state: "empty",
      manifest: null,
      message: "Studio에서 만든 manifest JSON을 불러오세요.",
    };
  }

  let value: unknown;
  try {
    value = JSON.parse(normalized) as unknown;
  } catch {
    return {
      state: "invalid",
      manifest: null,
      message: "JSON 형식을 해석할 수 없습니다. 파일 내용과 쉼표를 확인해 주세요.",
    };
  }

  const result = CreatorMarketplaceResourceManifestSchema.safeParse(value);
  if (!result.success) {
    const detail = result.error.issues
      .slice(0, 3)
      .map((issue) => {
        const location = issue.path.length > 0 ? issue.path.join(".") : "manifest";
        return `${location}: ${issue.message}`;
      })
      .join(" · ");
    return {
      state: "invalid",
      manifest: null,
      message: detail || "manifest 검증을 통과하지 못했습니다.",
    };
  }

  return {
    state: "valid",
    manifest: result.data,
    message: `v${result.data.resourceVersion} · ${result.data.entries.length}개 항목 · 서버 게시 준비 완료`,
  };
}

/**
 * Accepts either an already-valid public manifest or the v2 authoring envelope emitted by the
 * marketplace workshop. Authoring conversion is explicit, deterministic and contract-validated;
 * no browser record is treated as published until the server returns a release record.
 */
export async function prepareAuthoritativeMarketManifest(
  source: string,
): Promise<PreparedAuthoritativeMarketManifest> {
  const direct = parseAuthoritativeMarketManifest(source);
  if (direct.state === "valid") {
    return { manifest: direct.manifest, convertedFromAuthoring: false };
  }

  let value: unknown;
  try {
    value = JSON.parse(source) as unknown;
  } catch {
    throw new Error(direct.message);
  }
  if (!isRecord(value)) throw new Error(direct.message);
  return {
    manifest: await convertAuthoringEnvelope(value),
    convertedFromAuthoring: true,
  };
}

/**
 * The cache namespace changed when local drafts and starter fixtures stopped being public data.
 * Reusing v1 mixed caches would re-introduce browser-authored records into the public catalog.
 */
export function authoritativeMarketCacheKey(serializedQuery: string): string {
  return `authority:v2:${serializedQuery}`;
}

export function marketAuthorityErrorMessage(
  error: unknown,
  fallback: string,
): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback;
}
