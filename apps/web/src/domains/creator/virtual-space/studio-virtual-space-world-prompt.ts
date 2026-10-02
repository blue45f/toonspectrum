/**
 * 월드 안 상호작용 프롬프트(가장 가까운 대상 하나에 'X' 키캡 말풍선 + 바닥 링).
 *
 * - interactionRings 설정과 무관하게 항상 하나만 보인다. 설정은 '모든 표식·근접 링 보기'만 담당한다.
 * - 대상 선정은 순수 함수(studioWorldPromptTarget)로 테스트하고, Phaser 객체는 StudioWorldPromptRuntime이 소유한다.
 * - 모션 줄이기에서는 링이 맥동하지 않고 말풍선이 튀어 오르지 않는다.
 * - 포털은 밟으면 바로 이동하는 대상이라 'E' 키캡 없이 목적지 라벨만 보여 준다.
 *   우선순위는 E 키 대상(상호작용·NPC)보다 낮다 — 포털 안내는 주변 안내일 뿐이다.
 */
import type * as Phaser from "phaser";

import { campusKeycapTexture } from "./studio-virtual-space-campus-textures";
import type { StudioCanvasBubbleColors } from "./studio-virtual-space-emote-runtime";
import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";

export interface StudioWorldPromptCandidate {
  readonly id: string;
  readonly kind: "interaction" | "npc" | "portal";
  readonly point: StudioVirtualSpacePoint;
  /** 이 반경 안에서만 프롬프트 대상이 된다. */
  readonly radius: number;
  readonly labelKo: string;
  readonly labelEn: string;
}

export interface StudioWorldPromptTarget extends StudioWorldPromptCandidate {
  readonly distance: number;
}

/**
 * 반경 안 후보 중 하나만 고른다. E 키가 실제로 여는 순서를 따른다:
 * 바닥 상호작용이 있으면 그중 가장 가까운 것, 없으면 가장 가까운 NPC,
 * 그것도 없을 때만 가장 가까운 포털(키캡 없는 안내)을 고른다.
 */
export function studioWorldPromptTarget(
  point: StudioVirtualSpacePoint,
  candidates: readonly StudioWorldPromptCandidate[],
): StudioWorldPromptTarget | null {
  let interaction: StudioWorldPromptTarget | null = null;
  let npc: StudioWorldPromptTarget | null = null;
  let portal: StudioWorldPromptTarget | null = null;
  for (const candidate of candidates) {
    if (!Number.isFinite(candidate.point.x) || !Number.isFinite(candidate.point.y)) continue;
    const distance = Math.hypot(candidate.point.x - point.x, candidate.point.y - point.y);
    if (distance > candidate.radius) continue;
    const target = { ...candidate, distance };
    if (candidate.kind === "interaction") { if (!interaction || distance < interaction.distance) interaction = target; }
    else if (candidate.kind === "npc") { if (!npc || distance < npc.distance) npc = target; }
    else if (!portal || distance < portal.distance) portal = target;
  }
  return interaction ?? npc ?? portal;
}

/** 2글자 원형 표식은 이 거리 밖에서 숨긴다. */
export const STUDIO_WORLD_MARKER_VISIBLE_DISTANCE = 320;

/**
 * '모든 표식 보기'(interactionRings)일 때만 320px 안의 표식을 보인다.
 * 프롬프트 대상이 된 표식은 'X' 키캡이 대신하므로 숨겨 이름표·키캡과 겹치지 않게 한다.
 */
export function studioWorldMarkerVisible(input: {
  readonly distance: number;
  readonly prompted: boolean;
  readonly showAll: boolean;
}): boolean {
  if (input.prompted) return false;
  return input.showAll && input.distance <= STUDIO_WORLD_MARKER_VISIBLE_DISTANCE;
}

export interface StudioWorldPromptPlacement {
  readonly target: StudioWorldPromptTarget;
  /** 말풍선 꼬리가 가리키는 머리 위 기준점(화면 좌표계의 월드 y). */
  readonly anchorY: number;
  readonly label: string;
}

