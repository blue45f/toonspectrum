import type * as Phaser from "phaser";

import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import type { StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";

export interface StudioObjectTextureKeys {
  readonly door: string;
  readonly crate: string;
  readonly lantern: string;
  readonly bench: string;
}

export interface StudioDoorState {
  readonly open: boolean;
  readonly lastNearAt: number;
}

export function stepStudioDoorState(
  state: StudioDoorState,
  distance: number,
  time: number,
  openRadius = 54,
  closeDelayMs = 850,
): StudioDoorState {
  if (distance <= openRadius) return { open: true, lastNearAt: time };
  if (state.open && time - state.lastNearAt < closeDelayMs) return state;
  return { open: false, lastNearAt: state.lastNearAt };
}

interface DoorRuntime {
  readonly image: Phaser.Physics.Arcade.Image;
  state: StudioDoorState;
}

export class StudioWorldObjectRuntime {
  private readonly doors: readonly DoorRuntime[];
  private readonly crates: readonly Phaser.Physics.Arcade.Image[];
  private readonly lamps: readonly Phaser.GameObjects.Image[];
  private readonly benches: readonly Phaser.GameObjects.Image[];
  private readonly colliders: Phaser.Physics.Arcade.Collider[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    manifest: StudioVirtualSpaceWorldManifest,
    player: Phaser.GameObjects.GameObject,
    walls: readonly Phaser.GameObjects.GameObject[],
    keys: StudioObjectTextureKeys,
  ) {
    const entranceRooms = manifest.rooms.filter((room) => [
      "writers", "drawing", "review", "quality", "meeting", "assets", "production", "release",
    ].includes(room.id));
    this.doors = entranceRooms.map((room) => {
      const x = room.x + room.width / 2;
      const y = room.y + room.height - 7;
      const image = scene.physics.add.image(x, y, keys.door).setDisplaySize(38, 52).setDepth(y + 960);
      image.setImmovable(true).setPushable(false).setData("closedY", y).setData("roomId", room.id);
      this.colliders.push(scene.physics.add.collider(player, image));
      return { image, state: { open: false, lastNearAt: -Infinity } };
    });
    const cratePoints = [
      { x: 295, y: 555 },
      { x: 632, y: 548 },
      { x: 944, y: 548 },
      { x: 626, y: 824 },
    ] as const;
    this.crates = cratePoints.map((point, index) => {
      const crate = scene.physics.add.image(point.x, point.y, keys.crate)
        .setDisplaySize(42, 42)
        .setDepth(point.y + 970)
        .setCollideWorldBounds(true)
        .setDrag(720, 720)
        .setMaxVelocity(120, 120)
        .setBounce(0.05)
        .setMass(2.4 + index * 0.25);
      crate.body.setSize(30, 30, true);
      this.colliders.push(scene.physics.add.collider(player, crate));
      for (const wall of walls) this.colliders.push(scene.physics.add.collider(crate, wall));
      return crate;
    });
    for (let index = 0; index < this.crates.length; index += 1) {
      for (let other = index + 1; other < this.crates.length; other += 1) {
        this.colliders.push(scene.physics.add.collider(this.crates[index]!, this.crates[other]!));
      }
    }
    const lampPoints = [[315, 245], [625, 245], [935, 245], [315, 545], [625, 545], [935, 545], [315, 820], [935, 820]] as const;
    this.lamps = lampPoints.map(([x, y]) => scene.add.image(x, y, keys.lantern)
      .setDisplaySize(38, 38).setDepth(y + 940).setBlendMode("ADD"));
    const benchPoints = [[185, 554], [500, 554], [812, 554], [1095, 554], [500, 817], [1095, 817]] as const;
    this.benches = benchPoints.map(([x, y]) => scene.add.image(x, y, keys.bench)
      .setDisplaySize(68, 50).setDepth(y + 945));
    for (const bench of this.benches) {
      scene.physics.add.existing(bench, true);
      this.colliders.push(scene.physics.add.collider(player, bench));
    }
  }

  update(time: number, playerPoint: StudioVirtualSpacePoint): void {
    for (const door of this.doors) {
      const distance = Math.hypot(door.image.x - playerPoint.x, door.image.y - playerPoint.y);
      const next = stepStudioDoorState(door.state, distance, time);
      if (next.open !== door.state.open) {
        door.image.setAngle(next.open ? 82 : 0).setAlpha(next.open ? 0.62 : 1);
        const body = door.image.body as Phaser.Physics.Arcade.Body;
        body.enable = !next.open;
        if (!next.open) body.reset(door.image.x, Number(door.image.getData("closedY")));
      }
      door.state = next;
    }
    this.crates.forEach((crate) => {
      crate.setDepth(Math.round(crate.y) + 970);
      const velocity = (crate.body as Phaser.Physics.Arcade.Body).velocity;
      crate.setAngle(Math.max(-2.2, Math.min(2.2, velocity.x * 0.012)));
    });
    this.lamps.forEach((lamp, index) => lamp.setAlpha(0.72 + Math.sin(time * 0.0023 + index) * 0.18));
  }

  destroy(): void {
    this.colliders.forEach((collider) => collider.destroy());
    this.doors.forEach((door) => door.image.destroy());
    this.crates.forEach((crate) => crate.destroy());
    this.lamps.forEach((lamp) => lamp.destroy());
    this.benches.forEach((bench) => bench.destroy());
  }
}

/**
 * A-6 대형 스크린 오브젝트: 화면 공유 중인 아바타가 스크린 근처에서 공유하면
 * 바인딩된 화면 내용이 이 스크린에 표시된다. `로컬 스크린`은 가시 반경 안에
 * 있는 아바타에게만 보인다(근접 기반 가시성). 실제 송출은 하지 않으며
 * 로컬 상태 + UI 미리보기 범위에서만 동작한다.
 */
export const DEFAULT_STUDIO_SCREEN_VISIBILITY_RADIUS = 260;

export type StudioScreenShareTrackState = "live" | "ended";

export interface StudioScreenShareBinding {
  readonly sharerId: string;
  readonly sharerLabel: string;
  readonly trackState: StudioScreenShareTrackState;
  readonly startedAt: number;
}

export interface StudioScreenObject {
  readonly id: string;
  readonly position: StudioVirtualSpacePoint;
  /** 이 반경(px) 안에 있는 아바타에게만 공유 화면이 보인다. */
  readonly visibilityRadius: number;
  readonly share: StudioScreenShareBinding | null;
}

const SCREEN_ID_PATTERN = /^[a-z0-9][a-z0-9:_-]{0,127}$/iu;

function cleanScreenToken(value: string, fallback: string): string {
  return SCREEN_ID_PATTERN.test(value) ? value : fallback;
}

function cleanRadius(value: number): number {
  return Number.isFinite(value) && value > 0 && value <= 2000
    ? value
    : DEFAULT_STUDIO_SCREEN_VISIBILITY_RADIUS;
}

function cleanPoint(point: StudioVirtualSpacePoint): StudioVirtualSpacePoint {
  const x = Number.isFinite(point.x) ? point.x : 0;
  const y = Number.isFinite(point.y) ? point.y : 0;
  return Object.freeze({ x, y });
}

export function createStudioScreenObject(
  id: string,
  position: StudioVirtualSpacePoint,
  visibilityRadius = DEFAULT_STUDIO_SCREEN_VISIBILITY_RADIUS,
): StudioScreenObject {
  return Object.freeze({
    id: cleanScreenToken(id, "screen"),
    position: cleanPoint(position),
    visibilityRadius: cleanRadius(visibilityRadius),
    share: null,
  });
}

function cleanBinding(binding: StudioScreenShareBinding): StudioScreenShareBinding | null {
  if (!SCREEN_ID_PATTERN.test(binding.sharerId)) return null;
  if (binding.trackState !== "live" && binding.trackState !== "ended") return null;
  if (!Number.isFinite(binding.startedAt)) return null;
  const sharerLabel = binding.sharerLabel.normalize("NFC").replace(/[\p{Cc}\p{Cf}]/gu, " ").trim();
  if (!sharerLabel) return null;
  return Object.freeze({ ...binding, sharerLabel });
}

/** 화면 공유 바인딩을 스크린에 연결한다. 바인딩이 유효하지 않으면 스크린을 그대로 반환한다. */
export function bindStudioScreenShare(
  screen: StudioScreenObject,
  binding: StudioScreenShareBinding,
): StudioScreenObject {
  const cleaned = cleanBinding(binding);
  if (!cleaned) return screen;
  return Object.freeze({ ...screen, share: cleaned });
}

/** 화면 공유 바인딩을 해제한다. */
export function releaseStudioScreenShare(screen: StudioScreenObject): StudioScreenObject {
  if (!screen.share) return screen;
  return Object.freeze({ ...screen, share: null });
}

/** 공유 화면이 특정 거리(px)의 아바타에게 보이는지 판단한다. */
export function studioScreenShareVisibleTo(screen: StudioScreenObject, distance: number): boolean {
  return screen.share !== null
    && screen.share.trackState === "live"
    && Number.isFinite(distance)
    && distance >= 0
    && distance <= screen.visibilityRadius;
}
