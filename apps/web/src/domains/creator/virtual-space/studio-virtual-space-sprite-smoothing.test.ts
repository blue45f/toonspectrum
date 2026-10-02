import { describe, expect, it } from "vitest";

import {
  STUDIO_DISPLAY_DAMP_TAU_SECONDS,
  STUDIO_DISPLAY_SNAP_DISTANCE_PX,
  STUDIO_SPRITE_CROSSFADE_MS,
  createStudioSpriteCrossfadeState,
  dampStudioDisplayPoint,
  finishStudioSpriteCrossfade,
  studioBreathPhaseAt,
  studioSmoothingPhaseSeed,
  studioSpriteCrossfadeAlpha,
  transitionStudioSpriteCrossfade,
  type StudioSpriteVisualIdentity,
} from "./studio-virtual-space-sprite-smoothing";

const identity = (partial: Partial<StudioSpriteVisualIdentity> = {}): StudioSpriteVisualIdentity => ({
  key: "idle-sheet#0|idle",
  textureKey: "idle-sheet",
  frame: "0",
  animated: false,
  state: "idle",
  ...partial,
});

describe("dampStudioDisplayPoint", () => {
  it("첫 표시(null)에서는 목표를 그대로 반환한다", () => {
    expect(dampStudioDisplayPoint(null, { x: 10, y: 20 }, 0.016)).toEqual({ x: 10, y: 20 });
  });

  it("한 프레임(16ms) 뒤에는 간격의 약 27%를 좁힌다 (τ=50ms 지수 감쇠)", () => {
    const next = dampStudioDisplayPoint({ x: 0, y: 0 }, { x: 80, y: 0 }, 0.016);
    const expected = 80 * (1 - Math.exp(-0.016 / STUDIO_DISPLAY_DAMP_TAU_SECONDS));
    expect(next.x).toBeCloseTo(expected, 6);
    expect(next.x).toBeGreaterThan(16);
    expect(next.x).toBeLessThan(28);
    expect(next.y).toBe(0);
  });

  it("프레임레이트와 무관하게 수렴한다: 8ms 두 번 ≈ 16ms 한 번", () => {
    const target = { x: 60, y: 30 };
    const once = dampStudioDisplayPoint({ x: 0, y: 0 }, target, 0.016);
    const half = dampStudioDisplayPoint({ x: 0, y: 0 }, target, 0.008);
    const twice = dampStudioDisplayPoint(half, target, 0.008);
    expect(twice.x).toBeCloseTo(once.x, 6);
    expect(twice.y).toBeCloseTo(once.y, 6);
  });

  it("반복 적용하면 목표에 수렴하고 지나치지 않는다", () => {
    let point = { x: 0, y: 0 };
    for (let index = 0; index < 120; index += 1) {
      point = dampStudioDisplayPoint(point, { x: 50, y: -30 }, 1 / 60);
      expect(point.x).toBeLessThanOrEqual(50);
      expect(point.y).toBeGreaterThanOrEqual(-30);
    }
    expect(point.x).toBeCloseTo(50, 3);
    expect(point.y).toBeCloseTo(-30, 3);
  });

  it("스냅 임계보다 먼 목표는 텔레포트로 보고 즉시 이동한다", () => {
    const snapped = dampStudioDisplayPoint({ x: 0, y: 0 }, { x: STUDIO_DISPLAY_SNAP_DISTANCE_PX + 1, y: 0 }, 0.016);
    expect(snapped).toEqual({ x: STUDIO_DISPLAY_SNAP_DISTANCE_PX + 1, y: 0 });
  });

  it("enabled=false면 감쇠 없이 스냅한다 (모션 감소)", () => {
    expect(dampStudioDisplayPoint({ x: 0, y: 0 }, { x: 10, y: 10 }, 0.016, { enabled: false }))
      .toEqual({ x: 10, y: 10 });
  });

  it("dt가 0이면 움직이지 않는다", () => {
    expect(dampStudioDisplayPoint({ x: 3, y: 4 }, { x: 30, y: 40 }, 0)).toEqual({ x: 3, y: 4 });
  });
});

