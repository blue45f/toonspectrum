import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import type {
  StudioVirtualSpaceWorldManifest,
  StudioWorldInteractionDefinition,
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
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  readonly rotation?: number;
  readonly visible?: boolean;
  readonly properties?: readonly TiledProperty[];
}
interface TiledObjectLayer {
  readonly type: "objectgroup";
  readonly name: string;
  readonly visible?: boolean;
  readonly objects?: readonly TiledObject[];
}
export interface StudioTiledMapLike {
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
function objects(map: StudioTiledMapLike, layerName: string): readonly TiledObject[] {
  return map.layers?.find((layer) =>
    layer.type === "objectgroup"
    && layer.name === layerName
    && layer.visible !== false
  )?.objects?.filter((object) => object.visible !== false) ?? [];
}
function rect(object: TiledObject): StudioWorldRect {
  return {
    x: Number(object.x ?? 0),
    y: Number(object.y ?? 0),
    width: Math.max(0, Number(object.width ?? 0)),
    height: Math.max(0, Number(object.height ?? 0)),
  };
}
function optionalNumber(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
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
  const rooms = objects(map, "rooms").map((object): StudioWorldRoomDefinition => ({
    ...rect(object),
    id: String(property(object, "roomId") ?? object.name ?? "lounge"),
    labelKo: String(property(object, "labelKo") ?? object.name ?? ""),
    labelEn: String(property(object, "labelEn") ?? object.name ?? ""),
    descriptionKo: optionalString(property(object, "descriptionKo")),
    descriptionEn: optionalString(property(object, "descriptionEn")),
    action: optionalString(property(object, "action")) as StudioWorldRoomDefinition["action"],
  }));
  const colliders = objects(map, "colliders").map(rect);
  const props = objects(map, "props").map((object): StudioWorldPropDefinition => ({
    id: object.name ?? `prop-${object.id ?? 0}`,
    kind: String(property(object, "kind") ?? "decor") as StudioWorldPropDefinition["kind"],
    assetKey: optionalString(property(object, "assetKey")),
    assetUrl: optionalString(property(object, "assetUrl")),
    x: Number(object.x ?? 0),
    y: Number(object.y ?? 0),
    width: Number(object.width ?? 0) > 0 ? Number(object.width) : undefined,
    height: Number(object.height ?? 0) > 0 ? Number(object.height) : undefined,
    scale: optionalNumber(property(object, "scale")) ?? 1,
    rotation: optionalNumber(property(object, "rotation")) ?? optionalNumber(object.rotation) ?? 0,
    alpha: optionalNumber(property(object, "alpha")) ?? 1,
    originX: optionalNumber(property(object, "originX")),
    originY: optionalNumber(property(object, "originY")),
    depth: String(property(object, "depth") ?? "y-sort") as StudioWorldPropDefinition["depth"],
    fixedDepth: optionalNumber(property(object, "fixedDepth")),
    collider: property(object, "collider") === false ? undefined : (
      Number(object.width ?? 0) > 0 && Number(object.height ?? 0) > 0
        ? rect(object)
        : undefined
    ),
    action: optionalString(property(object, "action")) as StudioWorldPropDefinition["action"],
    interactionRadius: optionalNumber(property(object, "interactionRadius")),
    labelKo: optionalString(property(object, "labelKo")),
    labelEn: optionalString(property(object, "labelEn")),
  }));
  const interactions = objects(map, "interactions").map((object): StudioWorldInteractionDefinition => ({
    id: object.name ?? `interaction-${object.id ?? 0}`,
    zoneId: String(property(object, "roomId") ?? "lounge"),
    point: { x: Number(object.x ?? 0), y: Number(object.y ?? 0) },
    radius: Math.max(
      1,
      optionalNumber(property(object, "radius"))
        ?? Math.max(Number(object.width ?? 80), Number(object.height ?? 80)) / 2,
    ),
    labelKo: String(property(object, "labelKo") ?? object.name ?? ""),
    labelEn: String(property(object, "labelEn") ?? object.name ?? ""),
    action: String(property(object, "action") ?? "community") as StudioWorldInteractionDefinition["action"],
  }));
  const portals = objects(map, "portals").map((object): StudioWorldPortalDefinition => {
    const targetX = optionalNumber(property(object, "targetX"));
    const targetY = optionalNumber(property(object, "targetY"));
    return {
      id: object.name ?? `portal-${object.id ?? 0}`,
      point: { x: Number(object.x ?? 0), y: Number(object.y ?? 0) },
      radius: Math.max(1, optionalNumber(property(object, "radius")) ?? 48),
      targetRoomId: optionalString(property(object, "targetRoomId")),
      targetPoint: targetX != null && targetY != null ? { x: targetX, y: targetY } : undefined,
      href: optionalString(property(object, "href")),
    };
  });
  const spawns = objects(map, "spawns").map((object): StudioWorldSpawnDefinition => ({
    id: object.name ?? `spawn-${object.id ?? 0}`,
    point: { x: Number(object.x ?? 0), y: Number(object.y ?? 0) },
    facing: String(property(object, "facing") ?? "down") as StudioWorldSpawnDefinition["facing"],
  }));
  const npcs = objects(map, "npcs").map((object): StudioWorldNpcDefinition => ({
    id: object.name ?? `npc-${object.id ?? 0}`,
    skinKey: String(property(object, "skinKey") ?? "pink"),
    point: { x: Number(object.x ?? 0), y: Number(object.y ?? 0) },
    roomId: String(property(object, "roomId") ?? "lounge"),
    facing: String(property(object, "facing") ?? "down") as StudioWorldNpcDefinition["facing"],
    scale: optionalNumber(property(object, "scale")) ?? 1,
    speed: optionalNumber(property(object, "speed")) ?? 72,
    behavior: String(property(object, "behavior") ?? "idle") as StudioWorldNpcDefinition["behavior"],
    patrol: parsePatrol(property(object, "patrol")),
  }));

  const worldWidth = Math.max(1, map.width * map.tilewidth);
  const worldHeight = Math.max(1, map.height * map.tileheight);
  return {
    ...base,
    version: base.version + 1,
    width: worldWidth,
    height: worldHeight,
    backgroundUrl: optionalString(mapProperty(map, "backgroundUrl")) ?? base.backgroundUrl,
    backgroundAssetKey: optionalString(mapProperty(map, "backgroundAssetKey")) ?? base.backgroundAssetKey,
    rooms: rooms.length ? rooms : base.rooms,
    colliders: colliders.length ? colliders : base.colliders,
    props: props.length ? props : base.props,
    interactions: interactions.length ? interactions : base.interactions,
    portals: portals.length ? portals : base.portals,
    spawns: spawns.length ? spawns : base.spawns,
    npcs: npcs.length ? npcs : base.npcs,
  };
}
