import {
  studioCanvasNameplateColors,
  studioColorHex,
} from "./studio-virtual-space-emote-runtime";
import type { StudioVirtualNameplateStatus } from "./studio-virtual-space-nameplate-layout";

/**
 * 이름표 스타일·상태 점 렌더러. 이름표 색은 CSS 토큰에서 읽는다(최소 11px).
 * 내 이름표는 accent, NPC는 accent-2 글자.
 */
export function createStudioNameplateRenderer(deps: {
  readonly scene: import("phaser").Scene;
  readonly parent: HTMLElement;
}) {
  const { scene } = deps;
  const nameplateColors = studioCanvasNameplateColors(deps.parent);
  const nameplateStyle = (kind: "peer" | "self" | "npc") => ({
    fontFamily: "Pretendard, Inter, sans-serif",
    fontSize: "11px",
    fontStyle: kind === "self" ? "bold" : "",
    color: studioColorHex(kind === "self" ? nameplateColors.selfText : kind === "npc" ? nameplateColors.npcText : nameplateColors.text),
    backgroundColor: `${studioColorHex(kind === "self" ? nameplateColors.self : nameplateColors.plate)}${kind === "self" ? "f0" : "e6"}`,
    padding: { x: 6, y: 3 },
  });
  const statusDots = new Map<string, import("phaser").GameObjects.Arc>();
  /** 상태가 있으면 이름표 왼쪽 안쪽에 색 점을 둔다. 글자 라벨이 같은 상태를 말하므로 색만으로 전달하지 않는다. */
  const syncStatusDot = (id: string, label: import("phaser").GameObjects.Text, status: StudioVirtualNameplateStatus | null) => {
    const padding = status ? "dot" : "plain";
    if (label.getData("statusPadding") !== padding) {
      label.setPadding(status ? 17 : 6, 3, 6, 3).setData("statusPadding", padding);
    }
    const existing = statusDots.get(id);
    if (!status) { existing?.setVisible(false); return; }
    const dot = existing ?? scene.add.circle(0, 0, 3.5, nameplateColors.status[status]);
    if (!existing) statusDots.set(id, dot);
    const scale = label.scaleX;
    dot.setFillStyle(nameplateColors.status[status], 1).setStrokeStyle(1, nameplateColors.plate, 0.9)
      .setScale(scale)
      .setPosition(label.x - label.displayWidth * label.originX + 9 * scale, label.y + label.displayHeight * (0.5 - label.originY))
      .setDepth(label.depth + 1).setAlpha(label.alpha).setVisible(label.visible);
  };
  return { nameplateStyle, statusDots, syncStatusDot };
}
