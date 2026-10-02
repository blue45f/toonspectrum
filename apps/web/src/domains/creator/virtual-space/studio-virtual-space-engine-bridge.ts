import { isStudioSpaceEmoteId, type StudioSpaceEmoteId } from "./studio-virtual-space-emote-catalog";
import type { StudioLightFixture } from "./studio-virtual-space-lighting";
import {
  DEFAULT_STUDIO_FOLLOW_CONFIG,
  type StudioFollowConfig,
} from "./studio-virtual-space-follow";
import {
  requestStudioSpacePose,
  studioSpacePoseBlend,
  type StudioSeatAnchor,
  type StudioSpacePose,
  type StudioSpacePoseRequest,
} from "./studio-virtual-space-pose-controller";
import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";

export type StudioVirtualEnvironmentEffect =
  | "waterfall-splash"
  | "wish"
  | "photo"
  | "petals"
  | "lanterns"
  | "pet"
  | "gong"
  | "spotlight";

/** 고스트 모드에서 로컬 아바타 스프라이트에 적용하는 투명도. 값의 정본은 ghost-mode 모듈이다. */
export { STUDIO_GHOST_SPRITE_ALPHA } from "./studio-virtual-space-ghost-mode";

/** 주야 사이클 설정 (가상 시계는 페이지가 소유하고 1초마다 now를 갱신한다). */
export interface StudioDayNightCycleConfig {
  /** 사이클 활성화 여부. 비활성화면 조명 패널의 수동 밝기를 쓴다. */
  readonly enabled: boolean;
  /** 사이클 시작 기준 시각 (ms, 가상 시계). */
  readonly startMs: number;
  /** 현재 가상 시각 (ms). 페이지가 주기적으로 갱신한다. */
  readonly now: number;
  /** 한 바퀴 주기 (ms). 기본 24시간. */
  readonly cycleMs?: number;
}

export interface StudioPoseFrameState {
  readonly pose: StudioSpacePose;
  /** 자세 전이 블렌드 0~1. */
  readonly poseBlend: number;
}

export interface StudioVirtualEnvironmentEffectRequest {
  readonly effect: StudioVirtualEnvironmentEffect;
  readonly point: StudioVirtualSpacePoint;
}

/** NPC 대화 카메라 연출 대상. */
export interface StudioVirtualSpaceConversationFocus {
  readonly point: StudioVirtualSpacePoint;
  readonly npcId?: string;
}

export class StudioVirtualSpaceEngineBridge {
  private joystick: StudioVirtualSpacePoint = { x: 0, y: 0 };
  private moveTarget: StudioVirtualSpacePoint | null = null;
  private followingPeerId: string | null = null;
  private followConfig: StudioFollowConfig = DEFAULT_STUDIO_FOLLOW_CONFIG;
  private stopRevision = 0;
  private interactRequested = false;
  private unstuckRequested = false;
  private environmentEffect: StudioVirtualEnvironmentEffectRequest | null = null;
  private pendingEmote: StudioSpaceEmoteId | null = null;
  private emoteSequence = 0;
  private teleportTarget: StudioVirtualSpacePoint | null = null;
  private focusHandler: (() => void) | null = null;
  /**
   * 고스트 모드: 반투명 + 통과 이동. 대규모 이벤트에서 아바타 끼임을 피한다.
   * 렌더링(반투명)은 트랙1, 물리적 통과 판정은 트랙3 담당.
   */
  private ghostMode = false;
  private locateTargetId: string | null = null;
  private pose: StudioSpacePose = "stand";
  private pendingPoseRequest: StudioSpacePoseRequest | null = null;
  private poseTransitionStartedAt: number | null = null;
  private dayNight: StudioDayNightCycleConfig = { enabled: false, startMs: 0, now: 0 };
  private lightFixtures: readonly StudioLightFixture[] = Object.freeze([]);
  private conversationFocus: StudioVirtualSpacePoint | null = null;
  private conversationNpcId: string | null = null;

