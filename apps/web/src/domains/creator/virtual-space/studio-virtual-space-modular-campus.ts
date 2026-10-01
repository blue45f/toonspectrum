import type * as Phaser from "phaser";

import { studioVirtualArtStyle, type StudioVirtualArtStyleKey } from "./studio-virtual-space-art-style";
import type { StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";
import type { StudioOfficeZoneType } from "./studio-virtual-space-office-zones";

export const STUDIO_MODULAR_CAMPUS_WORLD_ID = "toonstudio-master-studio";
export const STUDIO_MODULAR_CAMPUS_ASSET_KEY = "studio-modular-campus-v3";

interface CampusRenderable { destroy(): void }

function css(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

/**
 * 오피스 존 바닥/벽 비주얼 데이터 (Track D).
 *
 * 존 종류별 바닥 패턴 키·바닥 톤 힌트·벽 악센트 색상. 순수 데이터로만
 * 제공되며, 렌더러는 일러스트를 덧칠하지 않고 기존 룸 경계선(outline)의
 * 색상 선택에만 사용한다. 실제 fill 덧칠은 파일 헤더 제약상 금지된다.
 */
export interface StudioOfficeZoneFloorVisual {
  /** 바닥 패턴 키 (렌더러가 질감 선택에 쓰는 태그, 직접 그리지 않음). */
  readonly floorPattern: "herringbone" | "tatami" | "carpet" | "marble" | "wood" | "grid" | "moss" | "stage" | "sand";
  /** 바닥 톤 힌트 (hex). */
  readonly floorTint: string;
  /** 벽 악센트 색상 (hex, 존 경계선에만 사용). */
  readonly wallAccent: string;
}

export const STUDIO_OFFICE_ZONE_FLOOR_VISUALS: Record<StudioOfficeZoneType, StudioOfficeZoneFloorVisual> = Object.freeze({
  lobby:          { floorPattern: "marble",      floorTint: "#f5efe2", wallAccent: "#d9a441" },
  reception:      { floorPattern: "marble",      floorTint: "#f8f3e8", wallAccent: "#cfa14d" },
  "meeting-room": { floorPattern: "wood",        floorTint: "#e8dfcf", wallAccent: "#7c6cf0" },
  "event-hall":   { floorPattern: "stage",       floorTint: "#f2e3c2", wallAccent: "#e07840" },
  lounge:         { floorPattern: "carpet",      floorTint: "#efe6d8", wallAccent: "#b07a4f" },
  cafe:           { floorPattern: "herringbone", floorTint: "#e9d9c0", wallAccent: "#a4682f" },
  "focus-zone":   { floorPattern: "tatami",      floorTint: "#dfe4d2", wallAccent: "#5b7f6b" },
  "phone-booth":  { floorPattern: "grid",        floorTint: "#e2e2ec", wallAccent: "#6b6fae" },
  studio:         { floorPattern: "grid",        floorTint: "#e8e8e8", wallAccent: "#3f7fbf" },
  library:        { floorPattern: "wood",        floorTint: "#e4d8c4", wallAccent: "#8a6f4d" },
});

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** 존 종류의 바닥/벽 비주얼 조회. */
export function studioOfficeZoneFloorVisual(type: StudioOfficeZoneType): StudioOfficeZoneFloorVisual {
  return STUDIO_OFFICE_ZONE_FLOOR_VISUALS[type];
}

/**
 * 룸의 존 매칭 결과 → 경계선(outline) 스타일.
 * 존이 매칭되면 해당 존의 벽 악센트 색상을 낮은 투명도로 사용한다.
 * 일러스트 덧칠(fill)은 하지 않는다 — 기존 subtle bounds 패턴 유지.
 */
export function studioRoomBoundsLineStyleFor(
  roomId: string,
  zones: readonly { readonly roomId?: string; readonly type: StudioOfficeZoneType }[] | undefined,
  palette: { readonly accent: number; readonly gate: number },
): { readonly width: number; readonly color: number; readonly alpha: number } {
  const isHub = roomId === "live" || roomId === "lobby";
  if (isHub) return { width: 1.5, color: palette.accent, alpha: 0.08 };
  const matched = zones?.filter((zone) => zone.roomId === roomId) ?? [];
  if (matched.length === 0) return { width: 1, color: palette.gate, alpha: 0.025 };
  const first = matched[0]!;
  const visual = STUDIO_OFFICE_ZONE_FLOOR_VISUALS[first.type];
  const parsed = Number.parseInt(visual.wallAccent.slice(1), 16);
  const color = HEX_COLOR.test(visual.wallAccent) ? parsed : palette.gate;
  // 여러 존이 겹치는 룸은 선을 살짝 두껍게 해 가독성을 확보한다.
  return { width: matched.length > 1 ? 1.25 : 1, color, alpha: 0.06 };
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
  // Track D: manifest.zones에 매칭되는 룸은 존 벽 악센트 색상으로 경계선을 그린다 (outline만, fill 덧칠 금지).
  const bounds = add(scene.add.graphics().setDepth(-885));
  manifest.rooms.forEach((room, index) => {
    const line = studioRoomBoundsLineStyleFor(room.id, manifest.zones, palette);
    bounds.lineStyle(line.width, line.color, line.alpha)
      .strokeRoundedRect(room.x + 4, room.y + 4, room.width - 8, room.height - 8, room.id === "live" || room.id === "lobby" ? 26 : 16);
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
  // A compact landmark keeps the central plaza readable without covering the generated art.
  detail.lineStyle(2, palette.gate, 0.32).strokeCircle(780, 700, 22);
  detail.lineStyle(1, 0xffffff, dark ? 0.24 : 0.34).strokeCircle(780, 700, 12);
  detail.fillStyle(palette.accent, 0.42).fillCircle(780, 700, 4);

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
