import {
  deriveStudioUnifiedAssetFacet,
  STUDIO_UNIFIED_ASSET_EDITABILITY_LABELS,
  STUDIO_UNIFIED_ASSET_FORMAT_LABELS,
  STUDIO_UNIFIED_ASSET_RIGHTS_LABELS,
  type StudioUnifiedAssetEditability,
  type StudioUnifiedAssetRightsStatus,
} from "./studio-unified-asset-intelligence";
import {
  STUDIO_INSERT_PLACEMENT_LABELS,
  type StudioInsertHubEntry,
  type StudioInsertPlacementMode,
} from "./studio-insert-hub-model";

import type { StudioUnifiedAssetItem } from "./studio-unified-asset-catalog";

export const STUDIO_ASSET_COMPARISON_LIMIT = 3;

export type StudioAssetIntent =
  | "all"
  | "dialogue"
  | "entrance"
  | "action"
  | "emotion"
  | "transition"
  | "time"
  | "atmosphere";

export type StudioAssetPerformanceTier = "light" | "standard" | "heavy";

export const STUDIO_ASSET_INTENT_LABELS: Readonly<
  Record<StudioAssetIntent, string>
> = Object.freeze({
  all: "전체 의도",
  dialogue: "2인 대화",
  entrance: "첫 등장",
  action: "액션·추격",
  emotion: "감정 클로즈업",
  transition: "장소 전환",
  time: "시간 변화",
  atmosphere: "날씨·분위기",
});

export const STUDIO_ASSET_PERFORMANCE_LABELS: Readonly<
  Record<StudioAssetPerformanceTier, string>
> = Object.freeze({
  light: "경량",
  standard: "표준",
  heavy: "고품질·고부하",
});

const INTENT_KEYWORDS: Readonly<
  Record<Exclude<StudioAssetIntent, "all">, readonly string[]>
> = Object.freeze({
  dialogue: Object.freeze([
    "대화",
    "말풍선",
    "대사",
    "회의",
    "conversation",
    "dialogue",
    "speech",
    "bubble",
  ]),
  entrance: Object.freeze([
    "첫 등장",
    "등장",
    "소개",
    "주인공",
    "로우앵글",
    "entrance",
    "reveal",
    "hero",
  ]),
  action: Object.freeze([
    "액션",
    "추격",
    "타격",
    "폭발",
    "전투",
    "속도",
    "action",
    "chase",
    "attack",
    "combat",
  ]),
  emotion: Object.freeze([
    "감정",
    "표정",
    "클로즈업",
    "슬픔",
    "기쁨",
    "분노",
    "긴장",
    "emotion",
    "closeup",
    "mood",
  ]),
  transition: Object.freeze([
    "장소 전환",
    "화면 전환",
    "이동",
    "몽타주",
    "transition",
    "establishing",
    "location change",
  ]),
  time: Object.freeze([
    "시간",
    "아침",
    "낮",
    "저녁",
    "밤",
    "야간",
    "새벽",
    "time",
    "morning",
    "day",
    "night",
  ]),
  atmosphere: Object.freeze([
    "날씨",
    "비",
    "눈",
    "안개",
    "조명",
    "분위기",
    "weather",
    "rain",
    "snow",
    "fog",
    "lighting",
  ]),
});

export interface StudioAssetApplyPlan {
  readonly itemId: string;
  readonly title: string;
  readonly actionLabel: string;
  readonly formatLabel: string;
  readonly rights: StudioUnifiedAssetRightsStatus;
  readonly rightsLabel: string;
  readonly editability: StudioUnifiedAssetEditability;
  readonly editabilityLabel: string;
  readonly performanceTier: StudioAssetPerformanceTier;
  readonly performanceLabel: string;
  readonly placementLabel: string;
  readonly compatibilityLabel: string;
  readonly steps: readonly string[];
  readonly warnings: readonly string[];
  readonly requiresExplicitConfirmation: boolean;
}

function normalize(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("ko-KR");
}

function entryHaystack(entry: StudioInsertHubEntry): string {
  return normalize(
    [
      entry.title,
      entry.description,
      entry.categoryLabel,
      ...entry.keywords,
      ...entry.badges,
    ].join(" "),
  );
}

