/**
 * 월드 게임필 조율기(main Track B·C 캔버스 연결 이식). Phaser에 의존하지 않아 단위 테스트한다.
 *
 * - 게임필 설정(입력 감도·가속·흔들림·파티클 밀도)을 1초마다 다시 읽고 OS 모션 줄이기와 합친다.
 * - 끼임 감지(StudioStuckSampler)로 벽에 비비면 직각 방향으로 짧게 밀어 준다(HUD 끼임 버튼 판정은 engine-events가 유지).
 * - 강한 충돌에서 카메라 흔들림을 요청한다(설정·모션 줄이기 존중, 400ms 쿨다운).
 * - 이벤트 디렉터(근접 트리거·NPC 인사·동료 접근·타운 이벤트)를 150ms마다 돌려 onSpaceUiEvent로 넘긴다.
 *   (계약 타입 StudioSpaceUiEvent는 engine-events가 소유한다.) 디렉터 입력 배열은 재사용하고,
 *   월드 좌표계에 맞는 환영·미니게임 트리거를 넘긴다. dialogue 대사는 월드가 NPC 머리 위 말풍선으로도 보여 준다.
 * 모든 per-frame 메서드는 객체를 새로 만들지 않는다.
 */
import { StudioCameraDirector, createStudioCameraDirectorFrameInput } from "./studio-virtual-space-camera-director";
import type { StudioSpaceUiEvent } from "./studio-virtual-space-engine-events";
import {
  createStudioVirtualSpaceEventDirector,
  type StudioVirtualSpaceEventDirectorInput,
  type StudioVirtualSpaceEventDirectorOptions,
  type StudioVirtualSpaceEventUi,
} from "./studio-virtual-space-event-director";
import {
  readStudioVirtualGameFeelPreference,
  resolveStudioGameFeel,
  studioAccelerationFactor,
  studioInputSensitivityFactor,
  type StudioEffectiveGameFeel,
  type StudioVirtualGameFeelPreference,
} from "./studio-virtual-space-game-feel-preference";
import type { StudioMiniGameTriggerZone } from "./studio-virtual-space-mini-games";
import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import { StudioStuckSampler } from "./studio-virtual-space-stuck-detector";
import { STUDIO_TOWN_MINI_GAMES } from "./studio-virtual-space-town-program";
import {
  DEFAULT_STUDIO_WORLD_MANIFEST,
  studioWorldSpawn,
  type StudioVirtualSpaceWorldManifest,
  type StudioWorldInteractionDefinition,
} from "./studio-virtual-space-world-manifest";

/** 게임필 설정을 다시 읽는 간격(ms). 설정 패널에서 바꾼 값이 1초 안에 반영된다. */
export const STUDIO_WORLD_FEEL_PREFERENCE_MS = 1_000;
/** 끼임 탈출 밀기 지속(ms)과 세기(main 캔버스와 같다). */
export const STUDIO_WORLD_FEEL_ESCAPE_MS = 350;
const ESCAPE_STRENGTH = 0.9;
/** 이 속도(px/s) 이상에서 60px/s 이하로 부딪혀 멈추면 화면을 흔든다. */
const IMPACT_SPEED = 220;
const IMPACT_STOP_SPEED = 60;
const IMPACT_COOLDOWN_MS = 400;
/** 이벤트 디렉터를 돌리는 간격(ms). 근접 판정에 60fps가 필요 없어 6분의 1 이하로 줄인다. */
export const STUDIO_WORLD_FEEL_EVENT_INTERVAL_MS = 150;
/** NPC 인사 대사를 머리 위 말풍선으로 보여 주는 시간(ms). */
export const STUDIO_WORLD_FEEL_GREETING_MS = 3_200;

export class StudioWorldFeelController {
  private preference: StudioVirtualGameFeelPreference;
  private feel: StudioEffectiveGameFeel;
  private preferenceReadAt = -Infinity;
  private osReducedMotion = false;
  private readonly stuck = new StudioStuckSampler();
  private escapeUntil = -Infinity;
  private escapeX = 0;
  private escapeY = 0;
  private previousImpactSpeed = 0;
  private lastShakeAt = -Infinity;
  readonly camera = new StudioCameraDirector();
  readonly cameraInput = createStudioCameraDirectorFrameInput();
  /** shapeInput()가 감도·끼임 탈출을 적용해 쓰는 입력. */
  readonly input = { x: 0, y: 0 };

  constructor(private readonly read: () => StudioVirtualGameFeelPreference = readStudioVirtualGameFeelPreference) {
    this.preference = this.read();
    this.feel = resolveStudioGameFeel(this.preference, false);
  }

