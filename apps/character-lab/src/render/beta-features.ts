/**
 * 베타·확장 기능 보고(순수 타입). `scene-features.ts`의 9개 기본 항목은 그대로 두고, 이 파일이 다음을 더한다.
 *
 * - 베타 토글 4종: NodeMaterial 툰 · IBL Shadows · OpenPBR · MeshUVSpaceRenderer 투영 페인트.
 *   기본은 전부 꺼짐이며, 켜기 전에 엔진이 능력을 확인해 `supported`와 한글 사유를 돌려준다.
 *   지원하지 않는 엔진에서 켜기를 요청해도 **다른 경로로 자동 대체하지 않는다**(기본 ShaderMaterial 툰·PBR 그대로, 상태만 `unavailable` + 사유).
 * - 리그·내보내기 능력 2종: 체형 morph 관절 오프셋 소비(`jointOffsets`)와 GLB morph sparse 정리(`glbMorphSparse`).
 *
 * 토글 상태는 엔진 세션 상태다(레시피·히스토리에 저장하지 않는다 — `ShadingProfile`은 core가 동결한 strict 계약이라 필드를 더할 수 없다).
 * 엔진을 다시 고르면 모두 꺼짐으로 돌아간다. RenderPanel이 `readBetaFeatures(engine)`로 읽고 `setBetaFeature`로 켜고 끈다.
 */
import type { SceneFeatureReport, SceneFeatureState } from "./scene-features";

export const BETA_FEATURE_IDS = ["nodeMaterialToon", "iblShadows", "openPbr", "uvProjectionPaint"] as const;
export type BetaFeatureId = (typeof BETA_FEATURE_IDS)[number];

/** 베타 토글이 아닌 확장 능력 항목 */
export const RIG_CAPABILITY_IDS = ["jointOffsets", "glbMorphSparse"] as const;
export type RigCapabilityId = (typeof RIG_CAPABILITY_IDS)[number];

export const EXTENDED_FEATURE_IDS = [...BETA_FEATURE_IDS, ...RIG_CAPABILITY_IDS] as const;
export type ExtendedFeatureId = (typeof EXTENDED_FEATURE_IDS)[number];

export function isBetaFeatureId(value: string): value is BetaFeatureId {
  return (BETA_FEATURE_IDS as readonly string[]).includes(value);
}

export const EXTENDED_FEATURE_LABELS_KO: Readonly<Record<ExtendedFeatureId, string>> = {
  nodeMaterialToon: "NodeMaterial 툰",
  iblShadows: "IBL 그림자",
  openPbr: "OpenPBR 재질",
  uvProjectionPaint: "투영 페인트(MeshUVSpaceRenderer)",
  jointOffsets: "체형 관절 오프셋",
  glbMorphSparse: "GLB morph sparse 정리",
};

/** 베타 토글 옆에 보이는 한 줄 설명(무엇을 하고 무엇이 필요한지) */
export const BETA_FEATURE_HINTS_KO: Readonly<Record<BetaFeatureId, string>> = {
  nodeMaterialToon: "툰 모드에서 기본 ShaderMaterial 대신 코드로 구성한 NodeMaterial 그래프로 같은 툰 램프·림·얼굴 SDF를 그립니다.",
  iblShadows: "PBR·OpenPBR 모드에서 복셀 기반 IBL 그림자를 더합니다. 청색 노이즈 텍스처 1장을 assets.babylonjs.com에서 받습니다(외부 요청).",
  openPbr: "PBR 모드에서 PBRMaterial 대신 OpenPBRMaterial(같은 프리셋 파라미터 매핑)을 씁니다. 페인트 데칼은 보이지 않고 노이즈 텍스처 1장을 외부에서 받습니다.",
  uvProjectionPaint: "드로잉 모드에서 UV 원형 스탬프 대신 표면에 브러시를 투영해 칠합니다(스트로크가 끝나면 GPU 결과를 레이어로 읽어 되돌리기 1단계로 기록).",
};

/** 베타 토글 한 항목의 상태: 기본 `SceneFeatureState`에 요청 여부와 능력(켤 수 있는지)을 더한다. */
export interface BetaFeatureState extends SceneFeatureState {
  /** 사용자가 켰는지(요청). 켰는데 못 쓰면 status는 unavailable이다. */
  readonly requested: boolean;
  /** 이 엔진·소스에서 켤 수 있는지(능력 확인 결과). false면 reasonKo가 사유다. */
  readonly supported: boolean;
}

