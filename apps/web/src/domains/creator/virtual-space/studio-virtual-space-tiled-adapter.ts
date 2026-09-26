import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import type { StudioWorldNpcActivityAnchor } from "./studio-virtual-space-npc-activity";
import type { StudioWorldAcousticZoneDefinition } from "./studio-virtual-space-acoustics";
import { studioWorldTilemapFromTiled, type StudioTiledVisualLayer, type StudioTiledVisualMap } from "./studio-virtual-space-tiled-tiles";
import type {
  StudioVirtualSpaceWorldManifest,
  StudioWorldInteractionDefinition,
  StudioWorldInteractionSlotDefinition,
  StudioWorldOcclusionLayer,
  StudioWorldNpcDefinition,
  StudioWorldPortalDefinition,
  StudioWorldPropDefinition,
  StudioWorldRect,
  StudioWorldRoomDefinition,
  StudioWorldSpawnDefinition,
} from "./studio-virtual-space-world-manifest";

interface TiledProperty {
  readonly name: string;
  readonly value: unknown;
}
interface TiledObject {
  readonly id?: number;
  readonly name?: string;
  readonly type?: string;
  readonly class?: string;
  readonly polygon?: readonly StudioVirtualSpacePoint[];
  readonly polyline?: readonly StudioVirtualSpacePoint[];
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  readonly rotation?: number;
  readonly visible?: boolean;
  readonly properties?: readonly TiledProperty[];
}
interface TiledObjectLayer extends StudioTiledVisualLayer {
  readonly type: "objectgroup" | "group" | "imagelayer" | "tilelayer";
  readonly name: string;
  readonly visible?: boolean;
  readonly objects?: readonly TiledObject[];
  readonly layers?: readonly TiledObjectLayer[];
  readonly offsetx?: number;
  readonly offsety?: number;
  readonly properties?: readonly TiledProperty[];
}
export interface StudioTiledMapLike extends StudioTiledVisualMap {
  readonly width: number;
  readonly height: number;
  readonly tilewidth: number;
  readonly tileheight: number;
  readonly layers?: readonly TiledObjectLayer[];
  readonly properties?: readonly TiledProperty[];
}

function property(object: TiledObject, name: string): unknown {
  return object.properties?.find((item) => item.name === name)?.value;
}
function mapProperty(map: StudioTiledMapLike, name: string): unknown {
  return map.properties?.find((item) => item.name === name)?.value;
}
/** An explicitly present empty layer replaces content; only missing layers inherit defaults. */
function layerObjects(map: StudioTiledMapLike, layerName: string): readonly TiledObject[] | undefined {
  let found = false;
  const result: TiledObject[] = [];
  const visit = (layers: readonly TiledObjectLayer[], ox = 0, oy = 0, hidden = false, enabled = true, depth = 0) => {
    if (depth > 16) throw new Error("Tiled groups exceed maximum nesting depth");
    for (const layer of layers) {
      const x = ox + Number(layer.offsetx ?? 0);
      const y = oy + Number(layer.offsety ?? 0);
      const invisible = hidden || layer.visible === false;
      const active = enabled && layer.properties?.find((item) => item.name === "enabled")?.value !== false;
      if (layer.type === "group") {
        visit(layer.layers ?? [], x, y, invisible, active, depth + 1);
        continue;
      }
      if (layer.type !== "objectgroup" || layer.name !== layerName) continue;
      found = true;
      if (!active || ((layerName === "props" || layerName === "occlusion-layers" || layerName === "npc-activity-anchors") && invisible)) continue;
      for (const object of layer.objects ?? []) {
        if (property(object, "enabled") === false || ((layerName === "props" || layerName === "occlusion-layers" || layerName === "npc-activity-anchors") && object.visible === false)) continue;
        if (layerName === "colliders" && (object.polygon || object.polyline || Number(object.rotation ?? 0) !== 0)) {
          throw new Error("Arcade collision layers require axis-aligned rectangle objects");
        }
        result.push({ ...object, x: Number(object.x ?? 0) + x, y: Number(object.y ?? 0) + y });
        if (result.length > 4096) throw new Error("Tiled object budget exceeded");
      }
    }
  };
  visit(map.layers ?? []);
  return found ? result : undefined;
}
function rect(object: TiledObject): StudioWorldRect {
  return {
    x: Number(object.x ?? 0),
    y: Number(object.y ?? 0),
    width: Number(object.width ?? 0),
    height: Number(object.height ?? 0),
  };
}
function optionalNumber(value: unknown): number | undefined {
  if (value == null || value === "" || typeof value === "boolean") return undefined;
  const number = Number(value);
  return number;
}
function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function parsePatrol(value: unknown): readonly StudioVirtualSpacePoint[] | undefined {
  if (Array.isArray(value)) {
    const points = value
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const candidate = item as Record<string, unknown>;
        const x = optionalNumber(candidate.x);
        const y = optionalNumber(candidate.y);
        return x == null || y == null ? null : { x, y };
      })
      .filter((item): item is StudioVirtualSpacePoint => item !== null);
    return points.length ? points : undefined;
  }
  if (typeof value !== "string") return undefined;
  const points = value
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [xRaw, yRaw] = entry.split(",");
      const x = optionalNumber(xRaw);
      const y = optionalNumber(yRaw);
      return x == null || y == null ? null : { x, y };
    })
    .filter((item): item is StudioVirtualSpacePoint => item !== null);
  return points.length ? points : undefined;
}

