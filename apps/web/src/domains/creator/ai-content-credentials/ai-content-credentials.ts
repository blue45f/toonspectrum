/**
 * AI 생성 콘텐츠 표시(티켓 A7) 도메인 모델.
 *
 * Adobe Firefly Content Credentials / C2PA에서 영감을 받아,
 * AI로 생성·보조된 영역에 메타데이터를 태깅하고 내보내기용 공개 명세(manifest)를 만든다.
 * 플랫폼 정책(예: AI 생성물 표시 의무)에 대응하기 위한 "AI 사용 여부 표시" 옵션을 제공한다.
 *
 * DOM/Canvas에 의존하지 않는 순수 TypeScript 모듈이다.
 * 모든 함수는 입력 객체를 변경하지 않고 새 객체를 반환한다(불변).
 */

/** AI 작업 소스. "human"은 사람이 직접 작업한 영역을 뜻한다. */
export type AiContentSource =
  | "text-to-image"
  | "generative-fill"
  | "ai-colorize"
  | "ai-background"
  | "ai-upscale"
  | "ai-assisted"
  | "human";

export const AI_CONTENT_SOURCES: readonly AiContentSource[] = [
  "text-to-image",
  "generative-fill",
  "ai-colorize",
  "ai-background",
  "ai-upscale",
  "ai-assisted",
  "human",
];

/** 사람이 직접 작업한 영역을 나타내는 소스 값. */
export const HUMAN_SOURCE: AiContentSource = "human";

/** 공개 명세(manifest) 포맷 식별자. */
export const MANIFEST_FORMAT = "toonstudio/content-credentials" as const;
/** 현재 지원하는 manifest 버전. */
export const MANIFEST_VERSION = 1 as const;

/**
 * 에셋 안에서 AI가 관여한(또는 사람이 작업한) 개별 영역.
 * 레이어·브러시 작업 단위로 태깅되는 것을 상정한다.
 */
export interface AiContentRegion {
  /** 영역 고유 ID (에셋 안에서 유일해야 한다). */
  regionId: string;
  /** 이 영역을 만든/보조한 작업의 종류. */
  source: AiContentSource;
  /** 사용한 도구 이름 (예: "생성형 채우기", "AI 컬러라이즈"). */
  toolName: string;
  /** 사용한 모델 이름 (예: "toonstudio-image-1"). 없을 수 있다. */
  modelName?: string;
  /** 작업 시각 (ISO 8601 문자열). */
  createdAt: string;
  /** AI 판정 확신도 (0~1). 없을 수 있다. */
  confidence?: number;
}

/**
 * 하나의 에셋에 대한 콘텐츠 자격 증명(Content Credential).
 * 영역별 AI 태깅을 모아 둔 루트 객체다.
 */
export interface ContentCredential {
  /** 에셋 고유 ID. */
  assetId: string;
  /** 태깅된 영역 목록 (regionId 기준 유일). */
  regions: AiContentRegion[];
  /** 자격 증명을 발급한 주체 (예: "studio-web/2.4.0"). */
  generator: string;
  /** 발급 시각 (ISO 8601 문자열). */
  generatedAt: string;
  /** C2PA 표준과 호환되는 구조인지 여부. */
  c2paCompatible: boolean;
}

/** 내보내기용 manifest 생성 옵션. */
export interface BuildManifestOptions {
  /**
   * 내보낸 파일에 "AI 사용" 표시를 포함할지 여부.
   * 플랫폼 정책에 따라 표시를 켜고 끌 수 있다. 기본값 true.
   * false여도 영역 메타데이터 자체는 manifest에 보존된다.
   */
  showAiDisclosure?: boolean;
}

/** 뷰어 뱃지 렌더링 옵션. */
export interface BadgeOptions {
  /** false면 AI 콘텐츠가 있어도 뱃지를 표시하지 않는다(표시 토글). 기본값 true. */
  showDisclosure?: boolean;
}

/** manifest 역직렬화 결과. */
export interface ParsedDisclosureManifest {
  /** 복원된 콘텐츠 자격 증명. */
  credential: ContentCredential;
  /** manifest에 기록된 AI 표시 옵션. */
  showAiDisclosure: boolean;
}

const MAX_ID_LENGTH = 512;
const MAX_NAME_LENGTH = 256;

/** AI가 관여한 소스인지 판별한다 ("human" 제외). */
export function isAiContentSource(source: AiContentSource): boolean {
  return source !== HUMAN_SOURCE;
}

/** "human"을 제외한 모든 소스 값을 검사한다. */
function assertValidSource(source: unknown): asserts source is AiContentSource {
  if (typeof source !== "string" || !AI_CONTENT_SOURCES.includes(source as AiContentSource)) {
    throw new Error(`invalid-source: ${String(source)}`);
  }
}