export function deriveStudioAssetIntents(
  entry: StudioInsertHubEntry,
): readonly Exclude<StudioAssetIntent, "all">[] {
  const haystack = entryHaystack(entry);
  const matches = (Object.keys(INTENT_KEYWORDS) as Exclude<
    StudioAssetIntent,
    "all"
  >[]).filter((intent) =>
    INTENT_KEYWORDS[intent].some((keyword) =>
      haystack.includes(normalize(keyword)),
    ),
  );
  return Object.freeze(matches);
}

export function filterStudioInsertHubEntriesByIntent(
  entries: readonly StudioInsertHubEntry[],
  intent: StudioAssetIntent,
): readonly StudioInsertHubEntry[] {
  if (intent === "all") return Object.freeze([...entries]);
  return Object.freeze(
    entries.filter((entry) => deriveStudioAssetIntents(entry).includes(intent)),
  );
}

export function toggleStudioAssetComparisonId(
  ids: readonly string[],
  id: string,
): readonly string[] {
  const normalized = id.trim();
  if (!normalized) return Object.freeze([...ids]);
  if (ids.includes(normalized)) {
    return Object.freeze(ids.filter((value) => value !== normalized));
  }
  return Object.freeze(
    [normalized, ...ids.filter((value) => value !== normalized)].slice(
      0,
      STUDIO_ASSET_COMPARISON_LIMIT,
    ),
  );
}

export function reconcileStudioAssetComparisonIds(
  ids: readonly string[],
  availableIds: ReadonlySet<string>,
): readonly string[] {
  const seen = new Set<string>();
  const reconciled: string[] = [];
  for (const id of ids) {
    if (!availableIds.has(id) || seen.has(id)) continue;
    seen.add(id);
    reconciled.push(id);
    if (reconciled.length >= STUDIO_ASSET_COMPARISON_LIMIT) break;
  }
  return Object.freeze(reconciled);
}

function assetPixels(item: StudioUnifiedAssetItem): number | null {
  if (item.source.kind === "local" || item.source.kind === "builtin-raster") {
    return item.source.value.width * item.source.value.height;
  }
  if (item.source.kind === "background") {
    const width = item.source.value.width;
    const height = item.source.value.height;
    return width && height ? width * height : null;
  }
  return null;
}

export function deriveStudioAssetPerformanceTier(
  item: StudioUnifiedAssetItem,
): StudioAssetPerformanceTier {
  if (item.source.kind === "object-3d") return "heavy";
  if (item.source.kind === "scene-template") return "standard";
  const pixels = assetPixels(item);
  if (pixels !== null && pixels >= 8_000_000) return "heavy";
  if (pixels !== null && pixels >= 2_000_000) return "standard";
  if (item.preview.kind === "image") return "standard";
  return "light";
}

function applySteps(
  item: StudioUnifiedAssetItem,
  placementMode: StudioInsertPlacementMode,
): readonly string[] {
  switch (item.source.kind) {
    case "scene-template":
      return Object.freeze([
        "장면 편집 도구에서 구성과 슬롯을 먼저 확인합니다.",
        "현재 페이지에 선택한 장면 구성을 적용합니다.",
        "성공한 적용만 최근 사용 기록에 남깁니다.",
      ]);
    case "background":
      return Object.freeze([
        `${STUDIO_INSERT_PLACEMENT_LABELS[placementMode]} 기준으로 배경을 배치합니다.`,
        "원본 비율과 현재 문서의 안전한 삽입 경로를 유지합니다.",
      ]);
    case "element":
      return Object.freeze([
        "편집 가능한 벡터 요소를 새 객체로 삽입합니다.",
        "색상·크기·위치를 이후에도 조정할 수 있습니다.",
      ]);
    case "builtin-raster":
      return Object.freeze([
        "선택한 컷 또는 현재 화면에 원본 비율로 일러스트를 배치합니다.",
        item.source.value.kind === "bubble-decoration"
          ? "장식 그림과 대사가 독립 레이어로 삽입되어 대사를 계속 편집할 수 있습니다."
          : "원본 이미지의 크기·회전·위치와 합성 방식을 조정할 수 있습니다.",
      ]);
    case "object-3d":
      return Object.freeze([
        "3D 편집 도구에서 선택 모델과 호환성을 확인합니다.",
        "카메라·조명·렌더 설정을 유지한 채 장면에 배치합니다.",
      ]);
    case "local":
      return Object.freeze([
        `${STUDIO_INSERT_PLACEMENT_LABELS[placementMode]} 기준으로 내 에셋 이미지를 배치합니다.`,
        "원본 비율을 유지하고 독립 이미지 레이어로 삽입합니다.",
      ]);
    case "native-tool":
      return Object.freeze([
        "전용 편집 도구를 열어 구조화된 요소를 만듭니다.",
        "생성 뒤에도 내용과 형태를 계속 편집할 수 있습니다.",
      ]);
    default: {
      const exhaustive: never = item.source;
      throw new Error(`지원하지 않는 에셋 소스입니다: ${String(exhaustive)}`);
    }
  }
}

