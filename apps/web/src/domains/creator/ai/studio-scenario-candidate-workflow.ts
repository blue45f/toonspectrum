import type {
  ScenarioImageCandidate,
  ScenarioImageQualityProfile,
  ScenarioImageVariationStrategy,
  ScenarioPreviewItem,
} from "../studio-scenario-layout";
import type { StudioPublishAiProvenance } from "../studio-publish-preflight";

export type StudioScenarioImageVariantCount = 1 | 2 | 4;
export type StudioScenarioImageQualityProfile = ScenarioImageQualityProfile;
export type StudioScenarioImageVariationStrategy = ScenarioImageVariationStrategy;

export const DEFAULT_STUDIO_SCENARIO_IMAGE_QUALITY_PROFILE: StudioScenarioImageQualityProfile =
  "balanced";
export const DEFAULT_STUDIO_SCENARIO_IMAGE_VARIATION_STRATEGY: StudioScenarioImageVariationStrategy =
  "directorial";
export const STUDIO_SCENARIO_IMAGE_MAX_REQUESTS_PER_BATCH = 24;

export const STUDIO_SCENARIO_IMAGE_QUALITY_PROFILES = [
  {
    id: "draft",
    label: "콘티 초안",
    shortLabel: "초안",
    description: "구도·실루엣·말풍선 여백을 빠르게 검토",
  },
  {
    id: "balanced",
    label: "균형 제작",
    shortLabel: "균형",
    description: "선·인체·명암·연속성을 함께 검토",
  },
  {
    id: "final",
    label: "최종 작화",
    shortLabel: "최종",
    description: "얼굴·손·소품·배경 원근과 마감까지 강조",
  },
] as const satisfies ReadonlyArray<{
  readonly id: StudioScenarioImageQualityProfile;
  readonly label: string;
  readonly shortLabel: string;
  readonly description: string;
}>;

export const STUDIO_SCENARIO_IMAGE_VARIATION_STRATEGIES = [
  {
    id: "subtle",
    label: "미세 변화",
    description: "카메라는 유지하고 표정·제스처·광원을 비교",
  },
  {
    id: "directorial",
    label: "연출 변화",
    description: "카메라·블로킹·동작 타이밍을 비교",
  },
  {
    id: "coverage",
    label: "커버리지",
    description: "와이드·미디엄·클로즈업 대체 숏을 확보",
  },
] as const satisfies ReadonlyArray<{
  readonly id: StudioScenarioImageVariationStrategy;
  readonly label: string;
  readonly description: string;
}>;

export interface StudioScenarioImageGenerationRequest {
  readonly indexes?: readonly number[];
  readonly variants?: StudioScenarioImageVariantCount;
  readonly qualityProfile?: StudioScenarioImageQualityProfile;
  readonly variationStrategy?: StudioScenarioImageVariationStrategy;
}

export interface StudioScenarioImageGenerationTask {
  readonly index: number;
  readonly variant: number;
  readonly variantCount: StudioScenarioImageVariantCount;
  readonly qualityProfile: StudioScenarioImageQualityProfile;
  readonly variationStrategy: StudioScenarioImageVariationStrategy;
  readonly qualityLabel: string;
  readonly variationLabel: string;
  readonly promptDirective: string;
}

export interface StudioScenarioImageGenerationPreflight {
  readonly indexes: readonly number[];
  readonly variants: StudioScenarioImageVariantCount;
  readonly qualityProfile: StudioScenarioImageQualityProfile;
  readonly variationStrategy: StudioScenarioImageVariationStrategy;
  readonly requestedCount: number;
  readonly maxRequests: number;
  readonly withinLimit: boolean;
}

export interface StudioScenarioImageCandidateInput {
  readonly id: string;
  readonly imageDataUrl: string;
  readonly imageProvenance?: StudioPublishAiProvenance;
  readonly inputFingerprint: string;
  readonly createdAt?: string;
  readonly qualityProfile?: StudioScenarioImageQualityProfile;
  readonly variationStrategy?: StudioScenarioImageVariationStrategy;
  readonly variationLabel?: string;
}

