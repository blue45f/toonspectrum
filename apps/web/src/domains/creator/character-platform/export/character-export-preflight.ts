import { createCharacterCompatibilityReport } from "../compatibility/character-compatibility-report";

import type {
  CharacterCapabilityProfile,
  CharacterSemanticPassId,
} from "../../character-shaper/character-shaper-contract";
import type { CharacterCompatibilityReport } from "../compatibility/character-compatibility-report";

export type CharacterExportFormat = "png" | "psd";
export type CharacterExportExecutionStrategy = "direct-main-thread" | "tile-worker";
export type CharacterExportPassStatus = "planned" | "conditional" | "skipped";

export interface CharacterExportPassPlan {
  readonly pass: CharacterSemanticPassId;
  readonly label: string;
  readonly status: CharacterExportPassStatus;
  readonly reason: string;
}

export interface CharacterExportPreflightWarning {
  readonly code:
    | "model-not-ready"
    | "compatibility-limited"
    | "high-memory"
    | "surface-paint-empty"
    | "transparent-background";
  readonly message: string;
}

export interface CharacterExportPreflight {
  readonly format: CharacterExportFormat;
  readonly width: number;
  readonly height: number;
  readonly transparent: boolean;
  readonly strategy: CharacterExportExecutionStrategy;
  readonly tileEdge: number | null;
  readonly estimatedResidentBytes: number;
  readonly passes: readonly CharacterExportPassPlan[];
  readonly plannedCount: number;
  readonly conditionalCount: number;
  readonly skippedCount: number;
  readonly compatibility: CharacterCompatibilityReport;
  readonly warnings: readonly CharacterExportPreflightWarning[];
}

export interface CreateCharacterExportPreflightInput {
  readonly format: CharacterExportFormat;
  readonly width: number;
  readonly height: number;
  readonly transparent: boolean;
  readonly profile: Partial<CharacterCapabilityProfile>;
  readonly compatibility?: CharacterCompatibilityReport;
  readonly hasSurfacePaint?: boolean;
  readonly canonical?: boolean;
}

export class CharacterExportPreflightError extends Error {
  constructor(readonly code: "invalid-dimensions", message: string) {
    super(message);
    this.name = "CharacterExportPreflightError";
  }
}

const MAX_EXPORT_EDGE = 16_384;
const DIRECT_EDGE_LIMIT = 2_048;
const DIRECT_MEMORY_LIMIT = 256 * 1024 * 1024;
const TILE_EDGE = 1_024;
const RGBA_CHANNELS = 4;
const WORKING_COPIES_PER_PASS = 3;

const PASS_LABELS: Readonly<Record<CharacterSemanticPassId, string>> = Object.freeze({
  beauty: "미리보기",
  flat: "밑색 전체",
  shadow: "음영",
  highlight: "하이라이트",
  line: "주선",
  "surface-paint": "표면 채색",
  "mask-face": "얼굴",
  "mask-eyes": "눈",
  "mask-hair": "헤어",
  "mask-skin": "피부",
  "mask-top": "상의",
  "mask-bottom": "하의",
  "mask-shoes": "신발",
  "mask-accessory": "액세서리",
});

const PSD_PASS_ORDER: readonly CharacterSemanticPassId[] = Object.freeze([
  "beauty",
  "flat",
  "shadow",
  "highlight",
  "line",
  "surface-paint",
  "mask-face",
  "mask-eyes",
  "mask-hair",
  "mask-skin",
  "mask-top",
  "mask-bottom",
  "mask-shoes",
  "mask-accessory",
]);

function ensureDimensions(width: number, height: number): void {
  if (
    !Number.isSafeInteger(width)
    || !Number.isSafeInteger(height)
    || width < 1
    || height < 1
    || width > MAX_EXPORT_EDGE
    || height > MAX_EXPORT_EDGE
  ) {
    throw new CharacterExportPreflightError(
      "invalid-dimensions",
      `내보내기 크기는 1~${MAX_EXPORT_EDGE}px의 정수여야 합니다.`,
    );
  }
}

function plan(
  pass: CharacterSemanticPassId,
  status: CharacterExportPassStatus,
  reason: string,
): CharacterExportPassPlan {
  return Object.freeze({ pass, label: PASS_LABELS[pass], status, reason });
}

function semanticPassStatus(
  pass: CharacterSemanticPassId,
  report: CharacterCompatibilityReport,
): CharacterExportPassPlan {
  const feature = report.features.find((item) => item.id === "semantic-psd");
  if (feature?.status === "supported") {
    return plan(pass, "planned", "공식 시맨틱 파츠에서 직접 생성합니다.");
  }
  if (feature?.status === "partial") {
    return plan(pass, "conditional", "모델의 메시·재질 구조에 따라 생략될 수 있습니다.");
  }
  return plan(pass, "skipped", "이 모델에서 분리 가능한 파츠 구조를 찾지 못했습니다.");
}