function assertNonEmptyString(value: unknown, field: string, maxLength: number): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
    throw new Error(`invalid-${field}`);
  }
}

function assertIsoDate(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error(`invalid-${field}`);
  }
}

/** 영역 한 건의 유효성을 검사하고 정규화된 복사본을 반환한다. */
function normalizeRegion(input: unknown): AiContentRegion {
  if (!isRecord(input)) throw new Error("invalid-region");
  const { regionId, source, toolName, modelName, createdAt, confidence } = input;
  assertNonEmptyString(regionId, "region-id", MAX_NAME_LENGTH);
  assertValidSource(source);
  assertNonEmptyString(toolName, "tool-name", MAX_NAME_LENGTH);
  if (modelName !== undefined) {
    assertNonEmptyString(modelName, "model-name", MAX_NAME_LENGTH);
  }
  assertIsoDate(createdAt, "created-at");
  if (confidence !== undefined) {
    if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      throw new Error("invalid-confidence");
    }
  }
  const normalized: AiContentRegion = {
    regionId,
    source,
    toolName,
    createdAt,
  };
  if (modelName !== undefined) normalized.modelName = modelName;
  if (confidence !== undefined) normalized.confidence = confidence;
  return normalized;
}

/**
 * 새 콘텐츠 자격 증명을 만든다. 영역은 비어 있는 상태로 시작한다.
 */
export function createContentCredential(
  assetId: string,
  generator: string,
  options?: { generatedAt?: string; c2paCompatible?: boolean },
): ContentCredential {
  assertNonEmptyString(assetId, "asset-id", MAX_ID_LENGTH);
  assertNonEmptyString(generator, "generator", MAX_NAME_LENGTH);
  const generatedAt = options?.generatedAt ?? new Date().toISOString();
  assertIsoDate(generatedAt, "generated-at");
  return {
    assetId,
    regions: [],
    generator,
    generatedAt,
    c2paCompatible: options?.c2paCompatible ?? true,
  };
}

/**
 * 영역을 추가한다. 같은 regionId가 이미 있으면 해당 영역을 새 값으로 병합(덮어쓰기)한다.
 * 원본 credential은 변경하지 않는다.
 */
export function addRegion(credential: ContentCredential, region: AiContentRegion): ContentCredential {
  const normalized = normalizeRegion(region);
  const existingIndex = credential.regions.findIndex((item) => item.regionId === normalized.regionId);
  const regions =
    existingIndex === -1
      ? [...credential.regions, normalized]
      : credential.regions.map((item, index) => (index === existingIndex ? normalized : item));
  return { ...credential, regions };
}

/**
 * regionId에 해당하는 영역을 제거한다. 없으면 그대로 반환한다.
 * 원본 credential은 변경하지 않는다.
 */
export function removeRegion(credential: ContentCredential, regionId: string): ContentCredential {
  const regions = credential.regions.filter((item) => item.regionId !== regionId);
  if (regions.length === credential.regions.length) return credential;
  return { ...credential, regions };
}

/** AI가 관여한 영역이 하나라도 있는지 여부. */
export function hasAiContent(credential: ContentCredential): boolean {
  return credential.regions.some((region) => isAiContentSource(region.source));
}

/**
 * 전체 영역 중 AI 영역이 차지하는 비율 (0~1).
 * 영역이 하나도 없으면 0을 반환한다.
 */
export function aiRegionRatio(credential: ContentCredential): number {
  if (credential.regions.length === 0) return 0;
  const aiCount = credential.regions.filter((region) => isAiContentSource(region.source)).length;
  return aiCount / credential.regions.length;
}

/** 사용된 AI 소스 종류를 중복 없이 나열한다 ("human" 제외). */
export function listAiSources(credential: ContentCredential): AiContentSource[] {
  const sources = new Set<AiContentSource>();
  for (const region of credential.regions) {
    if (isAiContentSource(region.source)) sources.add(region.source);
  }
  return [...sources];
}

/** AI 소스를 C2PA 액션 이름으로 매핑한다. */
function sourceToC2paAction(source: AiContentSource): string {
  return source === "text-to-image" ? "c2pa.created" : "c2pa.edited";
}

interface ManifestAssertion {
  label: string;
  data: Record<string, unknown>;
}

/**
 * 내보내기용 공개 명세(manifest) JSON을 만든다.
 * C2PA의 claim/assertion 구조에서 영감을 받은 형태다.
 */
