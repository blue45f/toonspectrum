import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import type { StudioVirtualSpaceWorldManifest, StudioWorldRoomDefinition } from "./studio-virtual-space-world-manifest";

export type StudioTownPathKind = "stone" | "garden" | "bridge" | "boardwalk";
export type StudioTownDistrictId =
  | "archive-grove"
  | "story-terrace"
  | "production-heights"
  | "atelier-gardens"
  | "review-falls"
  | "commons-market"
  | "sky-port";

export interface StudioTownPathSegment {
  readonly id: string;
  readonly from: StudioVirtualSpacePoint;
  readonly to: StudioVirtualSpacePoint;
  readonly width: number;
  readonly kind: StudioTownPathKind;
}

export interface StudioTownPlaza {
  readonly id: string;
  readonly center: StudioVirtualSpacePoint;
  readonly radiusX: number;
  readonly radiusY: number;
  readonly kind: StudioTownPathKind;
}

export interface StudioTownWaterfall {
  readonly id: string;
  readonly top: StudioVirtualSpacePoint;
  readonly bottom: StudioVirtualSpacePoint;
  readonly width: number;
  readonly height: number;
  readonly interactionPoint: StudioVirtualSpacePoint;
  readonly labelKo: string;
  readonly labelEn: string;
}

export interface StudioTownLandmark {
  readonly id: string;
  readonly district: StudioTownDistrictId;
  readonly point: StudioVirtualSpacePoint;
  readonly radius: number;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly kind: "fountain" | "garden" | "market" | "treehouse" | "observatory" | "stage" | "gong";
}

const EDGE_ROOM_IDS = Object.freeze([
  ["assets", "storyboard"], ["storyboard", "production"], ["production", "release"],
  ["writers", "drawing"], ["drawing", "review"], ["review", "quality"],
  ["teams", "lounge"], ["lounge", "live"], ["live", "meeting"],
  ["assets", "writers"], ["storyboard", "drawing"], ["production", "review"],
  ["release", "quality"], ["writers", "teams"], ["drawing", "lounge"],
  ["review", "live"], ["quality", "meeting"], ["lounge", "assistant"],
  ["live", "lobby"], ["assistant", "lobby"],
] as const);

const PATH_KIND_BY_EDGE = new Map<string, StudioTownPathKind>([
  ["live:meeting", "bridge"], ["production:release", "bridge"], ["quality:review", "bridge"],
  ["lounge:teams", "garden"], ["live:lounge", "garden"], ["assistant:lobby", "boardwalk"],
  ["live:lobby", "boardwalk"],
]);

function roomCenter(room: StudioWorldRoomDefinition): StudioVirtualSpacePoint {
  return { x: room.x + room.width / 2, y: room.y + room.height / 2 };
}

function roomById(manifest: Pick<StudioVirtualSpaceWorldManifest, "rooms">, id: string): StudioWorldRoomDefinition | undefined {
  return manifest.rooms.find((room) => room.id === id);
}

function edgeKey(left: string, right: string): string {
  return [left, right].sort().join(":");
}

export function studioTownUsesLivingLayout(manifest: Pick<StudioVirtualSpaceWorldManifest, "id" | "backgroundAssetKey">): boolean {
  return manifest.id === "toonspectrum-master-studio" && /^studio-modular-campus-v3/u.test(manifest.backgroundAssetKey);
}

export function studioTownPathSegments(
  manifest: Pick<StudioVirtualSpaceWorldManifest, "rooms">,
): readonly StudioTownPathSegment[] {
  const segments: StudioTownPathSegment[] = [];
  for (const [leftId, rightId] of EDGE_ROOM_IDS) {
    const left = roomById(manifest, leftId);
    const right = roomById(manifest, rightId);
    if (!left || !right) continue;
    const leftCenter = roomCenter(left);
    const rightCenter = roomCenter(right);
    const horizontal = Math.abs(leftCenter.x - rightCenter.x) >= Math.abs(leftCenter.y - rightCenter.y);
    const from = horizontal
      ? { x: leftCenter.x + Math.sign(rightCenter.x - leftCenter.x) * left.width * 0.34, y: leftCenter.y }
      : { x: leftCenter.x, y: leftCenter.y + Math.sign(rightCenter.y - leftCenter.y) * left.height * 0.34 };
    const to = horizontal
      ? { x: rightCenter.x - Math.sign(rightCenter.x - leftCenter.x) * right.width * 0.34, y: rightCenter.y }
      : { x: rightCenter.x, y: rightCenter.y - Math.sign(rightCenter.y - leftCenter.y) * right.height * 0.34 };
    const kind = PATH_KIND_BY_EDGE.get(edgeKey(leftId, rightId)) ?? "stone";
    segments.push(Object.freeze({
      id: `${leftId}-${rightId}`,
      from,
      to,
      width: kind === "bridge" ? 38 : kind === "boardwalk" ? 42 : 48,
      kind,
    }));
  }
  return Object.freeze(segments);
}

