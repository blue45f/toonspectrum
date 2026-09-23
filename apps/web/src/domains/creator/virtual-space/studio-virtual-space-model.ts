import type { StudioLiveParticipant } from "../live/studio-live-collaboration-protocol";
import type { StudioVirtualSpaceAppearance } from "./studio-virtual-space-appearance";

export const STUDIO_VIRTUAL_SPACE_LEGACY_WIDTH = 1180;
export const STUDIO_VIRTUAL_SPACE_LEGACY_HEIGHT = 720;
// Preserve the established 850x798 collision/P2P coordinate space. The approved production
// crop is 869x813 and is rendered with an aspect-preserving cover scale inside this world.
export const STUDIO_VIRTUAL_SPACE_WIDTH = 1280;
export const STUDIO_VIRTUAL_SPACE_HEIGHT = 960;
const STUDIO_VIRTUAL_SPACE_SCALE_X = STUDIO_VIRTUAL_SPACE_WIDTH / STUDIO_VIRTUAL_SPACE_LEGACY_WIDTH;
const STUDIO_VIRTUAL_SPACE_SCALE_Y = STUDIO_VIRTUAL_SPACE_HEIGHT / STUDIO_VIRTUAL_SPACE_LEGACY_HEIGHT;
const STUDIO_VIRTUAL_SPACE_DISTANCE_SCALE = Math.sqrt(STUDIO_VIRTUAL_SPACE_SCALE_X * STUDIO_VIRTUAL_SPACE_SCALE_Y);
export const STUDIO_VIRTUAL_SPACE_NEARBY_RADIUS = Math.round(230 * STUDIO_VIRTUAL_SPACE_DISTANCE_SCALE);
export const STUDIO_VIRTUAL_SPACE_MAX_NEARBY_PEERS = 3;
export const STUDIO_VIRTUAL_SPACE_MAX_PARTICIPANTS = 24;
// Wire-level capacity, not the number of currently registered skins. This lets the skin registry grow
// without changing the P2P packet contract.
export const STUDIO_VIRTUAL_SPACE_AVATAR_COUNT = 256;
export const STUDIO_VIRTUAL_SPACE_AUTO_AVATAR = -1;

export function studioVirtualSpaceScaleLegacyX(value: number): number {
  return value * STUDIO_VIRTUAL_SPACE_SCALE_X;
}
export function studioVirtualSpaceScaleLegacyY(value: number): number {
  return value * STUDIO_VIRTUAL_SPACE_SCALE_Y;
}
export function studioVirtualSpaceScaleLegacyDistance(value: number): number {
  return value * STUDIO_VIRTUAL_SPACE_DISTANCE_SCALE;
}
export function studioVirtualSpaceScaleLegacyPoint(point: StudioVirtualSpacePoint): StudioVirtualSpacePoint {
  return {
    x: studioVirtualSpaceScaleLegacyX(point.x),
    y: studioVirtualSpaceScaleLegacyY(point.y),
  };
}

/**
 * Data-driven room id. Built-in ids are declared by the default manifest, while Tiled/custom
 * manifests may introduce additional stable ids without changing the P2P wire contract.
 */
export type StudioVirtualSpaceZoneId = string;

export type StudioVirtualSpaceFacing = "down" | "left" | "right" | "up";
export type StudioVirtualSpaceActivity = "available" | "focused" | "reviewing" | "away";

export interface StudioVirtualSpacePoint {
  readonly x: number;
  readonly y: number;
}


export interface StudioVirtualSpaceZone {
  readonly id: StudioVirtualSpaceZoneId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly destination:
    | "none"
    | "story"
    | "comic"
    | "canvas"
    | "review"
    | "assets"
    | "live"
    | "assistant"
    | "community";
}

export interface StudioVirtualSpacePresenceState extends StudioVirtualSpacePoint {
  readonly zoneId: StudioVirtualSpaceZoneId;
  readonly facing: StudioVirtualSpaceFacing;
  readonly activity: StudioVirtualSpaceActivity;
  readonly moving: boolean;
  readonly avatarIndex: number;
  /** Optional for legacy peers; only locally registered presentation identifiers are accepted. */
  readonly appearance?: StudioVirtualSpaceAppearance;
}

