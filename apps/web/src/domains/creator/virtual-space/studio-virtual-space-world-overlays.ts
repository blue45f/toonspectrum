/**
 * 월드 공용 오버레이(상호작용 원형 표식·포털 발판·프라이빗 구역 표시·저작 디버그 선).
 *
 * Canvas에서 옮겨 온 생성 코드다. Canvas는 결과 객체와 클릭 콜백만 다룬다(Canvas 비대화 방지, W12).
 * Phaser는 Canvas가 늦게 불러오므로 여기서는 타입만 가져오고 실행 시 Geom 생성자는 인자로 받는다.
 */
import type * as Phaser from "phaser";

import type { StudioVirtualArtStyle } from "./studio-virtual-space-art-style";
import { strokeStudioDashedRect, studioPrivateZoneOverlayShapes } from "./studio-virtual-space-private-zone-overlay";
import {
  studioWorldCollisionRects,
  type StudioVirtualSpaceWorldManifest,
  type StudioWorldInteractionDefinition,
  type StudioWorldPortalDefinition,
} from "./studio-virtual-space-world-manifest";

type OverlayScene = Pick<Phaser.Scene, "add">;
interface StoppableEvent { stopPropagation(): void }
type PointerHandler = (pointer: Phaser.Input.Pointer, localX: number, localY: number, event: StoppableEvent) => void;

/** 원형 표식 안의 2글자 약어. */
export function studioInteractionMarkerText(interaction: Pick<StudioWorldInteractionDefinition, "id" | "action">): string {
  if (/falls/u.test(interaction.id)) return "FX";
  if (/fountain/u.test(interaction.id)) return "WT";
  if (/garden/u.test(interaction.id)) return "GD";
  if (/market/u.test(interaction.id)) return "MK";
  if (/observatory/u.test(interaction.id)) return "OB";
  if (/gong/u.test(interaction.id)) return "GG";
  if (/stage/u.test(interaction.id)) return "EV";
  const glyphByAction: Record<string, string> = {
    assistant: "AI", assets: "AS", canvas: "DR", community: "CO", comic: "SB", live: "LV", review: "RV", story: "ST",
  };
  return glyphByAction[interaction.action] ?? "GO";
}

function monospace(profile: StudioVirtualArtStyle): string {
  return profile.pixelated ? "ui-monospace, SFMono-Regular, Menlo, monospace" : "Inter, Pretendard, sans-serif";
}

/** 상호작용 지점의 원형 표식. 누르면 onSelect(그 상호작용)를 부른다. 바닥 y 정렬이라 이름표를 덮지 않는다. */
export function createStudioInteractionMarkers(
  scene: OverlayScene,
  interactions: readonly StudioWorldInteractionDefinition[],
  profile: StudioVirtualArtStyle,
  geom: Pick<typeof Phaser.Geom, "Circle">,
  onSelect: (interaction: StudioWorldInteractionDefinition) => void,
): Map<string, Phaser.GameObjects.Container> {
  const markers = new Map<string, Phaser.GameObjects.Container>();
  for (const interaction of interactions) {
    const plate = scene.add.graphics();
    plate.fillStyle(profile.palette.background, 0.58).fillCircle(0, 0, 14);
    plate.lineStyle(2, profile.palette.gate, 0.9).strokeCircle(0, 0, 12);
    plate.fillStyle(profile.palette.accent, 0.92).fillCircle(0, 0, 8);
    const glyph = scene.add.text(0, 0, studioInteractionMarkerText(interaction), {
      fontFamily: monospace(profile),
      fontSize: profile.pixelated ? "7px" : "8px",
      fontStyle: "bold",
      color: "#fbfaff",
    }).setOrigin(0.5);
    const marker = scene.add.container(interaction.point.x, interaction.point.y, [plate, glyph])
      .setSize(30, 30)
      .setDepth(Math.round(interaction.point.y) + 996)
      .setAlpha(0.68)
      .setInteractive(new geom.Circle(0, 0, 17), geom.Circle.Contains);
    if (marker.input) marker.input.cursor = "pointer";
    const select: PointerHandler = (_pointer, _x, _y, event) => { event.stopPropagation(); onSelect(interaction); };
    marker.on("pointerdown", select);
    markers.set(interaction.id, marker);
  }
  return markers;
}

