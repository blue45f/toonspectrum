import { STUDIO_INTERCHANGE_CAPABILITIES } from "./studio-interchange-capabilities";

import type { StudioInterchangeCapability } from "./studio-interchange-capabilities";

export type StudioFileControlActionId =
  | "archive-copy"
  | "archive-recovery"
  | "interchange-import"
  | "named-version"
  | "new-work"
  | "project-json-import"
  | "psd-import";

export interface StudioFileControlActionSpec {
  readonly id: StudioFileControlActionId;
  readonly label: string;
  readonly description: string;
  /**
   * Each entry is an AND matcher; the first matcher whose terms are all present
   * in an existing Project Center button wins. This delegates execution to the
   * established owner instead of creating a second save/import implementation.
   */
  readonly buttonMatchers: readonly (readonly string[])[];
}

export const STUDIO_FILE_CONTROL_ACTIONS: readonly StudioFileControlActionSpec[] =
  Object.freeze([
    Object.freeze({
      id: "new-work",
      label: "새 작업 준비",
      description: "템플릿 또는 웹툰 마법사에서 새 작업을 준비합니다.",
      buttonMatchers: Object.freeze([
        Object.freeze(["빠른 시작", "새 작업"]),
        Object.freeze(["빠른 시작"]),
      ]),
    }),
    Object.freeze({
      id: "named-version",
      label: "이름 붙인 버전",
      description: "복원 가능한 체크포인트를 만들고 이전 버전을 비교합니다.",
      buttonMatchers: Object.freeze([
        Object.freeze(["버전 체크포인트"]),
        Object.freeze(["체크포인트"]),
      ]),
    }),
    Object.freeze({
      id: "archive-copy",
      label: "이 기기에 완전 사본",
      description: "원본 자산을 포함한 .toonproject.zip 아카이브를 저장합니다.",
      buttonMatchers: Object.freeze([Object.freeze(["아카이브 백업"])]),
    }),
    Object.freeze({
      id: "archive-recovery",
      label: "아카이브에서 복구",
      description: "무결성을 검증한 프로젝트 아카이브를 엽니다.",
      buttonMatchers: Object.freeze([
        Object.freeze(["아카이브 복구"]),
        Object.freeze(["프로젝트 아카이브", "가져오기"]),
      ]),
    }),
    Object.freeze({
      id: "project-json-import",
      label: "JSON 백업 가져오기",
      description: "가벼운 ToonSpectrum 프로젝트 JSON 백업을 엽니다.",
      buttonMatchers: Object.freeze([
        Object.freeze(["프로젝트", "가져오기"]),
        Object.freeze(["JSON", "가져오기"]),
      ]),
    }),
    Object.freeze({
      id: "psd-import",
      label: "PSD 가져오기",
      description: "PSD의 레이어 구조와 호환성 진단을 거쳐 가져옵니다.",
      buttonMatchers: Object.freeze([Object.freeze(["PSD", "가져오기"])]),
    }),
    Object.freeze({
      id: "interchange-import",
      label: "ORA · CBZ · WILL 가져오기",
      description: "공개·교환용 문서 형식을 형식별 파이프라인으로 엽니다.",
      buttonMatchers: Object.freeze([
        Object.freeze(["ORA", "CBZ", "WILL", "가져오기"]),
        Object.freeze(["ORA", "가져오기"]),
      ]),
    }),
  ] satisfies readonly StudioFileControlActionSpec[]);

export function studioFileControlAction(
  id: StudioFileControlActionId,
): StudioFileControlActionSpec {
  const action = STUDIO_FILE_CONTROL_ACTIONS.find((candidate) => candidate.id === id);
  if (!action) throw new Error(`Unknown Studio file action: ${id}`);
  return action;
}

export type StudioFileCompatibilityTier =
  | "blocked"
  | "bridge"
  | "native"
  | "structured"
  | "unsupported";

export interface StudioFileCandidate {
  readonly name: string;
  readonly size: number;
  readonly type?: string;
}

export interface StudioFileCompatibilityReport {
  readonly name: string;
  readonly extension: string;
  readonly sizeBytes: number;
  readonly sizeLabel: string;
  readonly capabilityId: string | null;
  readonly capabilityLabel: string;
  readonly tier: StudioFileCompatibilityTier;
  readonly tierLabel: string;
  readonly summary: string;
  readonly risks: readonly string[];
  readonly recommendations: readonly string[];
  readonly maxFileBytes: number | null;
  readonly withinSizeBudget: boolean;
  readonly importSupport: StudioInterchangeCapability["import"] | "unknown";
  readonly uiWiring: StudioInterchangeCapability["uiWiring"]["import"] | "unknown";
  readonly actionId: StudioFileControlActionId | null;
}