export interface StudioVirtualSpacePeer {
  readonly participant: StudioLiveParticipant;
  readonly state: StudioVirtualSpacePresenceState;
  readonly lastSeen: number;
  readonly sequence: number;
}

export interface StudioVirtualAvatarProfile {
  readonly skin: string;
  readonly hair: string;
  readonly hairHighlight: string;
  readonly outfit: string;
  readonly accent: string;
  readonly accessory: "beret" | "bow" | "cat" | "headphones" | "leaf" | "star" | "none";
  readonly hairStyle: "bob" | "long" | "short" | "twin" | "wave" | "crop";
  readonly expression: "bright" | "calm" | "sparkle" | "smile";
}


function worldZone(zone: StudioVirtualSpaceZone): StudioVirtualSpaceZone {
  return Object.freeze(zone);
}

/**
 * Production flows south→north: reception and teams, planning and creation, review/QC,
 * then delivery. Cross-corridors keep frequent Drawing↔Assets and Drawing↔Review loops short.
 */
export const STUDIO_VIRTUAL_SPACE_ZONES: readonly StudioVirtualSpaceZone[] = Object.freeze([
  worldZone({ id: "assets", labelKo: "에셋 아카이브", labelEn: "Asset Archive",
    descriptionKo: "캐릭터·배경·브러시·3D 자료와 복구 버전을 관리해요.", descriptionEn: "Manage characters, backgrounds, brushes, 3D references and recovery versions.",
    x: 40, y: 40, width: 270, height: 210, destination: "assets" }),
  worldZone({ id: "storyboard", labelKo: "콘티 갤러리", labelEn: "Storyboard Gallery",
    descriptionKo: "컷 흐름과 장면 구성을 벽 전체에서 비교해요.", descriptionEn: "Compare panel flow and scene composition across the gallery wall.",
    x: 340, y: 40, width: 270, height: 210, destination: "comic" }),
  worldZone({ id: "production", labelKo: "프로덕션 관제실", labelEn: "Production Control",
    descriptionKo: "일정·배정·병목·마감과 오늘의 우선순위를 확인해요.", descriptionEn: "Inspect schedule, assignments, bottlenecks, deadlines and today's priorities.",
    x: 670, y: 40, width: 270, height: 210, destination: "assistant" }),
  worldZone({ id: "release", labelKo: "출고 센터", labelEn: "Release Center",
    descriptionKo: "최종 승인된 에피소드를 플랫폼별로 내보내고 인계해요.", descriptionEn: "Export and hand off approved episodes for each platform.",
    x: 970, y: 40, width: 270, height: 210, destination: "none" }),

  worldZone({ id: "writers", labelKo: "스토리 랩", labelEn: "Story Lab",
    descriptionKo: "시놉시스·대본·에피소드 의도를 함께 정리해요.", descriptionEn: "Shape synopsis, scripts and episode intent together.",
    x: 40, y: 300, width: 270, height: 230, destination: "story" }),
  worldZone({ id: "drawing", labelKo: "드로잉 아틀리에", labelEn: "Drawing Atelier",
    descriptionKo: "콘티·선화·채색 작업과 실시간 캔버스를 이어가요.", descriptionEn: "Continue storyboard, line-art, color and live-canvas work.",
    x: 340, y: 300, width: 290, height: 230, destination: "canvas" }),
  worldZone({ id: "review", labelKo: "리뷰 시어터", labelEn: "Review Theater",
    descriptionKo: "대형 모니터에서 버전 비교·코멘트·공동 검수를 진행해요.", descriptionEn: "Run version comparison, comments and group review on the theater display.",
    x: 670, y: 300, width: 290, height: 230, destination: "review" }),
  worldZone({ id: "quality", labelKo: "최종 QC", labelEn: "Final Quality Control",
    descriptionKo: "오탈자·누락 컷·출고 규격과 미해결 검수를 점검해요.", descriptionEn: "Check typos, missing panels, delivery specs and unresolved reviews.",
    x: 990, y: 300, width: 250, height: 230, destination: "review" }),

  worldZone({ id: "teams", labelKo: "팀 커먼즈", labelEn: "Team Commons",
    descriptionKo: "작화·스토리·편집 그룹의 자리와 팀 초대를 관리해요.", descriptionEn: "Manage story, art and editorial groups, desks and invitations.",
    x: 40, y: 590, width: 300, height: 260, destination: "community" }),
  worldZone({ id: "lounge", labelKo: "카페 라운지", labelEn: "Cafe Lounge",
    descriptionKo: "근처 팀원과 가볍게 만나고 상태를 공유해요.", descriptionEn: "Meet nearby teammates and share current status informally.",
    x: 370, y: 590, width: 240, height: 180, destination: "community" }),
  worldZone({ id: "live", labelKo: "크리에이터 플라자", labelEn: "Creator Plaza",
    descriptionKo: "모든 제작 동선과 확장 게이트가 만나는 중심 허브예요.", descriptionEn: "The central hub where production paths and expansion gates meet.",
    x: 640, y: 590, width: 280, height: 220, destination: "live" }),
  worldZone({ id: "meeting", labelKo: "팀 회의실", labelEn: "Team Meeting Rooms",
    descriptionKo: "문·입장·참여자 동의를 거쳐 회의와 검수를 시작해요.", descriptionEn: "Start meetings and reviews through explicit door, admission and roster consent.",
    x: 950, y: 590, width: 290, height: 260, destination: "live" }),
  worldZone({ id: "assistant", labelKo: "프로듀서 데스크", labelEn: "Producer Desk",
    descriptionKo: "NPC에게 일정·다음 작업·사람 위치와 제작 도움을 물어봐요.", descriptionEn: "Ask NPCs about schedule, next work, teammate locations and production help.",
    x: 370, y: 790, width: 240, height: 130, destination: "assistant" }),
  worldZone({ id: "lobby", labelKo: "스튜디오 로비", labelEn: "Studio Lobby",
    descriptionKo: "오늘 일정과 초대를 확인하고 제작 캠퍼스로 입장해요.", descriptionEn: "Review today's agenda and invitations before entering the production campus.",
    x: 640, y: 840, width: 280, height: 100, destination: "none" }),
]);