function psdPassPlan(
  pass: CharacterSemanticPassId,
  report: CharacterCompatibilityReport,
  hasSurfacePaint: boolean | undefined,
): CharacterExportPassPlan {
  const ready = report.grade !== "viewer";
  if (pass === "beauty") {
    return ready
      ? plan(pass, "planned", "현재 카메라의 캐릭터 미리보기를 저장합니다.")
      : plan(pass, "skipped", "캐릭터 렌더가 아직 준비되지 않았습니다.");
  }
  if (pass === "surface-paint") {
    const feature = report.features.find((item) => item.id === "surface-paint");
    if (feature?.status !== "supported") {
      return plan(pass, "skipped", feature?.reason ?? "표면 채색을 사용할 수 없습니다.");
    }
    if (hasSurfacePaint === true) return plan(pass, "planned", "현재 표면 채색 레이어를 저장합니다.");
    return plan(pass, "conditional", "표면 채색 픽셀이 있을 때만 레이어를 만듭니다.");
  }
  if (pass === "flat" || pass === "shadow" || pass === "highlight" || pass === "line") {
    return ready
      ? plan(pass, "conditional", "현재 재질과 렌더 상태에서 유효한 픽셀이 있을 때 생성합니다.")
      : plan(pass, "skipped", "캐릭터 렌더가 아직 준비되지 않았습니다.");
  }
  return semanticPassStatus(pass, report);
}

function estimateResidentBytes(width: number, height: number, activePasses: number): number {
  const bytes = width * height * RGBA_CHANNELS * Math.max(1, activePasses) * WORKING_COPIES_PER_PASS;
  return Number.isSafeInteger(bytes) ? bytes : Number.MAX_SAFE_INTEGER;
}

export function formatCharacterBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "알 수 없음";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kib = bytes / 1024;
  if (kib < 1024) return `${kib.toFixed(kib >= 10 ? 0 : 1)} KiB`;
  const mib = kib / 1024;
  if (mib < 1024) return `${mib.toFixed(mib >= 10 ? 0 : 1)} MiB`;
  const gib = mib / 1024;
  return `${gib.toFixed(gib >= 10 ? 0 : 1)} GiB`;
}

export function createCharacterExportPreflight(
  input: CreateCharacterExportPreflightInput,
): CharacterExportPreflight {
  ensureDimensions(input.width, input.height);
  const compatibility = input.compatibility ?? createCharacterCompatibilityReport(
    input.profile,
    { canonical: input.canonical },
  );
  const passes = input.format === "png"
    ? Object.freeze([
        compatibility.grade === "viewer"
          ? plan("beauty", "skipped", "캐릭터 렌더가 아직 준비되지 않았습니다.")
          : plan("beauty", "planned", "현재 카메라의 캐릭터 이미지를 저장합니다."),
      ])
    : Object.freeze(PSD_PASS_ORDER.map((passId) => psdPassPlan(passId, compatibility, input.hasSurfacePaint)));
  const plannedCount = passes.filter((item) => item.status === "planned").length;
  const conditionalCount = passes.filter((item) => item.status === "conditional").length;
  const skippedCount = passes.length - plannedCount - conditionalCount;
  const estimatedResidentBytes = estimateResidentBytes(
    input.width,
    input.height,
    plannedCount + conditionalCount,
  );
  const strategy: CharacterExportExecutionStrategy =
    Math.max(input.width, input.height) <= DIRECT_EDGE_LIMIT
    && estimatedResidentBytes <= DIRECT_MEMORY_LIMIT
      ? "direct-main-thread"
      : "tile-worker";
  const warnings: CharacterExportPreflightWarning[] = [];
  if (compatibility.grade === "viewer") {
    warnings.push({ code: "model-not-ready", message: "캐릭터 렌더가 준비되지 않아 출력할 수 없습니다." });
  } else if (compatibility.grade !== "canonical" && (compatibility.partialCount > 0 || compatibility.unsupportedCount > 0)) {
    warnings.push({
      code: "compatibility-limited",
      message: `현재 모델은 ${compatibility.label}입니다. 일부 PSD 레이어가 생략될 수 있습니다.`,
    });
  }
  if (strategy === "tile-worker") {
    warnings.push({
      code: "high-memory",
      message: `예상 작업 메모리 ${formatCharacterBytes(estimatedResidentBytes)} · 타일 Worker 방식으로 처리합니다.`,
    });
  }
  if (input.format === "psd" && input.hasSurfacePaint !== true) {
    warnings.push({ code: "surface-paint-empty", message: "표면 채색 픽셀이 없으면 해당 레이어는 생략됩니다." });
  }
  if (input.transparent) {
    warnings.push({ code: "transparent-background", message: "배경은 투명 알파로 저장됩니다." });
  }

  return Object.freeze({
    format: input.format,
    width: input.width,
    height: input.height,
    transparent: input.transparent,
    strategy,
    tileEdge: strategy === "tile-worker" ? TILE_EDGE : null,
    estimatedResidentBytes,
    passes,
    plannedCount,
    conditionalCount,
    skippedCount,
    compatibility,
    warnings: Object.freeze(warnings),
  });
}
