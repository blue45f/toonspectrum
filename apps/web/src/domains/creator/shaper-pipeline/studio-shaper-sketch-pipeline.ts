/**
 * 스케치→3D 캐릭터 모델 파이프라인(순수 로직).
 *
 * 정면/측면 스케치 2장 입력 → 업로드 → 분석 → 생성 → 등록 단계로 진행합니다.
 * 외부 AI 호출은 StudioSketchToModelProvider 인터페이스로 추상화하며,
 * 테스트·오프라인 용도로 결정적 stub 프로바이더(StubStudioSketchToModelProvider)를 제공합니다.
 * 생성된 모델은 데생 인형(studio-mannequin) 시스템에 등록할 수 있는 어댑터로 변환됩니다.
 */

import {
  STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS,
  clampStudioMannequinBodyParams,
} from "../scene-3d/studio-mannequin-model";

import type { StudioMannequinBodyParams } from "../scene-3d/studio-mannequin-model";

// ── 입력 ────────────────────────────────────────────────────────────────────

export type StudioSketchView = "front" | "side";

export interface StudioSketchInput {
  /** 스케치 식별자(파일명·업로드 키 등). */
  readonly id: string;
  readonly view: StudioSketchView;
  /** 이미지 바이트의 결정적 해시(테스트에서는 고정 문자열 사용). */
  readonly hash: string;
  readonly widthPx: number;
  readonly heightPx: number;
}

export interface StudioSketchPairInput {
  readonly front: StudioSketchInput;
  readonly side: StudioSketchInput;
}

// ── 파이프라인 단계 ─────────────────────────────────────────────────────────

export const STUDIO_SKETCH_PIPELINE_STAGES = [
  "uploading",
  "analyzing",
  "generating",
  "registering",
  "done",
] as const;

export type StudioSketchPipelineStage = (typeof STUDIO_SKETCH_PIPELINE_STAGES)[number];

export interface StudioSketchPipelineStep {
  readonly stage: StudioSketchPipelineStage;
  /** 단계 진입 시각(ms epoch). */
  readonly enteredAt: number;
  readonly detail: string;
}

export interface StudioSketchPipelineResult {
  readonly steps: readonly StudioSketchPipelineStep[];
  readonly model: StudioSketchCharacterModel;
}

// ── 분석/생성 결과 ──────────────────────────────────────────────────────────

export interface StudioSketchAnalysis {
  /** 두신 추정값(3–9). */
  readonly headCount: number;
  readonly shoulderWidthRatio: number;
  readonly pelvisWidthRatio: number;
  /** 감지된 의상·소품 라벨(결정적 stub용). */
  readonly detectedOutfit: string;
  readonly detectedProps: readonly string[];
  /** 0–1 신뢰도. */
  readonly confidence: number;
}

export interface StudioSketchCharacterModel {
  readonly modelId: string;
  /** 분석 결과가 매핑된 데생 인형 체형 파라미터. */
  readonly bodyParams: StudioMannequinBodyParams;
  /** stub 여부(실제 AI 호출이 아님을 식별 가능하게 한다). */
  readonly provenance: "stub" | "external";
  readonly sourceSketches: readonly StudioSketchInput[];
  readonly createdAt: number;
}

// ── 프로바이더 인터페이스 ───────────────────────────────────────────────────

export interface StudioSketchToModelProvider {
  readonly kind: "stub" | "external";
  /** 시간 주입(결정적 테스트용). 파이프라인은 이 시계를 우선 사용합니다. */
  readonly now?: () => number;
  analyze(sketches: StudioSketchPairInput): Promise<StudioSketchAnalysis>;
  generate(analysis: StudioSketchAnalysis, sketches: StudioSketchPairInput): Promise<StudioSketchCharacterModel>;
}

