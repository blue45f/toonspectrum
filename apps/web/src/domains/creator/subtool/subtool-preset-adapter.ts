/**
 * 브러시 카탈로그 → 서브툴 프리셋 어댑터.
 *
 * 기존 346종 브러시 카탈로그(`StudioBrushCatalogItem`) 항목을
 * 서브툴 프리셋으로 변환한다. `baseBrushId`에 카탈로그 id를 그대로 매핑하므로
 * 카탈로그의 id 체계와 충돌하지 않는다.
 *
 * 이 모듈은 카탈로그 모듈을 런타임에 import하지 않는다. 구조적 타이핑으로
 * 실제 `StudioBrushCatalogItem`을 그대로 넘기면 되며, 단위 테스트에서도
 * 가벼운 fixture로 동작한다.
 */
import {
  createDefaultSubToolParams,
  type SubToolParams,
  type SubToolTipShape,
} from "./subtool-params";
import type { SubTool } from "./subtool-store";

/** 어댑터가 필요로 하는 카탈로그 항목의 최소 형태. */
export interface SubToolCatalogSource {
  readonly id: string;
  readonly name: string;
  readonly defaultWidth?: number;
  readonly defaultOpacity?: number;
  readonly category?: string;
  readonly operation?: string;
  readonly hint?: string;
  readonly searchAliases?: readonly string[];
}

const SUBTOOL_PRESET_VERSION = 1;
const SUBTOOL_TIP_SIZE_MIN = 1;
const SUBTOOL_TIP_SIZE_MAX = 200;

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function sourceText(source: SubToolCatalogSource): string {
  const parts: string[] = [source.name, source.category ?? "", source.hint ?? ""];
  for (const alias of source.searchAliases ?? []) parts.push(alias);
  return parts.join(" ").toLowerCase();
}

const TIP_SHAPE_KEYWORDS: ReadonlyArray<{
  readonly keywords: readonly string[];
  readonly shape: SubToolTipShape;
}> = [
  { keywords: ["네온", "형광", "neon", "glow"], shape: "neon" },
  { keywords: ["입자", "파티클", "particle", "sparkle", "스파클", "별"], shape: "particle" },
  {
    keywords: ["질감", "texture", "paper", "종이", "canvas", "캔버스", "grain", "그레인"],
    shape: "textured",
  },
  {
    keywords: ["납작", "flat", "chisel", "치즐", "calligraphy", "캘리그래피", "brush-pen"],
    shape: "flat",
  },
];

/** 카탈로그 항목의 이름/카테고리/힌트에서 팁 모양을 추론한다. */
export function inferSubToolTipShape(
  source: SubToolCatalogSource,
): SubToolTipShape {
  const text = sourceText(source);
  for (const { keywords, shape } of TIP_SHAPE_KEYWORDS) {
    if (keywords.some((keyword) => text.includes(keyword))) return shape;
  }
  return "round";
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * 카탈로그 항목 하나를 서브툴 프리셋으로 변환한다.
 * - `id`는 `preset-<카탈로그 id>` (충돌 방지)
 * - `baseBrushId`는 카탈로그 id 그대로
 * - 팁 크기는 카탈로그 defaultWidth, 불투명도는 defaultOpacity에서 가져옴
 * - 그 외 파라미터는 CSP 중립 기본값
 */
export function adaptCatalogItemToSubToolPreset(
  source: SubToolCatalogSource,
): SubTool {
  const id = source.id.trim();
  if (id.length === 0) throw new Error("카탈로그 항목 식별자가 비어 있습니다.");
  const shape = inferSubToolTipShape(source);
  const defaults = createDefaultSubToolParams();
  const size =
    typeof source.defaultWidth === "number" && Number.isFinite(source.defaultWidth)
      ? clamp(source.defaultWidth, SUBTOOL_TIP_SIZE_MIN, SUBTOOL_TIP_SIZE_MAX)
      : defaults.tip.size;
  const opacity =
    typeof source.defaultOpacity === "number" &&
    Number.isFinite(source.defaultOpacity)
      ? clamp(source.defaultOpacity, 0, 1)
      : defaults.blending.opacity;

  const params: SubToolParams = {
    ...defaults,
    tip: {
      shape,
      size: roundTo(size, 1),
      angle: shape === "flat" ? 45 : defaults.tip.angle,
      roundness: shape === "flat" ? 0.35 : defaults.tip.roundness,
    },
    blending: { mode: "normal", opacity: roundTo(opacity, 3) },
  };

  return {
    id: `preset-${id}`,
    name: source.name.trim().length > 0 ? source.name.trim() : id,
    baseBrushId: id,
    params,
    createdAt: new Date(0).toISOString(),
    isPreset: true,
  };
}

/** 카탈로그 전체를 서브툴 프리셋 목록으로 변환한다. id 중복은 처음 항목만 유지한다. */
export function adaptCatalogItemsToSubToolPresets(
  sources: readonly SubToolCatalogSource[],
): SubTool[] {
  const presets: SubTool[] = [];
  const seen = new Set<string>();
  for (const source of sources) {
    let preset: SubTool;
    try {
      preset = adaptCatalogItemToSubToolPreset(source);
    } catch {
      continue;
    }
    if (seen.has(preset.id)) continue;
    seen.add(preset.id);
    presets.push(preset);
  }
  return presets;
}

/** 프리셋 식별 키 (버전 포함). 캐시 무효화에 사용한다. */
export function subToolPresetKey(tool: SubTool): string {
  return `v${SUBTOOL_PRESET_VERSION}:${tool.id}`;
}