type PromptScene = Pick<Phaser.Scene, "add" | "textures">;

const PROMPT_DEPTH = 150_600;
const RING_DEPTH_OFFSET = 995;

/** 머리 위 'X' 키캡 + 라벨, 바닥 링. 대상이 바뀔 때만 글자를 다시 쓴다. 포털은 키캡 없이 라벨만 가운데에 띄운다. */
export class StudioWorldPromptRuntime {
  private readonly container: Phaser.GameObjects.Container;
  private readonly keycap: Phaser.GameObjects.Image;
  private readonly label: Phaser.GameObjects.Text;
  private readonly ring: Phaser.GameObjects.Graphics;
  private currentKey = "";
  private shownAt = 0;

  constructor(scene: PromptScene, private readonly colors: StudioCanvasBubbleColors) {
    this.keycap = scene.add.image(0, 0, campusKeycapTexture(scene, colors.paper, colors.ink, colors.accent))
      .setOrigin(0.5, 1).setDisplaySize(30, 34);
    this.label = scene.add.text(18, -20, "", {
      fontFamily: "Pretendard, Inter, sans-serif",
      fontSize: "12px",
      fontStyle: "bold",
      color: `#${colors.ink.toString(16).padStart(6, "0")}`,
      backgroundColor: `#${colors.paper.toString(16).padStart(6, "0")}`,
      padding: { x: 6, y: 3 },
    }).setOrigin(0, 0.5);
    this.container = scene.add.container(0, 0, [this.keycap, this.label]).setDepth(PROMPT_DEPTH).setVisible(false);
    this.ring = scene.add.graphics().setVisible(false);
  }

  update(placement: StudioWorldPromptPlacement | null, time: number, reducedMotion: boolean, overlayScale: number): void {
    if (!placement) {
      if (this.currentKey) { this.currentKey = ""; this.container.setVisible(false); this.ring.setVisible(false); }
      return;
    }
    const { target } = placement;
    const key = `${target.kind}:${target.id}:${placement.label}`;
    if (key !== this.currentKey) {
      this.currentKey = key;
      this.shownAt = time;
      this.label.setText(placement.label);
      // 포털은 밟으면 이동하는 대상이라 E 키캡을 숨기고 라벨을 가운데 정렬한다.
      const isPortal = target.kind === "portal";
      this.keycap.setVisible(!isPortal);
      if (isPortal) this.label.setOrigin(0.5, 0.5).setPosition(0, -20);
      else this.label.setOrigin(0, 0.5).setPosition(18, -20);
    }
    const elapsed = Math.max(0, time - this.shownAt);
    const pop = reducedMotion ? 1 : Math.min(1, 0.6 + elapsed / 300);
    const bob = reducedMotion ? 0 : Math.sin(time / 320) * 2;
    const isPortal = target.kind === "portal";
    const width = isPortal ? this.label.width : 30 + 18 + this.label.width;
    this.container.setVisible(true)
      .setPosition(isPortal ? target.point.x : target.point.x - (width / 2 - 15) * overlayScale, placement.anchorY + bob)
      .setScale(overlayScale * pop);
    const pulse = reducedMotion ? 0.5 : 0.5 + Math.sin(time / 260) * 0.5;
    const radius = Math.min(46, Math.max(24, target.radius * 0.45));
    this.ring.clear().setVisible(true).setDepth(Math.round(target.point.y) + RING_DEPTH_OFFSET);
    this.ring.fillStyle(this.colors.accent2, 0.12 + pulse * 0.1).fillEllipse(target.point.x, target.point.y, radius * 2, radius);
    this.ring.lineStyle(2, this.colors.accent2, 0.55 + pulse * 0.35)
      .strokeEllipse(target.point.x, target.point.y, radius * 2 * (1 + pulse * 0.08), radius * (1 + pulse * 0.08));
  }

  destroy(): void {
    this.container.destroy();
    this.ring.destroy();
  }
}
