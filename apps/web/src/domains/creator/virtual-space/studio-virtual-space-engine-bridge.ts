import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";

export class StudioVirtualSpaceEngineBridge {
  private joystick: StudioVirtualSpacePoint = { x: 0, y: 0 };
  private moveTarget: StudioVirtualSpacePoint | null = null;
  private followingPeerId: string | null = null;
  private stopRevision = 0;

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
  clearMovement(): void {
    this.stopRevision += 1;
    this.joystick = { x: 0, y: 0 };
    this.moveTarget = null;
    this.followingPeerId = null;
  }
}
