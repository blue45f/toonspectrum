/**
 * 그림체 매칭 2D 렌더(순수 로직).
 *
 * 사용자 본인 작품으로만 옵트인 스타일 프로필을 생성합니다(윤리 가드).
 * 3D 포즈 렌더 파라미터 → 스타일 적용 파라미터 → 2D 출력 스펙으로 변환하며,
 * LT 변환(선화+톤)과의 병행 선택 옵션을 지원합니다.
 */

import { hashSketchSeed } from "./studio-shaper-sketch-pipeline";

import type { StudioShaperPosePresetId } from "./studio-shaper-sketch-pipeline";
import type { StudioMannequinVec3 } from "../scene-3d/studio-mannequin-model";

// ── 스타일 프로필 + 윤리 가드 ───────────────────────────────────────────────

export type StudioStyleSource = "user-owned" | "licensed" | "third-party" | "unknown";

export interface StudioStyleAttribution {
  /** UI에 반드시 표시할 권리자 표기. 예: "© 김툰 (본인 작품)". */
  readonly ownerLabel: string;
  readonly workTitle?: string;
  readonly sourceWorkId?: string;
}

export interface StudioStyleProfileInput {
  readonly source: StudioStyleSource;
  /** 참조 이미지 해시(원본 이미지 자체는 저장하지 않습니다). */
  readonly referenceHashes: readonly string[];
  readonly styleName: string;
  readonly attribution: StudioStyleAttribution;
  /** 본인 작품임을 사용자가 명시적으로 확인했는지 여부. */
  readonly userConfirmedOwnership: boolean;
}

export interface StudioStyleProfile {
  readonly profileId: string;
  readonly source: "user-owned";
  readonly referenceHashes: readonly string[];
  readonly styleName: string;
  readonly attribution: StudioStyleAttribution;
  readonly createdAt: number;
}

export class StudioStyleEthicsError extends Error {
  constructor(
    public readonly code: "non-owned-source" | "ownership-not-confirmed" | "missing-attribution" | "no-reference",
    message: string,
  ) {
    super(message);
    this.name = "StudioStyleEthicsError";
  }
}

/**
 * 스타일 프로필을 생성합니다.
 * source가 "user-owned"가 아니거나 본인 확인이 없으면 거부합니다(윤리 가드).
 */
export function createStudioStyleProfile(
  input: StudioStyleProfileInput,
  now: () => number = () => Date.now(),
): StudioStyleProfile {
  if (input.source !== "user-owned") {
    throw new StudioStyleEthicsError(
      "non-owned-source",
      "본인 작품이 아닌 이미지로는 스타일 프로필을 만들 수 없습니다. 본인 작품으로 다시 시도해 주세요.",
    );
  }
  if (!input.userConfirmedOwnership) {
    throw new StudioStyleEthicsError(
      "ownership-not-confirmed",
      "본인 작품 확인에 동의하지 않아 스타일 프로필을 만들 수 없습니다.",
    );
  }
  if (input.attribution.ownerLabel.trim().length === 0) {
    throw new StudioStyleEthicsError(
      "missing-attribution",
      "출처 표시용 권리자 표기는 필수입니다.",
    );
  }
  if (input.referenceHashes.length === 0) {
    throw new StudioStyleEthicsError("no-reference", "참조 이미지가 최소 1장 필요합니다.");
  }
  const seed = hashSketchSeed(`style-profile|${input.styleName}|${input.referenceHashes.join(",")}`);
  return {
    profileId: `style-${seed.toString(16).padStart(8, "0")}`,
    source: "user-owned",
    referenceHashes: Object.freeze([...input.referenceHashes]),
    styleName: input.styleName.trim(),
    attribution: {
      ownerLabel: input.attribution.ownerLabel.trim(),
      workTitle: input.attribution.workTitle?.trim() || undefined,
      sourceWorkId: input.attribution.sourceWorkId?.trim() || undefined,
    },
    createdAt: now(),
  };
}

// ── 3D 포즈 렌더 파라미터 → 스타일 적용 파라미터 ────────────────────────────

export interface StudioPoseRenderParams {
  readonly poseId: StudioShaperPosePresetId;
  /** 관절별 오일러 회전(rad). 생략된 관절은 rest 자세입니다. */
  readonly jointRotations: Readonly<Partial<Record<string, StudioMannequinVec3>>>;
  readonly cameraAngleDeg: number;
  readonly cameraElevationDeg: number;
  /** 조명 방향(정규화되지 않은 벡터도 허용). */
  readonly lightDirection: StudioMannequinVec3;
}