  /**
   * HUD: NPC와 대화를 시작하면 대상(지점·NPC id)을, 끝나면 null을 넘긴다.
   * Canvas가 카메라를 살짝 당겨 연출한다.
   */
  setConversationFocus(focus: StudioVirtualSpaceConversationFocus | null): void {
    const valid = focus && Number.isFinite(focus.point.x) && Number.isFinite(focus.point.y);
    this.conversationFocus = valid ? { x: focus.point.x, y: focus.point.y } : null;
    this.conversationNpcId = valid ? focus.npcId ?? null : null;
  }
  /** Canvas 전용. 대화 연출 중심점(없으면 null). */
  getConversationFocus(): StudioVirtualSpacePoint | null {
    return this.conversationFocus;
  }
  /** Canvas 전용. 대화 중인 NPC id. 걸어 다니는 NPC는 정의 지점보다 이 id의 현재 위치를 쓰면 더 정확하다. */
  getConversationNpcId(): string | null {
    return this.conversationNpcId;
  }

  setJoystick(vector: StudioVirtualSpacePoint): void {
    const x = Number.isFinite(vector.x) ? vector.x : 0;
    const y = Number.isFinite(vector.y) ? vector.y : 0;
    const scale = Math.max(1, Math.hypot(x, y));
    this.joystick = { x: x / scale, y: y / scale };
  }
  getJoystick(): StudioVirtualSpacePoint {
    return this.joystick;
  }
  requestMove(point: StudioVirtualSpacePoint): void {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    this.moveTarget = { x: point.x, y: point.y };
    this.followingPeerId = null;
  }
  consumeMoveTarget(): StudioVirtualSpacePoint | null {
    const target = this.moveTarget;
    this.moveTarget = null;
    return target;
  }
  setFollowingPeer(sessionId: string | null): void {
    this.followingPeerId = sessionId;
    if (sessionId) this.moveTarget = null;
  }
  getFollowingPeer(): string | null {
    return this.followingPeerId;
  }
  /** T8 따라가기 설정 (도슨트·충돌 무시·거리). 페이지가 소유하고 캔버스가 매 프레임 읽는다. */
  setFollowConfig(config: StudioFollowConfig): void {
    this.followConfig = config;
  }
  getFollowConfig(): StudioFollowConfig {
    return this.followConfig;
  }
  getStopRevision(): number { return this.stopRevision; }
  requestInteract(): void { this.interactRequested = true; }
  consumeInteract(): boolean {
    const requested = this.interactRequested;
    this.interactRequested = false;
    return requested;
  }
  requestUnstuck(): void { this.unstuckRequested = true; }
  consumeUnstuck(): boolean {
    const requested = this.unstuckRequested;
    this.unstuckRequested = false;
    return requested;
  }
  requestEnvironmentEffect(effect: StudioVirtualEnvironmentEffect, point: StudioVirtualSpacePoint): void {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    this.environmentEffect = { effect, point: { x: point.x, y: point.y } };
  }
  consumeEnvironmentEffect(): StudioVirtualEnvironmentEffectRequest | null {
    const request = this.environmentEffect;
    this.environmentEffect = null;
    return request;
  }
  /** 로컬 이모트를 즉시 재생한다. 같은 id를 연달아 요청해도 소비할 때마다 다시 재생된다. */
  requestEmote(id: StudioSpaceEmoteId): void {
    if (!isStudioSpaceEmoteId(id)) return;
    this.pendingEmote = id;
    this.emoteSequence += 1;
  }
  /** Canvas 전용. 대기 중인 로컬 이모트를 한 번만 꺼낸다. */
  consumeEmote(): StudioSpaceEmoteId | null {
    const emote = this.pendingEmote;
    this.pendingEmote = null;
    return emote;
  }
  /** 지금까지 요청된 로컬 이모트 수. 재생 재시작 판정과 진단에 쓴다. */
  getEmoteSequence(): number { return this.emoteSequence; }
  /** 같은 월드 안 순간이동. Canvas가 가장 가까운 점유 가능 지점으로 보정하고 카메라를 붙인다. */
  requestTeleport(point: StudioVirtualSpacePoint): void {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    this.teleportTarget = { x: point.x, y: point.y };
    this.moveTarget = null;
  }
  /** Canvas 전용. */
  consumeTeleport(): StudioVirtualSpacePoint | null {
    const target = this.teleportTarget;
    this.teleportTarget = null;
    return target;
  }
  /** Canvas 전용. 월드 캔버스로 포커스를 돌려보내는 방법을 등록한다. */
  setFocusHandler(handler: (() => void) | null): void {
    this.focusHandler = handler;
  }
  /** HUD가 패널·시트·팝오버를 닫은 뒤 월드로 키보드 포커스를 되돌린다. 등록된 핸들러가 없으면 아무것도 하지 않는다. */
  focusWorld(): void {
    this.focusHandler?.();
  }
  clearMovement(): void {
    this.stopRevision += 1;
    this.joystick = { x: 0, y: 0 };
    this.moveTarget = null;
    this.teleportTarget = null;
    this.followingPeerId = null;
  }
  /** 고스트 모드 켜기/끄기 (G키 토글). 트랙3의 통과 판정이 이 플래그를 읽는다. */
  setGhostMode(enabled: boolean): void {
    this.ghostMode = enabled;
  }
  /** 고스트 모드 토글. 바뀐 값을 돌려준다. */
  toggleGhostMode(): boolean {
    this.ghostMode = !this.ghostMode;
    return this.ghostMode;
  }
  /** 현재 고스트 모드 여부. */
  isGhostMode(): boolean {
    return this.ghostMode;
  }
  /** 참가자 locate 안내선 타깃 (세션 id, null이면 안내 없음). */
  setLocateTarget(sessionId: string | null): void {
    this.locateTargetId = typeof sessionId === "string" && sessionId.length > 0 ? sessionId : null;
  }
  getLocateTarget(): string | null {
    return this.locateTargetId;
  }
  /** 자세 요청 (휴식/일어서기). Canvas가 프레임마다 소비해 상태 머신에 넣는다. */
  requestPose(request: StudioSpacePoseRequest): void {
    if (request === "rest" || request === "stand") this.pendingPoseRequest = request;
  }
  getPose(): StudioSpacePose {
    return this.pose;
  }
  /**
   * Canvas 전용. 프레임마다 호출해 자세 상태 머신을 진행시킨다.
   * 이동을 시작하면 자동으로 일어서고, 대기 중인 요청을 판정한다.
   */
  updatePoseState(input: {
    readonly position: StudioVirtualSpacePoint;
    readonly moving: boolean;
    readonly seatAnchors: readonly StudioSeatAnchor[];
    readonly openArea: boolean;
    readonly now: number;
  }): StudioPoseFrameState {
    const now = Number.isFinite(input.now) ? input.now : 0;
    if (input.moving && this.pose !== "stand") {
      this.pose = "stand";
      this.poseTransitionStartedAt = now;
      this.pendingPoseRequest = null;
    } else if (this.pendingPoseRequest) {
      const request = this.pendingPoseRequest;
      this.pendingPoseRequest = null;
      const result = requestStudioSpacePose({
        current: this.pose,
        request,
        position: input.position,
        moving: input.moving,
        seatAnchors: input.seatAnchors,
        openArea: input.openArea,
        now,
      });
      if (result.accepted) {
        this.pose = result.pose;
        this.poseTransitionStartedAt = result.transitionStartedAt;
      }
    }
    return {
      pose: this.pose,
      poseBlend: studioSpacePoseBlend(this.poseTransitionStartedAt, now),
    };
  }
  /** 주야 사이클 설정. 가상 시계(now)는 페이지가 1초마다 갱신한다. */
  setDayNightCycle(config: StudioDayNightCycleConfig): void {
    this.dayNight = {
      enabled: config.enabled === true,
      startMs: Number.isFinite(config.startMs) ? config.startMs : 0,
      now: Number.isFinite(config.now) ? config.now : 0,
      cycleMs: config.cycleMs,
    };
  }
  getDayNightCycle(): StudioDayNightCycleConfig {
    return this.dayNight;
  }
  /**
   * 조명 기구 상태 (페이지가 소유). Canvas의 오브젝트 광원 런타임이
   * 기구 위치·종류·디머를 읽어 국소 글로우를 그린다.
   * 좌표·반경이 깨진 기구는 버리고 나머지만 보관한다.
   */
  setLightFixtures(fixtures: readonly StudioLightFixture[]): void {
    this.lightFixtures = Object.freeze(fixtures.filter((fixture) =>
      fixture && Number.isFinite(fixture.position?.x) && Number.isFinite(fixture.position?.y)
      && Number.isFinite(fixture.radius) && fixture.radius > 0,
    ));
  }
  /** Canvas 전용. */
  getLightFixtures(): readonly StudioLightFixture[] {
    return this.lightFixtures;
  }
}