export const STUDIO_TOWN_PLAZAS: readonly StudioTownPlaza[] = Object.freeze([
  { id: "creator-plaza", center: { x: 780, y: 700 }, radiusX: 126, radiusY: 98, kind: "stone" },
  { id: "lobby-landing", center: { x: 780, y: 887 }, radiusX: 124, radiusY: 66, kind: "boardwalk" },
  { id: "commons-garden", center: { x: 485, y: 700 }, radiusX: 108, radiusY: 80, kind: "garden" },
  { id: "review-landing", center: { x: 815, y: 455 }, radiusX: 94, radiusY: 76, kind: "stone" },
]);

export const STUDIO_TOWN_WATERFALLS: readonly StudioTownWaterfall[] = Object.freeze([
  { id: "archive-falls", top: { x: 300, y: 214 }, bottom: { x: 300, y: 292 }, width: 44, height: 112,
    interactionPoint: { x: 318, y: 292 }, labelKo: "아카이브 폭포", labelEn: "Archive Falls" },
  { id: "atelier-falls", top: { x: 625, y: 502 }, bottom: { x: 625, y: 585 }, width: 48, height: 122,
    interactionPoint: { x: 640, y: 581 }, labelKo: "아틀리에 폭포", labelEn: "Atelier Falls" },
  { id: "review-falls", top: { x: 958, y: 500 }, bottom: { x: 958, y: 584 }, width: 48, height: 124,
    interactionPoint: { x: 936, y: 582 }, labelKo: "리뷰 폭포", labelEn: "Review Falls" },
  { id: "commons-falls", top: { x: 350, y: 780 }, bottom: { x: 350, y: 862 }, width: 42, height: 116,
    interactionPoint: { x: 370, y: 848 }, labelKo: "커먼즈 폭포", labelEn: "Commons Falls" },
]);

export const STUDIO_TOWN_LANDMARKS: readonly StudioTownLandmark[] = Object.freeze([
  { id: "creator-fountain", district: "atelier-gardens", point: { x: 780, y: 700 }, radius: 78,
    labelKo: "크리에이터 분수", labelEn: "Creator Fountain", kind: "fountain" },
  { id: "commons-flower-garden", district: "commons-market", point: { x: 500, y: 682 }, radius: 68,
    labelKo: "커먼즈 정원", labelEn: "Commons Garden", kind: "garden" },
  { id: "creator-market", district: "commons-market", point: { x: 535, y: 770 }, radius: 68,
    labelKo: "크리에이터 마켓", labelEn: "Creator Market", kind: "market" },
  { id: "archive-treehouse", district: "archive-grove", point: { x: 92, y: 250 }, radius: 62,
    labelKo: "아카이브 트리하우스", labelEn: "Archive Treehouse", kind: "treehouse" },
  { id: "sky-observatory", district: "production-heights", point: { x: 1160, y: 258 }, radius: 64,
    labelKo: "하늘 관측소", labelEn: "Sky Observatory", kind: "observatory" },
  { id: "event-stage", district: "sky-port", point: { x: 840, y: 748 }, radius: 72,
    labelKo: "이벤트 스테이지", labelEn: "Event Stage", kind: "stage" },
  { id: "celebration-gong", district: "production-heights", point: { x: 1025, y: 700 }, radius: 50,
    labelKo: "완료 축하 공", labelEn: "Celebration Gong", kind: "gong" },
]);

export interface StudioTownTraversalProfile {
  readonly allowed: boolean;
  readonly onPath: boolean;
  readonly distanceToPath: number;
  readonly kind: StudioTownPathKind | "room" | "grass";
  readonly cost: number;
}

function distanceToSegment(point: StudioVirtualSpacePoint, from: StudioVirtualSpacePoint, to: StudioVirtualSpacePoint): number {
  const vx = to.x - from.x;
  const vy = to.y - from.y;
  const lengthSquared = vx * vx + vy * vy;
  if (lengthSquared <= 0.0001) return Math.hypot(point.x - from.x, point.y - from.y);
  const t = Math.max(0, Math.min(1, ((point.x - from.x) * vx + (point.y - from.y) * vy) / lengthSquared));
  return Math.hypot(point.x - (from.x + vx * t), point.y - (from.y + vy * t));
}

function insideRoom(room: StudioWorldRoomDefinition, point: StudioVirtualSpacePoint, inset = 4): boolean {
  return point.x >= room.x + inset && point.x <= room.x + room.width - inset
    && point.y >= room.y + inset && point.y <= room.y + room.height - inset;
}

