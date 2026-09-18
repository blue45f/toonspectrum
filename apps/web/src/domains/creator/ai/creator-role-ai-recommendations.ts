import type { StudioAiAssistToolId } from "./studio-ai-assist-ux";

import type { CreatorRoleId } from "@/shared/lib/creator-role-contract";

export interface CreatorRoleAiRecommendation {
  readonly id: string;
  readonly tool: StudioAiAssistToolId;
  readonly label: string;
  readonly reason: string;
  readonly prompt: string;
}

const item = (
  id: string,
  tool: StudioAiAssistToolId,
  label: string,
  reason: string,
  prompt: string,
): CreatorRoleAiRecommendation => ({ id, tool, label, reason, prompt });

const STORY = [
  item("story-dialogue", "dialogue", "대사 톤 점검", "말투와 감정선을 빠르게 비교합니다.", "등장인물의 말투, 호칭, 감정선이 일관적인지 점검하고 자연스러운 대안만 제안해 줘."),
  item("story-composition", "composition", "장면을 컷으로 정리", "대본의 장면 목적을 콘티 입력으로 바꿉니다.", "장면 목적, 감정 변화, 필수 정보가 드러나도록 세로 웹툰 컷 흐름을 제안해 줘."),
] as const;

const ART = [
  item("art-composition", "composition", "구도 점검", "시선 흐름과 인물 배치를 확인합니다.", "세로 스크롤에서 시선이 자연스럽게 이동하도록 카메라, 인물 배치, 여백을 점검해 줘."),
  item("art-character", "character", "캐릭터 연속성", "표정과 의상 기준을 유지합니다.", "참고 캐릭터의 얼굴 비율, 의상, 소품, 표정 연속성을 유지한 다음 컷을 제안해 줘."),
] as const;

const BACKGROUND = [
  item("background-scene", "background", "장면 배경 초안", "장소와 시간대에 맞는 배경을 준비합니다.", "카메라 원근과 인물 동선을 확보한 웹툰 배경. 반복 사용 가능한 구조와 명확한 광원."),
  item("background-camera", "composition", "카메라 블로킹", "3D 장면의 카메라와 동선을 검토합니다.", "장면 목적에 맞는 카메라 높이, 렌즈감, 원근, 인물 이동 경로를 제안해 줘."),
] as const;
const COLOR = [
  item("color-palette", "palette", "작품 팔레트", "장면 분위기와 기존 색 기준을 함께 맞춥니다.", "기존 캐릭터 색을 유지하면서 장면 시간대와 감정에 맞는 팔레트와 명암 기준을 제안해 줘."),
] as const;

const LETTERING = [
  item("lettering-dialogue", "dialogue", "말풍선 길이 점검", "번역·대사의 가독성과 길이를 조정합니다.", "의미와 말투는 유지하면서 모바일 말풍선에 맞게 대사를 간결하게 다듬어 줘."),
] as const;

const REVIEW = [
  item("review-dialogue", "dialogue", "대사 교정", "오탈자와 호칭 불일치를 찾습니다.", "대사의 맞춤법, 호칭, 시제, 말투 불일치를 목록으로 정리하고 원문을 임의로 바꾸지 마."),
  item("review-composition", "composition", "컷 흐름 검수", "중복 정보와 시선 단절을 확인합니다.", "세로 스크롤의 컷 순서, 시선 이동, 정보 반복, 감정 전환을 검수 체크리스트로 정리해 줘."),
] as const;

const PRODUCTION = [
  item("production-composition", "composition", "연출 위험 확인", "작화 비용이 큰 장면을 미리 찾습니다.", "이 장면의 제작 난이도, 필요한 배경·군중·효과, 재사용 가능한 요소와 위험을 정리해 줘."),
  item("production-dialogue", "dialogue", "회의 결정 정리", "결정과 후속 작업을 명확히 분리합니다.", "회의 메모에서 확정 사항, 미결 질문, 담당자, 마감이 필요한 후속 작업을 분리해 줘."),
] as const;

export function creatorRoleAiRecommendations(
  role: CreatorRoleId | null | undefined,
): readonly CreatorRoleAiRecommendation[] {
  switch (role) {
    case "story":
    case "planner": return STORY;
    case "storyboard":
    case "line-art":
    case "character":
    case "assistant": return ART;
    case "background":
    case "three-d": return BACKGROUND;
    case "color": return COLOR;
    case "lettering":
    case "localization": return LETTERING;
    case "editor":
    case "reviewer": return REVIEW;
    case "creator":
    case "producer": return PRODUCTION;
    default: return [];
  }
}
