import { describe, expect, it, vi } from "vitest";
import { StudioCameraFollowModeController, studioGaitShadowScale, studioPlayerLocomotionProfile } from "./studio-virtual-space-locomotion-presentation";
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
