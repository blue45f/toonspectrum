import {
  STUDIO_BRUSH_PACK_CATALOG_IDS,
  isStudioBrushPackCatalogId,
  type StudioBrushPackCatalogId,
} from "./studio-brush-pack-id";

import type { StudioBrushPreviewStyle } from "./studio-brush-visual";
import type { StudioBrushMediaGroup } from "./studio-creative-ux";

export type StudioBrushPackRuntimeBrushId = "ink-particle" | "airbrush" | "dry-media";

export type StudioBrushPackCategory =
  | "ink"
  | "sketch"
  | "chalk"
  | "flat"
  | "marker"
  | "texture"
  | "paint"
  | "rake"
  | "foliage"
  | "pattern"
  | "stamp"
  | "pixel"
  | "tone"
  | "effect";

/** Display-only catalogue data. The full dynamics snapshot stays in the lazy runtime module. */
export interface StudioBrushPackDescriptor {
  catalogId: StudioBrushPackCatalogId;
  catalogName: string;
  shortName: string;
  hint: string;
  category: StudioBrushPackCategory;
  defaultWidth: number;
  defaultOpacity: number;
  runtimeBrushId: StudioBrushPackRuntimeBrushId;
  mediaGroup: StudioBrushMediaGroup;
  previewStyle: StudioBrushPreviewStyle;
  previewWeight: number;
}

type DescriptorRow = readonly [
  name: string,
  shortName: string,
  hint: string,
  category: StudioBrushPackCategory,
  width: number,
  opacity: number,
  runtime: StudioBrushPackRuntimeBrushId,
  media: StudioBrushMediaGroup,
  preview: StudioBrushPreviewStyle,
  weight: number,
];

/*
 * Original Korean names and descriptions describe behavior, not proprietary brush assets. Rows
 * intentionally align with STUDIO_BRUSH_PACK_CATALOG_IDS so ids and runtime profiles share one
 * compact ordinal without duplicating identity strings in the lazy chunk.
 */
