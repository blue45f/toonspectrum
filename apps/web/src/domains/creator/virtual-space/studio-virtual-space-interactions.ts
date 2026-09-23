import type {
  StudioVirtualSpacePoint,
  StudioVirtualSpaceZoneId,
} from "./studio-virtual-space-model";

export type StudioVirtualSpaceInteractionAction =
  | "assistant"
  | "assets"
  | "canvas"
  | "community"
  | "comic"
  | "live"
  | "review"
  | "story";

export interface StudioVirtualSpaceInteraction {
  readonly id: string;
  readonly zoneId: StudioVirtualSpaceZoneId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly hintKo: string;
  readonly hintEn: string;
  readonly emoji: string;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly action: StudioVirtualSpaceInteractionAction;
}

const interaction = (value: StudioVirtualSpaceInteraction): StudioVirtualSpaceInteraction => Object.freeze(value);

export const STUDIO_VIRTUAL_SPACE_INTERACTIONS: readonly StudioVirtualSpaceInteraction[] = Object.freeze([
  interaction({
    id: "lounge-community-table", zoneId: "lounge",
    labelKo: "크리에이터 테이블", labelEn: "Creator table",
    hintKo: "커뮤니티와 가벼운 대화를 열어요.", hintEn: "Open community and casual conversation.",
    emoji: "☕", x: 145, y: 355, radius: 68, action: "community",
  }),
  interaction({
    id: "writers-script-desk", zoneId: "writers",
    labelKo: "대본 데스크", labelEn: "Script desk",
    hintKo: "시놉시스와 에피소드 대본 작업으로 이동해요.", hintEn: "Open synopsis and episode script work.",
    emoji: "📝", x: 195, y: 165, radius: 72, action: "story",
  }),
  interaction({
    id: "storyboard-wall", zoneId: "storyboard",
    labelKo: "스토리보드 월", labelEn: "Storyboard wall",
    hintKo: "컷 흐름과 장면 구성을 검토해요.", hintEn: "Review panel flow and scene composition.",
    emoji: "🖼️", x: 655, y: 150, radius: 76, action: "comic",
  }),
  interaction({
    id: "live-stage-console", zoneId: "live",
    labelKo: "크리에이터 허브", labelEn: "Creator hub",
    hintKo: "라이브 드로잉과 공동 작업 세션을 시작해요.", hintEn: "Start live drawing and co-creation sessions.",
    emoji: "🎬", x: 425, y: 475, radius: 92, action: "live",
  }),
  interaction({
    id: "asset-shelf", zoneId: "assets",
    labelKo: "에셋 선반", labelEn: "Asset shelf",
    hintKo: "캐릭터·배경·브러시·3D 에셋을 찾아요.", hintEn: "Browse characters, backgrounds, brushes and 3D assets.",
    emoji: "📦", x: 145, y: 530, radius: 72, action: "assets",
  }),
  interaction({
    id: "drawing-desk", zoneId: "drawing",
    labelKo: "드로잉 데스크", labelEn: "Drawing desk",
    hintKo: "현재 원고 캔버스를 열어요.", hintEn: "Open the current manuscript canvas.",
    emoji: "🎨", x: 705, y: 360, radius: 74, action: "canvas",
  }),
  interaction({
    id: "review-monitor", zoneId: "review",
    labelKo: "리뷰 모니터", labelEn: "Review monitor",
    hintKo: "댓글·수정 요청·승인 화면을 열어요.", hintEn: "Open comments, change requests and approvals.",
    emoji: "✅", x: 185, y: 725, radius: 78, action: "review",
  }),
  interaction({
    id: "ai-producer-desk", zoneId: "assistant",
    labelKo: "AI 프로듀서 데스크", labelEn: "AI Producer desk",
    hintKo: "프로젝트 맥락의 다음 작업과 도움말을 열어요.", hintEn: "Open project-aware next actions and assistance.",
    emoji: "🤖", x: 665, y: 725, radius: 80, action: "assistant",
  }),
]);

export function studioVirtualSpaceInteractionDistance(
  point: StudioVirtualSpacePoint,
  value: StudioVirtualSpaceInteraction,
): number {
  return Math.hypot(point.x - value.x, point.y - value.y);
}

export function selectNearestStudioVirtualSpaceInteraction(
  point: StudioVirtualSpacePoint,
): StudioVirtualSpaceInteraction | null {
  let nearest: StudioVirtualSpaceInteraction | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const value of STUDIO_VIRTUAL_SPACE_INTERACTIONS) {
    const distance = studioVirtualSpaceInteractionDistance(point, value);
    if (distance <= value.radius && distance < nearestDistance) {
      nearest = value;
      nearestDistance = distance;
    }
  }
  return nearest;
}