  /** 설정을 주기적으로 다시 읽고 OS 모션 줄이기와 합친다. */
  refresh(time: number, osReducedMotion: boolean): void {
    if (time - this.preferenceReadAt < STUDIO_WORLD_FEEL_PREFERENCE_MS && osReducedMotion === this.osReducedMotion) return;
    if (time - this.preferenceReadAt >= STUDIO_WORLD_FEEL_PREFERENCE_MS) {
      this.preferenceReadAt = time;
      this.preference = this.read();
    }
    this.osReducedMotion = osReducedMotion;
    this.feel = resolveStudioGameFeel(this.preference, osReducedMotion);
  }

  /** 실제 적용값(설정 + OS 모션 줄이기). */
  get effective(): StudioEffectiveGameFeel { return this.feel; }

  /** 가속도·감속도 배율(0.5~2). */
  get accelerationFactor(): number { return studioAccelerationFactor(this.preference.accelerationScale); }

  /** 입력 감도를 적용하고, 끼임 탈출 중이면 직각 방향으로 밀어 준다. 결과는 this.input에 쓴다. */
  shapeInput(x: number, y: number, time: number): { readonly x: number; readonly y: number } {
    const factor = studioInputSensitivityFactor(Math.hypot(x, y), this.preference.inputSensitivity);
    this.input.x = x * factor;
    this.input.y = y * factor;
    if (time < this.escapeUntil) {
      this.input.x += this.escapeX * ESCAPE_STRENGTH;
      this.input.y += this.escapeY * ESCAPE_STRENGTH;
    }
    return this.input;
  }

  /**
   * 직접 입력으로 미는 동안만 끼임 샘플을 쌓는다. 끼임이면 탈출 밀기를 예약하고 true를 돌려준다.
   * blocked는 Arcade 몸체가 이번 프레임에 벽에 막혔는지다.
   */
  sampleStuck(
    x: number, y: number, inputX: number, inputY: number,
    blockedX: boolean, blockedY: boolean, time: number, pushing: boolean,
  ): boolean {
    if (!pushing) {
      if (this.stuck.size > 0) this.stuck.reset();
      return false;
    }
    this.stuck.record(x, y, inputX, inputY, blockedX, blockedY, time);
    if (!this.stuck.analyze(time)) return false;
    this.escapeX = this.stuck.escape.x;
    this.escapeY = this.stuck.escape.y;
    this.escapeUntil = time + STUDIO_WORLD_FEEL_ESCAPE_MS;
    this.stuck.reset();
    return true;
  }

  /** 순간이동·끼임 해제 뒤에는 이전 샘플과 탈출 밀기를 버린다. */
  resetStuck(): void {
    this.stuck.reset();
    this.escapeUntil = -Infinity;
  }

  /** 빠르게 달리다 벽에 부딪혀 멈추면 카메라 흔들림을 요청한다. 요청했으면 true. */
  noteImpact(touching: boolean, speed: number, time: number): boolean {
    const previous = this.previousImpactSpeed;
    this.previousImpactSpeed = Number.isFinite(speed) ? speed : 0;
    if (!touching || previous <= IMPACT_SPEED || speed > IMPACT_STOP_SPEED) return false;
    if (!this.feel.screenShakeEnabled || this.osReducedMotion || time - this.lastShakeAt < IMPACT_COOLDOWN_MS) return false;
    this.lastShakeAt = time;
    this.camera.requestShake(0.4, 200, time);
    return true;
  }
}

/* ---------------------------------------------------------------------------------------------- */
/* 이벤트 디렉터 연결                                                                              */
/* ---------------------------------------------------------------------------------------------- */

interface FeedActor { id: string; name: string; position: { x: number; y: number } }
interface FeedInteractable {
  readonly id: string; readonly kind: string; readonly position: StudioVirtualSpacePoint; readonly radius: number;
  readonly labelKo: string; readonly labelEn: string;
}

/** 이 월드에서 디렉터가 쓸 환영·미니게임 트리거. 기본 오피스 월드는 디렉터 기본값을 그대로 쓴다. */
export function studioWorldEventDirectorOptions(
  manifest: StudioVirtualSpaceWorldManifest,
  interactions: readonly StudioWorldInteractionDefinition[],
): StudioVirtualSpaceEventDirectorOptions {
  if (manifest.id === DEFAULT_STUDIO_WORLD_MANIFEST.id && manifest.width === DEFAULT_STUDIO_WORLD_MANIFEST.width) return {};
  const lobby = manifest.spawns.find((spawn) => spawn.id === "main" || spawn.id === "skyport" || spawn.id === "lobby")
    ?? studioWorldSpawn(manifest);
  // 오락기마다 미니게임 하나를 맡긴다(캠퍼스 GAME 구역). 오락기가 없는 월드는 초대를 내지 않는다.
  const cabinets = interactions.filter((interaction) => /arcade-cabinet/u.test(interaction.id));
  const miniGameZones: StudioMiniGameTriggerZone[] = [];
  cabinets.forEach((cabinet, index) => {
    const game = STUDIO_TOWN_MINI_GAMES[index % STUDIO_TOWN_MINI_GAMES.length];
    if (game) miniGameZones.push({ id: game.id, center: cabinet.point, radius: Math.max(48, cabinet.radius) });
  });
  return { welcome: { center: lobby.point, radius: 220 }, miniGameZones };
}

