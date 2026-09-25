/** Lightweight original material catalogue. Field compilation is build-time; the baked atlas stays in the lazy runtime. */
import type { StudioMaterialTipProgram } from "./studio-material-tip-kernels";
import type { StudioBrushPackCategory, StudioBrushPackRuntimeBrushId } from "./studio-brush-pack-index";
import type { StudioBrushPreviewStyle } from "./studio-brush-visual";

export interface StudioMaterialBrushDefinition {
  readonly program: StudioMaterialTipProgram;
  readonly name: string;
  readonly shortName: string;
  readonly hint: string;
  readonly category: StudioBrushPackCategory;
  readonly width: number;
  readonly opacity: number;
  readonly runtime: StudioBrushPackRuntimeBrushId;
  readonly preview: StudioBrushPreviewStyle;
  readonly mode: "continuous" | "ribbon" | "stamp" | "scatter";
  readonly spacing: number;
  readonly flow: number;
  readonly scatter: number;
  readonly roundness: number;
  readonly tiltRatio: number;
}

export const STUDIO_MATERIAL_BRUSH_DEFINITIONS = [
  {"program": "capillary-dendrite", "name": "모세관 수지 잉크", "shortName": "수지 잉크", "hint": "연결된 가지와 가는 측맥을 남기는 분지형 잉크 팁", "category": "ink", "width": 36, "opacity": 0.88, "runtime": "ink-particle", "preview": "wavy", "mode": "stamp", "spacing": 0.58, "flow": 0.76, "scatter": 0.04, "roundness": 0.8, "tiltRatio": 0.85},
  {"program": "cellular-foam", "name": "거품 세포막", "shortName": "세포막", "hint": "빈 기포와 이어진 세포벽을 겹쳐 표현하는 다공성 팁", "category": "texture", "width": 48, "opacity": 0.8, "runtime": "dry-media", "preview": "texture", "mode": "stamp", "spacing": 0.38, "flow": 0.63, "scatter": 0.08, "roundness": 1, "tiltRatio": 0.55},
  {"program": "pigment-floc", "name": "응집 안료 입상", "shortName": "안료 입상", "hint": "큰 안료 덩어리 안에 작은 입자가 모이는 군집형 질감", "category": "paint", "width": 36, "opacity": 0.78, "runtime": "dry-media", "preview": "texture", "mode": "continuous", "spacing": 0.14, "flow": 0.48, "scatter": 0.025, "roundness": 1, "tiltRatio": 0.56},
  {"program": "lithography-reticulation", "name": "석판 망상 잉크", "shortName": "망상 잉크", "hint": "연결된 잉크 섬과 경계 얼룩이 만드는 석판 인쇄 질감", "category": "texture", "width": 42, "opacity": 0.8, "runtime": "dry-media", "preview": "texture", "mode": "stamp", "spacing": 0.34, "flow": 0.63, "scatter": 0.05, "roundness": 1, "tiltRatio": 0.64},
  {"program": "porous-charcoal", "name": "다공질 목탄 단면", "shortName": "다공질 목탄", "hint": "길쭉한 기공과 부서진 절단면이 남는 목탄 측면 자국", "category": "chalk", "width": 30, "opacity": 0.84, "runtime": "dry-media", "preview": "texture", "mode": "continuous", "spacing": 0.15, "flow": 0.52, "scatter": 0.018, "roundness": 0.68, "tiltRatio": 0.35},
  {"program": "graphite-platelets", "name": "흑연 판상 결정", "shortName": "판상 흑연", "hint": "서로 엇갈린 얇은 결정 조각이 겹쳐지는 흑연 명암", "category": "sketch", "width": 26, "opacity": 0.82, "runtime": "dry-media", "preview": "texture", "mode": "continuous", "spacing": 0.16, "flow": 0.46, "scatter": 0.014, "roundness": 0.72, "tiltRatio": 0.36},
  {"program": "felt-fiber-bundle", "name": "펠트 섬유 단면", "shortName": "펠트 단면", "hint": "조밀한 섬유의 중심과 외피가 구분되는 펠트 도포", "category": "marker", "width": 28, "opacity": 0.88, "runtime": "ink-particle", "preview": "dots", "mode": "continuous", "spacing": 0.14, "flow": 0.62, "scatter": 0.01, "roundness": 1, "tiltRatio": 0.62},
  {"program": "split-reed", "name": "갈라진 갈대 펜촉", "shortName": "갈대 펜", "hint": "중앙 잉크 홈과 벌어진 촉 끝을 가진 방향성 갈대 펜", "category": "ink", "width": 20, "opacity": 0.94, "runtime": "ink-particle", "preview": "calligraphy", "mode": "ribbon", "spacing": 0.03, "flow": 0.45, "scatter": 0, "roundness": 0.76, "tiltRatio": 0.32},
  {"program": "engraving-burin", "name": "동판 조각도", "shortName": "조각도", "hint": "마름모 날의 두 면과 중앙 능선이 드러나는 조각도 획", "category": "ink", "width": 24, "opacity": 0.94, "runtime": "ink-particle", "preview": "calligraphy", "mode": "ribbon", "spacing": 0.025, "flow": 0.34, "scatter": 0, "roundness": 0.54, "tiltRatio": 0.28},
  {"program": "silverpoint-crossgrain", "name": "은필 교차 미세결", "shortName": "은필 미세결", "hint": "주방향 선과 더 가는 교차선이 겹쳐지는 금속필 질감", "category": "sketch", "width": 28, "opacity": 0.86, "runtime": "dry-media", "preview": "dashed", "mode": "continuous", "spacing": 0.18, "flow": 0.64, "scatter": 0.01, "roundness": 0.86, "tiltRatio": 0.5},
  {"program": "chalk-fracture", "name": "각면 초크 균열", "shortName": "초크 균열", "hint": "각진 초크 단면에 불규칙한 균열과 가루가 함께 남는 팁", "category": "chalk", "width": 34, "opacity": 0.84, "runtime": "dry-media", "preview": "texture", "mode": "continuous", "spacing": 0.18, "flow": 0.6, "scatter": 0.02, "roundness": 0.94, "tiltRatio": 0.42},
  {"program": "wax-resist", "name": "왁스 방염 러빙", "shortName": "왁스 러빙", "hint": "왁스가 묻은 섬과 비어 있는 홈이 분리되는 러빙 질감", "category": "texture", "width": 42, "opacity": 0.84, "runtime": "dry-media", "preview": "texture", "mode": "stamp", "spacing": 0.33, "flow": 0.7, "scatter": 0.035, "roundness": 1, "tiltRatio": 0.6},
  {"program": "linen-scumble", "name": "리넨 융기 스컴블", "shortName": "리넨 융기", "hint": "날실과 씨실의 솟은 면만 엇갈려 묻는 직물 러빙", "category": "paint", "width": 40, "opacity": 0.84, "runtime": "dry-media", "preview": "texture", "mode": "continuous", "spacing": 0.2, "flow": 0.53, "scatter": 0, "roundness": 1, "tiltRatio": 0.65},
  {"program": "gouache-craquelure", "name": "과슈 박막 균열", "shortName": "과슈 균열", "hint": "넓은 도막 층판과 길게 이어지는 틈 및 짧은 옆균열을 남기는 박막 질감", "category": "paint", "width": 38, "opacity": 0.9, "runtime": "dry-media", "preview": "texture", "mode": "continuous", "spacing": 0.16, "flow": 0.42, "scatter": 0.02, "roundness": 1, "tiltRatio": 0.68},
  {"program": "stipple-etch", "name": "미세 점각", "shortName": "점각", "hint": "불규칙한 위치에 떨어진 작은 점만 남기는 판화 점각", "category": "tone", "width": 34, "opacity": 0.9, "runtime": "ink-particle", "preview": "dots", "mode": "stamp", "spacing": 0.4, "flow": 0.78, "scatter": 0.02, "roundness": 1, "tiltRatio": 0.95},
  {"program": "dry-bristle-comb", "name": "굴곡 건필 빗살", "shortName": "건필 빗살", "hint": "함께 휘어지는 가는 붓털과 길이별 끊김이 있는 빗살 획", "category": "rake", "width": 32, "opacity": 0.88, "runtime": "dry-media", "preview": "wavy", "mode": "ribbon", "spacing": 0.11, "flow": 0.69, "scatter": 0.005, "roundness": 1, "tiltRatio": 0.5},
  {"program": "opal-facet", "name": "오팔 각면 보석", "shortName": "오팔 각면", "hint": "부채꼴로 나뉜 명암 면과 내부 고리가 보이는 보석 장식", "category": "effect", "width": 42, "opacity": 0.94, "runtime": "ink-particle", "preview": "glitter", "mode": "scatter", "spacing": 0.78, "flow": 0.94, "scatter": 0.5, "roundness": 1, "tiltRatio": 1},
  {"program": "mica-flakes", "name": "운모 박편", "shortName": "운모 박편", "hint": "작은 판 조각 안에 층상 결이 들어 있는 광물 질감 팁", "category": "effect", "width": 46, "opacity": 0.9, "runtime": "ink-particle", "preview": "glitter", "mode": "scatter", "spacing": 0.49, "flow": 0.82, "scatter": 0.31, "roundness": 1, "tiltRatio": 0.84},
  {"program": "diffraction-spike", "name": "회절 십자광", "shortName": "십자광", "hint": "가는 십자광과 대각 잔광을 함께 찍는 별빛 장식 팁", "category": "effect", "width": 54, "opacity": 1, "runtime": "ink-particle", "preview": "glitter", "mode": "scatter", "spacing": 0.98, "flow": 1, "scatter": 0.56, "roundness": 1, "tiltRatio": 1},
  {"program": "circuit-trace", "name": "회로 배선 패턴", "shortName": "회로 배선", "hint": "모서리 배선과 둥근 접점을 함께 남기는 회로 패턴", "category": "pattern", "width": 60, "opacity": 0.94, "runtime": "ink-particle", "preview": "dashed", "mode": "stamp", "spacing": 0.85, "flow": 0.93, "scatter": 0, "roundness": 1, "tiltRatio": 1},
  {"program": "contour-isoline", "name": "등고선 지형결", "shortName": "등고선", "hint": "불규칙한 지형 높이를 따라 닫히고 갈라지는 등고선 패턴", "category": "pattern", "width": 56, "opacity": 0.88, "runtime": "ink-particle", "preview": "wavy", "mode": "stamp", "spacing": 0.65, "flow": 0.87, "scatter": 0.04, "roundness": 1, "tiltRatio": 0.82},
  {"program": "aurora-curtain", "name": "오로라 섬유 커튼", "shortName": "오로라", "hint": "물결치는 밝은 하단과 세로 섬유로 이루어진 빛 커튼 질감", "category": "effect", "width": 64, "opacity": 0.88, "runtime": "airbrush", "preview": "wavy", "mode": "ribbon", "spacing": 0.16, "flow": 0.68, "scatter": 0.015, "roundness": 0.9, "tiltRatio": 0.7},
  {"program": "coral-polyp", "name": "산호 폴립", "shortName": "산호 폴립", "hint": "방사 가지와 가장자리 굴곡 및 중심 기공이 있는 산호 팁", "category": "foliage", "width": 46, "opacity": 0.92, "runtime": "ink-particle", "preview": "glitter", "mode": "scatter", "spacing": 0.77, "flow": 0.9, "scatter": 0.3, "roundness": 1, "tiltRatio": 0.9},
  {"program": "fern-frond", "name": "고사리 깃잎", "shortName": "고사리", "hint": "중앙 잎자루 양쪽에 길이가 달라지는 작은 잎을 배치한 팁", "category": "foliage", "width": 56, "opacity": 0.94, "runtime": "ink-particle", "preview": "wavy", "mode": "scatter", "spacing": 0.82, "flow": 0.94, "scatter": 0.25, "roundness": 1, "tiltRatio": 0.8},
  {"program": "ginkgo-fan", "name": "은행잎 갈래맥", "shortName": "은행잎", "hint": "부채꼴 잎 가장자리와 갈라진 중앙 및 방사 잎맥이 있는 팁", "category": "foliage", "width": 46, "opacity": 0.94, "runtime": "ink-particle", "preview": "glitter", "mode": "scatter", "spacing": 0.81, "flow": 0.94, "scatter": 0.39, "roundness": 1, "tiltRatio": 0.85},
  {"program": "maple-leaf", "name": "단풍잎 톱니맥", "shortName": "단풍잎", "hint": "다섯 갈래 잎몸과 톱니 가장자리 및 굵은 잎맥을 가진 팁", "category": "foliage", "width": 44, "opacity": 0.94, "runtime": "ink-particle", "preview": "glitter", "mode": "scatter", "spacing": 0.88, "flow": 0.94, "scatter": 0.4, "roundness": 1, "tiltRatio": 0.86},
  {"program": "rose-rosette", "name": "겹장미 꽃주름", "shortName": "겹장미", "hint": "중심을 감싸는 다섯 겹 꽃잎의 주름과 음영이 있는 팁", "category": "foliage", "width": 48, "opacity": 0.96, "runtime": "ink-particle", "preview": "glitter", "mode": "scatter", "spacing": 0.94, "flow": 0.96, "scatter": 0.3, "roundness": 1, "tiltRatio": 0.92},
  {"program": "dandelion-seedhead", "name": "민들레 씨방", "shortName": "민들레", "hint": "방사 줄기 끝마다 가는 둥근 깃털이 달린 씨방 장식", "category": "foliage", "width": 64, "opacity": 0.96, "runtime": "ink-particle", "preview": "glitter", "mode": "scatter", "spacing": 1.02, "flow": 0.98, "scatter": 0.24, "roundness": 1, "tiltRatio": 1},
  {"program": "herringbone-twill", "name": "헤링본 능직", "shortName": "헤링본", "hint": "방향이 교대로 꺾이는 실과 행 사이의 이음매를 가진 능직", "category": "pattern", "width": 48, "opacity": 0.9, "runtime": "ink-particle", "preview": "texture", "mode": "stamp", "spacing": 0.72, "flow": 0.91, "scatter": 0, "roundness": 1, "tiltRatio": 1},
  {"program": "guilloche-rosette", "name": "기요셰 세공선", "shortName": "기요셰", "hint": "여러 위상의 가는 곡선이 서로 교차하는 세공 로제트", "category": "pattern", "width": 64, "opacity": 0.96, "runtime": "ink-particle", "preview": "wavy", "mode": "stamp", "spacing": 0.9, "flow": 0.98, "scatter": 0, "roundness": 1, "tiltRatio": 1},
  {"program": "fish-scale", "name": "비늘 호선 음영", "shortName": "비늘 호선", "hint": "엇갈린 비늘 외곽과 내부의 방사 잔선을 함께 남기는 패턴", "category": "pattern", "width": 48, "opacity": 0.9, "runtime": "ink-particle", "preview": "wavy", "mode": "stamp", "spacing": 0.68, "flow": 0.9, "scatter": 0, "roundness": 1, "tiltRatio": 1},
  {"program": "sequin-paillettes", "name": "스팽글 구멍 장식", "shortName": "스팽글", "hint": "중앙 구멍과 가장자리 밝은 능선이 구분되는 원판 장식", "category": "pattern", "width": 52, "opacity": 0.95, "runtime": "ink-particle", "preview": "glitter", "mode": "stamp", "spacing": 0.76, "flow": 0.95, "scatter": 0, "roundness": 1, "tiltRatio": 1},
  {"program": "sakura-petal", "name": "벚꽃 낱잎", "shortName": "벚꽃잎", "hint": "끝이 갈라진 물방울형 꽃잎과 중심 잎맥을 흩뿌리는 장식", "category": "foliage", "width": 46, "opacity": 1, "runtime": "ink-particle", "preview": "glitter", "mode": "scatter", "spacing": 0.9, "flow": 0.94, "scatter": 0.32, "roundness": 1, "tiltRatio": 1},
  {"program": "bamboo-joint", "name": "대나무 마디·잎", "shortName": "대나무", "hint": "줄기의 마디와 섬유 및 양쪽 잎을 한 번에 찍는 배경 소재", "category": "foliage", "width": 60, "opacity": 1, "runtime": "ink-particle", "preview": "wavy", "mode": "stamp", "spacing": 1.05, "flow": 0.92, "scatter": 0.03, "roundness": 1, "tiltRatio": 1},
  {"program": "feather-quill", "name": "깃털 빗살", "shortName": "깃털", "hint": "휘어진 중심 깃대와 비스듬한 깃가지의 빈틈을 유지하는 장식", "category": "foliage", "width": 58, "opacity": 1, "runtime": "ink-particle", "preview": "wavy", "mode": "scatter", "spacing": 0.92, "flow": 0.94, "scatter": 0.27, "roundness": 1, "tiltRatio": 1},
  {"program": "lightning-fork", "name": "분기 번개", "shortName": "번개", "hint": "꺾이는 굵은 주선과 가는 갈래가 구분되는 번개 실루엣", "category": "effect", "width": 70, "opacity": 1, "runtime": "ink-particle", "preview": "dashed", "mode": "stamp", "spacing": 0.98, "flow": 1, "scatter": 0, "roundness": 1, "tiltRatio": 1},
  {"program": "zipper-teeth", "name": "엇갈린 지퍼 이빨", "shortName": "지퍼", "hint": "좌우 반 피치로 엇갈린 이빨과 바깥 테이프를 찍는 의상 소재", "category": "pattern", "width": 40, "opacity": 1, "runtime": "ink-particle", "preview": "dashed", "mode": "stamp", "spacing": 0.89, "flow": 0.94, "scatter": 0, "roundness": 1, "tiltRatio": 1},
  {"program": "cobblestone-joints", "name": "돌바닥 줄눈", "shortName": "돌 줄눈", "hint": "불규칙한 돌 경계와 낮은 가장자리 음영으로 구성한 배경 패턴", "category": "pattern", "width": 64, "opacity": 1, "runtime": "ink-particle", "preview": "texture", "mode": "stamp", "spacing": 0.9, "flow": 0.9, "scatter": 0, "roundness": 1, "tiltRatio": 1},
  {"program": "knit-cable", "name": "케이블 니트", "shortName": "니트", "hint": "두 가닥의 교차와 앞뒤 농도 차이를 유지하는 옷감 질감", "category": "pattern", "width": 48, "opacity": 1, "runtime": "ink-particle", "preview": "wavy", "mode": "stamp", "spacing": 0.89, "flow": 0.96, "scatter": 0, "roundness": 1, "tiltRatio": 1},
  {"program": "wave-seigaiha", "name": "겹물결 기와결", "shortName": "겹물결", "hint": "행마다 어긋나는 동심 반원 네 겹의 장식 패턴", "category": "pattern", "width": 58, "opacity": 1, "runtime": "ink-particle", "preview": "wavy", "mode": "stamp", "spacing": 0.91, "flow": 0.96, "scatter": 0, "roundness": 1, "tiltRatio": 1},
  {"program": "graphite-contour", "name": "흑연 윤곽선", "shortName": "흑연 윤곽", "hint": "진한 중심선 양옆에 끊긴 가는 흑연 결을 남기는 선화 촉", "category": "sketch", "width": 12, "opacity": 0.91, "runtime": "dry-media", "preview": "dashed", "mode": "ribbon", "spacing": 0.065, "flow": 0.7, "scatter": 0.003, "roundness": 0.75, "tiltRatio": 0.42},
  {"program": "broken-chalk", "name": "부러진 초크 단면", "shortName": "부러진 초크", "hint": "두 덩어리의 비대칭 단면과 큰 절단 홈을 거칠게 찍는 초크 촉", "category": "chalk", "width": 32, "opacity": 0.86, "runtime": "dry-media", "preview": "texture", "mode": "stamp", "spacing": 0.61, "flow": 0.74, "scatter": 0.035, "roundness": 0.86, "tiltRatio": 0.58},
  {"program": "flat-gouache", "name": "과슈 평면 도포", "shortName": "과슈 평면", "hint": "넓고 불투명한 면 한쪽에 가는 마른 홈을 남기는 납작 과슈 질감 촉", "category": "paint", "width": 30, "opacity": 0.98, "runtime": "ink-particle", "preview": "calligraphy", "mode": "ribbon", "spacing": 0.06, "flow": 0.86, "scatter": 0, "roundness": 0.9, "tiltRatio": 0.48},
  {"program": "dry-edge-ink", "name": "한쪽 건필 잉크", "shortName": "건필 잉크", "hint": "진한 중심 옆으로 길이가 다른 마른 잉크 가닥이 갈라지는 촉", "category": "ink", "width": 22, "opacity": 0.96, "runtime": "ink-particle", "preview": "calligraphy", "mode": "ribbon", "spacing": 0.055, "flow": 0.61, "scatter": 0.006, "roundness": 0.83, "tiltRatio": 0.37},
  {"program": "foliage-bough", "name": "잎 달린 곁가지", "shortName": "곁가지", "hint": "비스듬한 가지와 크기가 다른 잎 다섯 장을 한 번에 찍는 배경 촉", "category": "foliage", "width": 62, "opacity": 0.94, "runtime": "ink-particle", "preview": "wavy", "mode": "stamp", "spacing": 1.17, "flow": 0.98, "scatter": 0.06, "roundness": 1, "tiltRatio": 0.92},
  {"program": "stitch-ladder", "name": "사다리 바느질", "shortName": "사다리 실밥", "hint": "두 줄 사이에 비스듬한 실밥을 반복해서 찍는 열린 봉제 패턴", "category": "pattern", "width": 36, "opacity": 0.97, "runtime": "ink-particle", "preview": "dashed", "mode": "stamp", "spacing": 0.99, "flow": 0.97, "scatter": 0, "roundness": 1, "tiltRatio": 1},
  {"program": "filbert-bristle", "name": "둥근 필버트 붓결", "shortName": "필버트 붓결", "hint": "둥근 타원 단면에 굵은 강모 다섯 줄과 열린 홈을 남기는 방향성 촉", "category": "paint", "width": 32, "opacity": 0.94, "runtime": "ink-particle", "preview": "oil", "mode": "ribbon", "spacing": 0.09, "flow": 0.73, "scatter": 0, "roundness": 0.92, "tiltRatio": 0.62},
] as const satisfies readonly StudioMaterialBrushDefinition[];

export type StudioMaterialBrushId = `material-${StudioMaterialTipProgram}`;
export const STUDIO_MATERIAL_BRUSH_IDS: readonly StudioMaterialBrushId[] = Object.freeze(
  STUDIO_MATERIAL_BRUSH_DEFINITIONS.map(({ program }) => `material-${program}` as const),
);
const BY_ID: ReadonlyMap<string, StudioMaterialBrushDefinition> = new Map(
  STUDIO_MATERIAL_BRUSH_DEFINITIONS.map((row) => [`material-${row.program}`, row]),
);

export function studioMaterialBrushDefinition(value: unknown): StudioMaterialBrushDefinition | null {
  return typeof value === "string" ? BY_ID.get(value) ?? null : null;
}
