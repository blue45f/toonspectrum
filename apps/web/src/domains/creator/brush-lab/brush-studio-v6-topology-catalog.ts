import { BRUSH_STUDIO_V6_ARTISTRY_TOPOLOGIES, type BrushStudioV6ArtistryModel } from "./brush-studio-v6-artistry-catalog";
import type { BrushStudioV6Tuning } from "./brush-studio-v6-engine";

export interface BrushStudioV6TopologyControl {
  readonly key: Exclude<keyof BrushStudioV6Tuning, "primaryColor" | "secondaryColor">;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
}
export interface BrushStudioV6TopologyDescriptor {
  readonly id: string;
  readonly recipeId: string;
  readonly model: "spring" | "curl" | "ballistic" | "weave" | "branch" | "orbit" | BrushStudioV6ArtistryModel;
  readonly group?: string;
  readonly label: string;
  readonly description: string;
  readonly controls: readonly BrushStudioV6TopologyControl[];
  readonly tuning: Partial<BrushStudioV6Tuning>;
}
const unit = (key: BrushStudioV6TopologyControl["key"], label: string): BrushStudioV6TopologyControl =>
  ({ key, label, min: 0, max: 1, step: 0.01 });
const population = { key: "particleCount", label: "입자 밀도", min: 128, max: 4096, step: 128 } as const;
const scale = { key: "patternScale", label: "구조 주기", min: 0.1, max: 4, step: 0.01 } as const;

/** Distinct, version-pinned algorithms. Existing stroke IDs retain their original solvers. */
export const BRUSH_STUDIO_V6_TOPOLOGIES: readonly BrushStudioV6TopologyDescriptor[] = Object.freeze([
  { id: "carrier-cpu-spring-filaments-v1", recipeId: "elastic-filaments", model: "spring", label: "탄성 실선",
    description: "감쇠 스프링으로 추적하는 실가닥. 급회전에서 관성·벌어짐이 남습니다.",
    controls: [unit("friction", "스프링 복원력"), unit("viscosity", "진동 감쇠"), { key: "bristleStrands", label: "실가닥 밀도", min: 8, max: 128, step: 4 }],
    tuning: { size: 44, spacing: 0.055, friction: 0.5, viscosity: 0.32, bristleStrands: 40 } },
  { id: "carrier-cpu-curl-advection-v1", recipeId: "vortex-flow", model: "curl", label: "소용돌이 흐름",
    description: "해석적 회전장에서 입자를 이류시켜 연기 같은 연결 궤적을 만듭니다. 밀도에 따라 최대 32개 입자를 추적합니다.",
    controls: [population, unit("advection", "흐름 강도"), unit("viscosity", "흐름 관성"), scale, unit("patternJitter", "발생 영역")],
    tuning: { size: 44, spacing: 0.07, particleCount: 2048, advection: 0.8, viscosity: 0.28, patternScale: 1.2, patternJitter: 0.7 } },
  { id: "carrier-cpu-ballistic-spray-v1", recipeId: "gravity-fountain", model: "ballistic", label: "중력 분사",
    description: "수명·항력·중력을 가진 입자가 꼬리를 남깁니다. 펜 이동 거리가 시뮬레이션 시계입니다.",
    controls: [population, unit("advection", "분사 속도"), unit("viscosity", "공기 저항"), { key: "gravity", label: "중력 방향·강도", min: -1, max: 1, step: 0.01 }, unit("reservoir", "입자 수명"), unit("patternJitter", "분사각")],
    tuning: { size: 42, spacing: 0.08, particleCount: 2048, advection: 0.8, viscosity: 0.2, gravity: 0.8, reservoir: 0.7, patternJitter: 0.55 } },
  { id: "carrier-cpu-woven-ribbon-v1", recipeId: "woven-ribbon", model: "weave", label: "직조 리본",
    description: "교차점의 앞뒤 순서를 바꾸며 띠와 가로실을 엮습니다. 곡선 간격은 자동 보정합니다.",
    controls: [unit("patternDensity", "직조 가닥 수"), scale, unit("patternJitter", "꼬임 깊이")],
    tuning: { size: 38, spacing: 0.065, patternDensity: 0.65, patternScale: 1.5, patternJitter: 0.5 } },
  { id: "carrier-cpu-dendritic-veins-v1", recipeId: "branching-veins", model: "branch", label: "가지 성장",
    description: "줄기에서 태어난 가지가 실제 부모 접점에서 분기합니다. 최대 32개 가지와 제한된 수명을 사용합니다.",
    controls: [{ ...population, label: "가지 밀도" }, unit("reactionRate", "분기 빈도"), unit("reservoir", "가지 길이"), unit("patternJitter", "분기각")],
    tuning: { size: 36, spacing: 0.07, particleCount: 2048, reactionRate: 0.65, reservoir: 0.6, patternJitter: 0.6 } },
  { id: "carrier-cpu-orbital-lace-v1", recipeId: "orbital-lace", model: "orbit", label: "궤도 레이스",
    description: "두 주기의 트로코이드 궤적과 연결 매듭을 만드는 기하 엔진입니다. 유체 물리가 아니며, 고주파 곡선 간격은 자동 보정합니다.",
    controls: [unit("patternDensity", "궤도 돌기 수"), scale, unit("patternJitter", "궤도 편심")],
    tuning: { size: 42, spacing: 0.045, patternDensity: 0.55, patternScale: 1.1, patternJitter: 0.65 } },
  ...BRUSH_STUDIO_V6_ARTISTRY_TOPOLOGIES,
].map((entry) => Object.freeze({ ...entry, controls: Object.freeze(entry.controls.map((control) => Object.freeze(control))), tuning: Object.freeze(entry.tuning) })) as BrushStudioV6TopologyDescriptor[]);
const BY_ID = new Map(BRUSH_STUDIO_V6_TOPOLOGIES.map((entry) => [entry.id, entry]));
export function brushStudioV6Topology(id: string): BrushStudioV6TopologyDescriptor | undefined {
  return BY_ID.get(id);
}
