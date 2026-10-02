import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import type { StudioBilingualCopy } from "./studio-virtual-space-proximity";
import { studioWorldCanOccupy } from "./studio-virtual-space-world-pathfinding";
import type { StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";

/**
 * T8 따라가기 (Follow) — 순수 로직.
 *
 * 기존 walk-over 파이프라인(`stepStudioWorldWalkOver` + 브리지 `followingPeerId`)이
 * "옆자리(32px)에 붙는" 기본 동작만 제공하던 것을 확장한다.
 * - 거리 유지: 기본 1.5타일(타일=32px → 48px). 설정으로 조정 가능.
 * - 충돌 무시 옵션: 스탠드오프 링 지점을 점유 판정 없이 고르고,
 *   캔버스가 물리 충돌기를 꺼서 실제로 벽을 통과한다 (고스트 모드와 같은 우회).
 * - 도슨트 모드: 캔버스·walk-over가 도착 밴드를 넓혀(holdSlack), 가이드가 멈추면
 *   추종자가 무리해서 붙지 않고 기다린다. 검수 투어·전시 안내 시나리오용.
 *
 * 실행 연결: 페이지가 `StudioFollowConfig`를 브리지에 넣고, 캔버스가 매 프레임
 * 설정을 읽어 walk-over 옵션(standOffPx·ignoreCollisions·holdSlackPx)으로 흘린다.
 */

/** 1타일로 환산하는 픽셀. 아바타 1칸 간격 단위로 본다. */
export const STUDIO_FOLLOW_TILE_PX = 32;
/** 대상과 유지할 기본 거리 (타일 단위). */
export const STUDIO_FOLLOW_DISTANCE_TILES = 1.5;
/** 도착 판정 여유 (px). 스탠드오프 + 이 값 안쪽이면 도착으로 본다. */
export const STUDIO_FOLLOW_ARRIVE_SLACK_PX = 8;

export type StudioFollowMode = "standard" | "docent";

export interface StudioFollowConfig {
  readonly mode: StudioFollowMode;
  /** true면 따라가는 경로가 충돌체를 무시한다 (벽 통과). */
  readonly ignoreCollisions: boolean;
  /** 대상과 유지할 거리 (타일 단위). */
  readonly distanceTiles: number;
  /** 1타일로 환산할 픽셀. */
  readonly tilePx: number;
}

export const DEFAULT_STUDIO_FOLLOW_CONFIG: StudioFollowConfig = Object.freeze({
  mode: "standard",
  ignoreCollisions: false,
  distanceTiles: STUDIO_FOLLOW_DISTANCE_TILES,
  tilePx: STUDIO_FOLLOW_TILE_PX,
});

/** 설정값이 깨져 있어도 안전한 스탠드오프(px)를 돌려준다. */
export function resolveStudioFollowStandOffPx(config: StudioFollowConfig): number {
  const tiles = Number.isFinite(config.distanceTiles) && config.distanceTiles > 0
    ? config.distanceTiles
    : STUDIO_FOLLOW_DISTANCE_TILES;
  const tilePx = Number.isFinite(config.tilePx) && config.tilePx > 0
    ? config.tilePx
    : STUDIO_FOLLOW_TILE_PX;
  return tiles * tilePx;
}

/**
 * 대상 둘레 스탠드오프 링에서 현재 위치와 가장 가까운 지점을 찾는다.
 * ignoreCollisions=false면 점유 가능한 지점만 후보가 되고, 전부 막혀 있으면 null.
 * ignoreCollisions=true면 점유 판정을 건너뛰어 가장 가까운 링 지점을 그대로 쓴다.
 */
export function findStudioFollowPoint(
  manifest: StudioVirtualSpaceWorldManifest,
  current: StudioVirtualSpacePoint,
  target: StudioVirtualSpacePoint,
  standOffPx: number,
  ignoreCollisions: boolean,
): StudioVirtualSpacePoint | null {
  if (![standOffPx].every(Number.isFinite) || standOffPx <= 0) return null;
  let best: StudioVirtualSpacePoint | null = null;
  let bestGap = Number.POSITIVE_INFINITY;
  for (let step = 0; step < 16; step += 1) {
    const angle = (Math.PI * 2 * step) / 16;
    const candidate = {
      x: target.x + Math.cos(angle) * standOffPx,
      y: target.y + Math.sin(angle) * standOffPx,
    };
    if (!ignoreCollisions && !studioWorldCanOccupy(manifest, candidate)) continue;
    const gap = Math.hypot(candidate.x - current.x, candidate.y - current.y);
    if (gap < bestGap) {
      best = candidate;
      bestGap = gap;
    }
  }
  return best;
}

/** 도슨트 모드 토글 안내 문구. */
export function studioFollowModeCopy(bt: StudioBilingualCopy, mode: StudioFollowMode): string {
  return mode === "docent"
    ? bt("도슨트 모드: 가이드가 멈추면 함께 멈춰 기다려요", "Docent mode: wait together when the guide stops")
    : bt("일반 따라가기", "Standard follow");
}