function insidePlaza(plaza: StudioTownPlaza, point: StudioVirtualSpacePoint): boolean {
  const dx = (point.x - plaza.center.x) / plaza.radiusX;
  const dy = (point.y - plaza.center.y) / plaza.radiusY;
  return dx * dx + dy * dy <= 1;
}

export function studioTownTraversalProfile(
  manifest: Pick<StudioVirtualSpaceWorldManifest, "id" | "backgroundAssetKey" | "rooms">,
  point: StudioVirtualSpacePoint,
): StudioTownTraversalProfile {
  if (!studioTownUsesLivingLayout(manifest)) return { allowed: true, onPath: false, distanceToPath: 0, kind: "room", cost: 1 };
  if (manifest.rooms.some((room) => insideRoom(room, point))) {
    return { allowed: true, onPath: true, distanceToPath: 0, kind: "room", cost: 1 };
  }
  for (const plaza of STUDIO_TOWN_PLAZAS) {
    if (insidePlaza(plaza, point)) return { allowed: true, onPath: true, distanceToPath: 0, kind: plaza.kind, cost: 1 };
  }
  let nearest = Number.POSITIVE_INFINITY;
  let nearestSegment: StudioTownPathSegment | undefined;
  for (const segment of studioTownPathSegments(manifest)) {
    const distance = distanceToSegment(point, segment.from, segment.to);
    if (distance < nearest) { nearest = distance; nearestSegment = segment; }
  }
  const halfWidth = (nearestSegment?.width ?? 44) / 2;
  const allowed = nearest <= halfWidth + 10;
  return {
    allowed,
    onPath: nearest <= halfWidth,
    distanceToPath: nearest,
    kind: allowed ? (nearestSegment?.kind ?? "stone") : "grass",
    cost: allowed ? (nearest <= halfWidth ? 1 : 2.8) : 12,
  };
}

export function studioTownLineCanTraverse(
  manifest: Pick<StudioVirtualSpaceWorldManifest, "id" | "backgroundAssetKey" | "rooms">,
  from: StudioVirtualSpacePoint,
  to: StudioVirtualSpacePoint,
  step = 8,
): boolean {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const count = Math.max(1, Math.ceil(distance / step));
  for (let index = 0; index <= count; index += 1) {
    const ratio = index / count;
    if (!studioTownTraversalProfile(manifest, {
      x: from.x + (to.x - from.x) * ratio,
      y: from.y + (to.y - from.y) * ratio,
    }).allowed) return false;
  }
  return true;
}

export function studioTownNearestWalkablePoint(
  manifest: Pick<StudioVirtualSpaceWorldManifest, "id" | "backgroundAssetKey" | "rooms">,
  point: StudioVirtualSpacePoint,
): StudioVirtualSpacePoint {
  if (studioTownTraversalProfile(manifest, point).allowed) return point;
  let best = point;
  let bestDistance = Number.POSITIVE_INFINITY;
  const candidates: StudioVirtualSpacePoint[] = [];
  for (const room of manifest.rooms) candidates.push(roomCenter(room));
  for (const plaza of STUDIO_TOWN_PLAZAS) candidates.push(plaza.center);
  for (const segment of studioTownPathSegments(manifest)) {
    const vx = segment.to.x - segment.from.x;
    const vy = segment.to.y - segment.from.y;
    const lengthSquared = vx * vx + vy * vy;
    const ratio = lengthSquared <= 0.0001 ? 0 : Math.max(0, Math.min(1,
      ((point.x - segment.from.x) * vx + (point.y - segment.from.y) * vy) / lengthSquared));
    candidates.push({ x: segment.from.x + vx * ratio, y: segment.from.y + vy * ratio });
  }
  for (const candidate of candidates) {
    const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
    if (distance < bestDistance) { bestDistance = distance; best = candidate; }
  }
  return best;
}

export function studioTownEnvironmentInteractions(): readonly {
  readonly id: string;
  readonly zoneId: string;
  readonly point: StudioVirtualSpacePoint;
  readonly radius: number;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly action: "live";
}[] {
  return Object.freeze([
    ...STUDIO_TOWN_WATERFALLS.map((waterfall) => ({
      id: `environment-${waterfall.id}`,
      zoneId: "live",
      point: waterfall.interactionPoint,
      radius: 58,
      labelKo: waterfall.labelKo,
      labelEn: waterfall.labelEn,
      action: "live" as const,
    })),
    ...STUDIO_TOWN_LANDMARKS.map((landmark) => ({
      id: `environment-${landmark.id}`,
      zoneId: landmark.kind === "market" || landmark.kind === "garden" ? "lounge" : "live",
      point: landmark.point,
      radius: landmark.radius,
      labelKo: landmark.labelKo,
      labelEn: landmark.labelEn,
      action: "live" as const,
    })),
  ]);
}