/**
 * 이벤트 디렉터를 일정 간격으로 돌려 UI 이벤트를 넘기고, NPC 인사 대사를 말풍선용으로 기억한다.
 * 입력 배열과 항목 객체는 재사용한다(동료·NPC가 늘 때만 항목을 만든다).
 */
export class StudioWorldEventFeed {
  private readonly director: ReturnType<typeof createStudioVirtualSpaceEventDirector>;
  private readonly input: {
    now: number;
    self: { id: string; position: { x: number; y: number }; speed: number };
    peers: FeedActor[];
    npcs: FeedActor[];
    interactables: readonly FeedInteractable[];
    dayPhase: StudioVirtualSpaceEventDirectorInput["dayPhase"];
  };
  private lastRunAt = -Infinity;
  private readonly greetings = new Map<string, { readonly ko: string; readonly en: string; readonly until: number }>();

  constructor(
    manifest: StudioVirtualSpaceWorldManifest,
    interactions: readonly StudioWorldInteractionDefinition[],
    private readonly emit: (event: StudioSpaceUiEvent) => void,
  ) {
    this.director = createStudioVirtualSpaceEventDirector(studioWorldEventDirectorOptions(manifest, interactions));
    this.input = {
      now: 0,
      self: { id: "", position: { x: 0, y: 0 }, speed: 0 },
      peers: [],
      npcs: [],
      interactables: Object.freeze(interactions.map((interaction) => Object.freeze({
        id: interaction.id, kind: interaction.action, position: interaction.point, radius: interaction.radius,
        labelKo: interaction.labelKo, labelEn: interaction.labelEn,
      }))),
      dayPhase: "day",
    };
  }

  /** 간격이 지났을 때만 true. true면 호출 측이 setPeer·setNpc로 목록을 채우고 run()을 부른다. */
  due(time: number): boolean {
    return time - this.lastRunAt >= STUDIO_WORLD_FEEL_EVENT_INTERVAL_MS;
  }

  begin(time: number, selfId: string, x: number, y: number, speed: number, dayPhase: StudioVirtualSpaceEventDirectorInput["dayPhase"]): void {
    this.lastRunAt = time;
    const input = this.input;
    input.now = time;
    input.self.id = selfId;
    input.self.position.x = x;
    input.self.position.y = y;
    input.self.speed = speed;
    input.dayPhase = dayPhase;
    input.peers.length = 0;
    input.npcs.length = 0;
    this.poolCursor = 0;
  }

  addPeer(id: string, name: string, x: number, y: number): void { this.add(this.input.peers, id, name, x, y); }
  addNpc(id: string, name: string, x: number, y: number): void { this.add(this.input.npcs, id, name, x, y); }

  run(): void {
    this.director.update(this.input);
    const events = this.director.consumeUiEvents();
    for (const event of events) this.forward(event);
  }

  /** 최근 인사 대사(말풍선용). 없거나 지났으면 null. */
  greeting(npcId: string, time: number): { readonly ko: string; readonly en: string } | null {
    const line = this.greetings.get(npcId);
    if (!line) return null;
    if (time > line.until) { this.greetings.delete(npcId); return null; }
    return line;
  }

  private readonly pool: FeedActor[] = [];
  private poolCursor = 0;

  private add(list: FeedActor[], id: string, name: string, x: number, y: number): void {
    let actor = this.pool[this.poolCursor];
    if (!actor) { actor = { id, name, position: { x, y } }; this.pool.push(actor); }
    this.poolCursor += 1;
    actor.id = id;
    actor.name = name;
    actor.position.x = x;
    actor.position.y = y;
    list.push(actor);
  }

  private forward(event: StudioVirtualSpaceEventUi): void {
    if (event.role === "dialogue" && event.targetId) {
      // 디렉터 대사는 "이름: 대사" 형식이다. 말풍선에는 대사만 쓴다.
      const ko = event.textKo.includes(": ") ? event.textKo.slice(event.textKo.indexOf(": ") + 2) : event.textKo;
      const en = event.textEn.includes(": ") ? event.textEn.slice(event.textEn.indexOf(": ") + 2) : event.textEn;
      this.greetings.set(event.targetId, { ko, en, until: event.at + STUDIO_WORLD_FEEL_GREETING_MS });
    }
    this.emit({
      kind: event.role,
      titleKo: event.textKo,
      titleEn: event.textEn,
      ...(event.targetId ? { targetId: event.targetId } : {}),
      at: event.at,
    });
  }
}
