import { isStudioSpaceEmoteId, type StudioSpaceEmoteId } from "./studio-virtual-space-emote-catalog";
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

export interface StudioVirtualEnvironmentEffectRequest {
  readonly effect: StudioVirtualEnvironmentEffect;
  readonly point: StudioVirtualSpacePoint;
}

export class StudioVirtualSpaceEngineBridge {
  private joystick: StudioVirtualSpacePoint = { x: 0, y: 0 };
  private moveTarget: StudioVirtualSpacePoint | null = null;
  private followingPeerId: string | null = null;
  private stopRevision = 0;
  private interactRequested = false;
  private unstuckRequested = false;
  private environmentEffect: StudioVirtualEnvironmentEffectRequest | null = null;
  private pendingEmote: StudioSpaceEmoteId | null = null;
  private emoteSequence = 0;
  private teleportTarget: StudioVirtualSpacePoint | null = null;
  private focusHandler: (() => void) | null = null;

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
}