export type StudioScenarioCandidateReviewStatus =
  | "missing"
  | "failed"
  | "unapproved"
  | "stale"
  | "approved";

export interface StudioScenarioCandidateReadiness {
  readonly total: number;
  readonly missing: number;
  readonly failed: number;
  readonly unapproved: number;
  readonly stale: number;
  readonly approved: number;
  readonly missingIndexes: readonly number[];
  readonly reviewIndexes: readonly number[];
}

function normalizeText(value: string | null | undefined): string {
  return value?.normalize("NFKC").trim().replace(/\s+/gu, " ") ?? "";
}

function stableSerialize(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "undefined";
  }
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
    .join(",")}}`;
}

function hashText(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function qualityProfileMeta(profile: StudioScenarioImageQualityProfile) {
  return STUDIO_SCENARIO_IMAGE_QUALITY_PROFILES.find((option) => option.id === profile)
    ?? STUDIO_SCENARIO_IMAGE_QUALITY_PROFILES[1];
}

function normalizeVariants(value: unknown): StudioScenarioImageVariantCount {
  return value === 2 || value === 4 ? value : 1;
}

function normalizeQualityProfile(value: unknown): StudioScenarioImageQualityProfile {
  return value === "draft" || value === "final"
    ? value
    : DEFAULT_STUDIO_SCENARIO_IMAGE_QUALITY_PROFILE;
}

function normalizeVariationStrategy(value: unknown): StudioScenarioImageVariationStrategy {
  return value === "subtle" || value === "coverage"
    ? value
    : DEFAULT_STUDIO_SCENARIO_IMAGE_VARIATION_STRATEGY;
}

function qualityDirective(profile: StudioScenarioImageQualityProfile): string {
  if (profile === "draft") {
    return "[품질 단계: 콘티 초안] 장면의 읽기 쉬운 실루엣, 인물 위치, 시선 방향과 말풍선 여백을 우선합니다. 미세 묘사는 절제하고 후속 편집이 쉬운 깨끗한 형태를 유지합니다.";
  }
  if (profile === "final") {
    return "[품질 단계: 최종 작화] 게시 후보 수준으로 얼굴·손·의상·소품 형태, 선 정리, 배경 원근, 재질·광원과 가장자리 완성도를 점검합니다. 이미지 안에 글자·로고·워터마크를 새로 만들지 않습니다.";
  }
  return "[품질 단계: 균형 제작] 웹툰 컷으로 즉시 검토 가능한 깨끗한 선, 안정적인 얼굴·손·인체, 분리되는 실루엣, 일관된 의상·소품, 명확한 초점과 셀 명암을 유지합니다.";
}

const VARIATION_AXES: Record<StudioScenarioImageVariationStrategy, readonly {
  readonly label: string;
  readonly directive: string;
}[]> = {
  subtle: [
    { label: "표정·시선", directive: "원래 카메라와 블로킹을 고정하고 표정 강도와 시선 방향만 미세하게 달리합니다." },
    { label: "제스처·실루엣", directive: "원래 카메라를 고정하고 손동작, 체중 중심과 실루엣의 읽힘만 달리합니다." },
    { label: "광원·심도", directive: "구도와 인물 정체성을 고정하고 키라이트 방향, 대비와 초점 심도만 달리합니다." },
    { label: "소품·배경 리듬", directive: "주요 인물과 사건을 고정하고 보조 소품과 배경의 시각적 리듬만 달리합니다." },
  ],
  directorial: [
    { label: "카메라 높이·렌즈", directive: "같은 사건과 연속성을 유지하면서 카메라 높이와 렌즈 감각을 바꿔 더 강한 연출 대안을 만듭니다." },
    { label: "블로킹·여백", directive: "인물 정체성과 사건을 유지하면서 블로킹, 네거티브 스페이스와 말풍선 여백을 재구성합니다." },
    { label: "동작 타이밍·시선", directive: "같은 비트의 직전 또는 직후 순간을 선택해 동작 타이밍과 시선 흐름을 달리합니다." },
    { label: "초점·광원", directive: "같은 구도 계약 안에서 주초점, 전경·중경·배경 분리와 광원 대비를 달리합니다." },
  ],
  coverage: [
    { label: "와이드 설정 숏", directive: "장소와 인물 관계가 읽히는 와이드 설정 숏 대안을 만듭니다." },
    { label: "미디엄 퍼포먼스", directive: "표정과 몸짓을 함께 읽을 수 있는 미디엄 퍼포먼스 숏 대안을 만듭니다." },
    { label: "클로즈 감정 숏", directive: "핵심 감정과 시선을 강조하는 클로즈업 또는 인서트 숏 대안을 만듭니다." },
    { label: "오버숄더 대체 숏", directive: "관계와 공간 방향을 보존하는 오버숄더 또는 반대축 대체 숏을 만듭니다." },
  ],
};

export function compileStudioScenarioImagePromptDirective(input: {
  readonly qualityProfile?: StudioScenarioImageQualityProfile;
  readonly variationStrategy?: StudioScenarioImageVariationStrategy;
  readonly variant?: number;
  readonly variantCount?: StudioScenarioImageVariantCount;
} = {}): { readonly qualityLabel: string; readonly variationLabel: string; readonly promptDirective: string } {
  const qualityProfile = normalizeQualityProfile(input.qualityProfile);
  const variationStrategy = normalizeVariationStrategy(input.variationStrategy);
  const variantCount = normalizeVariants(input.variantCount);
  const variant = Math.min(variantCount, Math.max(1, Math.trunc(input.variant ?? 1)));
  const quality = qualityProfileMeta(qualityProfile);
  const axes = VARIATION_AXES[variationStrategy];
  const axis = axes[(variant - 1) % axes.length] ?? axes[0]!;
  const variationLabel = variantCount > 1 ? axis.label : "기본 연출";
  const variationDirective = variantCount > 1
    ? `[후보 ${variant}/${variantCount} · ${variationLabel}] ${axis.directive}`
    : "[단일 후보] 원래 장면의 카메라, 사건, 인물 관계와 연속성 메타데이터를 우선합니다.";
  return {
    qualityLabel: quality.label,
    variationLabel,
    promptDirective: [
      qualityDirective(qualityProfile),
      variationDirective,
      "[고정 계약] 참조 인물의 정체성, 의상·소품, 장소·시간 연속성을 보존하고 대사·말풍선은 편집 레이어로 남기므로 이미지 내부 문자는 생성하지 않습니다.",
    ].join("\n"),
  };
}

export function scenarioImageReferenceSignature(
  references: readonly {
    readonly id?: string;
    readonly assetId?: string;
    readonly role?: string;
    readonly label?: string;
    readonly guidance?: string;
  }[],
): string {
  return stableSerialize(
    references.map((reference) => ({
      id: normalizeText(reference.id),
      assetId: normalizeText(reference.assetId),
      role: normalizeText(reference.role),
      label: normalizeText(reference.label),
      guidance: normalizeText(reference.guidance),
    })),
  );
}

export function scenarioImageInputFingerprint(
  item: Pick<ScenarioPreviewItem, "imagePrompt" | "continuity" | "aspect">,
  referenceSignature = "",
): string {
  return hashText(
    stableSerialize({
      imagePrompt: normalizeText(item.imagePrompt),
      continuity: item.continuity ?? null,
      aspect: item.aspect,
      references: referenceSignature,
    }),
  );
}

function legacyCandidate(item: ScenarioPreviewItem): ScenarioImageCandidate | null {
  if (!item.imageDataUrl) return null;
  return {
    id: `legacy-${hashText(item.imageDataUrl)}`,
    imageDataUrl: item.imageDataUrl,
    ...(item.imageProvenance ? { imageProvenance: item.imageProvenance } : {}),
    inputFingerprint: scenarioImageInputFingerprint(item),
    createdAt: item.imageProvenance?.createdAt ?? "legacy",
  };
}

export function scenarioImageCandidates(item: ScenarioPreviewItem): ScenarioImageCandidate[] {
  const candidates = [...(item.imageCandidates ?? [])];
  const legacy = legacyCandidate(item);
  if (legacy && !candidates.some((candidate) => candidate.imageDataUrl === legacy.imageDataUrl)) {
    candidates.unshift(legacy);
  }
  return candidates;
}

function scenarioItemWithoutImageOutcome(
  item: ScenarioPreviewItem,
): ScenarioPreviewItem {
  const next = { ...item };
  delete next.imageError;
  delete next.imageProvenance;
  return next;
}

export function appendScenarioImageCandidate(
  item: ScenarioPreviewItem,
  input: StudioScenarioImageCandidateInput,
): ScenarioPreviewItem {
  const candidate: ScenarioImageCandidate = {
    id: input.id,
    imageDataUrl: input.imageDataUrl,
    ...(input.imageProvenance ? { imageProvenance: input.imageProvenance } : {}),
    inputFingerprint: input.inputFingerprint,
    createdAt: input.createdAt ?? new Date().toISOString(),
    ...(input.qualityProfile ? { qualityProfile: input.qualityProfile } : {}),
    ...(input.variationStrategy ? { variationStrategy: input.variationStrategy } : {}),
    ...(input.variationLabel ? { variationLabel: input.variationLabel } : {}),
  };
  const allCandidates = scenarioImageCandidates(item)
    .filter((existing) => existing.id !== candidate.id)
    .concat(candidate);
  const candidates = allCandidates.slice(-12);
  if (
    item.approvedImageCandidateId &&
    !candidates.some((entry) => entry.id === item.approvedImageCandidateId)
  ) {
    const approved = allCandidates.find(
      (entry) => entry.id === item.approvedImageCandidateId,
    );
    if (approved) candidates[0] = approved;
  }
  return {
    ...scenarioItemWithoutImageOutcome(item),
    imageCandidates: candidates,
    selectedImageCandidateId: candidate.id,
    imageDataUrl: candidate.imageDataUrl,
    ...(candidate.imageProvenance ? { imageProvenance: candidate.imageProvenance } : {}),
  };
}

export function selectScenarioImageCandidate(
  item: ScenarioPreviewItem,
  candidateId: string,
): ScenarioPreviewItem {
  const candidates = scenarioImageCandidates(item);
  const candidate = candidates.find((entry) => entry.id === candidateId);
  if (!candidate) return item;
  return {
    ...scenarioItemWithoutImageOutcome(item),
    imageCandidates: candidates,
    selectedImageCandidateId: candidate.id,
    imageDataUrl: candidate.imageDataUrl,
    ...(candidate.imageProvenance ? { imageProvenance: candidate.imageProvenance } : {}),
  };
}

export function approveScenarioImageCandidate(
  item: ScenarioPreviewItem,
  candidateId: string,
): ScenarioPreviewItem {
  const selected = selectScenarioImageCandidate(item, candidateId);
  if (selected === item) return item;
  return { ...selected, approvedImageCandidateId: candidateId };
}

export function isScenarioImageCandidateStale(
  candidate: ScenarioImageCandidate,
  item: ScenarioPreviewItem,
  referenceSignature = "",
): boolean {
  return candidate.inputFingerprint !== scenarioImageInputFingerprint(item, referenceSignature);
}

export function scenarioCandidateReviewStatus(
  item: ScenarioPreviewItem,
  referenceSignature = "",
): StudioScenarioCandidateReviewStatus {
  const candidates = scenarioImageCandidates(item);
  if (candidates.length === 0) return item.imageError ? "failed" : "missing";
  const selectedId = item.selectedImageCandidateId
    ?? candidates.find((candidate) => candidate.imageDataUrl === item.imageDataUrl)?.id
    ?? candidates.at(-1)?.id;
  const selected = candidates.find((candidate) => candidate.id === selectedId);
  if (!selected) return item.imageError ? "failed" : "missing";
  if (isScenarioImageCandidateStale(selected, item, referenceSignature)) return "stale";
  return item.approvedImageCandidateId === selected.id ? "approved" : "unapproved";
}

export function summarizeStudioScenarioCandidateReadiness(
  items: readonly ScenarioPreviewItem[],
  referenceSignature = "",
): StudioScenarioCandidateReadiness {
  const counts: Record<StudioScenarioCandidateReviewStatus, number> = {
    missing: 0,
    failed: 0,
    unapproved: 0,
    stale: 0,
    approved: 0,
  };
  const missingIndexes: number[] = [];
  const reviewIndexes: number[] = [];
  items.forEach((item, index) => {
    const status = scenarioCandidateReviewStatus(item, referenceSignature);
    counts[status] += 1;
    if (status === "missing" || status === "failed") missingIndexes.push(index);
    if (status === "unapproved" || status === "stale") reviewIndexes.push(index);
  });
  return {
    total: items.length,
    ...counts,
    missingIndexes,
    reviewIndexes,
  };
}

function explicitGenerationIndexes(
  items: readonly ScenarioPreviewItem[],
  request: StudioScenarioImageGenerationRequest,
): number[] {
  return request.indexes
    ? [...new Set(request.indexes)].filter(
        (index) =>
          Number.isInteger(index) &&
          index >= 0 &&
          index < items.length &&
          (items[index]?.imagePrompt.trim().length ?? 0) > 0,
      )
    : items.flatMap((item, index) =>
        item.imageDataUrl || item.imagePrompt.trim().length === 0 ? [] : [index],
      );
}

export function inspectStudioScenarioImageGeneration(
  items: readonly ScenarioPreviewItem[],
  request: StudioScenarioImageGenerationRequest = {},
): StudioScenarioImageGenerationPreflight {
  const variants = normalizeVariants(request.variants);
  const qualityProfile = normalizeQualityProfile(request.qualityProfile);
  const variationStrategy = normalizeVariationStrategy(request.variationStrategy);
  const indexes = explicitGenerationIndexes(items, request);
  const requestedCount = indexes.length * variants;
  return {
    indexes,
    variants,
    qualityProfile,
    variationStrategy,
    requestedCount,
    maxRequests: STUDIO_SCENARIO_IMAGE_MAX_REQUESTS_PER_BATCH,
    withinLimit: requestedCount <= STUDIO_SCENARIO_IMAGE_MAX_REQUESTS_PER_BATCH,
  };
}

export function planStudioScenarioImageGeneration(
  items: readonly ScenarioPreviewItem[],
  request: StudioScenarioImageGenerationRequest = {},
): StudioScenarioImageGenerationTask[] {
  const preflight = inspectStudioScenarioImageGeneration(items, request);
  if (!preflight.withinLimit) return [];
  return preflight.indexes.flatMap((index) =>
    Array.from({ length: preflight.variants }, (_, variantIndex) => {
      const variant = variantIndex + 1;
      const compiled = compileStudioScenarioImagePromptDirective({
        qualityProfile: preflight.qualityProfile,
        variationStrategy: preflight.variationStrategy,
        variant,
        variantCount: preflight.variants,
      });
      return {
        index,
        variant,
        variantCount: preflight.variants,
        qualityProfile: preflight.qualityProfile,
        variationStrategy: preflight.variationStrategy,
        ...compiled,
      };
    }),
  );
}