export type BetaFeatureReport = Readonly<Record<BetaFeatureId, BetaFeatureState>>;

/** `sceneFeatures()`가 돌려주는 확장 항목(베타 4 + 능력 2) */
export type ExtendedFeatureReport = Readonly<Record<BetaFeatureId, BetaFeatureState> & Record<RigCapabilityId, SceneFeatureState>>;

/** 엔진 `sceneFeatures()`의 전체 보고: 기본 9 + 확장 6. 기본 9만 아는 소비자에게는 `SceneFeatureReport`로도 쓸 수 있다. */
export type FullSceneFeatureReport = SceneFeatureReport & ExtendedFeatureReport;

/** 엔진이 제공하는 베타 토글 포트(계약 `CharacterEngine` 밖, 구조적 판별) */
export interface BetaFeaturePort {
  betaFeatures(): BetaFeatureReport;
  /** 켜거나 끈다. 능력이 없으면 켜지지 않고 `unavailable` 상태와 사유가 돌아온다(자동 대체 없음). */
  setBetaFeature(id: BetaFeatureId, enabled: boolean): Promise<BetaFeatureState>;
}

export function hasBetaFeatures(value: unknown): value is BetaFeaturePort {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { betaFeatures?: unknown; setBetaFeature?: unknown };
  return typeof candidate.betaFeatures === "function" && typeof candidate.setBetaFeature === "function";
}

/** 엔진에서 베타 토글 보고를 읽는다. 포트가 없으면 null(패널은 토글을 비활성 + 사유로 보인다). */
export function readBetaFeatures(engine: unknown): BetaFeatureReport | null {
  return hasBetaFeatures(engine) ? engine.betaFeatures() : null;
}

/** 베타 토글 상태 생성 보조(요청 없음·지원 = 꺼짐) */
export function betaOff(reasonKo?: string): BetaFeatureState {
  return reasonKo === undefined ? { status: "off", requested: false, supported: true } : { status: "off", requested: false, supported: true, reasonKo };
}

export function betaUnsupported(reasonKo: string, requested: boolean): BetaFeatureState {
  return { status: requested ? "unavailable" : "off", requested, supported: false, reasonKo };
}

export function betaActive(detail?: string): BetaFeatureState {
  return detail === undefined ? { status: "active", requested: true, supported: true } : { status: "active", requested: true, supported: true, detail };
}

/** 요청했지만 지금은 적용되지 않는 경우(모드 불일치 등 — 능력은 있다). 오류가 아니므로 status는 off. */
export function betaWaiting(reasonKo: string): BetaFeatureState {
  return { status: "off", requested: true, supported: true, reasonKo };
}

/** 요청했고 능력도 있지만 만들다 실패한 경우 */
export function betaFailed(reasonKo: string): BetaFeatureState {
  return { status: "unavailable", requested: true, supported: true, reasonKo };
}

export function createBetaReport(partial: Partial<BetaFeatureReport> = {}): BetaFeatureReport {
  const report = {} as Record<BetaFeatureId, BetaFeatureState>;
  for (const id of BETA_FEATURE_IDS) report[id] = partial[id] ?? betaOff();
  return report;
}

/** 전체 보고에서 확장 항목만 꺼낸다. 확장 항목이 없는(기본 9만 아는) 엔진이면 null. */
export function readExtendedFeatures(report: SceneFeatureReport | null): Partial<ExtendedFeatureReport> | null {
  if (!report) return null;
  const out: Partial<Record<ExtendedFeatureId, SceneFeatureState>> = {};
  let found = false;
  for (const id of EXTENDED_FEATURE_IDS) {
    const entry = (report as unknown as Partial<Record<ExtendedFeatureId, SceneFeatureState>>)[id];
    if (entry) {
      out[id] = entry;
      found = true;
    }
  }
  return found ? (out as Partial<ExtendedFeatureReport>) : null;
}

/** 확장 항목 한 줄 요약(문서·진단용) */
export function summarizeExtendedFeatures(report: Partial<ExtendedFeatureReport>): string[] {
  const lines: string[] = [];
  for (const id of EXTENDED_FEATURE_IDS) {
    const state = report[id];
    if (!state) continue;
    const status = state.status === "active" ? "활성" : state.status === "off" ? "꺼짐" : "사용 불가";
    const extra = state.detail ? ` (${state.detail})` : state.reasonKo ? ` — ${state.reasonKo}` : "";
    lines.push(`${EXTENDED_FEATURE_LABELS_KO[id]}: ${status}${extra}`);
  }
  return lines;
}
