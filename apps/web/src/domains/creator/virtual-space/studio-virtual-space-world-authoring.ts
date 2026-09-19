import {
  studioWorldManifestFromTiled,
  type StudioTiledMapLike,
} from "./studio-virtual-space-tiled-adapter";
import {
  validateStudioWorldManifest,
  type StudioVirtualSpaceWorldManifest,
} from "./studio-virtual-space-world-manifest";

const WORLD_DRAFT_PREFIX = "toonspectrum:virtual-studio-world-draft:v1";

interface TiledProperty {
  readonly name: string;
  readonly type: "string" | "float" | "bool";
  readonly value: unknown;
}

function properties(values: Record<string, unknown>): readonly TiledProperty[] {
  return Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([name, value]) => ({
      name,
      type: typeof value === "number" ? "float" : typeof value === "boolean" ? "bool" : "string",
      value,
    }));
}

export function studioWorldDraftStorageKey(projectId: string): string {
  return `${WORLD_DRAFT_PREFIX}:${projectId}`;
}

export function readStudioWorldAuthoringDraft(
  projectId: string,
): StudioVirtualSpaceWorldManifest | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(studioWorldDraftStorageKey(projectId));
    if (!raw) return null;
    const candidate = JSON.parse(raw) as StudioVirtualSpaceWorldManifest;
    return validateStudioWorldManifest(candidate).length === 0 ? candidate : null;
  } catch {
    return null;
  }
}

export function writeStudioWorldAuthoringDraft(
  projectId: string,
  manifest: StudioVirtualSpaceWorldManifest,
): boolean {
  if (typeof localStorage === "undefined") return false;
  if (validateStudioWorldManifest(manifest).length > 0) return false;
  try {
    localStorage.setItem(studioWorldDraftStorageKey(projectId), JSON.stringify(manifest));
    return true;
  } catch {
    return false;
  }
}

export function clearStudioWorldAuthoringDraft(projectId: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(studioWorldDraftStorageKey(projectId));
  } catch {
    // Storage can be blocked in privacy-restricted contexts.
  }
}

