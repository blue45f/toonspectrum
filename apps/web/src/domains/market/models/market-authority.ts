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

function rotateRight(value: number, shift: number): number {
  return (value >>> shift) | (value << (32 - shift));
}

/** Small synchronous SHA-256 used only while adapting a JSON authoring envelope in render-time parsing. */
function sha256Hex(value: string): string {
  const constants = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
    0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
    0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
    0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
    0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
    0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const bytes = new TextEncoder().encode(value);
  const bitLength = bytes.length * 8;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x1_0000_0000), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);

  const hash = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const schedule = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      schedule[index] = view.getUint32(offset + index * 4, false);
    }
    for (let index = 16; index < 64; index += 1) {
      const left = schedule[index - 15] ?? 0;
      const right = schedule[index - 2] ?? 0;
      const sigma0 = rotateRight(left, 7) ^ rotateRight(left, 18) ^ (left >>> 3);
      const sigma1 = rotateRight(right, 17) ^ rotateRight(right, 19) ^ (right >>> 10);
      schedule[index] = (
        (schedule[index - 16] ?? 0)
        + sigma0
        + (schedule[index - 7] ?? 0)
        + sigma1
      ) >>> 0;
    }

    let a = hash[0] ?? 0;
    let b = hash[1] ?? 0;
    let c = hash[2] ?? 0;
    let d = hash[3] ?? 0;
    let e = hash[4] ?? 0;
    let f = hash[5] ?? 0;
    let g = hash[6] ?? 0;
    let h = hash[7] ?? 0;

    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temporary1 = (h + sum1 + choose + (constants[index] ?? 0) + (schedule[index] ?? 0)) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temporary2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }

    hash[0] = ((hash[0] ?? 0) + a) >>> 0;
    hash[1] = ((hash[1] ?? 0) + b) >>> 0;
    hash[2] = ((hash[2] ?? 0) + c) >>> 0;
    hash[3] = ((hash[3] ?? 0) + d) >>> 0;
    hash[4] = ((hash[4] ?? 0) + e) >>> 0;
    hash[5] = ((hash[5] ?? 0) + f) >>> 0;
    hash[6] = ((hash[6] ?? 0) + g) >>> 0;
    hash[7] = ((hash[7] ?? 0) + h) >>> 0;
  }

  return Array.from(hash, (word) => word.toString(16).padStart(8, "0")).join("");
}

function authoringPackageId(title: string): string {
  const normalizedTitle = title.normalize("NFKC").trim().toLowerCase();
  const slug = normalizedTitle
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 64) || "brush";
  const digest = sha256Hex(`brush\u0000${normalizedTitle}`);
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

function asJsonValue(value: unknown, fallback: CreatorMarketplaceJsonValue): CreatorMarketplaceJsonValue {
  try {
    return JSON.parse(JSON.stringify(value)) as CreatorMarketplaceJsonValue;
  } catch {
    return fallback;
  }
}

function authoringBrushSnapshot(value: Record<string, unknown>): CreatorMarketplaceJsonValue {
  const brush = isRecord(value.brush) ? value.brush : {};
  const source = isRecord(value.source) ? value.source : {};
  const originalSnapshot = brush.studioSnapshot ?? source.studioSnapshot;
  if (isRecord(originalSnapshot) && Object.keys(originalSnapshot).length > 0) {
    return asJsonValue(originalSnapshot, { schemaVersion: 2 });
  }

  return {
    schemaVersion: 2,
    deterministicSeed: typeof brush.deterministicSeed === "number"
      ? brush.deterministicSeed
      : 0,
    presetFamily: text(brush.presetFamily) || "custom",
    intendedUse: strings(brush.intendedUse),
    engineNodes: asJsonValue(brush.engineNodes, []),
    enginePrograms: asJsonValue(brush.enginePrograms, []),
  };
}

function convertAuthoringEnvelope(
  value: Record<string, unknown>,
): CreatorMarketplaceResourceManifest {
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
    packageId: authoringPackageId(title),
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
        sha256: sha256Hex(canonicalPayload),
      },
    }],
  });
}

/**
 * Public marketplace authority belongs to the server. This parser accepts either a complete,
 * contract-valid immutable release manifest or the explicit v2 Brush Studio authoring envelope.
 * Browser-only records are never promoted implicitly and the server still owns public state.
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
  if (result.success) {
    return {
      state: "valid",
      manifest: result.data,
      message: `v${result.data.resourceVersion} · ${result.data.entries.length}개 항목 · 서버 게시 준비 완료`,
    };
  }

  if (isRecord(value) && value.format === "toonspectrum.creator-marketplace-authoring") {
    try {
      const manifest = convertAuthoringEnvelope(value);
      return {
        state: "valid",
        manifest,
        message: `Brush Studio 저작 초안을 v${manifest.resourceVersion} 공개 manifest로 변환했습니다 · 서버 게시 준비 완료`,
      };
    } catch (caught) {
      return {
        state: "invalid",
        manifest: null,
        message: caught instanceof Error && caught.message.trim()
          ? caught.message
          : "Studio 저작 초안을 공개 manifest로 변환하지 못했습니다.",
      };
    }
  }

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
