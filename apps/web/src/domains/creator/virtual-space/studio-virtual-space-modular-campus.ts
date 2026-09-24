import type * as Phaser from "phaser";

import { studioVirtualArtStyle, type StudioVirtualArtStyleKey } from "./studio-virtual-space-art-style";
import type { StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";

export const STUDIO_MODULAR_CAMPUS_WORLD_ID = "toonspectrum-master-studio";
export const STUDIO_MODULAR_CAMPUS_ASSET_KEY = "studio-modular-campus-v3";

interface CampusRenderable { destroy(): void }

function css(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

/**
 * The v4 campus is authored as a generated, high-resolution illustrated world base. Runtime
 * graphics therefore add semantic labels, interaction affordances and expansion gates only;
 * they must never repaint the illustration with flat rectangles or low-detail pseudo tiles.
 */
export function drawStudioModularCampus(
  scene: Phaser.Scene,
  manifest: StudioVirtualSpaceWorldManifest,
  artStyle: StudioVirtualArtStyleKey,
): readonly CampusRenderable[] {
  if (manifest.id !== STUDIO_MODULAR_CAMPUS_WORLD_ID || manifest.backgroundAssetKey !== STUDIO_MODULAR_CAMPUS_ASSET_KEY) return [];

  const created: CampusRenderable[] = [];
  const add = <T extends CampusRenderable>(item: T): T => { created.push(item); return item; };
  const profile = studioVirtualArtStyle(artStyle);
  const palette = profile.palette;
  const dark = artStyle === "neon" || artStyle === "retro";

  // Subtle semantic room bounds keep navigation readable without covering generated artwork.
  const bounds = add(scene.add.graphics().setDepth(-885));
  manifest.rooms.forEach((room, index) => {
    const isHub = room.id === "live" || room.id === "lobby";
    bounds.lineStyle(isHub ? 3 : 2, isHub ? palette.accent : palette.gate, isHub ? 0.25 : 0.095)
      .strokeRoundedRect(room.x + 4, room.y + 4, room.width - 8, room.height - 8, isHub ? 26 : 16);
    const label = add(scene.add.text(room.x + room.width / 2, room.y + 12, room.labelEn.toUpperCase(), {
      fontFamily: profile.pixelated ? "ui-monospace, SFMono-Regular, Menlo, monospace" : "Inter, Pretendard, sans-serif",
      fontSize: profile.pixelated ? "9px" : "10px",
      fontStyle: "bold",
      color: dark ? "#fbf7ff" : artStyle === "ink" ? "#222228" : "#302b36",
      backgroundColor: dark ? "#0a1020dd" : "#ffffffe0",
      padding: { x: 7, y: 3 },
    }).setOrigin(0.5, 0).setDepth(-874 + index));
    if (profile.pixelated) label.setResolution(1);
  });

  const detail = add(scene.add.graphics().setDepth(-870));
  // Central creator portal and the four explicit modular expansion gates.
  detail.lineStyle(5, palette.gate, 0.62).strokeCircle(780, 700, 38);
  detail.lineStyle(2, 0xffffff, dark ? 0.5 : 0.72).strokeCircle(780, 700, 22);
  detail.fillStyle(palette.accent, 0.62).fillCircle(780, 700, 8);

  const gate = (x: number, y: number, vertical: boolean, labelText: string) => {
    detail.lineStyle(5, palette.gate, 0.72);
    if (vertical) detail.strokeRoundedRect(x - 32, y - 10, 64, 20, 8);
    else detail.strokeRoundedRect(x - 10, y - 32, 20, 64, 8);
    add(scene.add.text(x, vertical ? y - 20 : y, labelText, {
      fontFamily: "Inter, Pretendard, sans-serif",
      fontSize: "9px",
      fontStyle: "bold",
      color: dark ? "#f7f4ff" : css(palette.wall),
      backgroundColor: dark ? "#070b18dd" : "#ffffffe0",
      padding: { x: 5, y: 2 },
    }).setOrigin(0.5, vertical ? 1 : 0.5).setDepth(-868));
  };
  gate(manifest.width / 2, 13, true, "NORTH · +");
  gate(13, manifest.height / 2, false, "WEST · +");
  gate(manifest.width - 13, manifest.height / 2, false, "EAST · +");
  gate(780, manifest.height - 13, true, "ENTER");

  return Object.freeze(created);
}