export function studioWorldManifestToTiledMap(
  manifest: StudioVirtualSpaceWorldManifest,
): Record<string, unknown> {
  let objectId = 1;
  let layerId = 1;
  const object = (
    name: string,
    x: number,
    y: number,
    width = 0,
    height = 0,
    values: Record<string, unknown> = {},
  ) => ({
    id: objectId++,
    name,
    type: "",
    x,
    y,
    width,
    height,
    rotation: 0,
    visible: true,
    properties: properties(values),
  });
  const objectLayer = (name: string, objects: readonly unknown[]) => ({
    id: layerId++,
    name,
    type: "objectgroup",
    visible: true,
    opacity: 1,
    draworder: "topdown",
    x: 0,
    y: 0,
    objects,
  });

  const layers: unknown[] = [
    {
      id: layerId++,
      name: "background",
      type: "imagelayer",
      image: manifest.backgroundUrl,
      x: 0,
      y: 0,
      opacity: 1,
      visible: true,
    },
    objectLayer("rooms", manifest.rooms.map((room) => object(
      room.id,
      room.x,
      room.y,
      room.width,
      room.height,
      {
        roomId: room.id,
        labelKo: room.labelKo,
        labelEn: room.labelEn,
        descriptionKo: room.descriptionKo,
        descriptionEn: room.descriptionEn,
        action: room.action,
      },
    ))),
    objectLayer("colliders", manifest.colliders.map((collider, index) => object(
      `collider-${index + 1}`,
      collider.x,
      collider.y,
      collider.width,
      collider.height,
    ))),
    objectLayer("props", manifest.props.map((prop) => object(
      prop.id,
      prop.x,
      prop.y,
      prop.width ?? 0,
      prop.height ?? 0,
      {
        kind: prop.kind,
        assetKey: prop.assetKey,
        assetUrl: prop.assetUrl,
        scale: prop.scale,
        depth: prop.depth,
        fixedDepth: prop.fixedDepth,
        rotation: prop.rotation,
        alpha: prop.alpha,
        originX: prop.originX,
        originY: prop.originY,
        collider: Boolean(prop.collider),
        colliderX: prop.collider ? prop.collider.x - prop.x : undefined,
        colliderY: prop.collider ? prop.collider.y - prop.y : undefined,
        colliderWidth: prop.collider?.width,
        colliderHeight: prop.collider?.height,
        action: prop.action,
        interactionRadius: prop.interactionRadius,
        labelKo: prop.labelKo,
        labelEn: prop.labelEn,
        targetRoomId: prop.portal?.targetRoomId,
        targetX: prop.portal?.targetPoint?.x,
        targetY: prop.portal?.targetPoint?.y,
        href: prop.portal?.href,
      },
    ))),
    objectLayer("interactions", manifest.interactions.map((interaction) => object(
      interaction.id,
      interaction.point.x,
      interaction.point.y,
      0,
      0,
      {
        roomId: interaction.zoneId,
        radius: interaction.radius,
        labelKo: interaction.labelKo,
        labelEn: interaction.labelEn,
        action: interaction.action,
      },
    ))),
    objectLayer("portals", manifest.portals.map((portal) => object(
      portal.id,
      portal.point.x,
      portal.point.y,
      0,
      0,
      {
        radius: portal.radius,
        targetRoomId: portal.targetRoomId,
        targetX: portal.targetPoint?.x,
        targetY: portal.targetPoint?.y,
        href: portal.href,
      },
    ))),
    objectLayer("spawns", manifest.spawns.map((spawn) => object(
      spawn.id,
      spawn.point.x,
      spawn.point.y,
      0,
      0,
      { facing: spawn.facing },
    ))),
    objectLayer("occlusion-layers", (manifest.occlusionLayers ?? []).map((layer) => ({
      ...object(layer.id, 0, 0, 0, 0, { depth: layer.depth }), polygon: layer.polygon,
    }))),
    objectLayer("interaction-slots", (manifest.interactionSlots ?? []).map((slot) => object(
      slot.id, slot.approachPoint.x, slot.approachPoint.y, 0, 0,
      { roomId: slot.roomId, labelKo: slot.labelKo, labelEn: slot.labelEn,
        anchorX: slot.anchorPoint.x, anchorY: slot.anchorPoint.y, exitX: slot.exitPoint.x, exitY: slot.exitPoint.y,
        ...(slot.seatAttachmentPoint ? { seatX: slot.seatAttachmentPoint.x, seatY: slot.seatAttachmentPoint.y } : {}),
        facing: slot.facing, radius: slot.radius },
    ))),
    objectLayer("npcs", manifest.npcs.map((npc) => object(
      npc.id,
      npc.point.x,
      npc.point.y,
      0,
      0,
      {
        skinKey: npc.skinKey,
        roomId: npc.roomId,
        facing: npc.facing,
        scale: npc.scale,
        speed: npc.speed,
        behavior: npc.behavior,
        patrol: npc.patrol?.map((point) => `${point.x},${point.y}`).join(";"),
      },
    ))),
  ];

  return {
    compressionlevel: -1,
    height: manifest.height,
    width: manifest.width,
    tileheight: 1,
    tilewidth: 1,
    infinite: false,
    orientation: "orthogonal",
    renderorder: "right-down",
    type: "map",
    version: "1.10",
    tiledversion: "1.11.2",
    nextlayerid: layerId,
    nextobjectid: objectId,
    properties: properties({
      backgroundUrl: manifest.backgroundUrl,
      backgroundAssetKey: manifest.backgroundAssetKey,
      manifestVersion: manifest.version,
      manifestId: manifest.id,
    }),
    layers,
  };
}

function isTiledMap(value: unknown): value is StudioTiledMapLike {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return Number.isFinite(candidate.width)
    && Number.isFinite(candidate.height)
    && Number.isFinite(candidate.tilewidth)
    && Number.isFinite(candidate.tileheight);
}

function isManifestShape(value: unknown): value is StudioVirtualSpaceWorldManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === "string"
    && Number.isFinite(candidate.width)
    && Number.isFinite(candidate.height)
    && Array.isArray(candidate.rooms)
    && Array.isArray(candidate.props)
    && Array.isArray(candidate.colliders)
    && Array.isArray(candidate.interactions)
    && Array.isArray(candidate.portals)
    && Array.isArray(candidate.spawns)
    && Array.isArray(candidate.npcs);
}

export function parseStudioWorldAuthoringImport(
  raw: string,
  base: StudioVirtualSpaceWorldManifest,
): StudioVirtualSpaceWorldManifest {
  const parsed: unknown = JSON.parse(raw);
  const manifest = isTiledMap(parsed)
    ? studioWorldManifestFromTiled(parsed, base)
    : isManifestShape(parsed)
      ? parsed
      : null;
  if (!manifest) throw new Error("Unsupported world JSON format");
  const errors = validateStudioWorldManifest(manifest);
  if (errors.length > 0) throw new Error(errors.join("\n"));
  return manifest;
}
