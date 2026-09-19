import fs from "node:fs";
import path from "node:path";

import { DEFAULT_STUDIO_WORLD_MANIFEST as manifest } from "../apps/web/src/domains/creator/virtual-space/studio-virtual-space-world-manifest";

let objectId = 1;
let layerId = 1;

function properties(entries: Record<string, unknown>) {
  return Object.entries(entries)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([name, value]) => ({
      name,
      type: typeof value === "number" ? "float" : typeof value === "boolean" ? "bool" : "string",
      value,
    }));
}

function object(
  name: string,
  x: number,
  y: number,
  width = 0,
  height = 0,
  values: Record<string, unknown> = {},
) {
  return {
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
  };
}

function objectLayer(name: string, objects: unknown[]) {
  return {
    id: layerId++,
    name,
    type: "objectgroup",
    visible: true,
    opacity: 1,
    draworder: "topdown",
    x: 0,
    y: 0,
    objects,
  };
}

const layers = [
  {
    id: layerId++,
    name: "background",
    type: "imagelayer",
    image: "../reference/master-central-reference.jpg",
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
  objectLayer("colliders", manifest.colliders.map((collider, index) =>
    object("collider-" + String(index + 1), collider.x, collider.y, collider.width, collider.height)
  )),
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
      collider: false,
      action: prop.action,
      interactionRadius: prop.interactionRadius,
      labelKo: prop.labelKo,
      labelEn: prop.labelEn,
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
      patrol: npc.patrol?.map((point) => String(point.x) + "," + String(point.y)).join(";"),
    },
  ))),
];

const tiled = {
  compressionlevel: -1,
  height: manifest.height / 2,
  width: manifest.width / 2,
  tileheight: 2,
  tilewidth: 2,
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
  }),
  layers,
};

const output = path.resolve(
  "apps/web/public/assets/virtual-studio/world/default-world.json",
);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(tiled, null, 2) + "\n");
console.log(
  "Generated Virtual Studio Tiled world:",
  manifest.width,
  "x",
  manifest.height,
  "rooms=",
  manifest.rooms.length,
  "colliders=",
  manifest.colliders.length,
);
