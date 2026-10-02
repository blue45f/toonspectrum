/**
 * 게더타운식 상호작용 연출 런타임(월드 담당).
 *
 * 다가가면 반응하고, X(E·탭·클릭)로 발동하면 대상마다 다른 연출이 월드 안에서 바로 보인다.
 * - 프롬프트 라벨: "주문하기 · 카페 카운터"처럼 동사가 먼저 오는 라벨(상태 가구는 상태에 따른 동사).
 * - 상태 가구(main interactable-objects 상태 머신):
 *   · 카페 카운터 = 커피 머신. 주문하면 8초 동안 김이 오르고 추출 고리가 차오른다. 완성되면 바리스타가 알리고,
 *     카운터 가까이 있으면 바로 손에 컵이 들린다(멀리 있으면 카운터 위 컵이 빛나며 기다린다).
 *   · 책상 = 의자. 앉으면 앉은 자세(캔버스가 seat를 읽는다)와 책상 조명이 켜지고, 움직이거나 다시 X면 일어선다.
 * - 일회성 발동 연출: 분수 동전(포물선 → 물보라·반짝임), 무대 꽃가루, 오락기 픽셀 폭죽, 갤러리 조명,
 *   보드 마커 선, 자료 책장, 촬영 플래시, 고양이 하트, 회의 고리, 안내 종소리 등.
 * - 무대 앞 발표 자리에 선 사람(나·동료)에게 스포트라이트와 "발표 중" 배지(모든 접속자가 같은 위치 규칙으로 본다).
 * - 커피를 든 사람: 주문해 받은 나, 커피 리액션 중인 동료의 손에 잔과 김.
 * 성능: 연출 슬롯·컵·배지는 풀에서 재사용하고 매 프레임 객체·배열을 만들지 않는다. 화면 밖 대상은 그리지 않는다.
 * 모션 줄이기: 입자·움직임 없이 대상 둘레의 정적인 강조 고리만 잠깐 보인다(스포트라이트는 깜빡이지 않는다).
 * 색은 월드 안 조명·소품의 픽셀 아트 팔레트다(UI 색이 아니므로 CSS 토큰을 쓰지 않는다). 배지는 토큰 색을 받는다.
 */
import type * as Phaser from "phaser";