const UNSUPPORTED_BRIDGES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  ".clip": Object.freeze([
    "CLIP STUDIO PAINT에서 편집 구조가 필요하면 PSD/PSB 사본, 범용 레이어 교환은 ORA로 내보낸 뒤 가져오세요.",
    "원본 .clip 문서는 별도로 보관하세요. ToonSpectrum은 .clip 완전 왕복을 주장하지 않습니다.",
  ]),
  ".cmc": Object.freeze([
    "CLIP STUDIO의 다중 페이지 프로젝트를 페이지별 PSD/ORA와 원본 .cmc 폴더로 함께 보관하세요.",
  ]),
  ".kra": Object.freeze([
    "Krita에서 ORA 또는 PSD 사본을 만들고, 원본 .kra는 편집 기준본으로 별도 보관하세요.",
  ]),
  ".pdf": Object.freeze([
    "페이지별 PNG/PSD로 변환한 뒤 가져오세요. PDF의 폰트·벡터·페이지 상자는 현재 직접 복원하지 않습니다.",
  ]),
  ".ppt": Object.freeze(["슬라이드를 PNG 또는 PDF로 내보낸 뒤 페이지별로 가져오세요."]),
  ".pptx": Object.freeze(["슬라이드를 PNG 또는 PDF로 내보낸 뒤 페이지별로 가져오세요."]),
  ".doc": Object.freeze(["문서 페이지를 PDF 또는 이미지로 내보낸 뒤 가져오세요."]),
  ".docx": Object.freeze(["문서 페이지를 PDF 또는 이미지로 내보낸 뒤 가져오세요."]),
  ".ai": Object.freeze(["Illustrator에서 SVG 또는 PSD 사본을 내보낸 뒤 가져오세요."]),
  ".afdesign": Object.freeze(["Affinity Designer에서 SVG, PSD 또는 PNG 사본을 내보낸 뒤 가져오세요."]),
});

const MULTI_PART_EXTENSIONS = Object.freeze([".toonproject.zip"] as const);

