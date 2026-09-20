import { z } from "zod";

/** This graph-asset namespace is written only by the authenticated publication endpoint. */
export const STUDIO_WORLD_ARTIFACT_PREFIX = "studio-world-";

/** Renderer-neutral data for a published graph asset; no textures, network access, or grants. */
const id = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/iu);
const anchorId = z.string().regex(/^[a-z0-9][a-z0-9_.:-]{0,95}$/iu);
const entityId = z.string().min(1).max(160);
const positive = z.number().finite().positive().max(10000);
const coordinate = z.number().finite().min(0).max(10000);
const point = z.object({ x: coordinate, y: coordinate }).strict();
const rect = z.object({ x: coordinate, y: coordinate, width: positive, height: positive }).strict();
const label = z.string().trim().min(1).max(160);
const facing = z.enum(["down", "left", "right", "up"]);
const action = z.enum(["assistant", "assets", "canvas", "community", "comic", "live", "review", "story"]);
const safeCharacters = (value: string) => ![...value].some((character) => character === "\\" || character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
const route = z.string().max(2048).refine((value) => value.startsWith("/") && !value.startsWith("//") && safeCharacters(value), "Unsafe local route");
const assetUrl = z.string().max(2048).refine((value) => {
  if (route.safeParse(value).success) return true;
  if (!safeCharacters(value)) return false;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; }
  catch { return false; }
}, "Unsafe asset URL");
const destination = { targetRoomId: id.optional(), targetPoint: point.optional(), href: route.optional() };
const location = { approachPoint: point, anchorPoint: point, exitPoint: point, seatAttachmentPoint: point.optional(), facing };
const room = rect.extend({ id, labelKo: label, labelEn: label, descriptionKo: z.string().max(2000).optional(), descriptionEn: z.string().max(2000).optional(), action: action.optional() });
const prop = z.object({
  id, kind: z.enum(["decor", "solid", "interactive", "portal"]), assetKey: id.optional(), assetUrl: assetUrl.optional(),
  x: coordinate, y: coordinate, width: positive.optional(), height: positive.optional(), scale: positive.optional(),
  rotation: z.number().finite().optional(), alpha: z.number().min(0).max(1).optional(),
  originX: z.number().min(0).max(1).optional(), originY: z.number().min(0).max(1).optional(),
  depth: z.enum(["fixed", "y-sort", "foreground"]).optional(), fixedDepth: z.number().finite().optional(),
  collider: rect.optional(), action: action.optional(), interactionRadius: positive.optional(),
  labelKo: label.optional(), labelEn: label.optional(), portal: z.object(destination).strict().optional(),
}).strict();
const portal = z.object({ id, point, radius: positive, ...destination }).strict();
const acousticZone = rect.extend({ id: anchorId, roomId: anchorId, policy: z.enum(["public", "private"]), doorId: anchorId.optional() });