function applyWarnings(
  item: StudioUnifiedAssetItem,
  rights: StudioUnifiedAssetRightsStatus,
  editability: StudioUnifiedAssetEditability,
  performanceTier: StudioAssetPerformanceTier,
  placementMode: StudioInsertPlacementMode,
  selectionPlacementAvailable: boolean,
): readonly string[] {
  const warnings: string[] = [];
  if (rights === "review") {
    warnings.push("라이선스와 원본 출처를 확인한 뒤 사용해야 합니다.");
  }
  if (editability === "flattened") {
    warnings.push(item.source.kind === "builtin-raster" && item.source.value.kind === "bubble-decoration"
      ? "장식 그림은 이미지이며, 함께 추가되는 대사는 별도 텍스트 레이어에서 수정할 수 있습니다."
      : "평면 에셋이므로 내부 구성 요소를 개별 편집할 수 없습니다.");
  }
  if (performanceTier === "heavy") {
    warnings.push("고품질 에셋으로 GPU 또는 메모리 사용량이 높을 수 있습니다.");
  }
  if (item.preview.kind === "none") {
    warnings.push(
      "정적 미리보기가 없어 연결된 전용 도구에서 최종 모습을 확인해야 합니다.",
    );
  }
  if (placementMode === "selection" && !selectionPlacementAvailable) {
    warnings.push("현재 선택 영역이 없어 자동 배치로 전환해야 합니다.");
  }
  return Object.freeze(warnings);
}

export function buildStudioAssetApplyPlan(
  item: StudioUnifiedAssetItem,
  placementMode: StudioInsertPlacementMode,
  selectionPlacementAvailable: boolean,
): StudioAssetApplyPlan {
  const facet = deriveStudioUnifiedAssetFacet(item);
  const performanceTier = deriveStudioAssetPerformanceTier(item);
  const warnings = applyWarnings(
    item,
    facet.rights,
    facet.editability,
    performanceTier,
    placementMode,
    selectionPlacementAvailable,
  );
  const compatibilityLabel =
    facet.rights === "review"
      ? "권리 확인 후 사용"
      : item.source.kind === "object-3d"
        ? "3D 편집기에서 확인"
        : "현재 Studio에서 사용 가능";

  return Object.freeze({
    itemId: item.id,
    title: item.title,
    actionLabel: item.useLabel,
    formatLabel: STUDIO_UNIFIED_ASSET_FORMAT_LABELS[facet.format],
    rights: facet.rights,
    rightsLabel: STUDIO_UNIFIED_ASSET_RIGHTS_LABELS[facet.rights],
    editability: facet.editability,
    editabilityLabel: STUDIO_UNIFIED_ASSET_EDITABILITY_LABELS[facet.editability],
    performanceTier,
    performanceLabel: STUDIO_ASSET_PERFORMANCE_LABELS[performanceTier],
    placementLabel: STUDIO_INSERT_PLACEMENT_LABELS[placementMode],
    compatibilityLabel,
    steps: applySteps(item, placementMode),
    warnings,
    requiresExplicitConfirmation: facet.rights === "review",
  });
}