function normalizeText(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

export function studioFileExtension(name: string): string {
  const normalized = normalizeText(name);
  const multiPart = MULTI_PART_EXTENSIONS.find((extension) => normalized.endsWith(extension));
  if (multiPart) return multiPart;
  const slash = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  const baseName = normalized.slice(slash + 1);
  const dot = baseName.lastIndexOf(".");
  if (dot <= 0 || dot === baseName.length - 1) return "";
  return baseName.slice(dot);
}

function capabilityFor(
  extension: string,
  mime: string | undefined,
): StudioInterchangeCapability | null {
  const normalizedMime = normalizeText(mime ?? "");
  return STUDIO_INTERCHANGE_CAPABILITIES.find((capability) =>
    capability.extensions.some((candidate) => normalizeText(candidate) === extension)
    || (normalizedMime.length > 0
      && capability.mime.some((candidate) => normalizeText(candidate) === normalizedMime)),
  ) ?? null;
}

function importActionForExtension(extension: string): StudioFileControlActionId | null {
  if (extension === ".toonproject.zip") return "archive-recovery";
  if (extension === ".json") return "project-json-import";
  if (extension === ".psd") return "psd-import";
  if (extension === ".ora" || extension === ".cbz" || extension === ".will") {
    return "interchange-import";
  }
  return null;
}

function compatibilityTier(
  capability: StudioInterchangeCapability | null,
  withinSizeBudget: boolean,
): StudioFileCompatibilityTier {
  if (!withinSizeBudget) return "blocked";
  if (!capability || capability.import === "unsupported") return "unsupported";
  if (capability.import === "engine-ready" || capability.uiWiring.import === "not-wired") {
    return "bridge";
  }
  if (capability.id === "toonproject-archive" || capability.roundTrip === "lossless") {
    return "native";
  }
  return "structured";
}

function tierLabel(tier: StudioFileCompatibilityTier): string {
  switch (tier) {
    case "native":
      return "정식 복구 형식";
    case "structured":
      return "가져오기 가능 · 손실 확인";
    case "bridge":
      return "변환 또는 런타임 필요";
    case "blocked":
      return "용량 한도 초과";
    case "unsupported":
      return "직접 가져오기 미지원";
  }
}

function summaryFor(
  capability: StudioInterchangeCapability | null,
  tier: StudioFileCompatibilityTier,
  extension: string,
): string {
  if (extension === ".zip" && !capability) {
    return "일반 ZIP은 프로젝트 형식으로 식별할 수 없습니다. ToonSpectrum이 만든 .toonproject.zip만 복구하세요.";
  }
  if (!capability) {
    return `${extension || "확장자 없는 파일"} 형식은 현재 감사된 가져오기 레지스트리에 없습니다.`;
  }
  switch (tier) {
    case "native":
      return `${capability.label}은 프로젝트 구조와 포함 자산을 보존하는 정식 이동·복구 경로입니다.`;
    case "structured":
      return `${capability.label}은 가져올 수 있지만 원본 앱 전용 기능은 변환되거나 누락될 수 있습니다.`;
    case "bridge":
      return `${capability.label} 파이프라인은 현재 UI에 완전히 연결되지 않았거나 브라우저 런타임에 의존합니다.`;
    case "blocked":
      return `${capability.label} 파일이 현재 감사된 단일 파일 용량 한도를 넘습니다.`;
    case "unsupported":
      return `${capability.label}은 현재 직접 가져오기를 지원하지 않습니다.`;
  }
}

export function formatStudioFileBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "알 수 없음";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"] as const;
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const fractionDigits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(fractionDigits)} ${units[unitIndex]}`;
}

export function inspectStudioFileCandidate(
  file: StudioFileCandidate,
): StudioFileCompatibilityReport {
  const extension = studioFileExtension(file.name);
  const capability = capabilityFor(extension, file.type);
  const maxFileBytes = capability?.sizeBudget.maxFileBytes ?? null;
  const withinSizeBudget = maxFileBytes === null || file.size <= maxFileBytes;
  const tier = compatibilityTier(capability, withinSizeBudget);
  const bridgeRecommendations = UNSUPPORTED_BRIDGES[extension] ?? [];
  const recommendations = [
    ...(capability?.recommendedBridge ?? []),
    ...bridgeRecommendations,
  ];
  const risks = capability?.lossModel ?? [];
  const actionId = tier === "blocked" || tier === "bridge" || tier === "unsupported"
    ? null
    : importActionForExtension(extension);

  return Object.freeze({
    name: file.name,
    extension,
    sizeBytes: file.size,
    sizeLabel: formatStudioFileBytes(file.size),
    capabilityId: capability?.id ?? null,
    capabilityLabel: capability?.label ?? (extension ? extension.toUpperCase() : "확장자 없는 파일"),
    tier,
    tierLabel: tierLabel(tier),
    summary: summaryFor(capability, tier, extension),
    risks: Object.freeze([...risks]),
    recommendations: Object.freeze([...recommendations]),
    maxFileBytes,
    withinSizeBudget,
    importSupport: capability?.import ?? "unknown",
    uiWiring: capability?.uiWiring.import ?? "unknown",
    actionId,
  });
}

export interface StudioRecentLocalFile {
  readonly name: string;
  readonly extension: string;
  readonly sizeBytes: number;
  readonly inspectedAt: string;
  readonly actionId: StudioFileControlActionId | null;
}

const MAX_RECENT_LOCAL_FILES = 5;

function isRecentLocalFile(value: unknown): value is StudioRecentLocalFile {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StudioRecentLocalFile>;
  return typeof candidate.name === "string"
    && typeof candidate.extension === "string"
    && typeof candidate.sizeBytes === "number"
    && Number.isFinite(candidate.sizeBytes)
    && candidate.sizeBytes >= 0
    && typeof candidate.inspectedAt === "string"
    && Number.isFinite(Date.parse(candidate.inspectedAt))
    && (candidate.actionId === null
      || STUDIO_FILE_CONTROL_ACTIONS.some((action) => action.id === candidate.actionId));
}

export function parseStudioRecentLocalFiles(raw: string | null): readonly StudioRecentLocalFile[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return Object.freeze(parsed.filter(isRecentLocalFile).slice(0, MAX_RECENT_LOCAL_FILES));
  } catch {
    return [];
  }
}

export function addStudioRecentLocalFile(
  current: readonly StudioRecentLocalFile[],
  report: StudioFileCompatibilityReport,
  inspectedAt = new Date().toISOString(),
): readonly StudioRecentLocalFile[] {
  const normalizedName = normalizeText(report.name);
  const next: StudioRecentLocalFile[] = [
    Object.freeze({
      name: report.name,
      extension: report.extension,
      sizeBytes: report.sizeBytes,
      inspectedAt,
      actionId: report.actionId,
    }),
    ...current.filter((entry) => normalizeText(entry.name) !== normalizedName),
  ];
  return Object.freeze(next.slice(0, MAX_RECENT_LOCAL_FILES));
}
