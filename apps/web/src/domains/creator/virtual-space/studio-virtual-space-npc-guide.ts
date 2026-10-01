import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import { studioWorldInteractions, type StudioVirtualSpaceWorldManifest, type StudioWorldInteractionDefinition } from "./studio-virtual-space-world-manifest";
import { findStudioWorldPath } from "./studio-virtual-space-world-pathfinding";

export interface StudioVirtualNpcGuideTourRequest {
  readonly id: string;
  readonly guideId: string;
}
export interface StudioVirtualNpcGuideTourState {
  readonly requestId: string;
  readonly guideId: string;
  readonly status: "walking" | "waiting-for-user" | "at-stop" | "complete" | "cancelled";
  readonly stopIndex: number;
  readonly stopCount: number;
  readonly stopAction?: StudioWorldInteractionDefinition["action"];
}
export interface StudioNpcGuideStop {
  readonly point: StudioVirtualSpacePoint;
  readonly action: StudioWorldInteractionDefinition["action"];
}

/** Only existing reachable tool locations. The tour carries no navigation/tool/media callback. */
export function studioNpcGuideStops(manifest: StudioVirtualSpaceWorldManifest, start: StudioVirtualSpacePoint): readonly StudioNpcGuideStop[] {
  const stops: StudioNpcGuideStop[] = [];
  let from = start;
  for (const action of ["story", "canvas", "review", "assets"] as const) {
    const interaction = studioWorldInteractions(manifest).find((item) => item.action === action);
    if (!interaction) continue;
    const path = findStudioWorldPath(manifest, from, interaction.point);
    const point = path.at(-1);
    if (!point || Math.hypot(point.x - interaction.point.x, point.y - interaction.point.y) > interaction.radius) continue;
    stops.push({ point, action }); from = point;
  }
  return stops;
}

// ── 투어 경유지 대사 (Track C) ──────────────────────────────────────────────

/** 투어 경유지 액션별 안내 대사. stopIndex는 "N번째 방문지" 번호 표시에 쓴다. */
export function studioNpcGuideStopLine(
  action: StudioWorldInteractionDefinition["action"],
  stopIndex: number,
): { readonly ko: string; readonly en: string } {
  const visitNumber = stopIndex + 1;
  const lines: Record<string, { readonly ko: string; readonly en: string }> = {
    story: {
      ko: `${visitNumber}번째 방문지, 스토리보드실이에요! 컷 순서 미니게임도 해보세요.`,
      en: `Stop ${visitNumber}: the storyboard room! Try the panel-order mini-game.`,
    },
    canvas: {
      ko: `${visitNumber}번째 방문지, 작화실이에요. 팔레트 매칭이 인기예요.`,
      en: `Stop ${visitNumber}: the drawing studio. Palette match is popular here.`,
    },
    review: {
      ko: `${visitNumber}번째 방문지, 검수실이에요. 포즈 맞히기로 눈을 풀어보세요.`,
      en: `Stop ${visitNumber}: the review room. Stretch your eyes with pose guess.`,
    },
    assets: {
      ko: `${visitNumber}번째 방문지, 소재 아카이브예요. 숨은 소재 찾기에 도전!`,
      en: `Stop ${visitNumber}: the asset archive. Try finding hidden assets!`,
    },
  };
  return lines[action] ?? {
    ko: `${visitNumber}번째 방문지예요. 천천히 둘러보세요!`,
    en: `Stop ${visitNumber}. Take your time looking around!`,
  };
}
