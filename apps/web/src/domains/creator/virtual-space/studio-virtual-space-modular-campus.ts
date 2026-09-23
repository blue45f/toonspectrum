import type * as Phaser from "phaser";

import {
  studioVirtualArtStyle,
  type StudioVirtualArtStyleKey,
} from "./studio-virtual-space-art-style";
import type { StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";

export const STUDIO_MODULAR_CAMPUS_WORLD_ID = "toonspectrum-master-studio";
export const STUDIO_MODULAR_CAMPUS_ASSET_KEY = "studio-modular-campus-base";

interface CampusRenderable {
  destroy(): void;
}

function fillRounded(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: number,
  line: number,
  depth: number,
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setDepth(depth);
  g.fillStyle(fill, 1).fillRoundedRect(x, y, width, height, radius);
  g.lineStyle(2, line, 0.78).strokeRoundedRect(x, y, width, height, radius);
  return g;
}

function roomAccent(index: number, base: number): number {
  const shifts = [0x000000, 0x14002a, 0x002018, 0x251000, 0x001928, 0x240014, 0x102000, 0x151515];
  return (base ^ shifts[index % shifts.length]!) & 0xffffff;
}

export function drawStudioModularCampus(
  scene: Phaser.Scene,
  manifest: StudioVirtualSpaceWorldManifest,
  artStyle: StudioVirtualArtStyleKey,
): readonly CampusRenderable[] {
  if (manifest.id !== STUDIO_MODULAR_CAMPUS_WORLD_ID || manifest.backgroundAssetKey !== STUDIO_MODULAR_CAMPUS_ASSET_KEY) return [];

  const profile = studioVirtualArtStyle(artStyle);
  const p = profile.palette;
  const created: CampusRenderable[] = [];
  const add = <T extends CampusRenderable>(item: T): T => { created.push(item); return item; };

  const base = add(scene.add.graphics().setDepth(-950));
  base.fillStyle(p.background, 1).fillRect(0, 0, manifest.width, manifest.height);

  const tile = profile.pixelated ? 20 : 24;
  base.lineStyle(1, p.line, profile.pixelated ? 0.22 : 0.12);
  for (let x = 0; x <= manifest.width; x += tile) base.lineBetween(x, 0, x, manifest.height);
  for (let y = 0; y <= manifest.height; y += tile) base.lineBetween(0, y, manifest.width, y);

  const live = manifest.rooms.find((room) => room.id === "live");
  const hubX = live ? live.x + live.width / 2 : manifest.width / 2;
  const hubY = live ? live.y + live.height / 2 : manifest.height / 2;

  const paths = add(scene.add.graphics().setDepth(-940));
  paths.fillStyle(p.path, 1);
  paths.fillRoundedRect(hubX - 37, 0, 74, manifest.height, 18);
  paths.fillRoundedRect(0, hubY - 32, manifest.width, 64, 18);
  paths.lineStyle(1, p.line, 0.24);
  for (let y = 0; y < manifest.height; y += tile) paths.lineBetween(hubX - 37, y, hubX + 37, y);
  for (let x = 0; x < manifest.width; x += tile) paths.lineBetween(x, hubY - 32, x, hubY + 32);

  manifest.rooms.forEach((room, index) => {
    const isHub = room.id === "live";
    const roomFloor = roomAccent(index, p.room);
    const g = add(fillRounded(scene, room.x, room.y, room.width, room.height, isHub ? 26 : 16, roomFloor, p.wall, -920));
    if (isHub) {
      g.lineStyle(5, p.accent, 0.5).strokeCircle(hubX, hubY, Math.min(room.width, room.height) * 0.25);
      g.lineStyle(2, p.gate, 0.65).strokeCircle(hubX, hubY, Math.min(room.width, room.height) * 0.17);
    } else {
      const cx = room.x + room.width / 2;
      const cy = room.y + room.height / 2;
      const dx = hubX - cx;
      const dy = hubY - cy;
      g.fillStyle(p.floor, 1);
      if (Math.abs(dx) > Math.abs(dy)) {
        const doorY = cy - 22;
        const doorX = dx > 0 ? room.x + room.width - 5 : room.x - 5;
        g.fillRect(doorX, doorY, 10, 44);
      } else {
        const doorX = cx - 24;
        const doorY = dy > 0 ? room.y + room.height - 5 : room.y - 5;
        g.fillRect(doorX, doorY, 48, 10);
      }
    }

    const label = add(scene.add.text(room.x + 10, room.y + 9, room.labelEn.toUpperCase(), {
      fontFamily: "Inter, Pretendard, sans-serif",
      fontSize: profile.pixelated ? "9px" : "10px",
      fontStyle: "bold",
      color: artStyle === "neon" ? "#e6f6ff" : artStyle === "ink" ? "#27272d" : "#3b3340",
      backgroundColor: artStyle === "neon" ? "#0d1222cc" : "#ffffffb8",
      padding: { x: 6, y: 3 },
    }).setDepth(-910));
    if (profile.pixelated) label.setResolution(1);
  });

  const deco = add(scene.add.graphics().setDepth(-905));
  deco.fillStyle(p.plant, 0.9);
  const plantPoints = [
    [18, 88], [18, 210], [18, 590], [832, 92], [832, 214], [832, 592],
    [hubX - 92, hubY - 105], [hubX + 92, hubY - 105], [hubX - 94, hubY + 104], [hubX + 94, hubY + 104],
  ] as const;
  for (const [x, y] of plantPoints) {
    deco.fillCircle(x, y, 11).fillCircle(x - 7, y + 4, 7).fillCircle(x + 7, y + 4, 7);
  }
  deco.fillStyle(p.furniture, 0.78);
  for (const room of manifest.rooms) {
    if (room.id === "live") continue;
    const x = room.x + room.width / 2;
    const y = room.y + room.height / 2;
    deco.fillRoundedRect(x - 26, y - 11, 52, 22, 5);
    deco.lineStyle(2, p.line, 0.55).strokeRoundedRect(x - 26, y - 11, 52, 22, 5);
  }

  const gate = (x: number, y: number, vertical: boolean, label: string, entry = false) => {
    const g = add(scene.add.graphics().setDepth(-880));
    g.lineStyle(6, p.gate, 0.86);
    if (vertical) {
      g.strokeRoundedRect(x - 34, y - 12, 68, 24, 9);
      g.lineStyle(2, p.accent, 0.58).lineBetween(x, y - 18, x, y + 18);
    } else {
      g.strokeRoundedRect(x - 12, y - 34, 24, 68, 9);
      g.lineStyle(2, p.accent, 0.58).lineBetween(x - 18, y, x + 18, y);
    }
    const text = add(scene.add.text(
      vertical ? x : x + 18,
      vertical ? y - 24 : y,
      label,
      {
        fontFamily: "Inter, Pretendard, sans-serif",
        fontSize: "9px",
        fontStyle: "bold",
        color: artStyle === "neon" ? "#c8f7ff" : "#4a4050",
        backgroundColor: artStyle === "neon" ? "#09101ccc" : "#ffffffd0",
        padding: { x: 5, y: 2 },
      },
    ).setOrigin(vertical ? 0.5 : 0, vertical ? 1 : 0.5).setDepth(-875));
    if (entry) text.setText("ENTER · EXPAND");
  };

  gate(manifest.width / 2, 16, true, "NORTH · +");
  gate(16, manifest.height / 2, false, "WEST · +");
  gate(manifest.width - 16, manifest.height / 2, false, "EAST · +");
  gate(manifest.width / 2, manifest.height - 18, true, "ENTER", true);

  const entrance = add(scene.add.graphics().setDepth(-890));
  entrance.fillStyle(p.floorAlt, 0.9).fillRoundedRect(hubX - 54, manifest.height - 120, 108, 112, 18);
  entrance.lineStyle(2, p.gate, 0.62).strokeRoundedRect(hubX - 54, manifest.height - 120, 108, 112, 18);
  entrance.fillStyle(p.accent, 0.6);
  entrance.fillTriangle(hubX, manifest.height - 130, hubX - 12, manifest.height - 108, hubX + 12, manifest.height - 108);

  return Object.freeze(created);
}