import type { StudioVirtualArtStyleKey } from "./studio-virtual-space-art-style";
import { studioCampusLifeUnit } from "./studio-virtual-space-campus-life";
import { campusCoffeeCupTexture, campusStyleColor } from "./studio-virtual-space-campus-textures";
import type { StudioSpaceEmoteId } from "./studio-virtual-space-emote-catalog";
import type { StudioSpaceUiEvent } from "./studio-virtual-space-engine-events";
import {
  STUDIO_COFFEE_BREW_MS,
  activateInteractableRuntime,
  advanceInteractableRuntime,
  createInteractableRuntime,
  type StudioInteractableRuntime,
} from "./studio-virtual-space-interactable-objects";
import type { StudioVirtualSpaceFacing, StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import {
  studioWorldInsideStageApron,
  studioWorldInteractableKind,
  studioWorldInteractionFxAnchor,
  studioWorldInteractionKind,
  studioWorldInteractionPromptLabel,
  studioWorldNpcPromptLabel,
  studioWorldStageAprons,
  type StudioWorldBilingualText,
  type StudioWorldFxAnchor,
  type StudioWorldFxObject,
  type StudioWorldInteractionKind,
  type StudioWorldStageApron,
} from "./studio-virtual-space-world-interaction-kinds";
import type { StudioWorldInteractionDefinition } from "./studio-virtual-space-world-manifest";

type FxScene = Pick<Phaser.Scene, "add" | "textures" | "make">;

export interface StudioInteractionFxCallbacks {
  /** point 근처(radius 안) NPC 한 명이 대사를 durationMs 동안 말한다. 근처에 NPC가 없으면 아무것도 하지 않는다. */
  readonly npcSay: (point: StudioVirtualSpacePoint, radius: number, ko: string, en: string, durationMs: number) => void;
  /** 내 머리 위 이모트(이 브라우저에서만 재생). */
  readonly selfEmote: (emote: StudioSpaceEmoteId) => void;
  /** HUD 알림. 캔버스가 onSpaceUiEvent로 넘긴다. */
  readonly notify: (event: StudioSpaceUiEvent) => void;
}

export interface StudioInteractionFxOptions {
  readonly style: StudioVirtualArtStyleKey;
  /** 연출 기준점을 고를 오브젝트 그림(캠퍼스 오브젝트). 없으면 상호작용 지점 위를 쓴다. */
  readonly objects: readonly StudioWorldFxObject[];
  /** 배지 색(CSS 토큰에서 읽은 값). */
  readonly badge: { readonly plate: number; readonly text: number; readonly accent: number };
  readonly translate: (ko: string, en: string) => string;
}

/** 캔버스가 읽어 앉은 자세를 그리는 월드 자리. */
export interface StudioInteractionFxSeat {
  readonly id: string;
  readonly anchorPoint: StudioVirtualSpacePoint;
  readonly facing: StudioVirtualSpaceFacing;
}

/** 발동 연출 길이(ms). */
export const STUDIO_INTERACTION_BURST_MS = 1_400;
/** 받은 커피를 손에 드는 시간(ms). */
export const STUDIO_INTERACTION_COFFEE_HOLD_MS = 45_000;
/** 커피가 완성됐을 때 이 거리(상호작용 반경 배수) 안이면 바로 손에 쥔다. */
const COFFEE_HANDOFF_RADIUS = 1.6;
/** 같은 사람이 무대에 다시 올라도 알림은 이 간격에 한 번. */
const STAGE_NOTICE_COOLDOWN_MS = 20_000;
/** 바리스타 권유 대사 간격. */
const CAFE_INVITE_COOLDOWN_MS = 25_000;
const NPC_LINE_MS = 3_200;
const NPC_SEARCH_RADIUS = 240;
const BURST_POOL = 6;
const CUP_POOL = 8;
const BADGE_POOL = 4;
const FX_DEPTH = 150_200;
const BADGE_DEPTH = 160_120;
/** 화면 밖 여유(px). 이 밖의 연출은 그리지 않는다. */
const VIEW_MARGIN = 160;

interface Burst {
  readonly graphics: Phaser.GameObjects.Graphics;
  kind: StudioWorldInteractionKind;
  anchorX: number;
  anchorY: number;
  originX: number;
  originY: number;
  startedAt: number;
  seed: number;
  still: boolean;
  active: boolean;
}

interface Machine {
  readonly interaction: StudioWorldInteractionDefinition;
  readonly anchor: StudioWorldFxAnchor;
  readonly graphics: Phaser.GameObjects.Graphics;
  readonly cup: Phaser.GameObjects.Image;
  runtime: StudioInteractableRuntime;
}

interface Badge {
  readonly text: Phaser.GameObjects.Text;
  label: string;
}

export interface StudioInteractionFxView {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const COLORS = Object.freeze({
  steam: 0xf4f0ea,
  amber: 0xffc35a,
  water: 0x8fe3ff,
  foam: 0xeefcff,
  gold: 0xf2c75c,
  pink: 0xff7aa8,
  cyan: 0x55e0ff,
  violet: 0x9b7bff,
  green: 0x7ee08a,
  paper: 0xfbf8f1,
  red: 0xe4575f,
  lamp: 0xffe2a0,
  spot: 0xfff1c4,
});

/** 0~1 구간 진행률. */
function progressOf(time: number, startedAt: number, duration: number): number {
  return Math.max(0, Math.min(1, (time - startedAt) / duration));
}

function easeOut(value: number): number {
  return 1 - (1 - value) * (1 - value);
}

export class StudioInteractionFxRuntime {
  private readonly bursts: Burst[] = [];
  private burstCursor = 0;
  private readonly machines = new Map<string, Machine>();
  private readonly chairs = new Map<string, StudioInteractableRuntime>();
  private readonly anchors = new Map<string, StudioWorldFxAnchor>();
  private readonly kinds = new Map<string, StudioWorldInteractionKind>();
  private readonly promptLabels = new Map<string, StudioWorldBilingualText>();
  private readonly npcLabels = new Map<string, StudioWorldBilingualText>();
  private readonly aprons: readonly StudioWorldStageApron[];
  private readonly lamp: Phaser.GameObjects.Graphics;
  private readonly spot: Phaser.GameObjects.Graphics;
  private readonly heldSteam: Phaser.GameObjects.Graphics;
  private readonly cups: Phaser.GameObjects.Image[] = [];
  private readonly badges: Badge[] = [];
  private readonly cupTexture: string;
  private cupsUsed = 0;
  private badgesUsed = 0;
  private presentersDrawn = 0;
  private seatState: StudioInteractionFxSeat | null = null;
  private seatInteraction: StudioWorldInteractionDefinition | null = null;
  private selfCupUntil = -Infinity;
  private selfOnStage = false;
  private lastStageNoticeAt = -Infinity;
  private lastCafeInviteAt = -Infinity;
  private frameTime = 0;
  private reducedMotion = false;
  private particleRatio = 1;
  private readonly view = { x: 0, y: 0, width: 0, height: 0 };

  constructor(
    private readonly scene: FxScene,
    interactions: readonly StudioWorldInteractionDefinition[],
    private readonly options: StudioInteractionFxOptions,
    private readonly callbacks: StudioInteractionFxCallbacks,
  ) {
    const { style } = options;
    this.cupTexture = campusCoffeeCupTexture(scene, style);
    for (const interaction of interactions) {
      const kind = studioWorldInteractionKind(interaction);
      this.kinds.set(interaction.id, kind);
      const anchor = studioWorldInteractionFxAnchor(interaction, options.objects);
      this.anchors.set(interaction.id, anchor);
      if (studioWorldInteractableKind(kind) === "coffee-machine") {
        const graphics = scene.add.graphics().setDepth(Math.round(anchor.baseY) + 1_004).setVisible(false);
        const cup = scene.add.image(anchor.x, anchor.y + 12, this.cupTexture).setOrigin(0.5, 1)
          .setDisplaySize(14, 14).setDepth(Math.round(anchor.baseY) + 1_005).setVisible(false);
        this.machines.set(interaction.id, { interaction, anchor, graphics, cup, runtime: createInteractableRuntime(interaction.id, "coffee-machine", 0) });
      }
    }
    this.aprons = studioWorldStageAprons(interactions);
    for (let index = 0; index < BURST_POOL; index += 1) {
      this.bursts.push({ graphics: scene.add.graphics().setDepth(FX_DEPTH).setVisible(false), kind: "generic",
        anchorX: 0, anchorY: 0, originX: 0, originY: 0, startedAt: 0, seed: 0, still: false, active: false });
    }
    this.lamp = scene.add.graphics().setBlendMode("ADD").setVisible(false);
    this.spot = scene.add.graphics().setBlendMode("ADD").setVisible(false).setDepth(FX_DEPTH - 1);
    this.heldSteam = scene.add.graphics().setVisible(false).setDepth(FX_DEPTH - 2);
  }

  /** 상호작용 종류(캐시). */
  kindOf(interaction: Pick<StudioWorldInteractionDefinition, "id" | "action">): StudioWorldInteractionKind {
    return this.kinds.get(interaction.id) ?? studioWorldInteractionKind(interaction);
  }

  /** 지금 상태에 맞는 프롬프트 라벨("주문하기 · 카페 카운터"). 상태가 바뀔 때만 새로 만든다. */
  promptLabel(interaction: StudioWorldInteractionDefinition): StudioWorldBilingualText {
    const state = this.machines.get(interaction.id)?.runtime.stateKey
      ?? (this.seatInteraction?.id === interaction.id ? "chair:occupied" : null);
    const key = `${interaction.id}|${state ?? ""}`;
    let label = this.promptLabels.get(key);
    if (!label) {
      label = studioWorldInteractionPromptLabel(interaction, state);
      this.promptLabels.set(key, label);
    }
    return label;
  }

  /** NPC 프롬프트 라벨("대화하기 · 린"). NPC마다 한 번 만든다. */
  npcPromptLabel(id: string, name: StudioWorldBilingualText): StudioWorldBilingualText {
    let label = this.npcLabels.get(id);
    if (!label) {
      label = studioWorldNpcPromptLabel(name);
      this.npcLabels.set(id, label);
    }
    return label;
  }

  /** 프롬프트 대상이 바뀔 때 부른다(다가가면 반응하는 대사). */
  prompted(interaction: StudioWorldInteractionDefinition | null, time: number): void {
    if (!interaction) return;
    if (this.kindOf(interaction) === "cafe-counter" && time - this.lastCafeInviteAt >= CAFE_INVITE_COOLDOWN_MS) {
      const machine = this.machines.get(interaction.id);
      if (machine && machine.runtime.stateKey !== "coffee:idle") return;
      this.lastCafeInviteAt = time;
      this.callbacks.npcSay(interaction.point, NPC_SEARCH_RADIUS, "커피 한잔 할까요? ☕", "Fancy a coffee? ☕", NPC_LINE_MS);
    }
  }

  /** 월드 자리에 앉아 있으면 그 자리(캔버스가 앉은 자세를 그린다). */
  get seat(): StudioInteractionFxSeat | null { return this.seatState; }

  /** X(E·탭·클릭)로 상호작용을 발동했을 때 한 번 부른다. */
  activate(interaction: StudioWorldInteractionDefinition, self: StudioVirtualSpacePoint, time: number, reducedMotion: boolean): void {
    const kind = this.kindOf(interaction);
    const anchor = this.anchors.get(interaction.id) ?? studioWorldInteractionFxAnchor(interaction, this.options.objects);
    const machine = this.machines.get(interaction.id);
    if (machine) this.activateMachine(machine, time);
    if (kind === "desk") this.toggleSeat(interaction, time);
    if (kind === "stage" && !this.selfOnStage) {
      this.callbacks.notify({ kind: "toast", titleKo: "무대 앞 발표 자리로 가면 스포트라이트가 켜져요.",
        titleEn: "Step onto the stage front to get the spotlight.", at: time, targetId: interaction.id });
    }
    this.startBurst(kind, anchor, self, time, reducedMotion);
  }

  /** 움직이기 시작하면 자리에서 일어난다. */
  standUp(time: number): void {
    const interaction = this.seatInteraction;
    if (!interaction) return;
    const chair = this.chairs.get(interaction.id);
    if (chair && chair.stateKey === "chair:occupied") this.chairs.set(interaction.id, activateInteractableRuntime(chair, time).runtime);
    this.seatInteraction = null;
    this.seatState = null;
  }

  /** 매 프레임 시작: 카메라 화면과 설정을 받는다. */
  beginFrame(time: number, view: StudioInteractionFxView, reducedMotion: boolean, particleRatio: number): void {
    this.frameTime = time;
    this.reducedMotion = reducedMotion;
    this.particleRatio = Math.max(0, Math.min(1, particleRatio));
    this.view.x = view.x;
    this.view.y = view.y;
    this.view.width = view.width;
    this.view.height = view.height;
    this.cupsUsed = 0;
    this.badgesUsed = 0;
    this.presentersDrawn = 0;
    this.spot.clear();
    this.heldSteam.clear();
  }

  /**
   * 사람 한 명(나는 id "self")을 그린 뒤 부른다. 커피를 든 사람의 손에 잔을, 무대 앞 발표 자리의 사람에게
   * 스포트라이트·배지를 붙인다. emote는 지금 재생 중인 리액션 id다.
   */
  trackActor(
    id: string,
    sprite: Phaser.GameObjects.Sprite,
    groundX: number,
    groundY: number,
    facing: StudioVirtualSpaceFacing,
    emote: string | null,
    visible: boolean,
  ): void {
    const self = id === "self";
    if (self) this.updateSelfStage(groundX, groundY);
    if (!visible || !this.inView(sprite.x, sprite.y)) return;
    const height = sprite.displayHeight * sprite.originY;
    const holding = emote === "coffee" || (self && this.frameTime < this.selfCupUntil);
    if (holding && !(self && this.seatState)) this.drawHeldCup(sprite, height, facing);
    for (const apron of this.aprons) {
      if (!studioWorldInsideStageApron(apron, groundX, groundY)) continue;
      this.drawPresenter(sprite, height);
      break;
    }
  }

  /** 매 프레임 끝: 상태 가구·발동 연출·쓰지 않은 풀 정리. selfMoving이면 자리에서 일어난다. */
  endFrame(self: StudioVirtualSpacePoint, selfMoving: boolean): void {
    const time = this.frameTime;
    if (selfMoving && this.seatState) this.standUp(time);
    for (const machine of this.machines.values()) this.stepMachine(machine, self, time);
    this.drawLamp(time);
    for (const burst of this.bursts) if (burst.active) this.drawBurst(burst, time);
    for (let index = this.cupsUsed; index < this.cups.length; index += 1) this.cups[index]!.setVisible(false);
    for (let index = this.badgesUsed; index < this.badges.length; index += 1) this.badges[index]!.text.setVisible(false);
    this.spot.setVisible(this.presentersDrawn > 0);
    this.heldSteam.setVisible(this.cupsUsed > 0 && !this.reducedMotion);
  }

  /** 진단용(개발 서버 dataset). */
  get diagnostics(): string {
    let brewing = 0;
    for (const machine of this.machines.values()) if (machine.runtime.stateKey !== "coffee:idle") brewing += 1;
    let bursts = 0;
    for (const burst of this.bursts) if (burst.active) bursts += 1;
    return `bursts:${bursts}|machines:${brewing}|seat:${this.seatInteraction?.id ?? ""}|cups:${this.cupsUsed}|stage:${this.presentersDrawn}`;
  }

  destroy(): void {
    for (const burst of this.bursts) burst.graphics.destroy();
    this.bursts.length = 0;
    for (const machine of this.machines.values()) { machine.graphics.destroy(); machine.cup.destroy(); }
    this.machines.clear();
    for (const cup of this.cups) cup.destroy();
    this.cups.length = 0;
    for (const badge of this.badges) badge.text.destroy();
    this.badges.length = 0;
    this.lamp.destroy();
    this.spot.destroy();
    this.heldSteam.destroy();
  }

  /* -------------------------------------------------------------------------------------------- */

  private inView(x: number, y: number): boolean {
    const view = this.view;
    if (view.width <= 0) return true;
    return x >= view.x - VIEW_MARGIN && x <= view.x + view.width + VIEW_MARGIN
      && y >= view.y - VIEW_MARGIN && y <= view.y + view.height + VIEW_MARGIN;
  }

  private activateMachine(machine: Machine, time: number): void {
    const before = machine.runtime.stateKey;
    machine.runtime = activateInteractableRuntime(advanceInteractableRuntime(machine.runtime, time), time).runtime;
    const { point } = machine.interaction;
    if (before === "coffee:idle" && machine.runtime.stateKey === "coffee:brewing") {
      this.callbacks.npcSay(point, NPC_SEARCH_RADIUS, "원두를 갈고 있어요. 잠시만요! ☕", "Grinding the beans — one moment! ☕", NPC_LINE_MS);
      this.callbacks.notify({ kind: "toast", titleKo: "커피를 주문했어요. 김이 오르는 동안 잠깐 기다려요. ☕",
        titleEn: "Coffee ordered — wait a moment while it brews. ☕", at: time, targetId: machine.interaction.id });
    } else if (before === "coffee:ready") {
      this.handCoffee(machine, time);
    }
  }

  private stepMachine(machine: Machine, self: StudioVirtualSpacePoint, time: number): void {
    const before = machine.runtime.stateKey;
    if (before === "coffee:brewing") {
      machine.runtime = advanceInteractableRuntime(machine.runtime, time);
      if (machine.runtime.stateKey === "coffee:ready") {
        const { point, radius } = machine.interaction;
        const near = Math.hypot(self.x - point.x, self.y - point.y) <= radius * COFFEE_HANDOFF_RADIUS;
        if (near) {
          machine.runtime = activateInteractableRuntime(machine.runtime, time).runtime;
          this.handCoffee(machine, time);
        } else {
          this.callbacks.npcSay(point, NPC_SEARCH_RADIUS, "주문하신 커피 나왔어요! ☕", "Your coffee is ready! ☕", NPC_LINE_MS);
        }
      }
    }
    this.drawMachine(machine, time);
  }

  private handCoffee(machine: Machine, time: number): void {
    this.selfCupUntil = time + STUDIO_INTERACTION_COFFEE_HOLD_MS;
    this.callbacks.selfEmote("coffee");
    this.callbacks.npcSay(machine.interaction.point, NPC_SEARCH_RADIUS, "맛있게 드세요! ☕", "Enjoy! ☕", NPC_LINE_MS);
    this.callbacks.notify({ kind: "toast", titleKo: "따뜻한 커피를 받았어요. ☕", titleEn: "You got a warm coffee. ☕",
      at: time, targetId: machine.interaction.id });
  }

  private toggleSeat(interaction: StudioWorldInteractionDefinition, time: number): void {
    const current = this.chairs.get(interaction.id) ?? createInteractableRuntime(interaction.id, "chair", time);
    if (this.seatInteraction && this.seatInteraction.id !== interaction.id) this.standUp(time);
    const next = activateInteractableRuntime(current, time).runtime;
    this.chairs.set(interaction.id, next);
    if (next.stateKey === "chair:occupied") {
      this.seatInteraction = interaction;
      this.seatState = Object.freeze({ id: interaction.id, anchorPoint: interaction.point, facing: "up" as const });
    } else {
      this.seatInteraction = null;
      this.seatState = null;
    }
  }

  private updateSelfStage(x: number, y: number): void {
    let inside = false;
    for (const apron of this.aprons) if (studioWorldInsideStageApron(apron, x, y)) { inside = true; break; }
    if (inside === this.selfOnStage) return;
    this.selfOnStage = inside;
    if (inside && this.frameTime - this.lastStageNoticeAt >= STAGE_NOTICE_COOLDOWN_MS) {
      this.lastStageNoticeAt = this.frameTime;
      this.callbacks.notify({ kind: "toast", titleKo: "무대에 섰어요. 객석의 모두에게 '발표 중'으로 보여요. 🎤",
        titleEn: "You're on stage — everyone in the audience sees you as presenting. 🎤", at: this.frameTime });
    }
  }

  private startBurst(kind: StudioWorldInteractionKind, anchor: StudioWorldFxAnchor, self: StudioVirtualSpacePoint, time: number, reducedMotion: boolean): void {
    // 같은 대상을 연달아 누르면 슬롯을 새로 쓰지 않고 다시 시작한다.
    let burst = this.bursts.find((candidate) => candidate.active && candidate.anchorX === anchor.x && candidate.anchorY === anchor.y);
    if (!burst) {
      burst = this.bursts[this.burstCursor];
      this.burstCursor = (this.burstCursor + 1) % this.bursts.length;
    }
    if (!burst) return;
    burst.kind = kind;
    burst.anchorX = anchor.x;
    burst.anchorY = anchor.y;
    burst.originX = self.x;
    burst.originY = self.y - 34;
    burst.startedAt = time;
    burst.seed = Math.floor(time) % 9_973;
    burst.still = reducedMotion;
    burst.active = true;
    burst.graphics.setDepth(Math.max(FX_DEPTH, Math.round(anchor.baseY) + 2_100)).setVisible(true);
  }

  private count(base: number): number {
    return Math.max(1, Math.round(base * (0.4 + this.particleRatio * 0.6)));
  }

  private color(value: number): number {
    return campusStyleColor(value, this.options.style);
  }

  private drawBurst(burst: Burst, time: number): void {
    const graphics = burst.graphics;
    const t = progressOf(time, burst.startedAt, STUDIO_INTERACTION_BURST_MS);
    if (t >= 1) { burst.active = false; graphics.clear().setVisible(false); return; }
    graphics.clear();
    if (!this.inView(burst.anchorX, burst.anchorY)) return;
    const x = burst.anchorX, y = burst.anchorY;
    if (burst.still) {
      // 모션 줄이기: 움직이지 않는 강조 고리만 서서히 사라진다.
      graphics.lineStyle(3, this.color(COLORS.gold), 0.9 * (1 - t)).strokeEllipse(x, y, 96, 40);
      return;
    }
    const fade = 1 - t;
    const seed = burst.seed;
    switch (burst.kind) {
      case "cafe-counter": {
        // 주문: 머신에서 김이 몇 줄기 피어오르고 카운터가 따뜻하게 빛난다.
        graphics.fillStyle(this.color(COLORS.amber), 0.22 * fade).fillEllipse(x, y + 6, 64, 24);
        const puffs = this.count(6);
        for (let index = 0; index < puffs; index += 1) {
          const local = Math.max(0, Math.min(1, t * 1.5 - index * 0.08));
          graphics.fillStyle(this.color(COLORS.steam), 0.6 * (1 - local))
            .fillCircle(x - 10 + (index % 3) * 10 + Math.sin(local * 6 + index) * 5, y - 6 - easeOut(local) * 46, 3 + local * 6);
        }
        break;
      }
      case "fountain": {
        // 동전 포물선(0~0.35) → 물보라 고리·물방울·반짝임.
        const flight = Math.min(1, t / 0.35);
        if (flight < 1) {
          const cx = burst.originX + (x - burst.originX) * flight;
          const cy = burst.originY + (y - burst.originY) * flight - Math.sin(flight * Math.PI) * 70;
          graphics.fillStyle(this.color(COLORS.gold), 1).fillCircle(cx, cy, 3.4);
          graphics.fillStyle(this.color(0xfff6c8), 1).fillCircle(cx - 1, cy - 1, 1.2);
        } else {
          const splash = easeOut((t - 0.35) / 0.65);
          graphics.lineStyle(2.5, this.color(COLORS.foam), 0.9 * (1 - splash)).strokeEllipse(x, y + 8, 30 + splash * 90, 10 + splash * 30);
          graphics.lineStyle(1.5, this.color(COLORS.water), 0.7 * (1 - splash)).strokeEllipse(x, y + 8, 14 + splash * 56, 6 + splash * 18);
          const drops = this.count(10);
          for (let index = 0; index < drops; index += 1) {
            const angle = (index / drops) * Math.PI * 2 + studioCampusLifeUnit(seed + index) * 0.5;
            const lift = Math.sin(splash * Math.PI) * (26 + studioCampusLifeUnit(seed + index * 7) * 20);
            graphics.fillStyle(this.color(COLORS.water), 0.85 * (1 - splash))
              .fillCircle(x + Math.cos(angle) * splash * 40, y + 6 + Math.sin(angle) * splash * 14 - lift, 2.2);
          }
          this.sparkles(graphics, x, y - 18, seed, 5, 34 * splash, this.color(COLORS.gold), 1 - splash);
        }
        break;
      }
      case "stage": {
        // 위에서 떨어지는 꽃가루와 무대 플래시.
        graphics.fillStyle(this.color(COLORS.spot), 0.28 * fade).fillEllipse(x, y + 40, 220, 70);
        const pieces = this.count(18);
        const palette = [COLORS.pink, COLORS.cyan, COLORS.gold, COLORS.violet, COLORS.green];
        for (let index = 0; index < pieces; index += 1) {
          const drift = (studioCampusLifeUnit(seed + index * 3) - 0.5) * 240;
          const fall = t * (120 + studioCampusLifeUnit(seed + index * 5) * 90);
          const px = x + drift + Math.sin(t * 9 + index) * 10;
          const py = y - 120 + fall;
          graphics.fillStyle(this.color(palette[index % palette.length]!), 0.95 * fade)
            .fillRect(px, py, 4, 6 + (index % 3));
        }
        break;
      }
      case "arcade": {
        // 화면 플래시와 8비트 픽셀 폭죽.
        graphics.fillStyle(this.color(COLORS.cyan), 0.35 * fade).fillEllipse(x, y, 70, 50);
        const pixels = this.count(14);
        const palette = [COLORS.cyan, COLORS.pink, COLORS.gold, COLORS.green];
        for (let index = 0; index < pixels; index += 1) {
          const angle = (index / pixels) * Math.PI * 2;
          const reach = easeOut(t) * (34 + studioCampusLifeUnit(seed + index) * 30);
          const size = 5 - Math.floor(t * 3);
          graphics.fillStyle(this.color(palette[index % palette.length]!), fade)
            .fillRect(Math.round(x + Math.cos(angle) * reach), Math.round(y - 10 + Math.sin(angle) * reach * 0.8), size, size);
        }
        break;
      }
      case "gallery": {
        // 위에서 내려오는 조명 원뿔과 반짝임.
        graphics.fillStyle(this.color(COLORS.spot), 0.24 * fade)
          .fillTriangle(x - 12, y - 110, x + 12, y - 110, x + 70, y + 46)
          .fillTriangle(x - 12, y - 110, x + 70, y + 46, x - 70, y + 46);
        this.sparkles(graphics, x, y, seed, 7, 26 + easeOut(t) * 30, this.color(COLORS.gold), fade);
        break;
      }
      case "board": {
        // 보드 면에 마커 선이 그어진다.
        const strokes = 3;
        for (let index = 0; index < strokes; index += 1) {
          const local = Math.max(0, Math.min(1, t * 2.2 - index * 0.35));
          if (local <= 0) continue;
          const sx = x - 60, sy = y - 18 + index * 16;
          const color = [COLORS.violet, COLORS.pink, COLORS.cyan][index]!;
          graphics.lineStyle(3, this.color(color), 0.95 * fade).lineBetween(sx, sy, sx + 110 * local, sy + Math.sin(local * 6 + index) * 4);
        }
        this.sparkles(graphics, x + 50, y - 26, seed, 3, 16, this.color(COLORS.gold), fade);
        break;
      }
      case "archive": {
        // 책장 사이에서 종이 몇 장이 떠오른다.
        const pages = this.count(6);
        for (let index = 0; index < pages; index += 1) {
          const lift = easeOut(t) * (40 + studioCampusLifeUnit(seed + index) * 30);
          const sway = Math.sin(t * 6 + index * 1.7) * 12;
          graphics.fillStyle(this.color(COLORS.paper), 0.95 * fade)
            .fillRect(x - 30 + index * 12 + sway, y - lift, 9, 12);
          graphics.lineStyle(1, this.color(0x8d93a6), 0.7 * fade).lineBetween(x - 28 + index * 12 + sway, y - lift + 4, x - 23 + index * 12 + sway, y - lift + 4);
        }
        break;
      }
      case "camera-set": {
        // 촬영 플래시와 깜빡이는 REC 점.
        graphics.fillStyle(this.color(0xffffff), 0.6 * Math.max(0, 1 - t * 4)).fillEllipse(x, y, 260, 140);
        if (Math.floor(t * 8) % 2 === 0) graphics.fillStyle(this.color(COLORS.red), 0.95).fillCircle(x + 70, y - 50, 5);
        break;
      }
      case "cat": {
        // 하트가 피어오른다.
        const hearts = this.count(5);
        for (let index = 0; index < hearts; index += 1) {
          const local = Math.max(0, Math.min(1, t * 1.4 - index * 0.12));
          if (local <= 0) continue;
          const hx = x - 20 + index * 10 + Math.sin(local * 5 + index) * 6;
          const hy = y + 20 - easeOut(local) * 46;
          this.heart(graphics, hx, hy, 4.5, this.color(COLORS.pink), 1 - local);
        }
        break;
      }
      case "meeting":
      case "gong": {
        // 테이블·공 둘레로 퍼지는 두 겹 고리.
        for (let ring = 0; ring < 2; ring += 1) {
          const local = Math.max(0, Math.min(1, t * 1.3 - ring * 0.25));
          graphics.lineStyle(3 - ring, this.color(burst.kind === "gong" ? COLORS.gold : COLORS.cyan), 0.85 * (1 - local))
            .strokeEllipse(x, y + 46, 80 + local * 150, 30 + local * 54);
        }
        break;
      }
      case "concierge": {
        // 안내 종소리: 종 위로 퍼지는 호 두 개와 반짝임.
        for (let ring = 0; ring < 2; ring += 1) {
          const local = Math.max(0, Math.min(1, t * 1.6 - ring * 0.3));
          graphics.lineStyle(2, this.color(COLORS.gold), 0.9 * (1 - local)).beginPath()
            .arc(x, y - 6, 10 + local * 26, Math.PI * 1.15, Math.PI * 1.85).strokePath();
        }
        this.sparkles(graphics, x, y - 18, seed, 3, 22, this.color(COLORS.gold), fade);
        break;
      }
      case "garden": {
        const petals = this.count(12);
        for (let index = 0; index < petals; index += 1) {
          const angle = (index / petals) * Math.PI * 2;
          const reach = easeOut(t) * (30 + studioCampusLifeUnit(seed + index) * 40);
          graphics.fillStyle(this.color(0xffb7d0), 0.9 * fade)
            .fillEllipse(x + Math.cos(angle) * reach, y + Math.sin(angle) * reach * 0.5 - t * 20, 5, 3);
        }
        break;
      }
      case "waterfall": {
        const drops = this.count(12);
        for (let index = 0; index < drops; index += 1) {
          const angle = Math.PI + (index / drops) * Math.PI;
          const reach = easeOut(t) * (40 + studioCampusLifeUnit(seed + index) * 30);
          graphics.fillStyle(this.color(COLORS.foam), 0.8 * fade).fillCircle(x + Math.cos(angle) * reach, y + Math.sin(angle) * reach * 0.6, 2.6);
        }
        break;
      }
      default: {
        // 책상·콘솔·관측소·마켓·기타: 대상 둘레 고리와 반짝임.
        const local = easeOut(t);
        graphics.lineStyle(2.5, this.color(COLORS.cyan), 0.8 * fade).strokeEllipse(x, y + 30, 60 + local * 70, 22 + local * 26);
        this.sparkles(graphics, x, y - 10, seed, 4, 18 + local * 18, this.color(COLORS.gold), fade);
      }
    }
  }

  /** 네 갈래 반짝임 count개를 반지름 radius 둘레에 그린다. */
  private sparkles(graphics: Phaser.GameObjects.Graphics, x: number, y: number, seed: number, count: number, radius: number, color: number, alpha: number): void {
    if (alpha <= 0) return;
    const total = this.count(count);
    for (let index = 0; index < total; index += 1) {
      const angle = studioCampusLifeUnit(seed + index * 13) * Math.PI * 2;
      const sx = x + Math.cos(angle) * radius;
      const sy = y + Math.sin(angle) * radius * 0.7;
      const size = 2 + (index % 2);
      graphics.fillStyle(color, alpha).fillRect(sx - size, sy - 0.75, size * 2, 1.5).fillRect(sx - 0.75, sy - size, 1.5, size * 2);
    }
  }

  private heart(graphics: Phaser.GameObjects.Graphics, x: number, y: number, size: number, color: number, alpha: number): void {
    if (alpha <= 0) return;
    graphics.fillStyle(color, alpha)
      .fillCircle(x - size * 0.5, y, size * 0.6)
      .fillCircle(x + size * 0.5, y, size * 0.6)
      .fillTriangle(x - size * 1.08, y + size * 0.15, x + size * 1.08, y + size * 0.15, x, y + size * 1.3);
  }

  private drawMachine(machine: Machine, time: number): void {
    const { graphics, cup, anchor } = machine;
    const state = machine.runtime.stateKey;
    if (state === "coffee:idle" || !this.inView(anchor.x, anchor.y)) {
      graphics.setVisible(false);
      cup.setVisible(false);
      return;
    }
    graphics.clear().setVisible(true);
    const x = anchor.x, y = anchor.y;
    if (state === "coffee:brewing") {
      const progress = progressOf(time, machine.runtime.stateChangedAt, STUDIO_COFFEE_BREW_MS);
      // 추출 고리(앰버)가 시계 방향으로 차오른다.
      graphics.lineStyle(4, this.color(0x2a2236), 0.55).strokeCircle(x, y - 34, 11);
      graphics.lineStyle(4, this.color(COLORS.amber), 0.95).beginPath()
        .arc(x, y - 34, 11, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress).strokePath();
      // 노즐 아래로 떨어지는 커피 방울과 머신에서 오르는 김.
      if (!this.reducedMotion) {
        const drip = (time % 420) / 420;
        graphics.fillStyle(this.color(0x6b3f24), 0.9).fillCircle(x, y + 4 + drip * 8, 1.6);
        for (let index = 0; index < 3; index += 1) {
          const phase = ((time / 900) + index / 3) % 1;
          graphics.fillStyle(this.color(COLORS.steam), 0.55 * (1 - phase))
            .fillCircle(x - 6 + index * 6 + Math.sin(phase * 6 + index) * 4, y - 8 - phase * 30, 3 + phase * 4);
        }
      }
      cup.setVisible(true).setPosition(x, y + 14).setAlpha(0.85);
    } else {
      // 완성: 카운터 위 컵이 빛나며 기다린다.
      const pulse = this.reducedMotion ? 0.6 : 0.45 + Math.sin(time / 260) * 0.25;
      graphics.fillStyle(this.color(COLORS.amber), pulse * 0.5).fillEllipse(x, y + 10, 34, 14);
      this.sparkles(graphics, x, y - 4, 31, 3, 14, this.color(COLORS.gold), pulse);
      cup.setVisible(true).setPosition(x, y + 14).setAlpha(1);
    }
  }

  private drawLamp(time: number): void {
    const interaction = this.seatInteraction;
    if (!interaction) { this.lamp.setVisible(false); return; }
    const anchor = this.anchors.get(interaction.id);
    const x = anchor?.x ?? interaction.point.x;
    const y = anchor?.y ?? interaction.point.y - 54;
    const flicker = this.reducedMotion ? 1 : 0.92 + Math.sin(time / 180) * 0.04 + Math.sin(time / 47) * 0.02;
    this.lamp.clear().setVisible(true).setDepth(Math.round(interaction.point.y) + 1_003);
    this.lamp.fillStyle(this.color(COLORS.lamp), 0.2 * flicker)
      .fillTriangle(x - 8, y - 20, x + 8, y - 20, x + 46, y + 40)
      .fillTriangle(x - 8, y - 20, x + 46, y + 40, x - 46, y + 40);
    this.lamp.fillStyle(this.color(COLORS.lamp), 0.32 * flicker).fillEllipse(x, y + 40, 100, 30);
    this.lamp.fillStyle(this.color(0xffffff), 0.9).fillCircle(x, y - 22, 3);
  }

  private drawHeldCup(sprite: Phaser.GameObjects.Sprite, height: number, facing: StudioVirtualSpaceFacing): void {
    let cup = this.cups[this.cupsUsed];
    if (!cup) {
      if (this.cups.length >= CUP_POOL) return;
      cup = this.scene.add.image(0, 0, this.cupTexture).setOrigin(0.5, 1);
      this.cups.push(cup);
    }
    this.cupsUsed += 1;
    const side = facing === "left" ? -1 : 1;
    const reach = facing === "up" ? 0.14 : facing === "down" ? 0.2 : 0.26;
    const size = Math.max(10, height * 0.15);
    const x = sprite.x + side * sprite.displayWidth * reach;
    const y = sprite.y - height * 0.36;
    cup.setTexture(this.cupTexture).setDisplaySize(size, size).setPosition(x, y)
      .setDepth(sprite.depth + (facing === "up" ? -1 : 1)).setVisible(true);
    if (this.reducedMotion) return;
    const time = this.frameTime;
    for (let index = 0; index < 2; index += 1) {
      const phase = ((time / 1_100) + index / 2) % 1;
      this.heldSteam.fillStyle(this.color(COLORS.steam), 0.5 * (1 - phase))
        .fillCircle(x - 1 + Math.sin(phase * 7 + index * 2) * 2.5, y - size * 0.75 - phase * 14, 1.6 + phase * 2);
    }
  }

  private drawPresenter(sprite: Phaser.GameObjects.Sprite, height: number): void {
    if (this.presentersDrawn >= BADGE_POOL) return;
    this.presentersDrawn += 1;
    const x = sprite.x, foot = sprite.y;
    const top = foot - height;
    const flicker = this.reducedMotion ? 1 : 0.9 + Math.sin(this.frameTime / 210 + x) * 0.06;
    const spot = this.spot;
    spot.fillStyle(this.color(COLORS.spot), 0.16 * flicker)
      .fillTriangle(x - 10, top - 150, x + 10, top - 150, x + 46, foot + 6)
      .fillTriangle(x - 10, top - 150, x + 46, foot + 6, x - 46, foot + 6);
    spot.fillStyle(this.color(COLORS.spot), 0.3 * flicker).fillEllipse(x, foot + 2, 104, 30);
    let badge = this.badges[this.badgesUsed];
    if (!badge) {
      const { plate, text, accent } = this.options.badge;
      const label = this.options.translate("● 발표 중", "● Presenting");
      const object = this.scene.add.text(0, 0, label, {
        fontFamily: "Pretendard, Inter, sans-serif",
        fontSize: "11px",
        fontStyle: "bold",
        color: `#${text.toString(16).padStart(6, "0")}`,
        backgroundColor: `#${plate.toString(16).padStart(6, "0")}`,
        padding: { x: 7, y: 3 },
      }).setOrigin(0.5, 1).setDepth(BADGE_DEPTH).setStroke(`#${accent.toString(16).padStart(6, "0")}`, 0);
      badge = { text: object, label };
      this.badges.push(badge);
    }
    this.badgesUsed += 1;
    const label = this.options.translate("● 발표 중", "● Presenting");
    if (label !== badge.label) { badge.label = label; badge.text.setText(label); }
    badge.text.setPosition(x, top - 30).setVisible(true);
  }
}
