import { describe, expect, it, vi } from "vitest";
import { StudioCameraFollowModeController, studioBlinkScaleY, studioEffectiveGaitStride, studioGaitBodyOffset, studioGaitRockAngle, studioGaitShadowScale, studioGaitSquashScaleY, studioIdleSwayOffsetX, studioPlayerLocomotionProfile } from "./studio-virtual-space-locomotion-presentation";
import { DEFAULT_STUDIO_MOTION_CONFIG, stepStudioVirtualSpaceMotion } from "./studio-virtual-space-motion";
import { STUDIO_VIRTUAL_SPACE_WALK_SPEED } from "./studio-virtual-space-navigation";
import { studioGaitFrame } from "./studio-virtual-space-presentation";

describe("업무 공간의 걷기 표현", () => {
  it("내장 장소에서는 몸 크기에 맞게 걷고 네 자세를 초당 약 여섯 번 표시한다", () => {
    const profile = studioPlayerLocomotionProfile(true);
    const bodyHeight = 131 * .65;
    expect(profile.walkSpeed / bodyHeight).toBeGreaterThan(1);
    expect(profile.walkSpeed / bodyHeight).toBeLessThan(2);
    expect(profile.gaitDistancePerCycle).toBeDefined();
    const framesPerSecond = profile.walkSpeed / profile.gaitDistancePerCycle! * 4;
    expect(framesPerSecond).toBeGreaterThan(5);
    expect(framesPerSecond).toBeLessThan(7);
    expect(profile.walkSpeed * profile.sprintMultiplier).toBe(208);
  });

  it.each([30, 60, 120])("%iHz에서도 이동한 거리만큼 보폭이 진행하고 멈추면 고정된다", (hz) => {
    const profile = studioPlayerLocomotionProfile(true);
    const config = { ...DEFAULT_STUDIO_MOTION_CONFIG, maxSpeed: profile.walkSpeed };
    let state = { velocity: { x: profile.walkSpeed, y: 0 } };
    let distance = 0;
    const frames = new Set<number>();
    for (let index = 0; index < hz; index++) {
      state = stepStudioVirtualSpaceMotion(state, { x: 1, y: 0 }, 1 / hz, config);
      distance += Math.hypot(state.velocity.x, state.velocity.y) / hz;
      frames.add(studioGaitFrame(distance, 4, profile.gaitDistancePerCycle));
    }
    expect(distance).toBeCloseTo(160, 5);
    expect(frames).toEqual(new Set([0, 1, 2, 3]));
    const stoppedFrame = studioGaitFrame(distance, 4, profile.gaitDistancePerCycle);
    for (let index = 0; index < hz; index++) {
      expect(studioGaitFrame(distance, 4, profile.gaitDistancePerCycle)).toBe(stoppedFrame);
    }
  });

  it("기존 사용자 월드의 속도와 원본별 보폭을 보존한다", () => {
    const profile = studioPlayerLocomotionProfile(false);
    expect(profile.walkSpeed).toBe(STUDIO_VIRTUAL_SPACE_WALK_SPEED);
    expect(profile.sprintMultiplier).toBe(1.35);
    expect(profile.gaitDistancePerCycle).toBeUndefined();
  });

  it("양발 접지와 그림자의 주기를 맞추고 멈춤과 모션 감소에서는 고정한다", () => {
    expect(studioGaitShadowScale(0, 108, true, false)).toBe(1);
    expect(studioGaitShadowScale(27, 108, true, false)).toBeCloseTo(.92);
    expect(studioGaitShadowScale(54, 108, true, false)).toBe(1);
    expect(studioGaitShadowScale(108, 108, true, false)).toBe(1);
    expect(studioGaitShadowScale(27, 108, false, false)).toBe(1);
    expect(studioGaitShadowScale(27, 108, true, true)).toBe(1);
    expect(studioGaitShadowScale(NaN, 108, true, false)).toBe(1);
    expect(studioGaitShadowScale(27, 0, true, false)).toBe(1);
    const atWall = studioGaitShadowScale(21, 108, true, false);
    for (let render = 0; render < 120; render++) expect(studioGaitShadowScale(21, 108, true, false)).toBe(atWall);
  });
});

