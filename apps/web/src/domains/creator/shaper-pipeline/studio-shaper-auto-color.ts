/**
 * AI 자동 채색 작업 스펙(순수 로직).
 *
 * 선화 + 캐릭터별 팔레트 → 영역 분할 → 색상 매핑 → 그림자/하이라이트 옵션의
 * 채색 작업 스펙을 생성합니다. 결과는 선화 레이어와 분리된 별도 레이어로 구성되어
 * 사용자가 수동으로 수정할 수 있습니다.
 */

/** 자동 채색 1회 작업 예산(ms). 초과 시 그림자/하이라이트를 생략하는 폴백을 적용합니다. */
export const STUDIO_AUTO_COLOR_BUDGET_MS = 30_000 as const;

export interface StudioAutoColorLineArt {
  /** 선화 참조(레이어 id·스토리지 키 등). */
  readonly lineArtRef: string;
  readonly widthPx: number;
  readonly heightPx: number;
  /** 감지된 채색 영역 id 목록. */
  readonly regionIds: readonly string[];
}

export interface StudioAutoColorPaletteSwatch {
  /** 영역 이름(예: "피부", "머리카락", "교복 상의"). */
  readonly regionName: string;
  readonly baseColor: string;
  readonly shadowColor?: string;
  readonly highlightColor?: string;
}

export interface StudioAutoColorPalette {
  readonly paletteId: string;
  readonly characterId: string;
  readonly swatches: readonly StudioAutoColorPaletteSwatch[];
}

export interface StudioAutoColorOptions {
  /** 그림자 레이어 생성 여부. */
  readonly shadows: boolean;
  /** 하이라이트 레이어 생성 여부. */
  readonly highlights: boolean;
  /** 추정 소요 시간(ms). 예산 초과 판단에 사용합니다. */
  readonly estimatedMs: number;
}

export type StudioAutoColorLayerKind = "line" | "fill" | "shadow" | "highlight";

export interface StudioAutoColorLayer {
  readonly layerId: string;
  readonly kind: StudioAutoColorLayerKind;
  readonly label: string;
  /** 레이어 단위 색상(영역별 매핑은 fills에 기록). */
  readonly color?: string;
  /** 영역별 채색 결과(영역 id → 색상). */
  readonly fills: Readonly<Record<string, string>>;
  /** 수동 수정 가능 여부. */
  readonly editable: boolean;
}

export interface StudioAutoColorJobSpec {
  readonly jobId: string;
  readonly lineArtRef: string;
  readonly paletteId: string;
  /** 예산 초과로 폴백이 적용되었는지 여부. */
  readonly fallbackApplied: boolean;
  readonly layers: readonly StudioAutoColorLayer[];
  /** 매핑되지 않은 영역 id 목록(팔레트에 없는 영역). */
  readonly unmappedRegions: readonly string[];
}

function regionColor(regionId: string, palette: StudioAutoColorPalette): StudioAutoColorPaletteSwatch | undefined {
  const normalized = regionId.normalize("NFKC").trim().toLowerCase();
  return palette.swatches.find((swatch) => swatch.regionName.normalize("NFKC").trim().toLowerCase() === normalized);
}

function deriveJobId(lineArtRef: string, paletteId: string, fallback: boolean): string {
  let hash = 0x811c9dc5;
  const seed = `${lineArtRef}|${paletteId}|${fallback ? "fallback" : "full"}`;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `auto-color-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/**
 * 자동 채색 작업 스펙을 생성합니다.
 * estimatedMs가 STUDIO_AUTO_COLOR_BUDGET_MS를 초과하면 그림자/하이라이트를 생략한
 * 플랫 채색 폴백 스펙을 반환합니다(fallbackApplied=true).
 */
export function buildStudioAutoColorJobSpec(
  lineArt: StudioAutoColorLineArt,
  palette: StudioAutoColorPalette,
  options: StudioAutoColorOptions,
): StudioAutoColorJobSpec {
  if (lineArt.lineArtRef.trim().length === 0) {
    throw new Error("선화 참조가 비어 있습니다.");
  }
  const fallbackApplied = options.estimatedMs > STUDIO_AUTO_COLOR_BUDGET_MS;
  const withShadows = options.shadows && !fallbackApplied;
  const withHighlights = options.highlights && !fallbackApplied;

  const fills: Record<string, string> = {};
  const shadowFills: Record<string, string> = {};
  const highlightFills: Record<string, string> = {};
  const unmappedRegions: string[] = [];
  for (const regionId of lineArt.regionIds) {
    const swatch = regionColor(regionId, palette);
    if (!swatch) {
      unmappedRegions.push(regionId);
      continue;
    }
    fills[regionId] = swatch.baseColor;
    if (withShadows && swatch.shadowColor) shadowFills[regionId] = swatch.shadowColor;
    if (withHighlights && swatch.highlightColor) highlightFills[regionId] = swatch.highlightColor;
  }

  const layers: StudioAutoColorLayer[] = [
    {
      layerId: "line-art",
      kind: "line",
      label: "선화",
      fills: Object.freeze({}),
      editable: false,
    },
    {
      layerId: "color-fill",
      kind: "fill",
      label: "채색(기본)",
      fills: Object.freeze({ ...fills }),
      editable: true,
    },
  ];
  if (withShadows) {
    layers.push({
      layerId: "color-shadow",
      kind: "shadow",
      label: "채색(그림자)",
      fills: Object.freeze({ ...shadowFills }),
      editable: true,
    });
  }
  if (withHighlights) {
    layers.push({
      layerId: "color-highlight",
      kind: "highlight",
      label: "채색(하이라이트)",
      fills: Object.freeze({ ...highlightFills }),
      editable: true,
    });
  }

  return {
    jobId: deriveJobId(lineArt.lineArtRef, palette.paletteId, fallbackApplied),
    lineArtRef: lineArt.lineArtRef,
    paletteId: palette.paletteId,
    fallbackApplied,
    layers: Object.freeze(layers),
    unmappedRegions: Object.freeze(unmappedRegions),
  };
}