const DEFAULT_POINT: StudioVirtualSpacePoint = Object.freeze({ x: 780, y: 900 });

const SKIN = ["oklch(0.91 0.055 55)", "oklch(0.86 0.07 48)", "oklch(0.78 0.08 52)", "oklch(0.68 0.075 50)"] as const;
const HAIR = ["oklch(0.31 0.055 25)", "oklch(0.36 0.07 300)", "oklch(0.72 0.1 335)", "oklch(0.72 0.11 235)", "oklch(0.77 0.12 95)", "oklch(0.58 0.12 155)"] as const;
const HAIR_HIGHLIGHT = ["oklch(0.56 0.12 25)", "oklch(0.58 0.13 300)", "oklch(0.86 0.1 340)", "oklch(0.86 0.1 235)", "oklch(0.9 0.11 95)", "oklch(0.77 0.12 155)"] as const;
const OUTFIT = ["oklch(0.63 0.2 300)", "oklch(0.68 0.18 355)", "oklch(0.68 0.17 235)", "oklch(0.72 0.16 155)", "oklch(0.76 0.17 85)", "oklch(0.6 0.16 20)"] as const;
const ACCENT = ["oklch(0.78 0.19 335)", "oklch(0.78 0.17 250)", "oklch(0.82 0.17 145)", "oklch(0.86 0.16 85)", "oklch(0.72 0.18 25)", "oklch(0.72 0.18 295)"] as const;
const ACCESSORIES = ["beret", "bow", "cat", "headphones", "leaf", "star", "none"] as const;
const HAIR_STYLES = ["bob", "long", "short", "twin", "wave", "crop"] as const;
const EXPRESSIONS = ["bright", "calm", "sparkle", "smile"] as const;

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function indexed<T>(items: readonly T[], hash: number, shift: number): T {
  return items[(hash >>> shift) % items.length]!;
}

export function studioVirtualAvatarProfile(identity: string): StudioVirtualAvatarProfile {
  const hash = stableHash(identity || "toonspectrum-creator");
  return Object.freeze({
    skin: indexed(SKIN, hash, 0),
    hair: indexed(HAIR, hash, 3),
    hairHighlight: indexed(HAIR_HIGHLIGHT, hash, 6),
    outfit: indexed(OUTFIT, hash, 9),
    accent: indexed(ACCENT, hash, 12),
    accessory: indexed(ACCESSORIES, hash, 15),
    hairStyle: indexed(HAIR_STYLES, hash, 18),
    expression: indexed(EXPRESSIONS, hash, 21),
  });
}