/** Structural/security validation shared by API and Web. Web retains renderer/pathfinding checks. */
export const studioWorldManifestSchema = z.object({
  id, version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), width: z.number().int().min(32).max(10000), height: z.number().int().min(32).max(10000),
  backgroundAssetKey: id, backgroundUrl: assetUrl,
  rooms: z.array(room).min(1).max(4096), props: z.array(prop).max(4096), colliders: z.array(rect).max(4096),
  interactions: z.array(z.object({ id, zoneId: id, point, radius: positive, labelKo: label, labelEn: label, action }).strict()).max(4096),
  portals: z.array(portal).max(4096), spawns: z.array(z.object({ id, point, facing: facing.optional() }).strict()).min(1).max(4096),
  npcs: z.array(z.object({ id, skinKey: anchorId, point, roomId: id, facing: facing.optional(), scale: positive.optional(), speed: positive.optional(),
    behavior: z.enum(["idle", "talk", "draw", "review", "patrol"]).optional(), patrol: z.array(point).max(256).optional(), activityAnchorIds: z.array(anchorId).max(12).optional() }).strict()).max(4096),
  interactionSlots: z.array(z.object({ id, roomId: id, labelKo: label, labelEn: label, ...location, radius: positive.max(24) }).strict()).max(128).optional(),
  occlusionLayers: z.array(z.object({ id, polygon: z.array(point).min(3).max(128), depth: z.number().finite().nonnegative() }).strict()).max(8).optional(),
  npcActivityAnchors: z.array(z.object({ id: anchorId, roomId: id, ...location, activity: z.enum(["work", "inspect", "rest"]),
    animation: z.enum(["idle", "talk", "draw", "review", "sit"]), minDurationMs: z.number().int().min(2500).max(120000), maxDurationMs: z.number().int().min(2500).max(120000) }).strict()).max(64).optional(),
  acousticZones: z.array(acousticZone).max(64).optional(),
}).strict().superRefine((world, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  const groups = [world.rooms, world.props, world.interactions, world.portals, world.spawns, world.npcs, world.interactionSlots ?? [], world.occlusionLayers ?? [], world.npcActivityAnchors ?? [], world.acousticZones ?? []];
  if (groups.reduce((sum, values) => sum + values.length, world.colliders.length) > 4096) fail("World entity budget exceeded");
  for (const group of groups) if (new Set(group.map((item) => item.id)).size !== group.length) fail("Duplicate world entity id");
  const inBounds = (value: { x: number; y: number }) => value.x <= world.width && value.y <= world.height;
  const within = (outer: { x: number; y: number; width: number; height: number }, inner: { x: number; y: number; width: number; height: number }) =>
    inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;
  const rooms = new Map(world.rooms.map((value) => [value.id, value]));
  const bounds = { x: 0, y: 0, width: world.width, height: world.height };
  for (const value of [...world.rooms, ...world.colliders, ...world.props.flatMap((value) => value.collider ? [value.collider] : [])]) if (!within(bounds, value)) fail("Rectangle outside world");
  const roomRef = (value: string) => { if (!rooms.has(value)) fail("Missing room reference"); };
  const points = [...world.spawns.map((value) => value.point), ...world.interactions.map((value) => value.point), ...world.props,
    ...world.npcs.flatMap((value) => [value.point, ...(value.patrol ?? [])]), ...(world.occlusionLayers ?? []).flatMap((value) => value.polygon)];
  for (const value of world.interactions) roomRef(value.zoneId);
  for (const value of [...world.npcs, ...(world.interactionSlots ?? []), ...(world.npcActivityAnchors ?? [])]) roomRef(value.roomId);
  for (const value of [...world.portals, ...world.props.flatMap((item) => item.portal ? [{ ...item.portal, point: item }] : [])]) {
    points.push(value.point);
    if (value.targetPoint) points.push(value.targetPoint);
    if (value.targetRoomId) roomRef(value.targetRoomId);
    if (!value.targetPoint && !value.targetRoomId && !value.href) fail("Portal has no destination");
  }
  for (const value of [...(world.interactionSlots ?? []), ...(world.npcActivityAnchors ?? [])]) {
    points.push(value.anchorPoint, value.approachPoint, value.exitPoint, ...(value.seatAttachmentPoint ? [value.seatAttachmentPoint] : []));
  }
  for (const slot of world.interactionSlots ?? []) {
    const target = rooms.get(slot.roomId);
    if (target && !within(target, { ...slot.anchorPoint, width: 0, height: 0 })) fail("Slot anchor outside room");
  }
  if (points.some((value) => !inBounds(value))) fail("Point outside world");
  const anchors = new Set((world.npcActivityAnchors ?? []).map((value) => value.id));
  for (const npc of world.npcs) if (npc.activityAnchorIds && (new Set(npc.activityAnchorIds).size !== npc.activityAnchorIds.length || npc.activityAnchorIds.some((value) => !anchors.has(value)))) fail("Invalid NPC anchor reference");
  for (const anchor of world.npcActivityAnchors ?? []) if (anchor.maxDurationMs < anchor.minDurationMs || (anchor.animation === "sit" && !anchor.seatAttachmentPoint)) fail("Invalid NPC activity");
  const zones = world.acousticZones ?? [];
  for (const [index, zone] of zones.entries()) {
    const target = rooms.get(zone.roomId);
    if (!target || !within(target, zone) || !within(bounds, zone)) fail("Acoustic zone outside its room");
    if (zones.slice(0, index).some((other) => Math.max(zone.x, other.x) < Math.min(zone.x + zone.width, other.x + other.width) && Math.max(zone.y, other.y) < Math.min(zone.y + zone.height, other.y + other.height))) fail("Acoustic zones overlap");
  }
  if (new TextEncoder().encode(JSON.stringify(world)).byteLength > 2 * 1024 * 1024) fail("World manifest exceeds byte budget");
});

export const studioWorldPublishSchema = z.object({
  expectedPublishedRevisionId: entityId.nullable(), manifest: studioWorldManifestSchema,
}).strict();
export const studioWorldPublicationSchema = z.object({
  contract: z.literal("studio-world-publication-v1"), workId: entityId, projectId: entityId, artifactId: entityId,
  revisionId: entityId, previousPublishedRevisionId: entityId.nullable(), contentHash: z.string().regex(/^[a-f0-9]{64}$/u),
  sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), publishedBy: entityId, publishedAt: z.string().datetime(),
  manifest: studioWorldManifestSchema,
}).strict();
export type StudioWorldManifest = z.infer<typeof studioWorldManifestSchema>;
export type StudioWorldPublish = z.infer<typeof studioWorldPublishSchema>;
export type StudioWorldPublication = z.infer<typeof studioWorldPublicationSchema>;
export type StudioWorldPublishResult = { readonly publication: StudioWorldPublication; readonly replayed: boolean };
