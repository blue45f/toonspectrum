import type * as Phaser from "phaser";

import {
  studioVirtualArtStyle,
  type StudioVirtualArtStyleKey,
  type StudioVirtualArtTextureKind,
} from "./studio-virtual-space-art-style";
import type { StudioVirtualSpaceWorldManifest, StudioWorldRoomDefinition } from "./studio-virtual-space-world-manifest";

export const STUDIO_MODULAR_CAMPUS_WORLD_ID = "toonspectrum-master-studio";
export const STUDIO_MODULAR_CAMPUS_ASSET_KEY = "studio-modular-campus-v3";

interface CampusRenderable { destroy(): void }
interface CampusLayer { readonly items: CampusRenderable[]; add<T extends CampusRenderable>(item: T): T }

function textureKey(style: StudioVirtualArtStyleKey, kind: StudioVirtualArtTextureKind): string {
  return `studio-style-${style}-${kind}`;
}

function layer(): CampusLayer {
  const items: CampusRenderable[] = [];
  return { items, add: <T extends CampusRenderable>(item: T) => { items.push(item); return item; } };
}

function colorCss(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

function roomAccent(index: number, base: number): number {
  const shifts = [0x000000, 0x0e1238, 0x123a20, 0x3b1a0c, 0x082e3a, 0x34102a, 0x263600, 0x202024];
  return (base ^ shifts[index % shifts.length]!) & 0xffffff;
}

function roundedMask(
  scene: Phaser.Scene,
  store: CampusLayer,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): Phaser.Display.Masks.GeometryMask {
  const maskGraphics = store.add(scene.add.graphics().setVisible(false));
  maskGraphics.fillStyle(0xffffff).fillRoundedRect(x, y, width, height, radius);
  return maskGraphics.createGeometryMask();
}

function tiledArea(
  scene: Phaser.Scene,
  store: CampusLayer,
  style: StudioVirtualArtStyleKey,
  kind: StudioVirtualArtTextureKind,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  depth: number,
): CampusRenderable | null {
  const key = textureKey(style, kind);
  if (!scene.textures.exists(key)) return null;
  const sprite = store.add(scene.add.tileSprite(x, y, width, height, key).setOrigin(0).setDepth(depth));
  const mask = roundedMask(scene, store, x, y, width, height, radius);
  sprite.setMask(mask);
  return sprite;
}

function addRoomLabel(
  scene: Phaser.Scene,
  store: CampusLayer,
  room: StudioWorldRoomDefinition,
  style: StudioVirtualArtStyleKey,
  index: number,
): void {
  const profile = studioVirtualArtStyle(style);
  const dark = style === "neon" || style === "retro";
  const label = store.add(scene.add.text(room.x + room.width / 2, room.y + 13, room.labelEn.toUpperCase(), {
    fontFamily: profile.pixelated ? "ui-monospace, SFMono-Regular, Menlo, monospace" : "Inter, Pretendard, sans-serif",
    fontSize: profile.pixelated ? "9px" : "11px",
    fontStyle: "bold",
    color: dark ? "#f7f5ff" : style === "ink" ? "#25252b" : "#342f3b",
    backgroundColor: dark ? "#111527d8" : "#ffffffd8",
    padding: { x: 8, y: 4 },
  }).setOrigin(.5, 0).setDepth(-870 + index));
  if (profile.pixelated) label.setResolution(1);
}

function drawRoomArchitecture(
  scene: Phaser.Scene,
  store: CampusLayer,
  manifest: StudioVirtualSpaceWorldManifest,
  room: StudioWorldRoomDefinition,
  style: StudioVirtualArtStyleKey,
  index: number,
): void {
  const profile = studioVirtualArtStyle(style), p = profile.palette;
  const radius = profile.pixelated ? 6 : style === "sky-island" ? 32 : 20;
  const cliff = style === "sky-island" ? 22 : style === "pastel" ? 10 : 6;
  const shadow = store.add(scene.add.graphics().setDepth(-936));
  if (style === "sky-island") {
    shadow.fillStyle(0x38566f, .36).fillRoundedRect(room.x - 8, room.y + cliff, room.width + 16, room.height + 18, radius + 7);
    shadow.fillStyle(0x6f8b63, .9).fillRoundedRect(room.x - 6, room.y + 10, room.width + 12, room.height + cliff, radius + 6);
    shadow.lineStyle(2, 0xb7e28b, .72).strokeRoundedRect(room.x - 6, room.y + 8, room.width + 12, room.height + 6, radius + 6);
    // Stylized waterfalls from the island edge make separated zones read as floating land.
    const falls = Math.max(1, Math.floor(room.width / 180));
    for (let n = 0; n < falls; n += 1) {
      const fx = room.x + room.width * (n + 1) / (falls + 1);
      shadow.fillStyle(p.water, .72).fillRoundedRect(fx - 7, room.y + room.height - 2, 14, 35 + (n % 2) * 14, 6);
      shadow.lineStyle(2, 0xe3fbff, .72).lineBetween(fx - 2, room.y + room.height + 2, fx - 2, room.y + room.height + 30);
    }
  } else if (style === "neon") {
    shadow.fillStyle(0x080c1b, .82).fillRoundedRect(room.x - 7, room.y + 9, room.width + 14, room.height + 10, radius);
    shadow.lineStyle(8, p.accent, .12).strokeRoundedRect(room.x - 7, room.y - 1, room.width + 14, room.height + 4, radius);
  } else {
    shadow.fillStyle(style === "ink" ? 0x77777c : 0x38334a, .18).fillRoundedRect(room.x - 5, room.y + cliff, room.width + 10, room.height + 7, radius);
  }

  const floor = store.add(scene.add.graphics().setDepth(-925));
  floor.fillStyle(roomAccent(index, p.room), 1).fillRoundedRect(room.x, room.y, room.width, room.height, radius);
  floor.lineStyle(style === "retro" ? 4 : 2, p.wall, style === "neon" ? .95 : .76)
    .strokeRoundedRect(room.x, room.y, room.width, room.height, radius);
  tiledArea(scene, store, style, "floor", room.x + 3, room.y + 3, room.width - 6, room.height - 6, Math.max(2, radius - 3), -923);

  const architecture = store.add(scene.add.graphics().setDepth(-900));
  // A readable façade line and a clear door toward the shared production corridor.
  architecture.fillStyle(p.wall, style === "neon" ? .8 : .54);
  architecture.fillRoundedRect(room.x + 12, room.y + 36, room.width - 24, 8, 4);
  const doorWidth = style === "retro" ? 42 : 52;
  const doorX = room.x + room.width / 2 - doorWidth / 2;
  architecture.fillStyle(p.path, 1).fillRoundedRect(doorX, room.y + room.height - 13, doorWidth, 18, 7);
  architecture.lineStyle(2, p.gate, .78).strokeRoundedRect(doorX, room.y + room.height - 13, doorWidth, 18, 7);

  // Different architectural silhouettes, not merely a global color filter.
  if (style === "sky-island") {
    const towerX = room.x + room.width - 42;
    architecture.fillStyle(0xfff4d4, .95).fillRoundedRect(towerX - 16, room.y + 18, 32, 45, 8);
    architecture.fillStyle(p.accent, .78).fillTriangle(towerX, room.y + 3, towerX - 21, room.y + 24, towerX + 21, room.y + 24);
    architecture.lineStyle(2, 0xffffff, .74).strokeCircle(towerX, room.y + 40, 6);
  } else if (style === "retro") {
    architecture.fillStyle(p.accent, .62);
    for (let x = room.x + 18; x < room.x + room.width - 12; x += 30) architecture.fillRect(x, room.y + 48, 14, 9);
  } else if (style === "pastel") {
    architecture.fillStyle(p.accent, .28).fillEllipse(room.x + room.width - 38, room.y + 32, 50, 34);
    architecture.lineStyle(2, 0xffffff, .8).strokeEllipse(room.x + room.width - 38, room.y + 32, 50, 34);
  } else if (style === "ink") {
    architecture.lineStyle(2, p.wall, .55);
    for (let x = room.x + 16; x < room.x + room.width; x += 12) architecture.lineBetween(x, room.y + 47, x - 8, room.y + 61);
  } else if (style === "neon") {
    architecture.lineStyle(3, p.gate, .9).strokeRoundedRect(room.x + 15, room.y + 49, room.width - 30, room.height - 70, 12);
  }

  addRoomLabel(scene, store, room, style, index);
}

function drawCampusPaths(
  scene: Phaser.Scene,
  store: CampusLayer,
  manifest: StudioVirtualSpaceWorldManifest,
  style: StudioVirtualArtStyleKey,
): void {
  const p = studioVirtualArtStyle(style).palette;
  const paths = store.add(scene.add.graphics().setDepth(-948));
  const segments = [
    [615, 0, 50, manifest.height],
    [0, 265, manifest.width, 30],
    [0, 545, manifest.width, 35],
    [0, 860, manifest.width, 38],
    [310, 0, 28, 850],
    [630, 0, 38, 940],
    [945, 0, 35, 850],
  ] as const;
  for (const [x, y, width, height] of segments) {
    paths.fillStyle(p.path, .96).fillRoundedRect(x, y, width, height, style === "retro" ? 3 : 14);
    paths.lineStyle(1, p.line, .34).strokeRoundedRect(x, y, width, height, style === "retro" ? 3 : 14);
    tiledArea(scene, store, style, "path", x, y, width, height, style === "retro" ? 3 : 14, -947);
  }
  // Production-flow arrows: lobby → planning/drawing → review/QC → release.
  paths.fillStyle(p.accent, .72);
  for (const [x, y, direction] of [[640, 825, -1], [640, 570, -1], [640, 285, -1], [965, 285, -1]] as const) {
    paths.fillTriangle(x - 8, y + 8 * direction, x + 8, y + 8 * direction, x, y - 8 * direction);
  }
}

function drawAmbientWorld(
  scene: Phaser.Scene,
  store: CampusLayer,
  manifest: StudioVirtualSpaceWorldManifest,
  style: StudioVirtualArtStyleKey,
): void {
  const profile = studioVirtualArtStyle(style), p = profile.palette;
  if (scene.textures.exists(textureKey(style, "water"))) {
    store.add(scene.add.tileSprite(0, 0, manifest.width, manifest.height, textureKey(style, "water")).setOrigin(0).setDepth(-970).setAlpha(style === "neon" ? .62 : .72));
  }
  const base = store.add(scene.add.graphics().setDepth(-969));
  if (style !== "sky-island") base.fillStyle(p.background, 1).fillRect(0, 0, manifest.width, manifest.height);
  if (style === "sky-island") {
    // Cloud banks establish the floating-island composition from the supplied reference direction.
    if (scene.textures.exists(textureKey(style, "cloud"))) {
      store.add(scene.add.tileSprite(0, 0, manifest.width, manifest.height, textureKey(style, "cloud")).setOrigin(0).setDepth(-968).setAlpha(.18));
    }
    for (const [x, y, scale] of [[50,90,1],[1190,130,.8],[40,500,.7],[1230,540,.9],[310,900,.7],[1040,910,.8]] as const) {
      base.fillStyle(0xffffff, .52).fillEllipse(x, y, 180 * scale, 64 * scale);
    }
  }
}

function drawCampusDetails(
  scene: Phaser.Scene,
  store: CampusLayer,
  manifest: StudioVirtualSpaceWorldManifest,
  style: StudioVirtualArtStyleKey,
): void {
  const p = studioVirtualArtStyle(style).palette;
  const detail = store.add(scene.add.graphics().setDepth(-880));
  // Central portal/fountain.
  detail.fillStyle(p.water, .82).fillCircle(780, 700, 34);
  detail.lineStyle(5, p.gate, .72).strokeCircle(780, 700, 41);
  detail.lineStyle(2, 0xffffff, .72).strokeCircle(780, 700, 22);
  detail.fillStyle(p.accent, .62).fillCircle(780, 700, 10);

  const plants = [
    [65,65],[288,65],[65,230],[288,230],[365,65],[590,65],[690,65],[920,65],[995,65],[1215,65],
    [65,325],[290,510],[365,325],[605,510],[695,325],[935,510],[1015,325],[1215,510],
    [65,615],[315,825],[390,615],[590,750],[965,615],[1215,825],[660,610],[900,610],
  ] as const;
  for (const [x, y] of plants) {
    detail.fillStyle(p.plant, .92).fillCircle(x, y, 11).fillCircle(x - 7, y + 5, 7).fillCircle(x + 7, y + 5, 7);
    detail.fillStyle(p.furniture, .75).fillRect(x - 3, y + 9, 6, 10);
  }

  // Four visible expansion gates preserve future modular floors.
  const gate = (x: number, y: number, vertical: boolean, label: string) => {
    detail.lineStyle(6, p.gate, .88);
    if (vertical) detail.strokeRoundedRect(x - 34, y - 12, 68, 24, 9);
    else detail.strokeRoundedRect(x - 12, y - 34, 24, 68, 9);
    store.add(scene.add.text(x, y - (vertical ? 24 : 0), label, {
      fontFamily: "Inter, Pretendard, sans-serif", fontSize: "9px", fontStyle: "bold",
      color: style === "neon" || style === "retro" ? "#f8f4ff" : colorCss(p.wall),
      backgroundColor: style === "neon" ? "#070b18db" : "#ffffffe0", padding: { x: 5, y: 2 },
    }).setOrigin(.5, vertical ? 1 : .5).setDepth(-875));
  };
  gate(manifest.width / 2, 13, true, "NORTH · +");
  gate(13, manifest.height / 2, false, "WEST · +");
  gate(manifest.width - 13, manifest.height / 2, false, "EAST · +");
  gate(780, manifest.height - 13, true, "ENTER");
}

export function drawStudioModularCampus(
  scene: Phaser.Scene,
  manifest: StudioVirtualSpaceWorldManifest,
  artStyle: StudioVirtualArtStyleKey,
): readonly CampusRenderable[] {
  if (manifest.id !== STUDIO_MODULAR_CAMPUS_WORLD_ID || manifest.backgroundAssetKey !== STUDIO_MODULAR_CAMPUS_ASSET_KEY) return [];
  const store = layer();
  drawAmbientWorld(scene, store, manifest, artStyle);
  drawCampusPaths(scene, store, manifest, artStyle);
  manifest.rooms.forEach((room, index) => drawRoomArchitecture(scene, store, manifest, room, artStyle, index));
  drawCampusDetails(scene, store, manifest, artStyle);
  return Object.freeze(store.items);
}
