/**
 * Studio 3D 데생 인형 — Magic Poser 벤치마크: VRM 표정 블렌드셰이프 (MP8).
 *
 * VRM 표준 표정 프리셋(VRM 0.x blendShapeMaster 호환 이름)을 조합해
 * 데생 인형의 얼굴 표정을 지정합니다. 표정 강도 슬라이더와 두 표정의
 * 블렌딩을 지원해 웹툰 컷의 감정 연출 레퍼런스로 사용합니다.
 *
 * 실제 블렌드셰이프 가중치 적용은 VRM 런타임 컴포넌트가 이 스펙을 읽어 수행합니다.
 */

import type { StudioVrmExportExpressionPreset } from "../vrm/studio-vrm-export-vrm-extension";

/** 표정 가중치 맵(표정 이름 → 0~1). 생략된 표정은 0으로 간주합니다. */
export type StudioVrmExpressionWeights = Partial<
  Record<StudioVrmExportExpressionPreset, number>
>;

export interface StudioVrmExpressionCombo {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly labelEn: string;
  readonly descriptionEn: string;
  readonly weights: StudioVrmExpressionWeights;
}

export const STUDIO_VRM_EXPRESSION_COMBOS: readonly StudioVrmExpressionCombo[] =
  Object.freeze([
    {
      id: "smile",
      label: "미소",
      description: "밝은 미소 표정입니다. 일상·로맨스 컷에 사용합니다.",
      labelEn: "Smile",
      descriptionEn: "A bright smile. For slice-of-life and romance panels.",
      weights: { happy: 1 },
    },
    {
      id: "surprised",
      label: "놀람",
      description: "눈을 크게 뜬 놀람 표정입니다. 반전·개그 컷에 사용합니다.",
      labelEn: "Surprised",
      descriptionEn: "Wide-eyed surprise. For twist and comedy panels.",
      weights: { surprised: 1 },
    },
    {
      id: "angry",
      label: "분노",
      description: "화가 난 표정입니다. 갈등·전투 컷에 사용합니다.",
      labelEn: "Angry",
      descriptionEn: "An angry face. For conflict and action panels.",
      weights: { angry: 1 },
    },
    {
      id: "sad",
      label: "슬픔",
      description: "슬픈 표정입니다. 감정선·회상 컷에 사용합니다.",
      labelEn: "Sad",
      descriptionEn: "A sad face. For emotional and flashback panels.",
      weights: { sad: 1 },
    },
    {
      id: "neutral",
      label: "무표정",
      description: "중립 표정입니다. 모든 가중치가 0입니다.",
      labelEn: "Neutral",
      descriptionEn: "Neutral expression. All weights are 0.",
      weights: {},
    },
  ]);

function clampWeight(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** 가중치 맵의 모든 값을 0~1로 정규화합니다. */
export function normalizeStudioVrmExpressionWeights(
  weights: StudioVrmExpressionWeights,
): StudioVrmExpressionWeights {
  const normalized: Record<string, number> = {};
  for (const [name, weight] of Object.entries(weights)) {
    const clamped = clampWeight(weight);
    if (clamped > 0) {
      normalized[name] = clamped;
    }
  }
  return normalized as StudioVrmExpressionWeights;
}

/**
 * 두 표정 가중치를 t(0~1)로 선형 보간합니다.
 * 감정 전이(예: 미소→놀람) 애니메이션의 키프레임 계산에 사용합니다.
 */
export function blendStudioVrmExpressionWeights(
  from: StudioVrmExpressionWeights,
  to: StudioVrmExpressionWeights,
  t: number,
): StudioVrmExpressionWeights {
  const clamped = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0;
  const names = new Set<StudioVrmExportExpressionPreset>([
    ...Object.keys(from),
    ...Object.keys(to),
  ] as StudioVrmExportExpressionPreset[]);
  const result: Record<string, number> = {};
  for (const name of names) {
    const value = (from[name] ?? 0) + ((to[name] ?? 0) - (from[name] ?? 0)) * clamped;
    if (value > 0) {
      result[name] = Math.round(value * 1000) / 1000;
    }
  }
  return result as StudioVrmExpressionWeights;
}

/**
 * 표정 강도를 0~100으로 적용합니다.
 * 0이면 무표정(모든 가중치 0), 100이면 원본 가중치 그대로입니다.
 */
export function applyStudioVrmExpressionIntensity(
  weights: StudioVrmExpressionWeights,
  intensity: number,
): StudioVrmExpressionWeights {
  const t = Number.isFinite(intensity) ? Math.min(100, Math.max(0, intensity)) / 100 : 0;
  return blendStudioVrmExpressionWeights({}, weights, t);
}

/** 콤보 ID로 표정 스펙을 찾습니다. 없으면 undefined를 돌립니다. */
export function findStudioVrmExpressionCombo(
  id: string,
): StudioVrmExpressionCombo | undefined {
  return STUDIO_VRM_EXPRESSION_COMBOS.find((combo) => combo.id === id);
}

// ── 셰이퍼 표정 선택 계약 ────────────────────────────────────────────────────

/** 표정 탭의 선택 상태: 감정 콤보 + 강도(0~100). */
export interface StudioShaperExpressionSelection {
  readonly comboId: string;
  readonly intensity: number;
}

export const DEFAULT_SHAPER_EXPRESSION_SELECTION: Readonly<StudioShaperExpressionSelection> =
  Object.freeze({ comboId: "smile", intensity: 60 });

/**
 * 콤보+강도 선택을 VRM 블렌드셰이프 가중치로 해석합니다.
 * 알 수 없는 콤보 ID는 무표정(빈 가중치)으로 처리합니다.
 */
export function resolveShaperExpressionWeights(
  selection: StudioShaperExpressionSelection,
): StudioVrmExpressionWeights {
  const combo = findStudioVrmExpressionCombo(selection.comboId);
  return applyStudioVrmExpressionIntensity(combo?.weights ?? {}, selection.intensity);
}
