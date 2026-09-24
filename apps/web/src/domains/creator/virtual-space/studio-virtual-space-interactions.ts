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

/** Every station is approached physically, then opens an explicit multi-action sheet. */
export const STUDIO_VIRTUAL_SPACE_INTERACTIONS: readonly StudioVirtualSpaceInteraction[] = Object.freeze([
  interaction({ id: "asset-archive-terminal", zoneId: "assets", labelKo: "에셋 아카이브 터미널", labelEn: "Asset archive terminal",
    hintKo: "소재·버전·복구 자료를 찾아요.", hintEn: "Browse assets, versions and recovery materials.", emoji: "📦", x: 175, y: 175, radius: 78, action: "assets" }),
  interaction({ id: "storyboard-wall", zoneId: "storyboard", labelKo: "스토리보드 월", labelEn: "Storyboard wall",
    hintKo: "컷 흐름과 장면 구성을 검토해요.", hintEn: "Review panel flow and scene composition.", emoji: "🖼️", x: 475, y: 175, radius: 82, action: "comic" }),
  interaction({ id: "production-control-board", zoneId: "production", labelKo: "프로덕션 상태판", labelEn: "Production control board",
    hintKo: "일정·병목·배정·마감을 확인해요.", hintEn: "Inspect schedule, bottlenecks, assignments and deadlines.", emoji: "📊", x: 805, y: 175, radius: 82, action: "assistant" }),
  interaction({ id: "release-delivery-console", zoneId: "release", labelKo: "출고 콘솔", labelEn: "Release delivery console",
    hintKo: "최종 QC 뒤 플랫폼별 내보내기를 준비해요.", hintEn: "Prepare platform exports after final quality control.", emoji: "🚀", x: 1105, y: 175, radius: 82, action: "assistant" }),

  interaction({ id: "writers-script-desk", zoneId: "writers", labelKo: "대본 데스크", labelEn: "Script desk",
    hintKo: "시놉시스와 에피소드 대본 작업을 열어요.", hintEn: "Open synopsis and episode script work.", emoji: "📝", x: 175, y: 455, radius: 80, action: "story" }),
  interaction({ id: "drawing-atelier-desk", zoneId: "drawing", labelKo: "드로잉 아틀리에 데스크", labelEn: "Drawing atelier desk",
    hintKo: "현재 원고·콘티·드로잉 캔버스를 이어가요.", hintEn: "Continue the current manuscript, storyboard or drawing canvas.", emoji: "🎨", x: 485, y: 455, radius: 82, action: "canvas" }),
  interaction({ id: "review-theater-monitor", zoneId: "review", labelKo: "리뷰 시어터 모니터", labelEn: "Review theater monitor",
    hintKo: "검수본을 열고 비교·코멘트·공동 리뷰를 시작해요.", hintEn: "Open a review, compare versions and start a group review.", emoji: "✅", x: 815, y: 455, radius: 86, action: "review" }),
  interaction({ id: "quality-control-console", zoneId: "quality", labelKo: "최종 QC 콘솔", labelEn: "Final QC console",
    hintKo: "미해결 의견·누락·오탈자·출고 규격을 확인해요.", hintEn: "Check unresolved notes, omissions, typos and delivery specs.", emoji: "🔎", x: 1115, y: 455, radius: 82, action: "review" }),

  interaction({ id: "team-commons-directory", zoneId: "teams", labelKo: "팀 커먼즈 디렉터리", labelEn: "Team Commons directory",
    hintKo: "제작 그룹을 만들고 팀원을 초대해요.", hintEn: "Create production groups and invite teammates.", emoji: "👥", x: 190, y: 755, radius: 88, action: "community" }),
  interaction({ id: "cafe-community-table", zoneId: "lounge", labelKo: "카페 커뮤니티 테이블", labelEn: "Cafe community table",
    hintKo: "근처 팀원과 인사하고 가볍게 대화해요.", hintEn: "Greet nearby teammates and have an informal conversation.", emoji: "☕", x: 490, y: 720, radius: 82, action: "community" }),
  interaction({ id: "creator-plaza-stage", zoneId: "live", labelKo: "크리에이터 플라자", labelEn: "Creator Plaza",
    hintKo: "라이브 드로잉·발표·공동 작업을 시작해요.", hintEn: "Start live drawing, presentation and co-creation.", emoji: "✨", x: 840, y: 735, radius: 92, action: "live" }),
  interaction({ id: "meeting-room-console", zoneId: "meeting", labelKo: "팀 회의실 콘솔", labelEn: "Team meeting console",
    hintKo: "참여자 명단과 장치를 확인한 뒤 회의를 시작해요.", hintEn: "Review the roster and device choices before starting a meeting.", emoji: "🎧", x: 1100, y: 760, radius: 88, action: "live" }),
  interaction({ id: "producer-assistant-desk", zoneId: "assistant", labelKo: "프로듀서 데스크", labelEn: "Producer desk",
    hintKo: "NPC에게 일정·다음 작업·팀원 위치를 물어봐요.", hintEn: "Ask an NPC about schedules, next work and teammate locations.", emoji: "🤖", x: 490, y: 885, radius: 74, action: "assistant" }),
  interaction({ id: "lobby-today-board", zoneId: "lobby", labelKo: "오늘의 스튜디오 보드", labelEn: "Studio today board",
    hintKo: "입장 전 오늘 일정·검수·다음 작업을 확인해요.", hintEn: "Review today's schedule, reviews and next work before entering.", emoji: "📅", x: 780, y: 895, radius: 72, action: "assistant" }),
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