describe("몸의 보행 위상", () => {
  it("접지 순간에만 몸이 낮아지고 그림자와 같은 거리에서 같은 위상을 쓴다", () => {
    const stride = 108;
    // 그림자가 가장 작은 27px가 두 발 접지다. 몸도 정확히 그때 가장 낮아야 한다.
    const planted = studioGaitBodyOffset(27, stride, true, false);
    expect(planted.offsetY).toBeLessThan(0);
    // cos(π) = -1 이므로 접지 지점은 정확히 두 배 리프트만큼 내려간다.
    expect(planted.offsetY).toBeCloseTo(-7, 6);
    expect(studioGaitBodyOffset(0, stride, true, false).offsetY).toBeCloseTo(0, 6);
    expect(studioGaitBodyOffset(54, stride, true, false).offsetY).toBeCloseTo(0, 6);

    for (let step = 0; step <= 108; step += 3) {
      const distance = step;
      const shadow = studioGaitShadowScale(distance, stride, true, false);
      const body = studioGaitBodyOffset(distance, stride, true, false);
      // 둘 다 같은 (1 - cos)에서 나오므로 몸이 내리는 높이는 그림자가 줄어든 높이의 고정 배다.
      // 비례가 깨지면 그림자와 캐릭터가 따로 동동하지 않는다.
      const shadowDip = 1 - shadow;
      const bodyDip = -body.offsetY;
      expect(shadowDip === 0, `거리 ${distance}`).toBe(bodyDip === 0);
      if (shadowDip > 0) expect(bodyDip / shadowDip, `거리 ${distance}`).toBeCloseTo(87.5, 6);
    }
  });

  it("좌우 흔들림은 한 보행 주기에서 두 번 방향을 바꾼다", () => {
    const stride = 108;
    const first = studioGaitBodyOffset(13.5, stride, true, false).offsetX;
    const second = studioGaitBodyOffset(40.5, stride, true, false).offsetX;
    expect(first).toBeGreaterThan(0);
    expect(second).toBeLessThan(0);
    expect(first).toBeCloseTo(-second, 6);
    // 두 번째 보행 주기도 같은 자리에서 같은 흔들림으로 반복된다.
    expect(studioGaitBodyOffset(13.5 + stride, stride, true, false).offsetX).toBeCloseTo(first, 6);
  });

  it("정지·벽·모션 감소·입력 오류에서는 몸이 완전히 고정된다", () => {
    for (const offset of [
      studioGaitBodyOffset(27, 108, false, false),
      studioGaitBodyOffset(27, 108, true, true),
      studioGaitBodyOffset(NaN, 108, true, false),
      studioGaitBodyOffset(-5, 108, true, false),
      studioGaitBodyOffset(27, 0, true, false),
      studioGaitBodyOffset(27, Number.NaN, true, false),
    ]) {
      expect(offset).toEqual({ offsetX: 0, offsetY: 0 });
    }
  });

  it("보행 클립이 있는 내장 장소에서도 몸이 그림자와 함께 움직인다", () => {
    const profile = studioPlayerLocomotionProfile(true);
    expect(profile.gaitDistancePerCycle).toBeDefined();
    const stride = profile.gaitDistancePerCycle!;
    const moving = studioGaitBodyOffset(27, stride, true, false);
    const idle = studioGaitBodyOffset(27, stride, false, false);
    expect(moving.offsetY).toBeLessThan(idle.offsetY);
    expect(moving.offsetX).not.toBe(0);
    // 기존 사용자 월드는 보폭이 없으므로 원본 속도와 흔들림을 그대로 유지한다.
    expect(studioPlayerLocomotionProfile(false).gaitDistancePerCycle).toBeUndefined();
  });
});

describe("카메라 추적 모드 변경", () => {
  it("렌더링마다 같은 모드를 전달해도 Phaser의 추적 위치를 다시 초기화하지 않는다", () => {
    const position = { scrollX: 0 };
    const camera = { setDeadzone: vi.fn(() => { position.scrollX = 500; }) };
    const controller = new StudioCameraFollowModeController(camera);
    controller.update("follow");
    position.scrollX = 128;
    for (let frame = 0; frame < 120; frame++) controller.update("follow");
    expect(position.scrollX).toBe(128);
    expect(camera.setDeadzone).toHaveBeenCalledExactlyOnceWith(150, 100);
    controller.update("steady");
    expect(camera.setDeadzone).toHaveBeenLastCalledWith(200, 135);
    controller.update("cinematic");
    expect(camera.setDeadzone).toHaveBeenLastCalledWith(110, 78);
    controller.update("follow");
    expect(camera.setDeadzone).toHaveBeenCalledTimes(4);
  });
});