/** 간단한 문자열 해시(FNV-1a 32bit) — stub의 결정적 출력을 위한 내부 유틸입니다. */
export function hashSketchSeed(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function deriveAnalysis(sketches: StudioSketchPairInput): StudioSketchAnalysis {
  const seed = hashSketchSeed(`${sketches.front.hash}|${sketches.side.hash}`);
  const unit = (shift: number, modulo: number): number => ((seed >>> shift) % modulo) / modulo;
  const headCount = 5.5 + unit(0, 1000) / 1000 * 2.5;
  const shoulderWidthRatio = 0.9 + unit(10, 1000) / 1000 * 0.25;
  const pelvisWidthRatio = 0.9 + unit(20, 1000) / 1000 * 0.25;
  const outfitIndex = (seed >>> 4) % 4;
  const detectedOutfit = ["교복", "사복", "판타지 갑주", "한복"][outfitIndex] ?? "사복";
  const propIndex = (seed >>> 7) % 4;
  const detectedProps = [["가방"], ["검"], ["우산"], []][propIndex] ?? [];
  return {
    headCount: Math.round(headCount * 10) / 10,
    shoulderWidthRatio: Math.round(shoulderWidthRatio * 100) / 100,
    pelvisWidthRatio: Math.round(pelvisWidthRatio * 100) / 100,
    detectedOutfit,
    detectedProps,
    confidence: 0.9,
  };
}

/**
 * 결정적 stub 프로바이더. 동일 입력에는 항상 동일 출력을 반환하므로
 * 테스트와 오프라인 개발에서 실제 AI 호출 없이 파이프라인을 검증할 수 있습니다.
 */
export class StubStudioSketchToModelProvider implements StudioSketchToModelProvider {
  readonly kind = "stub" as const;

  constructor(readonly now: () => number = () => Date.now()) {}

  async analyze(sketches: StudioSketchPairInput): Promise<StudioSketchAnalysis> {
    return deriveAnalysis(sketches);
  }

  async generate(
    analysis: StudioSketchAnalysis,
    sketches: StudioSketchPairInput,
  ): Promise<StudioSketchCharacterModel> {
    const seed = hashSketchSeed(`${sketches.front.hash}|${sketches.side.hash}|model`);
    const bodyParams = clampStudioMannequinBodyParams({
      ...STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS,
      headCount: analysis.headCount,
      shoulderWidth: analysis.shoulderWidthRatio,
      pelvisWidth: analysis.pelvisWidthRatio,
    });
    return {
      modelId: `stub-model-${seed.toString(16).padStart(8, "0")}`,
      bodyParams,
      provenance: "stub",
      sourceSketches: [sketches.front, sketches.side],
      createdAt: this.now(),
    };
  }
}

// ── 파이프라인 실행 ─────────────────────────────────────────────────────────

export class StudioSketchPipelineError extends Error {
  constructor(
    public readonly stage: StudioSketchPipelineStage,
    public readonly code: "invalid-input" | "provider-failed",
    message: string,
  ) {
    super(message);
    this.name = "StudioSketchPipelineError";
  }
}

function validateSketch(sketch: unknown, role: string): StudioSketchInput {
  const candidate = sketch as Partial<StudioSketchInput> | null;
  if (
    !candidate
    || typeof candidate.id !== "string"
    || candidate.id.length === 0
    || (candidate.view !== "front" && candidate.view !== "side")
    || typeof candidate.hash !== "string"
    || candidate.hash.length === 0
    || typeof candidate.widthPx !== "number"
    || candidate.widthPx <= 0
    || typeof candidate.heightPx !== "number"
    || candidate.heightPx <= 0
  ) {
    throw new StudioSketchPipelineError(
      "uploading",
      "invalid-input",
      `${role} 스케치 입력이 올바르지 않습니다.`,
    );
  }
  return candidate as StudioSketchInput;
}

/**
 * 파이프라인 전체를 실행합니다. 단계 전이는 steps 배열에 기록되며,
 * 실패 시 StudioSketchPipelineError가 발생하고 지금까지의 steps를 error에 담지 않고 던집니다.
 */
export async function runStudioSketchToModelPipeline(
  input: unknown,
  provider: StudioSketchToModelProvider,
  now?: () => number,
): Promise<StudioSketchPipelineResult> {
  const clock = now ?? provider.now ?? (() => Date.now());
  const steps: StudioSketchPipelineStep[] = [];
  const enter = (stage: StudioSketchPipelineStage, detail: string): void => {
    steps.push({ stage, enteredAt: clock(), detail });
  };

  enter("uploading", "정면·측면 스케치를 업로드합니다.");
  const raw = (input ?? {}) as { front?: unknown; side?: unknown };
  const front = validateSketch(raw.front, "정면");
  const side = validateSketch(raw.side, "측면");
  if (front.view !== "front" || side.view !== "side") {
    throw new StudioSketchPipelineError("uploading", "invalid-input", "정면/측면 구도가 뒤바뀌었습니다.");
  }

  let analysis: StudioSketchAnalysis;
  enter("analyzing", "스케치에서 체형·의상 정보를 분석합니다.");
  try {
    analysis = await provider.analyze({ front, side });
  } catch (error) {
    throw new StudioSketchPipelineError("analyzing", "provider-failed", `분석 단계에서 오류가 발생했습니다: ${String(error)}`);
  }

  let model: StudioSketchCharacterModel;
  enter("generating", "분석 결과를 3D 캐릭터 모델로 생성합니다.");
  try {
    model = await provider.generate(analysis, { front, side });
  } catch (error) {
    throw new StudioSketchPipelineError("generating", "provider-failed", `생성 단계에서 오류가 발생했습니다: ${String(error)}`);
  }

  enter("registering", "생성된 모델을 데생 인형 시스템에 등록합니다.");
  enter("done", "파이프라인이 완료되었습니다.");
  return { steps, model };
}

// ── 데생 인형 등록 어댑터 ───────────────────────────────────────────────────

export interface StudioMannequinRegistration {
  /** 데생 인형 시스템의 등록 키. */
  readonly registrationId: string;
  readonly displayName: string;
  readonly bodyParams: StudioMannequinBodyParams;
  readonly sourceModelId: string;
  readonly provenance: StudioSketchCharacterModel["provenance"];
  readonly registeredAt: number;
}

/** 생성된 모델을 데생 인형 시스템 등록 스펙으로 변환합니다. */
export function adaptSketchModelToMannequinRegistration(
  model: StudioSketchCharacterModel,
  displayName: string,
  now: () => number = () => Date.now(),
): StudioMannequinRegistration {
  const trimmed = displayName.trim();
  if (trimmed.length === 0) {
    throw new StudioSketchPipelineError("registering", "invalid-input", "등록할 캐릭터 이름이 비어 있습니다.");
  }
  const seed = hashSketchSeed(`${model.modelId}|${trimmed}`);
  return {
    registrationId: `mannequin-reg-${seed.toString(16).padStart(8, "0")}`,
    displayName: trimmed,
    bodyParams: clampStudioMannequinBodyParams(model.bodyParams),
    sourceModelId: model.modelId,
    provenance: model.provenance,
    registeredAt: now(),
  };
}

// ── 포즈 10종 프리셋 → 2D 레퍼런스 출력 파라미터 ────────────────────────────

export const STUDIO_SHAPER_POSE_PRESET_IDS = [
  "standing-front",
  "standing-side",
  "walking",
  "running",
  "sitting",
  "kneeling",
  "waving",
  "pointing",
  "action-dash",
  "bowing",
] as const;

export type StudioShaperPosePresetId = (typeof STUDIO_SHAPER_POSE_PRESET_IDS)[number];

export const STUDIO_SHAPER_POSE_PRESET_LABELS: Readonly<Record<StudioShaperPosePresetId, string>> =
  Object.freeze({
    "standing-front": "정면 기립",
    "standing-side": "측면 기립",
    walking: "걷기",
    running: "달리기",
    sitting: "앉기",
    kneeling: "무릎 꿇기",
    waving: "손 흔들기",
    pointing: "가리키기",
    "action-dash": "돌진 액션",
    bowing: "절하기",
  });

export interface StudioPoseReferenceOutputParams {
  readonly poseId: StudioShaperPosePresetId;
  readonly poseLabel: string;
  /** 카메라 방위각(도). 0=정면. */
  readonly cameraAngleDeg: number;
  /** 카메라 고도각(도). 0=수평. */
  readonly cameraElevationDeg: number;
  /** 레퍼런스 출력 프레임(px). */
  readonly frameWidthPx: number;
  readonly frameHeightPx: number;
  /** 선화 굵기 배율(레퍼런스 추출용). */
  readonly lineWeightScale: number;
  /** 결정적 프리셋 해시 — 동일 포즈는 항상 동일 파라미터를 얻습니다. */
  readonly presetSeed: number;
}

function posePresetSeed(poseId: StudioShaperPosePresetId): number {
  return hashSketchSeed(`pose-preset|${poseId}`);
}

/** 포즈 프리셋을 2D 레퍼런스 출력 파라미터로 변환합니다(결정적). */
export function applyStudioShaperPosePreset(
  poseId: StudioShaperPosePresetId,
): StudioPoseReferenceOutputParams {
  if (!STUDIO_SHAPER_POSE_PRESET_IDS.includes(poseId)) {
    throw new StudioSketchPipelineError("generating", "invalid-input", `알 수 없는 포즈 프리셋입니다: ${String(poseId)}`);
  }
  const seed = posePresetSeed(poseId);
  const cameraByPose: Record<StudioShaperPosePresetId, { angle: number; elevation: number }> = {
    "standing-front": { angle: 0, elevation: 0 },
    "standing-side": { angle: 90, elevation: 0 },
    walking: { angle: 45, elevation: 5 },
    running: { angle: 45, elevation: 8 },
    sitting: { angle: 30, elevation: 12 },
    kneeling: { angle: 30, elevation: 10 },
    waving: { angle: 0, elevation: 0 },
    pointing: { angle: 60, elevation: 5 },
    "action-dash": { angle: 60, elevation: 10 },
    bowing: { angle: 20, elevation: 15 },
  };
  const camera = cameraByPose[poseId];
  return {
    poseId,
    poseLabel: STUDIO_SHAPER_POSE_PRESET_LABELS[poseId],
    cameraAngleDeg: camera.angle,
    cameraElevationDeg: camera.elevation,
    frameWidthPx: 1024,
    frameHeightPx: 1536,
    lineWeightScale: 1 + ((seed >>> 8) % 40) / 200,
    presetSeed: seed,
  };
}
