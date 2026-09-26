export type StudioBg3dAssistantStep = "choose" | "arrange" | "frame" | "finish";
export type StudioBg3dAssistantGoal = "background" | "character" | "props";
export type StudioBg3dAssistantSheetState = "peek" | "half" | "full";
export type StudioBg3dAssistantOutputStyle = "color" | "line" | "tone" | "reference";

export interface StudioBg3dAssistantScenePreset {
  readonly id: string;
  readonly templateId: string;
  readonly title: string;
  readonly description: string;
  readonly image: string;
  readonly badge: string;
  readonly cameraPreset: string;
  readonly featured?: boolean;
}

export const STUDIO_BG3D_ASSISTANT_STEPS: readonly {
  readonly id: StudioBg3dAssistantStep;
  readonly number: number;
  readonly label: string;
  readonly shortLabel: string;
}[] = Object.freeze([
  { id: "choose", number: 1, label: "시작점 선택", shortLabel: "선택" },
  { id: "arrange", number: 2, label: "배치·포즈", shortLabel: "배치" },
  { id: "frame", number: 3, label: "구도 잡기", shortLabel: "구도" },
  { id: "finish", number: 4, label: "작화 적용", shortLabel: "적용" },
]);

const ART_ROOT = "/assets/studio/scene-assistant/imagegen25-v1";

export const STUDIO_BG3D_ASSISTANT_SCENES: readonly StudioBg3dAssistantScenePreset[] = Object.freeze([
  {
    id: "classroom",
    templateId: "classroom",
    title: "교실",
    description: "대화·수업·청춘 장면에 바로 쓰는 창가 교실",
    image: `${ART_ROOT}/classroom.webp`,
    badge: "일상",
    cameraPreset: "threeQuarter",
    featured: true,
  },
  {
    id: "cafe",
    templateId: "cafe",
    title: "카페",
    description: "2인 대화와 로맨스 컷에 맞는 따뜻한 실내",
    image: `${ART_ROOT}/cafe.webp`,
    badge: "로맨스",
    cameraPreset: "close",
    featured: true,
  },
  {
    id: "city",
    templateId: "street_avenue",
    title: "도심 거리",
    description: "야간·액션·현대극에 어울리는 깊이 있는 거리",
    image: `${ART_ROOT}/city.webp`,
    badge: "도시",
    cameraPreset: "wide",
    featured: true,
  },
  {
    id: "rooftop",
    templateId: "rooftop",
    title: "노을 옥상",
    description: "고백·독백·대치 장면을 위한 감정적인 옥상",
    image: `${ART_ROOT}/rooftop.webp`,
    badge: "드라마",
    cameraPreset: "low",
  },
  {
    id: "bedroom",
    templateId: "bedroom",
    title: "밤의 방",
    description: "일상·메신저·독백 컷에 맞는 개인 공간",
    image: `${ART_ROOT}/bedroom.webp`,
    badge: "일상",
    cameraPreset: "close",
  },
  {
    id: "palace",
    templateId: "ancient_palace",
    title: "고풍 궁궐",
    description: "사극과 로맨스 판타지를 위한 넓은 궁궐 마당",
    image: `${ART_ROOT}/palace.webp`,
    badge: "사극",
    cameraPreset: "wide",
  },
  {
    id: "fantasy",
    templateId: "fantasy_dungeon_hall",
    title: "판타지 유적",
    description: "전투와 모험 컷에 깊이를 더하는 거대한 공간",
    image: `${ART_ROOT}/fantasy.webp`,
    badge: "판타지",
    cameraPreset: "low",
  },
  {
    id: "sf",
    templateId: "space_station_bridge",
    title: "SF 함교",
    description: "미래 도시와 우주 장면을 위한 시네마틱 함교",
    image: `${ART_ROOT}/sf.webp`,
    badge: "SF",
    cameraPreset: "wide",
  },
  {
    id: "action",
    templateId: "post_apocalyptic_ruins",
    title: "폐허 거점",
    description: "추격·전투·재난 장면에 맞는 강한 원근 공간",
    image: `${ART_ROOT}/action.webp`,
    badge: "액션",
    cameraPreset: "threeQuarter",
  },
]);

export const STUDIO_BG3D_ASSISTANT_HERO = `${ART_ROOT}/scene-assistant-hero.webp`;
export const STUDIO_BG3D_ASSISTANT_CAMERA_PRESETS = Object.freeze([
  { id: "threeQuarter", label: "3/4 시점", description: "인물과 공간이 함께 보이는 기본 구도" },
  { id: "front", label: "정면", description: "대화와 설명 컷에 안정적인 시점" },
  { id: "low", label: "로우앵글", description: "긴장감과 인물의 힘을 강조" },
  { id: "high", label: "하이앵글", description: "공간 관계와 고립감을 표현" },
  { id: "wide", label: "와이드", description: "장소 전체와 동선을 한눈에" },
  { id: "close", label: "클로즈업", description: "표정과 소품을 가까이 보여 주기" },
] as const);

export const STUDIO_BG3D_ASSISTANT_OUTPUT_STYLES = Object.freeze([
  {
    id: "color",
    label: "컬러 배경",
    description: "재질색과 명암을 유지해 바로 사용",
  },
  {
    id: "line",
    label: "선화 가이드",
    description: "배경선을 중심으로 직접 작화하기",
  },
  {
    id: "tone",
    label: "톤 배경",
    description: "흑백 원고에 맞는 셀 명암과 톤",
  },
  {
    id: "reference",
    label: "참고 이미지",
    description: "가볍게 깔고 위에 직접 그리기",
  },
] as const satisfies readonly {
  readonly id: StudioBg3dAssistantOutputStyle;
  readonly label: string;
  readonly description: string;
}[]);
export function studioBg3dAssistantStepIndex(step: StudioBg3dAssistantStep): number {
  return STUDIO_BG3D_ASSISTANT_STEPS.findIndex((item) => item.id === step);
}

export function nextStudioBg3dAssistantStep(
  step: StudioBg3dAssistantStep,
): StudioBg3dAssistantStep | null {
  const index = studioBg3dAssistantStepIndex(step);
  return STUDIO_BG3D_ASSISTANT_STEPS[index + 1]?.id ?? null;
}

export function previousStudioBg3dAssistantStep(
  step: StudioBg3dAssistantStep,
): StudioBg3dAssistantStep | null {
  const index = studioBg3dAssistantStepIndex(step);
  return STUDIO_BG3D_ASSISTANT_STEPS[index - 1]?.id ?? null;
}

export function studioBg3dAssistantOutputSettings(style: StudioBg3dAssistantOutputStyle) {
  if (style === "line") {
    return { lineArtPreview: true, tone: { mode: "none" as const, opacity: 0 } };
  }
  if (style === "tone") {
    return {
      lineArtPreview: true,
      tone: { mode: "cel" as const, type: "grayscale" as const, opacity: 0.92 },
    };
  }
  if (style === "reference") {
    return {
      lineArtPreview: false,
      tone: { mode: "flat" as const, type: "color" as const, opacity: 0.55 },
    };
  }
  return {
    lineArtPreview: false,
    tone: { mode: "flat" as const, type: "color" as const, opacity: 1 },
  };
}