describe("유효 보폭 단일화", () => {
  it("장소 프로필 강제 보폭이 클립 보폭보다 우선하고, 둘 다 없으면 표준 84를 쓴다", () => {
    expect(studioEffectiveGaitStride(108, 76)).toBe(108);
    expect(studioEffectiveGaitStride(undefined, 76)).toBe(76);
    expect(studioEffectiveGaitStride(undefined, undefined)).toBe(84);
  });

  it("0 이하·비유한 보폭은 없는 것으로 보고 다음 후보로 넘어간다", () => {
    expect(studioEffectiveGaitStride(0, 70)).toBe(70);
    expect(studioEffectiveGaitStride(Number.NaN, -5)).toBe(84);
    expect(studioEffectiveGaitStride(undefined, Number.POSITIVE_INFINITY)).toBe(84);
  });
});

describe("걸음 위상 동기 2차 모션", () => {
  it("흔들림은 보폭 한 주기 안에서 부호가 바뀌고 진폭이 1.1도를 넘지 않는다", () => {
    const stride = 84;
    expect(studioGaitRockAngle(0, stride, true, false)).toBe(0);
    expect(studioGaitRockAngle(stride / 8, stride, true, false)).toBeGreaterThan(0);
    expect(studioGaitRockAngle(stride * 3 / 8, stride, true, false)).toBeLessThan(0);
    for (let d = 0; d <= stride * 2; d += 3) {
      expect(Math.abs(studioGaitRockAngle(d, stride, true, false))).toBeLessThanOrEqual(1.1);
    }
    // 한 보폭이 지나면 같은 위상으로 돌아온다.
    expect(studioGaitRockAngle(stride / 8 + stride, stride, true, false))
      .toBeCloseTo(studioGaitRockAngle(stride / 8, stride, true, false), 10);
  });

  it("접지 스쿼시는 발이 닿는 위상에서 가장 눌리고 주기 끝에서 원복한다", () => {
    const stride = 84;
    expect(studioGaitSquashScaleY(0, stride, true, false)).toBeCloseTo(0.988, 10);
    expect(studioGaitSquashScaleY(stride / 4, stride, true, false)).toBe(1);
    expect(studioGaitSquashScaleY(stride / 2, stride, true, false)).toBeCloseTo(0.988, 10);
  });

  it("정지·벽·모션 감소에서는 흔들림과 스쿼시가 모두 중립이다", () => {
    expect(studioGaitRockAngle(30, 84, false, false)).toBe(0);
    expect(studioGaitRockAngle(30, 84, true, true)).toBe(0);
    expect(studioGaitSquashScaleY(0, 84, false, false)).toBe(1);
    expect(studioGaitSquashScaleY(0, 84, true, true)).toBe(1);
    expect(studioGaitRockAngle(Number.NaN, 84, true, false)).toBe(0);
    expect(studioGaitSquashScaleY(30, 0, true, false)).toBe(1);
  });
});

describe("대기 생명감", () => {
  it("무게 이동은 ±1.2px 안에서 5.9초 주기로 반복되고 시드마다 위상이 어긋난다", () => {
    for (let t = 0; t <= 12_000; t += 250) {
      expect(Math.abs(studioIdleSwayOffsetX(t, 0.3, false))).toBeLessThanOrEqual(1.2);
    }
    expect(studioIdleSwayOffsetX(1_234, 0.3, false)).toBeCloseTo(studioIdleSwayOffsetX(1_234 + 5_900, 0.3, false), 10);
    expect(studioIdleSwayOffsetX(1_000, 0, false)).not.toBeCloseTo(studioIdleSwayOffsetX(1_000, 0.5, false), 3);
    expect(studioIdleSwayOffsetX(1_000, 0.3, true)).toBe(0);
  });

  it("깜빡임 대용 스쿼시는 대부분 1이고 간격 안에 한 번 0.986까지 눌렸다 돌아온다", () => {
    let min = 1;
    let dippedFrames = 0;
    for (let t = 0; t <= 6_800; t += 10) {
      const value = studioBlinkScaleY(t, 0, false);
      if (value < 1) dippedFrames += 1;
      min = Math.min(min, value);
    }
    expect(min).toBeCloseTo(0.986, 3);
    // 110ms 창만 눌리므로 표본(10ms 간격) 기준 20개를 넘지 않는다.
    expect(dippedFrames).toBeGreaterThan(0);
    expect(dippedFrames).toBeLessThanOrEqual(20);
    expect(studioBlinkScaleY(1_000, 0.5, true)).toBe(1);
  });
});
