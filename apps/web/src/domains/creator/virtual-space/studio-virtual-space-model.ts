import type { StudioLiveParticipant } from "../live/studio-live-collaboration-protocol";

export const STUDIO_VIRTUAL_SPACE_LEGACY_WIDTH = 1180;
export const STUDIO_VIRTUAL_SPACE_LEGACY_HEIGHT = 720;
// Preserve the established 850x798 collision/P2P coordinate space. The approved production
// crop is 869x813 and is rendered with an aspect-preserving cover scale inside this world.
export const STUDIO_VIRTUAL_SPACE_WIDTH = 850;
export const STUDIO_VIRTUAL_SPACE_HEIGHT = 798;
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
  readonly destination: "none" | "story" | "comic" | "canvas" | "review" | "assets" | "assistant" | "live";
}

export interface StudioVirtualSpacePresenceState extends StudioVirtualSpacePoint {
  readonly zoneId: StudioVirtualSpaceZoneId;
  readonly facing: StudioVirtualSpaceFacing;
  readonly activity: StudioVirtualSpaceActivity;
  readonly moving: boolean;
  readonly avatarIndex: number;
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

function legacyZone(zone: Omit<StudioVirtualSpaceZone, "x" | "y" | "width" | "height"> & {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}): StudioVirtualSpaceZone {
  return Object.freeze({
    ...zone,
    x: studioVirtualSpaceScaleLegacyX(zone.x),
    y: studioVirtualSpaceScaleLegacyY(zone.y),
    width: studioVirtualSpaceScaleLegacyX(zone.width),
    height: studioVirtualSpaceScaleLegacyY(zone.height),
  });
}

export const STUDIO_VIRTUAL_SPACE_ZONES: readonly StudioVirtualSpaceZone[] = Object.freeze([
  legacyZone({
    id: "lounge", labelKo: "라운지", labelEn: "Lounge",
    descriptionKo: "가볍게 만나고 오늘의 작업을 공유해요.",
    descriptionEn: "Meet casually and share what everyone is working on.",
    x: 32, y: 32, width: 340, height: 190, destination: "none",
  }),
  legacyZone({
    id: "writers", labelKo: "작가실", labelEn: "Writers Room",
    descriptionKo: "시놉시스·대본·에피소드를 함께 정리해요.",
    descriptionEn: "Shape synopsis, scripts and episodes together.",
    x: 390, y: 32, width: 330, height: 190, destination: "story",
  }),
  legacyZone({
    id: "storyboard", labelKo: "콘티 보드", labelEn: "Storyboard Wall",
    descriptionKo: "컷 흐름과 장면 구성을 한눈에 검토해요.",
    descriptionEn: "Review panel flow and scene composition at a glance.",
    x: 738, y: 32, width: 410, height: 190, destination: "comic",
  }),
  legacyZone({
    id: "assets", labelKo: "에셋 라이브러리", labelEn: "Asset Library",
    descriptionKo: "캐릭터·배경·브러시·3D 자료를 찾아요.",
    descriptionEn: "Find characters, backgrounds, brushes and 3D assets.",
    x: 32, y: 250, width: 310, height: 190, destination: "assets",
  }),
  legacyZone({
    id: "live", labelKo: "크리에이터 플라자", labelEn: "Creator Plaza",
    descriptionKo: "라이브 드로잉과 공동 작업 이벤트가 열리는 중앙 광장이에요.",
    descriptionEn: "The central plaza for live drawing and co-creation events.",
    x: 390, y: 250, width: 410, height: 190, destination: "live",
  }),
  legacyZone({
    id: "drawing", labelKo: "드로잉 스튜디오", labelEn: "Drawing Studio",
    descriptionKo: "같은 원고를 보며 실시간으로 작업해요.",
    descriptionEn: "Work on the same manuscript with live collaboration.",
    x: 838, y: 250, width: 310, height: 190, destination: "canvas",
  }),
  legacyZone({
    id: "review", labelKo: "리뷰 룸", labelEn: "Review Room",
    descriptionKo: "댓글·수정 요청·승인을 함께 처리해요.",
    descriptionEn: "Handle comments, change requests and approvals together.",
    x: 32, y: 462, width: 430, height: 226, destination: "review",
  }),
  legacyZone({
    id: "assistant", labelKo: "어시스트 데스크", labelEn: "Assistant Desk",
    descriptionKo: "어시스트 배정과 AI 프로듀서 도움을 한곳에서 처리해요.",
    descriptionEn: "Coordinate assistants and AI production support in one place.",
    x: 718, y: 462, width: 430, height: 226, destination: "assistant",
  }),
]);

const DEFAULT_POINT: StudioVirtualSpacePoint = Object.freeze(studioVirtualSpaceScaleLegacyPoint({ x: 590, y: 640 }));

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
  // Spawn on the open entrance path between Review Room and Assistant Desk, mirroring the master scene.
  const spreadX = 535 + (hash % 110);
  const spreadY = 610 + ((hash >>> 8) % 42);
  return Object.freeze(studioVirtualSpaceScaleLegacyPoint({ x: spreadX, y: spreadY }));
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
  return matched?.id ?? "lounge";
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
    case "none":
      return null;
  }
}
