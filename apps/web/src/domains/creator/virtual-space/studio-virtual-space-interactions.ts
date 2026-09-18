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

export const STUDIO_VIRTUAL_SPACE_INTERACTIONS: readonly StudioVirtualSpaceInteraction[] = Object.freeze([
  {
    id: "lounge-community-table",
    zoneId: "lounge",
    labelKo: "크리에이터 테이블",
    labelEn: "Creator table",
    hintKo: "커뮤니티와 가벼운 대화를 열어요.",
    hintEn: "Open community and casual conversation.",
    emoji: "☕",
    x: 190,
    y: 105,
    radius: 96,
    action: "community",
  },
  {
    id: "writers-script-desk",
    zoneId: "writers",
    labelKo: "대본 데스크",
    labelEn: "Script desk",
    hintKo: "시놉시스와 38화 대본 작업으로 이동해요.",
    hintEn: "Open synopsis and episode script work.",
    emoji: "📝",
    x: 555,
    y: 105,
    radius: 96,
    action: "story",
  },
  {
    id: "storyboard-wall",
    zoneId: "storyboard",
    labelKo: "스토리보드 월",
    labelEn: "Storyboard wall",
    hintKo: "컷 흐름과 장면 구성을 검토해요.",
    hintEn: "Review panel flow and scene composition.",
    emoji: "🖼️",
    x: 940,
    y: 100,
    radius: 100,
    action: "comic",
  },
  {
    id: "live-stage-console",
    zoneId: "live",
    labelKo: "라이브 콘솔",
    labelEn: "Live console",
    hintKo: "라이브 드로잉 세션을 시작해요.",
    hintEn: "Start a live drawing session.",
    emoji: "🎬",
    x: 590,
    y: 435,
    radius: 100,
    action: "live",
  },
  {
    id: "asset-shelf",
    zoneId: "assets",
    labelKo: "에셋 선반",
    labelEn: "Asset shelf",
    hintKo: "캐릭터·배경·브러시·3D 에셋을 찾아요.",
    hintEn: "Browse characters, backgrounds, brushes and 3D assets.",
    emoji: "📦",
    x: 170,
    y: 310,
    radius: 106,
    action: "assets",
  },
  {
    id: "drawing-desk",
    zoneId: "drawing",
    labelKo: "드로잉 데스크",
    labelEn: "Drawing desk",
    hintKo: "현재 원고 캔버스를 열어요.",
    hintEn: "Open the current manuscript canvas.",
    emoji: "🎨",
    x: 995,
    y: 305,
    radius: 112,
    action: "canvas",
  },
  {
    id: "review-monitor",
    zoneId: "review",
    labelKo: "리뷰 모니터",
    labelEn: "Review monitor",
    hintKo: "댓글·수정 요청·승인 화면을 열어요.",
    hintEn: "Open comments, change requests and approvals.",
    emoji: "✅",
    x: 240,
    y: 550,
    radius: 112,
    action: "review",
  },
  {
    id: "ai-producer-desk",
    zoneId: "assistant",
    labelKo: "AI 프로듀서 데스크",
    labelEn: "AI Producer desk",
    hintKo: "프로젝트 맥락의 다음 작업과 도움말을 열어요.",
    hintEn: "Open project-aware next actions and assistance.",
    emoji: "🤖",
    x: 925,
    y: 545,
    radius: 120,
    action: "assistant",
  },
]);

export function studioVirtualSpaceInteractionDistance(
  point: StudioVirtualSpacePoint,
  interaction: StudioVirtualSpaceInteraction,
): number {
  return Math.hypot(point.x - interaction.x, point.y - interaction.y);
}

export function selectNearestStudioVirtualSpaceInteraction(
  point: StudioVirtualSpacePoint,
): StudioVirtualSpaceInteraction | null {
  let nearest: StudioVirtualSpaceInteraction | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const interaction of STUDIO_VIRTUAL_SPACE_INTERACTIONS) {
    const distance = studioVirtualSpaceInteractionDistance(point, interaction);
    if (distance <= interaction.radius && distance < nearestDistance) {
      nearest = interaction;
      nearestDistance = distance;
    }
  }
  return nearest;
}
