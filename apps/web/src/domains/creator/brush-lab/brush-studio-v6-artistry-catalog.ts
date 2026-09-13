import type { BrushStudioV6TopologyControl, BrushStudioV6TopologyDescriptor } from "./brush-studio-v6-topology-catalog";

export const BRUSH_STUDIO_V6_ARTISTRY_MODELS = [
  "braid", "chain", "pearls", "zipper", "fern", "blossom",
  "fur", "rake", "stipple", "contour", "scales", "embroidery",
] as const;
export type BrushStudioV6ArtistryModel = typeof BRUSH_STUDIO_V6_ARTISTRY_MODELS[number];
export function isBrushStudioV6ArtistryModel(model: string): model is BrushStudioV6ArtistryModel {
  return (BRUSH_STUDIO_V6_ARTISTRY_MODELS as readonly string[]).includes(model);
}
const unit = (key: BrushStudioV6TopologyControl["key"], label: string): BrushStudioV6TopologyControl =>
  ({ key, label, min: 0, max: 1, step: 0.01 });
const scale = { key: "patternScale", label: "반복 길이", min: 0.1, max: 4, step: 0.01 } as const;
const density = unit("patternDensity", "구조 밀도");
const jitter = unit("patternJitter", "자연스러운 변형");
const population = { key: "particleCount", label: "입자 밀도", min: 128, max: 4096, step: 128 } as const;
const strands = { key: "bristleStrands", label: "가닥 수", min: 8, max: 128, step: 4 } as const;

/** Original analytic geometry, not downloaded tips or renamed variants. Never repurpose these v1 IDs. */
export const BRUSH_STUDIO_V6_ARTISTRY_TOPOLOGIES: readonly BrushStudioV6TopologyDescriptor[] = Object.freeze([
  { model: "braid", id: "carrier-cpu-braided-cord-v1", recipeId: "braided-cord", group: "의상·장식", label: "세 가닥 땋은 끈",
    description: "세 가닥의 앞뒤 교차와 중심 이음선을 연결합니다. 머리 장식·로프·트리밍에 사용하세요.",
    controls: [scale, jitter, unit("relief", "가닥 두께")],
    tuning: { size: 32, patternScale: 1.1, patternJitter: 0.35, relief: 0.45 } },
  { model: "chain", id: "carrier-cpu-linked-chain-v1", recipeId: "linked-chain", group: "의상·장식", label: "교차 금속 체인",
    description: "넓은 링크와 옆면 링크를 번갈아 연결합니다. 선을 따라 이어지는 액세서리용 윤곽입니다.",
    controls: [scale, density, jitter], tuning: { size: 28, patternScale: 0.8, patternDensity: 0.7, patternJitter: 0.08 } },
  { model: "pearls", id: "carrier-cpu-pearl-strand-v1", recipeId: "pearl-strand", group: "의상·장식", label: "진주 스트랜드",
    description: "연결 실 위에 입체 단면과 반사점을 가진 구슬을 배치합니다. 반사점은 보조 색을 사용합니다.",
    controls: [scale, density, jitter], tuning: { size: 30, patternScale: 0.8, patternDensity: 0.65, patternJitter: 0.15 } },
  { model: "zipper", id: "carrier-cpu-zipper-teeth-v1", recipeId: "zipper-teeth", group: "의상·장식", label: "지퍼 이빨",
    description: "두 줄의 테이프와 어긋난 잠금 이빨을 이동 거리 기준으로 정렬합니다.",
    controls: [scale, density, jitter], tuning: { size: 30, patternScale: 0.55, patternDensity: 0.8, patternJitter: 0.05 } },
  { model: "fern", id: "carrier-cpu-fern-frond-v1", recipeId: "fern-frond", group: "배경·자연", label: "고사리 잎맥",
    description: "중심 줄기에 좌우 잎과 잎맥을 연결합니다. 잎 길이와 각도의 시드 변형을 지원합니다.",
    controls: [scale, density, jitter], tuning: { size: 46, patternScale: 0.65, patternDensity: 0.8, patternJitter: 0.4 } },
  { model: "blossom", id: "carrier-cpu-petal-blossom-v1", recipeId: "petal-blossom", group: "배경·자연", label: "꽃잎 블라썸",
    description: "꽃잎·꽃술·중심점을 독립 도형으로 생성합니다. 꽃잎 수와 간격, 회전을 조절하세요.",
    controls: [scale, density, jitter], tuning: { size: 36, patternScale: 1.4, patternDensity: 0.5, patternJitter: 0.55 } },
  { model: "fur", id: "carrier-cpu-tapered-fur-v1", recipeId: "tapered-fur", group: "배경·자연", label: "테이퍼 털 다발",
    description: "굵은 뿌리에서 가는 끝으로 휘어지는 털을 여러 선분으로 만듭니다. 풀·털·머리카락 질감에 사용하세요.",
    controls: [scale, density, jitter], tuning: { size: 42, patternScale: 0.8, patternDensity: 0.65, patternJitter: 0.5 } },
  { model: "rake", id: "carrier-cpu-pressure-rake-v1", recipeId: "pressure-rake", group: "선화·질감", label: "필압 레이크",
    description: "필압으로 벌어지는 빗살을 연속 연결합니다. 매끈한 다중 선과 건식 스크래치에 사용하세요.",
    controls: [strands, unit("friction", "빗살 벌어짐"), unit("viscosity", "선 두께")],
    tuning: { size: 42, bristleStrands: 40, friction: 0.7, viscosity: 0.4 } },
  { model: "stipple", id: "carrier-cpu-phyllotaxis-stipple-v1", recipeId: "phyllotaxis-stipple", group: "선화·질감", label: "균등 분포 점묘",
    description: "황금각 나선으로 점을 분산하고 시드로 변형합니다. 단순 난수 군집보다 규칙적인 피복을 목표로 합니다.",
    controls: [population, jitter, unit("granulation", "점 크기 분포")],
    tuning: { size: 38, particleCount: 1536, patternJitter: 0.5, granulation: 0.55 } },
  { model: "contour", id: "carrier-cpu-contour-engraving-v1", recipeId: "contour-engraving", group: "선화·질감", label: "등고선 인그레이빙",
    description: "방향을 따라 굽는 평행 등고선과 주기적인 교차선을 연결합니다. 판화·음영·나뭇결용입니다.",
    controls: [scale, density, jitter], tuning: { size: 44, patternScale: 1.2, patternDensity: 0.6, patternJitter: 0.5 } },
  { model: "scales", id: "carrier-cpu-scalloped-scales-v1", recipeId: "scalloped-scales", group: "의상·장식", label: "겹비늘 스캘럽",
    description: "엇갈린 행의 반원 윤곽을 겹쳐 비늘·기와·레이스 가장자리를 만듭니다.",
    controls: [scale, density, jitter], tuning: { size: 42, patternScale: 0.85, patternDensity: 0.7, patternJitter: 0.12 } },
  { model: "embroidery", id: "carrier-cpu-cross-embroidery-v1", recipeId: "cross-embroidery", group: "의상·장식", label: "십자 자수",
    description: "실의 교차 순서, 바늘구멍과 양쪽 솔기를 조합합니다. 의상 봉제선·수공예 장식용입니다.",
    controls: [scale, density, jitter], tuning: { size: 30, patternScale: 0.7, patternDensity: 0.65, patternJitter: 0.1 } },
].map((entry) => Object.freeze({ ...entry,
  controls: Object.freeze(entry.controls.map((control) => Object.freeze(control))),
  tuning: Object.freeze(entry.tuning),
})) as BrushStudioV6TopologyDescriptor[]);