export interface StudioStyleAppliedParams {
  readonly profileId: string;
  readonly poseId: StudioShaperPosePresetId;
  /** 선화: 굵기(px)·단순화 단계. */
  readonly line: { readonly thicknessPx: number; readonly simplifyLevel: 1 | 2 | 3 };
  /** 톤: 스크린톤 밀도(0–1)·톤 단계 수. */
  readonly tone: { readonly density: number; readonly steps: 2 | 3 | 4 };
  /** 채색 힌트 팔레트 참조(선택). */
  readonly paletteRef?: string;
  /** 포즈와 무관하게 프로필마다 고정되는 결정적 시드. */
  readonly styleSeed: number;
}

/**
 * 스타일 프로필을 3D 포즈 렌더 파라미터에 적용합니다.
 * 동일 프로필에서는 포즈가 달라도 line/tone 파라미터가 동일하게 유지됩니다(일관성).
 */
export function applyStudioStyleToPose(
  profile: StudioStyleProfile,
  pose: StudioPoseRenderParams,
): StudioStyleAppliedParams {
  const styleSeed = hashSketchSeed(`style-applied|${profile.profileId}`);
  const lineThicknessPx = 1.5 + ((styleSeed >>> 6) % 20) / 10;
  const simplifyLevel = (1 + ((styleSeed >>> 11) % 3)) as 1 | 2 | 3;
  const density = 0.25 + ((styleSeed >>> 13) % 50) / 100;
  const steps = (2 + ((styleSeed >>> 19) % 3)) as 2 | 3 | 4;
  return {
    profileId: profile.profileId,
    poseId: pose.poseId,
    line: { thicknessPx: lineThicknessPx, simplifyLevel },
    tone: { density, steps },
    styleSeed,
  };
}

// ── LT 변환 병행 선택 + 2D 출력 스펙 ────────────────────────────────────────

export type StudioRenderOutputChoice = "style" | "lt" | "both";

export interface StudioLtRenderOptions {
  /** 선화 추출 임계값(0–1). */
  readonly lineThreshold: number;
  /** 톤 밀도(0–1). */
  readonly toneDensity: number;
}

export interface StudioRenderOutputSpec {
  readonly outputId: string;
  readonly choice: StudioRenderOutputChoice;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly format: "png" | "webp";
  readonly styleApplied?: StudioStyleAppliedParams;
  readonly ltOptions?: StudioLtRenderOptions;
  /** 출력 레이어 구성(선화/톤/채색 분리). */
  readonly layers: readonly { readonly layerId: string; readonly kind: "line" | "tone" | "color" }[];
  /** UI에 표시할 출처 표기. */
  readonly attributionLabel: string;
}

export function buildStudioRenderOutputSpec(
  profile: StudioStyleProfile,
  applied: StudioStyleAppliedParams,
  choice: StudioRenderOutputChoice,
  options: { readonly lt?: StudioLtRenderOptions; readonly widthPx?: number; readonly heightPx?: number } = {},
): StudioRenderOutputSpec {
  const seed = hashSketchSeed(`render-output|${profile.profileId}|${applied.poseId ?? ""}|${choice}`);
  const layers: { readonly layerId: string; readonly kind: "line" | "tone" | "color" }[] = [];
  if (choice === "style" || choice === "both") {
    layers.push({ layerId: "line", kind: "line" }, { layerId: "tone", kind: "tone" });
  }
  if (choice === "lt" || choice === "both") {
    layers.push({ layerId: "lt-line", kind: "line" }, { layerId: "lt-tone", kind: "tone" });
  }
  return {
    outputId: `render-${seed.toString(16).padStart(8, "0")}`,
    choice,
    widthPx: options.widthPx ?? 1024,
    heightPx: options.heightPx ?? 1536,
    format: "png",
    styleApplied: choice === "lt" ? undefined : applied,
    ltOptions: choice === "style" ? undefined : { lineThreshold: 0.5, toneDensity: 0.6, ...options.lt },
    layers: Object.freeze(layers),
    attributionLabel: profile.attribution.workTitle
      ? `${profile.attribution.ownerLabel} · 「${profile.attribution.workTitle}」 스타일 적용`
      : `${profile.attribution.ownerLabel} 스타일 적용`,
  };
}
