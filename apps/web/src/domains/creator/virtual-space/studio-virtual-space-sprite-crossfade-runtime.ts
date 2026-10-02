/**
 * 스프라이트 크로스페이드 런타임 (Phaser 연결)
 *
 * 상태 전이 판정은 순수 모듈(`studio-virtual-space-sprite-smoothing`)이 하고,
 * 이 클래스는 배우(owner) 스프라이트 1장당 페이드 스프라이트 최대 1장을 붙여
 * 이전 그림을 100ms 동안 겹쳐 보여 주는 일만 한다.
 *
 * - 페이드 스프라이트는 배우가 처음 바뀔 때만 lazy 생성되고 이후 재사용된다 (증식 없음).
 * - 매 프레임 배우의 최종 변환(위치·각도·반전)을 복사하므로 텔레포트·좌석 이동 중에도
 *   이전 그림이 엉뚱한 자리에 남지 않고, 배우가 숨으면 함께 숨는다.
 * - 표시 중인 텍스처는 캐릭터 에셋 상주 정책이 최소 30초 유지하므로 페이드 도중 사라지지 않는다.
 */

import Phaser from "phaser";

import {
  STUDIO_SPRITE_CROSSFADE_MS,
  createStudioSpriteCrossfadeState,
  finishStudioSpriteCrossfade,
  studioSpriteCrossfadeAlpha,
  transitionStudioSpriteCrossfade,
  type StudioSpriteCrossfadeState,
  type StudioSpriteVisualIdentity,
} from "./studio-virtual-space-sprite-smoothing";

type CrossfadeScene = Pick<Phaser.Scene, "add">;

interface FadeSnapshot extends StudioSpriteVisualIdentity {
  readonly x: number;
  readonly y: number;
  readonly displayWidth: number;
  readonly displayHeight: number;
  readonly originX: number;
  readonly originY: number;
  readonly angle: number;
  readonly flipX: boolean;
  readonly flipY: boolean;
}

interface CrossfadeEntry {
  sprite: Phaser.GameObjects.Sprite | null;
  state: StudioSpriteCrossfadeState;
  pending: FadeSnapshot | null;
}

function identityOf(sprite: Phaser.GameObjects.Sprite): StudioSpriteVisualIdentity {
  const textureKey = sprite.texture.key;
  const frame = String(sprite.frame.name);
  const animated = sprite.anims.isPlaying && Boolean(sprite.anims.currentAnim);
  const state = String(sprite.getData("visualMotionState") ?? "");
  const animKey = animated ? (sprite.anims.currentAnim?.key ?? "") : "";
  return {
    key: animated ? `${textureKey}|anim:${animKey}|${state}` : `${textureKey}#${frame}|${state}`,
    textureKey,
    frame,
    animated,
    state,
  };
}

function snapshotOf(sprite: Phaser.GameObjects.Sprite): FadeSnapshot {
  return {
    ...identityOf(sprite),
    x: sprite.x,
    y: sprite.y,
    displayWidth: sprite.displayWidth,
    displayHeight: sprite.displayHeight,
    originX: sprite.originX,
    originY: sprite.originY,
    angle: sprite.angle,
    flipX: sprite.flipX,
    flipY: sprite.flipY,
  };
}

export class StudioSpriteCrossfadeRuntime {
  private readonly entries = new Map<Phaser.GameObjects.Sprite, CrossfadeEntry>();

  constructor(private readonly scene: CrossfadeScene) {}

  /** applySpriteVisual 호출 직전에 불러 현재 표시 그림·변환을 기록한다. */
  capture(owner: Phaser.GameObjects.Sprite): void {
    this.entryOf(owner).pending = snapshotOf(owner);
  }

  /** applySpriteVisual 호출 직후에 불러 정체성이 바뀌었으면 페이드를 시작한다. */
  commit(owner: Phaser.GameObjects.Sprite, time: number, enabled: boolean): void {
    const entry = this.entryOf(owner);
    const pending = entry.pending;
    entry.pending = null;
    if (!pending) return;
    // 캡처 시점의 정체성을 상태 머신의 "이전 그림"으로 먼저 맞춘 뒤 전이를 계산한다.
    // (capture/commit 쌍이 매 프레임 돌므로 상태는 항상 직전 프레임과 동기화된다.)
    entry.state = { identity: pending, fade: entry.state.fade };
    const { state, started } = transitionStudioSpriteCrossfade(entry.state, identityOf(owner), time, {
      fadeMs: STUDIO_SPRITE_CROSSFADE_MS,
      enabled,
    });
    entry.state = state;
    if (!started) return;
    const fadeSprite = this.fadeSpriteOf(entry, owner);
    fadeSprite
      .setTexture(pending.textureKey, pending.frame)
      .setOrigin(pending.originX, pending.originY)
      .setDisplaySize(pending.displayWidth, pending.displayHeight)
      .setPosition(pending.x, pending.y)
      .setAngle(pending.angle)
      .setFlip(pending.flipX, pending.flipY)
      .setDepth(owner.depth - 0.5)
      .setVisible(owner.visible)
      .setAlpha(owner.alpha);
  }

  /** 프레임 끝에 불러 진행 중인 페이드를 배우 변환에 맞추고 알파를 진행시킨다. */
  step(time: number): void {
    for (const [owner, entry] of this.entries) {
      if (!owner.active) {
        this.release(owner);
        continue;
      }
      entry.state = finishStudioSpriteCrossfade(entry.state, time);
      const fadeSprite = entry.sprite;
      if (!fadeSprite) continue;
      const alpha = studioSpriteCrossfadeAlpha(entry.state, time);
      if (!entry.state.fade || alpha <= 0) {
        fadeSprite.setVisible(false);
        continue;
      }
      fadeSprite
        .setPosition(owner.x, owner.y)
        .setAngle(owner.angle)
        .setFlip(owner.flipX, owner.flipY)
        .setDepth(owner.depth - 0.5)
        .setVisible(owner.visible)
        .setAlpha(alpha * owner.alpha);
    }
  }

  /** 배우가 제거될 때 페이드 스프라이트도 함께 정리한다. */
  release(owner: Phaser.GameObjects.Sprite): void {
    const entry = this.entries.get(owner);
    if (!entry) return;
    entry.sprite?.destroy();
    this.entries.delete(owner);
  }

  destroy(): void {
    for (const entry of this.entries.values()) entry.sprite?.destroy();
    this.entries.clear();
  }

  private entryOf(owner: Phaser.GameObjects.Sprite): CrossfadeEntry {
    let entry = this.entries.get(owner);
    if (!entry) {
      entry = { sprite: null, state: createStudioSpriteCrossfadeState(), pending: null };
      this.entries.set(owner, entry);
    }
    return entry;
  }

  private fadeSpriteOf(entry: CrossfadeEntry, owner: Phaser.GameObjects.Sprite): Phaser.GameObjects.Sprite {
    if (!entry.sprite || !entry.sprite.active) {
      entry.sprite = this.scene.add.sprite(owner.x, owner.y, owner.texture.key, owner.frame.name)
        .setVisible(false);
    }
    return entry.sprite;
  }
}