const DESCRIPTOR_ROWS: readonly DescriptorRow[] = [
  ["만능 원형", "원형", "고른 가장자리로 선화와 채색을 모두 처리하는 기본 원형 촉", "ink", 8, 1, "ink-particle", "line", "solid", 0.46],
  ["선명 잉크", "선명 잉크", "빠른 획에도 검고 또렷하게 이어지는 잉크 펜", "ink", 6, 1, "ink-particle", "line", "wavy", 0.4],
  ["유연 잉크", "유연 잉크", "필압에 따라 가늘고 굵게 부드럽게 전환되는 잉크", "ink", 9, 0.96, "ink-particle", "line", "calligraphy", 0.52],
  ["구름 소프트", "구름", "넓고 부드러운 가장자리의 저농도 블렌딩 촉", "paint", 36, 0.48, "airbrush", "paint", "soft", 0.72],
  ["안개 소프트", "안개", "여러 번 쌓아 은은한 명암을 만드는 초연질 촉", "paint", 52, 0.34, "airbrush", "paint", "soft", 0.84],
  ["파우더 스케치", "파우더", "분말이 끊겨 묻는 가벼운 러프 스케치", "sketch", 7, 0.76, "dry-media", "line", "dashed", 0.34],
  ["라운드 스케치", "라운드", "둥근 입자로 매끄럽게 이어지는 스케치 연필", "sketch", 5, 0.84, "dry-media", "line", "dashed", 0.3],
  ["결 스케치", "결 스케치", "종이 결을 드러내는 성긴 스케치 촉", "sketch", 8, 0.7, "dry-media", "line", "texture", 0.39],
  ["정밀 연필", "정밀 연필", "가느다란 선과 작은 명암에 맞춘 단단한 연필", "sketch", 3, 0.88, "dry-media", "line", "dashed", 0.22],
  ["포근 연필", "포근 연필", "부드러운 흑연이 넓게 묻는 스케치 연필", "sketch", 7, 0.68, "dry-media", "line", "texture", 0.38],
  ["극세 흑연", "극세 흑연", "잔털처럼 가는 흑연 결을 겹쳐 묘사하는 촉", "sketch", 2, 0.82, "dry-media", "line", "dashed", 0.16],
  ["원형 농담", "원형 농담", "압력에 따라 투명도가 변하는 둥근 채색 촉", "ink", 18, 0.72, "ink-particle", "paint", "soft", 0.58],
  ["타원 농담", "타원 농담", "기울어진 타원 촉으로 넓은 농담을 만드는 붓", "flat", 22, 0.68, "ink-particle", "paint", "calligraphy", 0.64],
  ["백묵 가루", "백묵 가루", "곱게 부서지는 분필 가루가 고르게 묻는 촉", "chalk", 14, 0.72, "dry-media", "texture", "texture", 0.55],
  ["거친 백묵", "거친 백묵", "큼직한 공극이 남는 칠판용 거친 분필", "chalk", 18, 0.66, "dry-media", "texture", "dashed", 0.62],
  ["압착 백묵", "압착 백묵", "단단한 모서리와 잔가루가 함께 남는 압착 분필", "chalk", 11, 0.82, "dry-media", "texture", "texture", 0.48],
  ["덩굴 획", "덩굴", "두 줄기가 휘감기듯 반복되는 장식용 획", "pattern", 20, 0.88, "ink-particle", "fx", "wavy", 0.66],
  ["버들 결", "버들", "가늘고 긴 섬유가 흐르는 방향성 장식 붓", "pattern", 24, 0.74, "dry-media", "texture", "wavy", 0.7],
  ["벨벳 목탄", "벨벳 목탄", "뭉근한 중심과 부서진 가장자리를 가진 목탄", "chalk", 20, 0.62, "dry-media", "texture", "soft", 0.68],
  ["선면 블록", "선면 블록", "얇은 선과 넓은 면이 번갈아 나타나는 블록 촉", "flat", 22, 0.9, "ink-particle", "paint", "calligraphy", 0.7],
  ["각진 사각", "사각", "정사각형 모서리를 유지하는 픽토리얼 채색 촉", "flat", 18, 0.94, "ink-particle", "marker", "solid", 0.6],
  ["수평 칼끝", "수평 칼끝", "가로로 길고 얇은 칼날형 평붓", "flat", 24, 0.96, "ink-particle", "line", "calligraphy", 0.68],
  ["수직 칼끝", "수직 칼끝", "세로로 선 날을 유지하는 레터링 평붓", "flat", 24, 0.96, "ink-particle", "line", "calligraphy", 0.68],
  ["단정 평붓", "평붓", "획 방향을 따라 정렬되는 고른 평면 붓", "flat", 26, 0.92, "ink-particle", "paint", "solid", 0.72],
  ["흩어진 평붓", "흩어진 평붓", "평평한 촉 주변으로 미세 입자가 흩어지는 붓", "flat", 28, 0.78, "dry-media", "paint", "texture", 0.76],
  ["리듬 평붓", "리듬 평붓", "간격을 두고 반복되는 평면 자국을 만드는 붓", "flat", 30, 0.86, "ink-particle", "paint", "dashed", 0.78],
  ["방향성 평붓", "방향 평붓", "진행 방향으로 흩어지는 평면 자국 촉", "flat", 32, 0.8, "dry-media", "paint", "texture", 0.8],
  ["클래식 마커", "클래식", "겹칠수록 농도가 쌓이는 둥근 마커", "marker", 18, 0.62, "ink-particle", "marker", "solid", 0.64],
  ["섬유 마커", "섬유 마커", "펠트 섬유 결이 보이는 반투명 마커", "marker", 20, 0.56, "dry-media", "marker", "texture", 0.68],
  ["단정 평면 마커", "평면 마커", "빈틈 없이 고르게 칠해지는 납작 마커", "marker", 26, 0.7, "ink-particle", "marker", "calligraphy", 0.74],
  ["투명 평면", "투명 평면", "넓은 면을 옅게 겹쳐 칠하는 투명 평촉", "marker", 34, 0.38, "airbrush", "marker", "soft", 0.82],
  ["단단 타원", "단단 타원", "경계가 선명한 타원형 마커 촉", "marker", 17, 0.92, "ink-particle", "marker", "solid", 0.58],
  ["원단 질감", "원단", "촘촘한 직물 섬유가 묻어나는 질감 붓", "texture", 26, 0.7, "dry-media", "texture", "texture", 0.72],
  ["거친 결", "거친 결", "작고 불규칙한 공극을 남기는 질감 붓", "texture", 20, 0.72, "dry-media", "texture", "dashed", 0.64],
  ["강한 거친 결", "강한 거침", "선명한 입자 대비로 표면을 거칠게 만드는 붓", "texture", 25, 0.78, "dry-media", "texture", "texture", 0.72],
  ["두터운 거친 결", "두터운 거침", "큰 덩어리와 균열이 함께 나타나는 두꺼운 촉", "texture", 36, 0.84, "dry-media", "texture", "oil", 0.86],
  ["번진 얼룩", "얼룩", "불규칙한 가장자리로 물든 얼룩을 쌓는 촉", "texture", 42, 0.42, "airbrush", "paint", "soft", 0.88],
  ["모래 질감", "모래", "미세한 알갱이가 촘촘히 흩어지는 표면 촉", "texture", 24, 0.66, "dry-media", "texture", "dots", 0.68],
  ["석고 질감", "석고", "밝고 둔한 덩어리가 겹치는 석고 표면 촉", "texture", 30, 0.72, "dry-media", "texture", "texture", 0.78],
  ["암석 결", "암석", "각진 균열과 알갱이로 바위 표면을 만드는 붓", "texture", 38, 0.78, "dry-media", "texture", "texture", 0.86],
  ["솜결", "솜결", "가볍고 성긴 섬유가 퍼지는 포근한 질감 촉", "texture", 40, 0.46, "airbrush", "texture", "soft", 0.88],
  ["요철 결", "요철", "불규칙한 돌기가 이어지는 입체 표면 촉", "texture", 28, 0.74, "dry-media", "texture", "dots", 0.74],
  ["둥근 채색붓", "둥근 붓", "중심 농도가 높은 원형 페인팅 붓", "paint", 24, 0.86, "ink-particle", "paint", "oil", 0.7],
  ["물감 잉크", "물감 잉크", "물감의 결에 잉크 선명도를 섞은 방향성 붓", "paint", 20, 0.84, "ink-particle", "paint", "oil", 0.68],
  ["페인트 롤러", "롤러", "평행한 롤러 결로 넓은 면을 빠르게 채우는 붓", "paint", 46, 0.76, "dry-media", "paint", "texture", 0.92],
  ["입자 흩뿌림", "흩뿌림", "압력과 속도에 따라 입자 반경이 변하는 스프레이", "paint", 44, 0.46, "airbrush", "fx", "dots", 0.9],
  ["거친 잉크", "거친 잉크", "마른 공극과 젖은 중심이 공존하는 텍스처 잉크", "ink", 16, 0.86, "dry-media", "line", "texture", 0.58],
  ["가는 갈퀴", "가는 갈퀴", "여러 가는 선을 일정 간격으로 긋는 갈퀴 붓", "rake", 22, 0.82, "dry-media", "texture", "dashed", 0.66],
  ["넓은 갈퀴", "넓은 갈퀴", "굵기가 다른 평행 섬유를 넓게 펼치는 붓", "rake", 34, 0.78, "dry-media", "texture", "texture", 0.82],
  ["마른 갈퀴", "마른 갈퀴", "중간중간 끊기는 마른 평행 결을 만드는 붓", "rake", 30, 0.68, "dry-media", "texture", "dashed", 0.78],
  ["초목 질감", "초목", "작은 줄기와 잎 점을 섞어 숲 바닥을 채우는 촉", "foliage", 38, 0.72, "dry-media", "texture", "texture", 0.86],
  ["흩어진 잔디", "성긴 잔디", "긴 풀잎을 넓은 반경에 성기게 흩뿌리는 붓", "foliage", 42, 0.74, "dry-media", "texture", "dashed", 0.88],
  ["빽빽한 잔디", "빽빽 잔디", "짧고 많은 풀잎을 밀도 높게 쌓는 붓", "foliage", 38, 0.82, "dry-media", "texture", "texture", 0.86],
  ["새잎", "새잎", "작고 뾰족한 잎 자국을 자연스럽게 흩는 촉", "foliage", 20, 0.88, "ink-particle", "paint", "dots", 0.62],
  ["긴잎", "긴잎", "가늘고 긴 잎 자국이 방향을 따라 회전하는 촉", "foliage", 26, 0.84, "ink-particle", "paint", "wavy", 0.7],
  ["둥근잎", "둥근잎", "둥글고 도톰한 잎 자국을 겹쳐 채우는 촉", "foliage", 24, 0.82, "ink-particle", "paint", "dots", 0.68],
  ["잎송이", "잎송이", "크기가 다른 잎을 묶음으로 흩뿌리는 장식 촉", "foliage", 34, 0.78, "ink-particle", "paint", "glitter", 0.8],
  ["자유 도장", "자유 도장", "비정형 덩어리를 가볍게 반복하는 장식 스탬프", "stamp", 26, 0.86, "ink-particle", "fx", "glitter", 0.72],
  ["흩어진 타원", "흩어진 타원", "작은 타원 자국을 넓게 흩어 배치하는 촉", "pattern", 28, 0.74, "airbrush", "fx", "dots", 0.74],
  ["매끈 타원", "매끈 타원", "고른 타원 도장을 리듬 있게 이어 붙이는 촉", "pattern", 22, 0.9, "ink-particle", "fx", "solid", 0.66],
  ["겹 타원", "겹 타원", "서로 다른 크기의 타원 자국을 겹치는 촉", "pattern", 30, 0.8, "ink-particle", "fx", "glitter", 0.78],
  ["바둑 격자", "격자", "교차하는 칸무늬를 일정하게 이어 그리는 패턴 촉", "pattern", 28, 0.92, "ink-particle", "fx", "tone", 0.74],
  ["머리카락 결", "머리카락", "굵기가 다른 여러 모발 선을 한 번에 긋는 붓", "rake", 16, 0.9, "ink-particle", "line", "dashed", 0.56],
  ["고른 줄무늬", "줄무늬", "평행한 굵은 줄을 일정 간격으로 반복하는 붓", "pattern", 30, 0.86, "ink-particle", "fx", "dashed", 0.76],
  ["거친 줄무늬", "거친 줄", "끊기고 흔들리는 평행 줄을 겹치는 질감 붓", "pattern", 34, 0.7, "dry-media", "texture", "texture", 0.82],
  ["발자국 도장", "발자국", "좌우 발자국이 번갈아 이어지는 장식 스탬프", "stamp", 24, 0.92, "ink-particle", "fx", "dots", 0.68],
  ["하트 도장", "하트", "손그림 느낌의 하트 자국을 이어 찍는 스탬프", "stamp", 26, 0.94, "ink-particle", "fx", "glitter", 0.72],
  ["초정밀 제도 잉크", "제도 잉크", "극세 제도선과 웹툰 세부 선화를 또렷하게 잇는 단단한 잉킹 촉", "ink", 2, 1, "ink-particle", "line", "solid", 0.2],
  ["마른 깨짐 잉크", "깨짐 잉크", "마른 붓과 닳은 펜촉처럼 공극이 생기는 거친 드라이 잉크", "ink", 11, 0.9, "dry-media", "line", "texture", 0.48],
  ["측면 흑연 음영", "측면 흑연", "연필 측면을 눕힌 듯 넓은 흑연 입자와 종이결을 쌓는 음영 촉", "sketch", 13, 0.58, "dry-media", "texture", "texture", 0.58],
  ["압축 목탄 모서리", "압축 목탄", "압축 목탄의 단단한 모서리와 부서지는 가루를 함께 남기는 촉", "chalk", 15, 0.76, "dry-media", "texture", "dashed", 0.62],
  ["수채 세필", "수채 세필", "가느다란 수채 세부 묘사와 투명한 농담을 겹쳐 만드는 원형 붓", "paint", 7, 0.62, "ink-particle", "paint", "soft", 0.36],
  ["수채 평면 워시", "평면 워시", "넓은 수채 워시와 가장자리 물고임을 만드는 부드러운 평붓", "paint", 42, 0.36, "airbrush", "paint", "soft", 0.9],
  ["불투명 구아슈", "구아슈", "매트한 불투명 구아슈 물감을 빈틈 없이 겹쳐 칠하는 채색 붓", "paint", 27, 0.92, "ink-particle", "paint", "oil", 0.76],
  ["필버트 유화", "필버트", "둥근 타원 모서리와 굵은 강모 결로 유화 면과 세부를 함께 칠하는 붓", "paint", 31, 0.9, "dry-media", "paint", "oil", 0.82],
  ["알코올 사선 마커", "사선 마커", "사선 평촉으로 넓은 알코올 마커 면과 가는 모서리를 전환하는 촉", "marker", 25, 0.52, "ink-particle", "marker", "calligraphy", 0.72],
  ["테이퍼 브러시 마커", "브러시 마커", "필압에 따라 시작과 끝이 가늘어지는 섬유형 브러시 마커", "marker", 14, 0.72, "dry-media", "marker", "wavy", 0.56],
  ["픽셀 정사각 촉", "픽셀 사각", "각진 정사각 도장을 촘촘히 이어 또렷한 픽셀 계단선을 만드는 촉", "pixel", 8, 1, "ink-particle", "line", "solid", 0.38],
  ["픽셀 디더 패턴", "픽셀 디더", "체커형 픽셀 점을 규칙적으로 쌓아 제한 색 디더링 명암을 만드는 촉", "pixel", 16, 0.9, "ink-particle", "texture", "tone", 0.54],
  ["교차 해칭", "교차 해칭", "서로 교차하는 가는 선 묶음으로 만화 음영과 재질을 빠르게 쌓는 촉", "tone", 18, 0.78, "dry-media", "texture", "dashed", 0.64],
  ["속도 해칭", "속도 해칭", "진행 방향으로 길게 뻗는 평행 해칭을 이용해 속도감과 그림자를 더하는 촉", "tone", 24, 0.82, "ink-particle", "fx", "wavy", 0.72],
  ["고밀도 망점", "고밀도 망점", "촘촘한 원형 망점을 반복해 웹툰 스크린톤 농담을 만드는 패턴 촉", "tone", 22, 0.86, "ink-particle", "texture", "tone", 0.68],
  ["보케 빛망울", "보케", "크기와 농도가 다른 부드러운 빛망울을 흩뿌려 배경 보케 효과를 만드는 촉", "effect", 48, 0.38, "airbrush", "fx", "glitter", 0.92],
  ["캔버스 직조", "직조", "가로세로 실이 교차하는 캔버스 천 결을 넓게 쌓는 표면 질감 촉", "texture", 32, 0.66, "dry-media", "texture", "texture", 0.8],
  ["극세 모발 다발", "극세 모발", "굵기와 흐름이 다른 여러 머리카락을 한 획으로 자연스럽게 잇는 보조 붓", "rake", 12, 0.86, "ink-particle", "line", "dashed", 0.5],
  ["천주름 갈퀴", "천주름", "완만하게 휘는 평행 섬유선으로 옷주름과 천의 흐름을 잡는 보조 붓", "rake", 28, 0.68, "dry-media", "texture", "wavy", 0.76],
  ["솔잎 군집", "솔잎", "중심에서 뻗는 가는 솔잎 묶음을 흩어 식생과 침엽수 가지를 채우는 촉", "foliage", 30, 0.8, "ink-particle", "texture", "dots", 0.78],
];

