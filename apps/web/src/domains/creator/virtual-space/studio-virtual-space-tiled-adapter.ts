import type {
  StudioVirtualSpaceWorldManifest,
  StudioWorldInteractionDefinition,
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
  readonly properties?: readonly TiledProperty[];
}
interface TiledObjectLayer {
  readonly type: "objectgroup";
  readonly name: string;
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
function objects(map: StudioTiledMapLike, layerName: string): readonly TiledObject[] {
  return map.layers?.find((layer) => layer.type === "objectgroup" && layer.name === layerName)?.objects ?? [];
}
function rect(object: TiledObject): StudioWorldRect {
  return { x: object.x ?? 0, y: object.y ?? 0, width: object.width ?? 0, height: object.height ?? 0 };
}

export function studioWorldManifestFromTiled(
  map: StudioTiledMapLike,
  base: StudioVirtualSpaceWorldManifest,
): StudioVirtualSpaceWorldManifest {
  const rooms = objects(map, "rooms").map((object): StudioWorldRoomDefinition => ({
    ...rect(object),
    id: String(property(object, "roomId") ?? object.name ?? "lounge") as StudioWorldRoomDefinition["id"],
    labelKo: String(property(object, "labelKo") ?? object.name ?? ""),
    labelEn: String(property(object, "labelEn") ?? object.name ?? ""),
  }));
  const colliders = objects(map, "colliders").map(rect);
  const props = objects(map, "props").map((object): StudioWorldPropDefinition => ({
    id: object.name ?? `prop-${object.id ?? 0}`,
    kind: String(property(object, "kind") ?? "decor") as StudioWorldPropDefinition["kind"],
    assetKey: String(property(object, "assetKey") ?? "") || undefined,
    x: object.x ?? 0,
    y: object.y ?? 0,
    scale: Number(property(object, "scale") ?? 1),
    depth: String(property(object, "depth") ?? "y-sort") as StudioWorldPropDefinition["depth"],
    collider: property(object, "collider") === false ? undefined : rect(object),
    action: property(object, "action") as StudioWorldPropDefinition["action"],
  }));
  const interactions = objects(map, "interactions").map((object): StudioWorldInteractionDefinition => ({
    id: object.name ?? `interaction-${object.id ?? 0}`,
    zoneId: String(property(object, "roomId") ?? "lounge") as StudioWorldInteractionDefinition["zoneId"],
    point: { x: object.x ?? 0, y: object.y ?? 0 },
    radius: Number(property(object, "radius") ?? Math.max(object.width ?? 80, object.height ?? 80) / 2),
    labelKo: String(property(object, "labelKo") ?? object.name ?? ""),
    labelEn: String(property(object, "labelEn") ?? object.name ?? ""),
    action: String(property(object, "action") ?? "community") as StudioWorldInteractionDefinition["action"],
  }));
  const portals = objects(map, "portals").map((object): StudioWorldPortalDefinition => ({
    id: object.name ?? `portal-${object.id ?? 0}`,
    point: { x: object.x ?? 0, y: object.y ?? 0 },
    radius: Number(property(object, "radius") ?? 48),
    targetRoomId: property(object, "targetRoomId") as StudioWorldPortalDefinition["targetRoomId"],
    targetPoint: property(object, "targetX") != null
      ? { x: Number(property(object, "targetX")), y: Number(property(object, "targetY")) }
      : undefined,
    href: property(object, "href") ? String(property(object, "href")) : undefined,
  }));
  const spawns = objects(map, "spawns").map((object): StudioWorldSpawnDefinition => ({
    id: object.name ?? `spawn-${object.id ?? 0}`,
    point: { x: object.x ?? 0, y: object.y ?? 0 },
    facing: String(property(object, "facing") ?? "down") as StudioWorldSpawnDefinition["facing"],
  }));

  return {
    ...base,
    version: base.version + 1,
    width: map.width * map.tilewidth,
    height: map.height * map.tileheight,
    rooms: rooms.length ? rooms : base.rooms,
    colliders: colliders.length ? colliders : base.colliders,
    props: props.length ? props : base.props,
    interactions: interactions.length ? interactions : base.interactions,
    portals: portals.length ? portals : base.portals,
    spawns: spawns.length ? spawns : base.spawns,
  };
}