describe("호흡 위상", () => {
  it("시드는 결정적이고 0~1 구간이다", () => {
    expect(studioSmoothingPhaseSeed("npc-moa")).toBe(studioSmoothingPhaseSeed("npc-moa"));
    const seed = studioSmoothingPhaseSeed("npc-moa");
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThan(1);
    expect(studioSmoothingPhaseSeed("npc-yun")).not.toBe(seed);
  });

  it("위상은 주기(4초)마다 반복되고 항상 0~1이다", () => {
    expect(studioBreathPhaseAt(1_000, 0.25)).toBeCloseTo(studioBreathPhaseAt(5_000, 0.25), 10);
    for (const time of [0, 999, 4_000, 12_345, -500]) {
      const phase = studioBreathPhaseAt(time, 0.7);
      expect(phase).toBeGreaterThanOrEqual(0);
      expect(phase).toBeLessThan(1);
    }
  });
});

describe("크로스페이드 상태 머신", () => {
  it("첫 정체성은 페이드 없이 채택한다", () => {
    const { state, started } = transitionStudioSpriteCrossfade(
      createStudioSpriteCrossfadeState(), identity(), 1_000);
    expect(started).toBeNull();
    expect(state.identity?.textureKey).toBe("idle-sheet");
    expect(state.fade).toBeNull();
  });

  it("idle→walk 텍스처 교체에서 이전 그림으로 페이드를 시작한다", () => {
    const first = transitionStudioSpriteCrossfade(createStudioSpriteCrossfadeState(), identity(), 0).state;
    const walk = identity({ key: "walk-sheet#0|walk", textureKey: "walk-sheet", state: "walk" });
    const { state, started } = transitionStudioSpriteCrossfade(first, walk, 500);
    expect(started).toEqual({ textureKey: "idle-sheet", frame: "0", startedAt: 500 });
    expect(state.identity?.textureKey).toBe("walk-sheet");
    expect(state.fade).toEqual(started);
  });

  it("같은 텍스처의 게이트 걷기 프레임 진행은 페이드하지 않는다", () => {
    const walk0 = identity({ key: "walk-sheet#0|walk", textureKey: "walk-sheet", state: "walk" });
    const first = transitionStudioSpriteCrossfade(createStudioSpriteCrossfadeState(), walk0, 0).state;
    const walk1 = identity({ key: "walk-sheet#1|walk", textureKey: "walk-sheet", frame: "1", state: "walk" });
    const { state, started } = transitionStudioSpriteCrossfade(first, walk1, 100);
    expect(started).toBeNull();
    expect(state.fade).toBeNull();
    expect(state.identity?.frame).toBe("1");
  });

  it("애니메이션 재생 중 같은 텍스처의 프레임 진행은 페이드하지 않는다", () => {
    const anim3 = identity({ key: "walk-sheet|anim:walk-down|walk", textureKey: "walk-sheet", frame: "3", animated: true, state: "walk" });
    const first = transitionStudioSpriteCrossfade(createStudioSpriteCrossfadeState(), anim3, 0).state;
    const anim4 = identity({ key: "walk-sheet|anim:walk-down|walk", textureKey: "walk-sheet", frame: "4", animated: true, state: "walk" });
    const { started } = transitionStudioSpriteCrossfade(first, anim4, 100);
    expect(started).toBeNull();
  });

  it("방향 전환으로 걷기 시트가 바뀌면 페이드한다", () => {
    const down = identity({ key: "walk-down|anim:walk-down|walk", textureKey: "walk-down", frame: "2", animated: true, state: "walk" });
    const first = transitionStudioSpriteCrossfade(createStudioSpriteCrossfadeState(), down, 0).state;
    const left = identity({ key: "walk-left|anim:walk-left|walk", textureKey: "walk-left", frame: "2", animated: true, state: "walk" });
    const { started } = transitionStudioSpriteCrossfade(first, left, 200);
    expect(started?.textureKey).toBe("walk-down");
  });

  it("같은 시트에서 표정 프레임이 바뀌면 페이드한다 (표정 전이)", () => {
    const calm = identity({ key: "emotions#0|idle", textureKey: "emotions", frame: "0" });
    const first = transitionStudioSpriteCrossfade(createStudioSpriteCrossfadeState(), calm, 0).state;
    const happy = identity({ key: "emotions#1|idle", textureKey: "emotions", frame: "1" });
    const { started } = transitionStudioSpriteCrossfade(first, happy, 300);
    expect(started).toEqual({ textureKey: "emotions", frame: "0", startedAt: 300 });
  });

  it("enabled=false면 페이드 없이 즉시 교체한다 (모션 감소·저사양)", () => {
    const first = transitionStudioSpriteCrossfade(createStudioSpriteCrossfadeState(), identity(), 0).state;
    const talk = identity({ key: "talk-sheet#0|talk", textureKey: "talk-sheet", state: "talk" });
    const { state, started } = transitionStudioSpriteCrossfade(first, talk, 100, { enabled: false });
    expect(started).toBeNull();
    expect(state.fade).toBeNull();
    expect(state.identity?.textureKey).toBe("talk-sheet");
  });

  it("페이드 도중 다시 교체되면 현재 본 그림을 새 원본으로 삼는다", () => {
    const s0 = transitionStudioSpriteCrossfade(createStudioSpriteCrossfadeState(), identity(), 0).state;
    const walk = identity({ key: "walk-sheet#0|walk", textureKey: "walk-sheet", state: "walk" });
    const s1 = transitionStudioSpriteCrossfade(s0, walk, 100).state;
    const talk = identity({ key: "talk-sheet#0|talk", textureKey: "talk-sheet", state: "talk" });
    const { started } = transitionStudioSpriteCrossfade(s1, talk, 150);
    expect(started).toEqual({ textureKey: "walk-sheet", frame: "0", startedAt: 150 });
  });

  it("알파는 1에서 시작해 페이드 시간에 0이 되고, finish가 상태를 정리한다", () => {
    const s0 = transitionStudioSpriteCrossfade(createStudioSpriteCrossfadeState(), identity(), 0).state;
    const walk = identity({ key: "walk-sheet#0|walk", textureKey: "walk-sheet", state: "walk" });
    const { state } = transitionStudioSpriteCrossfade(s0, walk, 1_000);
    expect(studioSpriteCrossfadeAlpha(state, 1_000)).toBe(1);
    const mid = studioSpriteCrossfadeAlpha(state, 1_000 + STUDIO_SPRITE_CROSSFADE_MS / 2);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(0.5);
    expect(studioSpriteCrossfadeAlpha(state, 1_000 + STUDIO_SPRITE_CROSSFADE_MS)).toBe(0);
    expect(finishStudioSpriteCrossfade(state, 1_050).fade).not.toBeNull();
    expect(finishStudioSpriteCrossfade(state, 1_100).fade).toBeNull();
    expect(finishStudioSpriteCrossfade(state, 1_100).identity?.textureKey).toBe("walk-sheet");
  });

  it("동일 정체성 재적용은 진행 중인 페이드를 건드리지 않는다", () => {
    const s0 = transitionStudioSpriteCrossfade(createStudioSpriteCrossfadeState(), identity(), 0).state;
    const walk = identity({ key: "walk-sheet#0|walk", textureKey: "walk-sheet", state: "walk" });
    const s1 = transitionStudioSpriteCrossfade(s0, walk, 100).state;
    const { state, started } = transitionStudioSpriteCrossfade(s1, walk, 120);
    expect(started).toBeNull();
    expect(state.fade?.startedAt).toBe(100);
  });
});
