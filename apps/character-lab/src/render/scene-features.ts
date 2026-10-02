/**
 * 장면 기능 가용성 보고(순수 타입). 엔진이 capability에 따라 켜지 못한 기능(CSM·SSS·IBL·TAA·SSAO·GPU 타이머·
 * 텍스처 모드)을 사유와 함께 노출한다 — 무음 축소 금지(ADR-0018). RenderPanel이 `readSceneFeatures(engine)`로 읽는다.
 * NullEngine 레인은 대부분 unavailable이며 그 사실이 곧 Node 테스트의 검증 대상이다.
 */
export const SCENE_FEATURE_IDS = ["cascadedShadows", "subsurfaceScattering", "imageBasedLighting", "taa", "ssao", "gpuTimer", "morphTextureMode", "boneTextureMode", "msaa"] as const;
export type SceneFeatureId = (typeof SCENE_FEATURE_IDS)[number];

export type SceneFeatureStatus = "active" | "off" | "unavailable";

export interface SceneFeatureState {
  readonly status: SceneFeatureStatus;
  /** unavailable·off일 때 한글 사유 */
  readonly reasonKo?: string;
  /** 추가 수치(예: MSAA 샘플 수, 캐스케이드 수) */
  readonly detail?: string;
}

export type SceneFeatureReport = Readonly<Record<SceneFeatureId, SceneFeatureState>>;

export const SCENE_FEATURE_LABELS_KO: Readonly<Record<SceneFeatureId, string>> = {
  cascadedShadows: "캐스케이드 그림자(CSM)",
  subsurfaceScattering: "피부 SSS(PrePass)",
  imageBasedLighting: "절차 스카이 IBL",
  taa: "TAA(베타)",
  ssao: "SSAO2(베타)",
  gpuTimer: "GPU 프레임 타이머",
  morphTextureMode: "morph 텍스처 모드",
  boneTextureMode: "본 행렬 텍스처 모드",
  msaa: "MSAA",
};

export const SCENE_FEATURE_STATUS_LABELS_KO: Readonly<Record<SceneFeatureStatus, string>> = {
  active: "활성",
  off: "꺼짐",
  unavailable: "사용 불가",
};

/** 모든 기능 off(사유 없음)로 시작하는 보고 */
export function createFeatureReport(partial: Partial<SceneFeatureReport> = {}): SceneFeatureReport {
  const report: Record<SceneFeatureId, SceneFeatureState> = {} as Record<SceneFeatureId, SceneFeatureState>;
  for (const id of SCENE_FEATURE_IDS) report[id] = partial[id] ?? { status: "off" };
  return report;
}

export function featureActive(reasonOrDetail?: string): SceneFeatureState {
  return reasonOrDetail === undefined ? { status: "active" } : { status: "active", detail: reasonOrDetail };
}

export function featureOff(reasonKo?: string): SceneFeatureState {
  return reasonKo === undefined ? { status: "off" } : { status: "off", reasonKo };
}

export function featureUnavailable(reasonKo: string): SceneFeatureState {
  return { status: "unavailable", reasonKo };
}

/** 엔진 구현이 추가로 제공하는 보고 포트(계약 CharacterEngine 밖, 구조적 판별) */
export interface SceneFeatureSource {
  sceneFeatures(): SceneFeatureReport;
}

export function hasSceneFeatures(value: unknown): value is SceneFeatureSource {
  return typeof value === "object" && value !== null && typeof (value as { sceneFeatures?: unknown }).sceneFeatures === "function";
}

/** 엔진에서 보고를 읽는다. 포트가 없으면 null(패널은 '보고 없음'을 표시한다). */
export function readSceneFeatures(engine: unknown): SceneFeatureReport | null {
  if (!hasSceneFeatures(engine)) return null;
  return engine.sceneFeatures();
}

/** 한 줄 요약 목록(HUD·문서용) */
export function summarizeFeatures(report: SceneFeatureReport): string[] {
  return SCENE_FEATURE_IDS.map((id) => {
    const state = report[id];
    const extra = state.detail ? ` (${state.detail})` : state.reasonKo ? ` — ${state.reasonKo}` : "";
    return `${SCENE_FEATURE_LABELS_KO[id]}: ${SCENE_FEATURE_STATUS_LABELS_KO[state.status]}${extra}`;
  });
}