export function studioVirtualSpaceInitialPoint(identity: string): StudioVirtualSpacePoint {
  const hash = stableHash(identity || "local");
  // Spawn across the open lobby entrance without overlapping the Today Board or gate.
  const spreadX = 730 + (hash % 100);
  const spreadY = 895 + ((hash >>> 8) % 28);
  return Object.freeze({ x: spreadX, y: spreadY });
}

export function clampStudioVirtualSpacePoint(point: StudioVirtualSpacePoint): StudioVirtualSpacePoint {
  const x = Math.max(20, Math.min(STUDIO_VIRTUAL_SPACE_WIDTH - 20, point.x));
  const y = Math.max(20, Math.min(STUDIO_VIRTUAL_SPACE_HEIGHT - 20, point.y));
  return Object.freeze({ x, y });
}

export function studioVirtualSpaceZoneAt(point: StudioVirtualSpacePoint): StudioVirtualSpaceZoneId {
  const matched = STUDIO_VIRTUAL_SPACE_ZONES.find((zone) =>
    point.x >= zone.x
    && point.x <= zone.x + zone.width
    && point.y >= zone.y
    && point.y <= zone.y + zone.height
  );
  return matched?.id ?? "lobby";
}

export function studioVirtualSpaceState(
  point: StudioVirtualSpacePoint = DEFAULT_POINT,
  facing: StudioVirtualSpaceFacing = "down",
  activity: StudioVirtualSpaceActivity = "available",
  moving = false,
  avatarIndex = STUDIO_VIRTUAL_SPACE_AUTO_AVATAR,
  zoneId?: StudioVirtualSpaceZoneId,
): StudioVirtualSpacePresenceState {
  const bounded = clampStudioVirtualSpacePoint(point);
  const safeAvatarIndex = Number.isInteger(avatarIndex)
    && avatarIndex >= 0
    && avatarIndex < STUDIO_VIRTUAL_SPACE_AVATAR_COUNT
    ? avatarIndex
    : STUDIO_VIRTUAL_SPACE_AUTO_AVATAR;
  return Object.freeze({
    ...bounded,
    zoneId: zoneId ?? studioVirtualSpaceZoneAt(bounded),
    facing,
    activity,
    moving,
    avatarIndex: safeAvatarIndex,
  });
}

export function studioVirtualSpaceDistance(
  left: StudioVirtualSpacePoint,
  right: StudioVirtualSpacePoint,
): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

export function selectNearbyStudioVirtualPeers(
  self: StudioVirtualSpacePoint,
  peers: readonly StudioVirtualSpacePeer[],
  radius = STUDIO_VIRTUAL_SPACE_NEARBY_RADIUS,
  limit = STUDIO_VIRTUAL_SPACE_MAX_NEARBY_PEERS,
): readonly StudioVirtualSpacePeer[] {
  const safeRadius = Math.max(0, radius);
  const safeLimit = Math.max(0, Math.floor(limit));
  return peers
    .map((peer) => ({ peer, distance: studioVirtualSpaceDistance(self, peer.state) }))
    .filter(({ distance }) => distance <= safeRadius)
    .sort((left, right) =>
      left.distance - right.distance
      || left.peer.participant.sessionId.localeCompare(right.peer.participant.sessionId)
    )
    .slice(0, safeLimit)
    .map(({ peer }) => peer);
}

export function studioVirtualSpaceDestination(
  projectId: string,
  destination: StudioVirtualSpaceZone["destination"],
): string | null {
  const encoded = encodeURIComponent(projectId);
  switch (destination) {
    case "story":
      return `/studio/p/${encoded}/story?view=script`;
    case "comic":
      return `/studio/work/${encoded}/comic`;
    case "canvas":
      return `/studio/work/${encoded}/canvas`;
    case "review":
      return `/studio/p/${encoded}/review?view=inbox`;
    case "assets":
      return `/studio/p/${encoded}/assets?view=project`;
    case "live":
      return `/studio/work/${encoded}/canvas?live=1`;
    case "assistant":
    case "community":
    case "none":
      return null;
  }
}