export function studioWorldManifestFromTiled(
  map: StudioTiledMapLike,
  base: StudioVirtualSpaceWorldManifest,
): StudioVirtualSpaceWorldManifest {
  const tilemap = studioWorldTilemapFromTiled(map);
  const layers = new Map(["rooms", "colliders", "props", "interactions", "portals", "spawns", "npcs", "interaction-slots", "occlusion-layers", "npc-activity-anchors", "acoustic-zones"]
    .map((name) => [name, layerObjects(map, name)] as const));
  const objects = (name: string) => layers.get(name) ?? [];
  const rooms = objects("rooms").map((object): StudioWorldRoomDefinition => ({
    ...rect(object),
    id: String(property(object, "roomId") ?? object.name ?? "lounge"),
    labelKo: String(property(object, "labelKo") ?? object.name ?? ""),
    labelEn: String(property(object, "labelEn") ?? object.name ?? ""),
    descriptionKo: optionalString(property(object, "descriptionKo")),
    descriptionEn: optionalString(property(object, "descriptionEn")),
    action: optionalString(property(object, "action")) as StudioWorldRoomDefinition["action"],
  }));
  const colliders = objects("colliders").map(rect);
  const props = objects("props").map((object): StudioWorldPropDefinition => ({
    id: object.name ?? `prop-${object.id ?? 0}`,
    kind: String(property(object, "kind") ?? (object.class || object.type || "decor")) as StudioWorldPropDefinition["kind"],
    assetKey: optionalString(property(object, "assetKey")),
    assetUrl: optionalString(property(object, "assetUrl")),
    x: Number(object.x ?? 0),
    y: Number(object.y ?? 0),
    width: Number(object.width ?? 0) > 0 ? Number(object.width) : undefined,
    height: Number(object.height ?? 0) > 0 ? Number(object.height) : undefined,
    scale: optionalNumber(property(object, "scale")) ?? 1,
    rotation: optionalNumber(property(object, "rotation")) ?? optionalNumber(object.rotation) ?? 0,
    alpha: optionalNumber(property(object, "alpha")) ?? 1,
    originX: optionalNumber(property(object, "originX")) ?? (Number(object.width ?? 0) > 0 ? 0 : undefined),
    originY: optionalNumber(property(object, "originY")) ?? (Number(object.height ?? 0) > 0 ? 0 : undefined),
    depth: String(property(object, "depth") ?? "y-sort") as StudioWorldPropDefinition["depth"],
    fixedDepth: optionalNumber(property(object, "fixedDepth")),
    collider: property(object, "collider") === false || (
      property(object, "collider") !== true
      && (property(object, "kind") ?? (object.class || object.type || "decor")) === "decor"
    ) ? undefined : (
      Number(property(object, "colliderWidth") ?? object.width ?? 0) > 0
      && Number(property(object, "colliderHeight") ?? object.height ?? 0) > 0
        ? {
            x: Number(object.x ?? 0) + Number(property(object, "colliderX") ?? 0),
            y: Number(object.y ?? 0) + Number(property(object, "colliderY") ?? 0),
            width: Number(property(object, "colliderWidth") ?? object.width),
            height: Number(property(object, "colliderHeight") ?? object.height),
          }
        : undefined
    ),
    portal: String(property(object, "kind") ?? (object.class || object.type || "decor")) === "portal"
      ? {
          targetRoomId: optionalString(property(object, "targetRoomId")),
          targetPoint: property(object, "targetX") != null && property(object, "targetY") != null
            ? { x: Number(property(object, "targetX")), y: Number(property(object, "targetY")) }
            : undefined,
          href: optionalString(property(object, "href")),
        }
      : undefined,
    action: optionalString(property(object, "action")) as StudioWorldPropDefinition["action"],
    interactionRadius: optionalNumber(property(object, "interactionRadius")),
    labelKo: optionalString(property(object, "labelKo")),
    labelEn: optionalString(property(object, "labelEn")),
  }));
  const interactions = objects("interactions").map((object): StudioWorldInteractionDefinition => ({
    id: object.name ?? `interaction-${object.id ?? 0}`,
    zoneId: String(property(object, "roomId") ?? "lounge"),
    point: { x: Number(object.x ?? 0), y: Number(object.y ?? 0) },
    radius: optionalNumber(property(object, "radius"))
      ?? Math.max(Number(object.width || 80), Number(object.height || 80)) / 2,
    labelKo: String(property(object, "labelKo") ?? object.name ?? ""),
    labelEn: String(property(object, "labelEn") ?? object.name ?? ""),
    action: String(property(object, "action") ?? "community") as StudioWorldInteractionDefinition["action"],
  }));
  const portals = objects("portals").map((object): StudioWorldPortalDefinition => {
    const targetX = optionalNumber(property(object, "targetX"));
    const targetY = optionalNumber(property(object, "targetY"));
    return {
      id: object.name ?? `portal-${object.id ?? 0}`,
      point: { x: Number(object.x ?? 0), y: Number(object.y ?? 0) },
      radius: optionalNumber(property(object, "radius")) ?? 48,
      targetRoomId: optionalString(property(object, "targetRoomId")),
      targetPoint: targetX != null && targetY != null ? { x: targetX, y: targetY } : undefined,
      href: optionalString(property(object, "href")),
    };
  });
  const spawns = objects("spawns").map((object): StudioWorldSpawnDefinition => ({
    id: object.name ?? `spawn-${object.id ?? 0}`,
    point: { x: Number(object.x ?? 0), y: Number(object.y ?? 0) },
    facing: String(property(object, "facing") ?? "down") as StudioWorldSpawnDefinition["facing"],
  }));
  const npcs = objects("npcs").map((object): StudioWorldNpcDefinition => ({
    id: object.name ?? `npc-${object.id ?? 0}`,
    skinKey: String(property(object, "skinKey") ?? "pink"),
    point: { x: Number(object.x ?? 0), y: Number(object.y ?? 0) },
    roomId: String(property(object, "roomId") ?? "lounge"),
    facing: String(property(object, "facing") ?? "down") as StudioWorldNpcDefinition["facing"],
    scale: optionalNumber(property(object, "scale")) ?? 1,
    speed: optionalNumber(property(object, "speed")) ?? 72,
    behavior: String(property(object, "behavior") ?? "idle") as StudioWorldNpcDefinition["behavior"],
    patrol: parsePatrol(property(object, "patrol")),
    ...(property(object, "activityAnchorIds") === undefined ? {} : { activityAnchorIds: String(property(object, "activityAnchorIds")).split(";") }),
  }));

  const npcActivityAnchors = objects("npc-activity-anchors").map((object): StudioWorldNpcActivityAnchor => {
    if (Number(object.rotation ?? 0) !== 0) throw new Error("NPC activity anchors require unrotated floor points");
    const point = (prefix: string) => ({ x: Number(object.x ?? 0) + Number(property(object, `${prefix}OffsetX`)), y: Number(object.y ?? 0) + Number(property(object, `${prefix}OffsetY`)) });
    return { id: object.name ?? `npc-activity-${object.id ?? 0}`, roomId: String(property(object, "roomId") ?? ""),
      approachPoint: { x: Number(object.x ?? 0), y: Number(object.y ?? 0) }, anchorPoint: point("anchor"), exitPoint: point("exit"),
      facing: String(property(object, "facing") ?? "") as StudioWorldNpcActivityAnchor["facing"],
      activity: String(property(object, "activity") ?? "") as StudioWorldNpcActivityAnchor["activity"],
      animation: String(property(object, "animation") ?? "") as StudioWorldNpcActivityAnchor["animation"],
      minDurationMs: Number(property(object, "minDurationMs")), maxDurationMs: Number(property(object, "maxDurationMs")),
      ...(property(object, "seatOffsetX") !== undefined || property(object, "seatOffsetY") !== undefined ? { seatAttachmentPoint: point("seat") } : {}) };
  });
  const acousticZones = objects("acoustic-zones").map((object): StudioWorldAcousticZoneDefinition => {
    if (Number(object.rotation ?? 0) !== 0 || object.polygon || object.polyline) throw new Error("Acoustic zones require axis-aligned rectangles");
    return { id: object.name ?? `acoustic-${object.id ?? 0}`, ...rect(object), roomId: String(property(object, "roomId") ?? ""),
      policy: String(property(object, "policy") ?? "") as StudioWorldAcousticZoneDefinition["policy"],
      ...(property(object, "doorId") !== undefined ? { doorId: String(property(object, "doorId")) } : {}) };
  });

  const interactionSlots = objects("interaction-slots").map((object): StudioWorldInteractionSlotDefinition => ({
    id: object.name ?? `slot-${object.id ?? 0}`,
    roomId: String(property(object, "roomId") ?? ""),
    labelKo: String(property(object, "labelKo") ?? object.name ?? ""),
    labelEn: String(property(object, "labelEn") ?? object.name ?? ""),
    approachPoint: { x: Number(object.x ?? 0), y: Number(object.y ?? 0) },
    anchorPoint: { x: Number(property(object, "anchorX")), y: Number(property(object, "anchorY")) },
    ...(property(object, "seatX") !== undefined || property(object, "seatY") !== undefined
      ? { seatAttachmentPoint: { x: Number(property(object, "seatX")), y: Number(property(object, "seatY")) } } : {}),
    exitPoint: { x: Number(property(object, "exitX")), y: Number(property(object, "exitY")) },
    facing: String(property(object, "facing") ?? "") as StudioWorldInteractionSlotDefinition["facing"],
    radius: Number(property(object, "radius")),
  }));

  const occlusionLayers = objects("occlusion-layers").map((object): StudioWorldOcclusionLayer => {
    if (Number(object.rotation ?? 0) !== 0) throw new Error("Occlusion layers require unrotated world-space polygons");
    return { id: object.name ?? `occlusion-${object.id ?? 0}`, depth: Number(property(object, "depth")),
      polygon: Array.isArray(object.polygon) ? object.polygon.map((p) => ({ x: Number(object.x ?? 0) + Number(p.x), y: Number(object.y ?? 0) + Number(p.y) })) : [] };
  });
  const worldWidth = map.width * map.tilewidth;
  const worldHeight = map.height * map.tileheight;
  return {
    ...base,
    id: optionalString(mapProperty(map, "manifestId")) ?? base.id,
    version: optionalNumber(mapProperty(map, "manifestVersion")) ?? base.version,
    width: worldWidth,
    height: worldHeight,
    // 새 배경 가져오기에 이전 월드의 타일을 상속하지 않는다.
    tilemap,
    backgroundUrl: optionalString(mapProperty(map, "backgroundUrl")) ?? base.backgroundUrl,
    backgroundAssetKey: optionalString(mapProperty(map, "backgroundAssetKey")) ?? base.backgroundAssetKey,
    // A different image layer cannot inherit the previous draft's digest claims.
    assetIntegrity: typeof mapProperty(map, "assetIntegrity") === "string"
      ? JSON.parse(mapProperty(map, "assetIntegrity") as string) : undefined,
    interactionRules: typeof mapProperty(map, "interactionRules") === "string"
      ? JSON.parse(mapProperty(map, "interactionRules") as string) : undefined,
    rooms: layers.get("rooms") !== undefined ? rooms : base.rooms,
    colliders: layers.get("colliders") !== undefined ? colliders : base.colliders,
    props: layers.get("props") !== undefined ? props : base.props,
    interactions: layers.get("interactions") !== undefined ? interactions : base.interactions,
    portals: layers.get("portals") !== undefined ? portals : base.portals,
    spawns: layers.get("spawns") !== undefined ? spawns : base.spawns,
    npcs: layers.get("npcs") !== undefined ? npcs : layers.get("npc-activity-anchors") === undefined
      ? base.npcs.map((npc) => ({ ...npc, activityAnchorIds: undefined })) : base.npcs,
    interactionSlots,
    // Missing optional visual layers do not inherit a different background's furniture mask.
    occlusionLayers,
    npcActivityAnchors,
    // Missing geometry never inherits public-media access from another world.
    acousticZones,
  };
}