/** 포털 발판(타원)과 방 이름표. 누르면 onSelect(포털)를 부른다. */
export function createStudioPortalGateways(
  scene: OverlayScene,
  manifest: StudioVirtualSpaceWorldManifest,
  portals: readonly StudioWorldPortalDefinition[],
  profile: StudioVirtualArtStyle,
  translate: (ko: string, en: string) => string,
  onSelect: (portal: StudioWorldPortalDefinition) => void,
): void {
  for (const portal of portals) {
    const gateway = scene.add.ellipse(portal.point.x, portal.point.y, portal.radius * 1.75, portal.radius * 0.82, profile.palette.gate, 0.14)
      .setStrokeStyle(2, profile.palette.gate, 0.82)
      .setDepth(600)
      .setInteractive({ useHandCursor: true });
    const select: PointerHandler = (_pointer, _x, _y, event) => { event.stopPropagation(); onSelect(portal); };
    gateway.on("pointerdown", select);
    const room = portal.targetRoomId ? manifest.rooms.find((candidate) => candidate.id === portal.targetRoomId) : undefined;
    if (!room) continue;
    scene.add.text(portal.point.x, portal.point.y - portal.radius - 8, translate(room.labelKo, room.labelEn), {
      fontFamily: monospace(profile),
      fontSize: profile.pixelated ? "7px" : "8px",
      fontStyle: "bold",
      color: "#fbfaff",
      backgroundColor: "#171522d8",
      padding: { x: 5, y: 3 },
    }).setOrigin(0.5, 1).setDepth(602).setInteractive({ useHandCursor: true }).on("pointerdown", select);
  }
}

/** 프라이빗 음향 구역의 점선 테두리와 '프라이빗' 표시. */
export function drawStudioPrivateZoneOverlay(scene: OverlayScene, manifest: StudioVirtualSpaceWorldManifest, label: string): void {
  const shapes = studioPrivateZoneOverlayShapes(manifest.acousticZones);
  if (shapes.length === 0) return;
  const graphics = scene.add.graphics().setDepth(30_000);
  for (const shape of shapes) {
    graphics.fillStyle(0x8b5cf6, 0.10);
    graphics.fillRect(shape.x, shape.y, shape.width, shape.height);
    graphics.lineStyle(2, 0xa78bfa, 0.55);
    strokeStudioDashedRect(graphics, shape);
    scene.add.text(shape.x + 8, shape.y + 8, label, {
      fontFamily: "Pretendard, sans-serif",
      fontSize: "12px",
      color: "#e9e2ff",
      backgroundColor: "#4c2f9edd",
      padding: { x: 6, y: 3 },
    }).setDepth(30_001);
  }
}

/** 월드 저작 모드의 방·충돌·상호작용·스폰 디버그 선. */
export function drawStudioWorldDebugOverlay(
  scene: OverlayScene,
  manifest: StudioVirtualSpaceWorldManifest,
  interactions: readonly StudioWorldInteractionDefinition[],
): void {
  const graphics = scene.add.graphics().setDepth(170_000);
  graphics.lineStyle(2, 0x66aaff, 0.86);
  for (const room of manifest.rooms) {
    graphics.strokeRect(room.x, room.y, room.width, room.height);
    scene.add.text(room.x + 5, room.y + 5, room.id, {
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: "10px",
      color: "#dcecff",
      backgroundColor: "#10233ddd",
      padding: { x: 4, y: 2 },
    }).setDepth(170_001);
  }
  graphics.lineStyle(2, 0xff5f6d, 0.88);
  for (const collider of studioWorldCollisionRects(manifest)) graphics.strokeRect(collider.x, collider.y, collider.width, collider.height);
  graphics.lineStyle(2, 0x4ade80, 0.75);
  for (const interaction of interactions) graphics.strokeCircle(interaction.point.x, interaction.point.y, interaction.radius);
  graphics.lineStyle(2, 0xfacc15, 0.9);
  for (const spawn of manifest.spawns) {
    graphics.strokeCircle(spawn.point.x, spawn.point.y, 10);
    graphics.lineBetween(spawn.point.x - 7, spawn.point.y, spawn.point.x + 7, spawn.point.y);
    graphics.lineBetween(spawn.point.x, spawn.point.y - 7, spawn.point.x, spawn.point.y + 7);
  }
}