export function buildDisclosureManifest(
  credential: ContentCredential,
  options?: BuildManifestOptions,
): string {
  const showAiDisclosure = options?.showAiDisclosure ?? true;
  const actions = credential.regions.map((region) => ({
    action: sourceToC2paAction(region.source),
    digital_source_type:
      region.source === "human"
        ? "http://cv.iptc.org/newscodes/c2paDigitalsourcetype/humanEditing"
        : "http://cv.iptc.org/newscodes/c2paDigitalsourcetype/trainedAlgorithmicMedia",
    tool: region.toolName,
    ...(region.modelName !== undefined ? { model: region.modelName } : {}),
    when: region.createdAt,
  }));
  const assertions: ManifestAssertion[] = [
    { label: "c2pa.actions", data: { actions } },
    {
      label: "toonstudio.ai-regions",
      data: { regions: credential.regions.map((region) => ({ ...region })) },
    },
    {
      label: "toonstudio.ai-summary",
      data: {
        has_ai_content: hasAiContent(credential),
        ai_region_ratio: aiRegionRatio(credential),
        ai_sources: listAiSources(credential),
      },
    },
  ];
  const manifest = {
    format: MANIFEST_FORMAT,
    version: MANIFEST_VERSION,
    claim_generator: `toonstudio/${credential.generator}`,
    generated_at: credential.generatedAt,
    asset_id: credential.assetId,
    generator: credential.generator,
    c2pa_compatible: credential.c2paCompatible,
    disclosure: { show_ai_disclosure: showAiDisclosure },
    assertions,
  };
  return JSON.stringify(manifest);
}

/**
 * 뷰어에 표시할 뱃지 텍스트를 만든다.
 * AI 콘텐츠가 없거나 표시가 꺼져 있으면 빈 문자열을 반환한다(뱃지 미표시).
 */
export function formatDisclosureBadge(
  credential: ContentCredential,
  locale: "ko" | "en" = "ko",
  options?: BadgeOptions,
): string {
  if (options?.showDisclosure === false) return "";
  if (!hasAiContent(credential)) return "";
  return locale === "en" ? "AI-generated" : "AI 생성 포함";
}

/** 위험한 키(__proto__ 등)가 들어간 JSON을 거부하는 reviver. */
function safeJsonParse(text: string): unknown {
  return JSON.parse(text, (property: string, value: unknown) => {
    if (["__proto__", "constructor", "prototype"].includes(property)) {
      throw new Error("unsafe-manifest-key");
    }
    return value;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * manifest JSON을 역직렬화하고 검증한다.
 * 형식이 올바르지 않으면 Error를 던진다.
 */
export function parseDisclosureManifest(text: string): ParsedDisclosureManifest {
  if (typeof text !== "string" || text.length === 0) {
    throw new Error("empty-manifest");
  }
  let parsed: unknown;
  try {
    parsed = safeJsonParse(text);
  } catch (error) {
    if (error instanceof Error && error.message === "unsafe-manifest-key") throw error;
    throw new Error("invalid-manifest-json", { cause: error });
  }
  if (!isRecord(parsed)) throw new Error("invalid-manifest");

  if (parsed.format !== MANIFEST_FORMAT) throw new Error("invalid-manifest-format");
  if (parsed.version !== MANIFEST_VERSION) throw new Error("unsupported-manifest-version");

  const assetId = parsed.asset_id;
  const generator = parsed.generator;
  const generatedAt = parsed.generated_at;
  const c2paCompatible = parsed.c2pa_compatible;
  const disclosure = parsed.disclosure;
  const assertions = parsed.assertions;

  assertNonEmptyString(assetId, "asset-id", MAX_ID_LENGTH);
  assertNonEmptyString(generator, "generator", MAX_NAME_LENGTH);
  assertIsoDate(generatedAt, "generated-at");
  if (typeof c2paCompatible !== "boolean") throw new Error("invalid-c2pa-compatible");

  if (!isRecord(disclosure) || typeof disclosure.show_ai_disclosure !== "boolean") {
    throw new Error("invalid-disclosure");
  }
  const showAiDisclosure = disclosure.show_ai_disclosure;

  if (!Array.isArray(assertions)) throw new Error("invalid-assertions");
  const regionsAssertion = assertions.find(
    (assertion): assertion is ManifestAssertion =>
      isRecord(assertion) && assertion.label === "toonstudio.ai-regions" && isRecord(assertion.data),
  );
  if (!regionsAssertion) throw new Error("missing-ai-regions-assertion");
  const rawRegions = (regionsAssertion.data as Record<string, unknown>).regions;
  if (!Array.isArray(rawRegions)) throw new Error("invalid-regions");

  const regions = rawRegions.map((raw) => normalizeRegion(raw));
  const regionIds = new Set(regions.map((region) => region.regionId));
  if (regionIds.size !== regions.length) throw new Error("duplicate-region-id");

  const credential: ContentCredential = {
    assetId,
    regions,
    generator,
    generatedAt,
    c2paCompatible,
  };
  return { credential, showAiDisclosure };
}