if (DESCRIPTOR_ROWS.length !== STUDIO_BRUSH_PACK_CATALOG_IDS.length) {
  throw new Error("Studio procedural brush descriptor table is out of sync with its stable ids");
}

export const STUDIO_BRUSH_PACK_DESCRIPTORS: readonly StudioBrushPackDescriptor[] =
  STUDIO_BRUSH_PACK_CATALOG_IDS.map((catalogId, index) => {
    const row = DESCRIPTOR_ROWS[index]!;
    return Object.freeze({
      catalogId,
      catalogName: row[0],
      shortName: row[1],
      hint: row[2],
      category: row[3],
      defaultWidth: row[4],
      defaultOpacity: row[5],
      runtimeBrushId: row[6],
      mediaGroup: row[7],
      previewStyle: row[8],
      previewWeight: row[9],
    });
  });

const DESCRIPTOR_BY_ID: ReadonlyMap<StudioBrushPackCatalogId, StudioBrushPackDescriptor> = new Map(
  STUDIO_BRUSH_PACK_DESCRIPTORS.map((descriptor) => [descriptor.catalogId, descriptor])
);

export function studioBrushPackDescriptorById(value: unknown): StudioBrushPackDescriptor | null {
  return isStudioBrushPackCatalogId(value) ? DESCRIPTOR_BY_ID.get(value) ?? null : null;
}
