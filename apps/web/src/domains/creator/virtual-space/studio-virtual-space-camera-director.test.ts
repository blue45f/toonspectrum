import { describe, expect, it } from "vitest";
import {
  createStudioCameraDirectorFrameInput,
  createStudioCameraDirectorState,
  requestStudioCameraShake,
  StudioCameraDirector,
  stepStudioCameraDirector,
  STUDIO_CAMERA_FOCUS_ZOOM,
  type StudioCameraDirectorInput,
} from "./studio-virtual-space-camera-director";

function input(overrides: Partial<StudioCameraDirectorInput> = {}): StudioCameraDirectorInput {
  return {
    position: { x: 400, y: 300 },
    velocity: { x: 0, y: 0 },
    maxSpeed: 340,
    roomId: "room-a",
    now: 10_000,
    deltaSeconds: 1 / 60,
    lookAheadSeconds: 0.16,
    reducedMotion: false,
    ...overrides,
  };
}

describe("카메라 디렉터", () => {
  it("정지하면 타겟은 캐릭터 위치다", () => {
    const warmup = stepStudioCameraDirector(createStudioCameraDirectorState(), input({ now: 9_000 }));
    const { output } = stepStudioCameraDirector(warmup.state, input());
    expect(output.target.x).toBeCloseTo(400, 5);
    expect(output.target.y).toBeCloseTo(300, 5);
    expect(output.zoomFactor).toBe(1);
    expect(output.shakeOffset.x).toBe(0);
    expect(output.shakeOffset.y).toBe(0);
    expect(output.roomTransitioning).toBe(false);
  });

  it("이동 방향으로 룩어헤드가 생긴다", () => {
    const state = createStudioCameraDirectorState();
    const { output } = stepStudioCameraDirector(state, input({ velocity: { x: 340, y: 0 } }));
    expect(output.target.x).toBeGreaterThan(400);
    expect(output.target.y).toBeCloseTo(300, 5);
    // 최대 룩어헤드 거리 제한
    expect(output.target.x - 400).toBeLessThanOrEqual(72 + 0.001);
  });

  it("최대 속도에서 최대 줌아웃(8%)이다", () => {
    const state = createStudioCameraDirectorState();
    const { output } = stepStudioCameraDirector(state, input({ velocity: { x: 340, y: 0 } }));
    expect(output.zoomFactor).toBeCloseTo(0.92, 5);
  });

  it("중간 속도는 ease-out 줌 곡선을 따른다", () => {
    const state = createStudioCameraDirectorState();
    const half = stepStudioCameraDirector(state, input({ velocity: { x: 170, y: 0 } }));
    const full = stepStudioCameraDirector(state, input({ velocity: { x: 340, y: 0 } }));
    // ease-out: 중간 속도의 줌아웃이 선형(0.96)보다 크다
    expect(half.output.zoomFactor).toBeLessThan(0.96);
    expect(half.output.zoomFactor).toBeGreaterThan(full.output.zoomFactor);
  });

  it("방이 바뀌면 룸 전환 상태가 된다", () => {
    let state = createStudioCameraDirectorState();
    const first = stepStudioCameraDirector(state, input({ roomId: "room-a", now: 10_000 }));
    state = first.state;
    const second = stepStudioCameraDirector(state, input({ roomId: "room-b", now: 10_100 }));
    expect(second.output.roomTransitioning).toBe(true);
    expect(second.state.roomId).toBe("room-b");
    // 600ms 뒤에는 전환 종료
    const third = stepStudioCameraDirector(second.state, input({ roomId: "room-b", now: 11_000 }));
    expect(third.output.roomTransitioning).toBe(false);
  });

  it("흔들림은 시간이 지나며 감쇠한다", () => {
    let state = createStudioCameraDirectorState();
    state = requestStudioCameraShake(state, 0.8, 300, 10_000);
    const early = stepStudioCameraDirector(state, input({ now: 10_050 }));
    const earlyMagnitude = Math.hypot(early.output.shakeOffset.x, early.output.shakeOffset.y);
    expect(earlyMagnitude).toBeGreaterThan(0);
    const late = stepStudioCameraDirector(early.state, input({ now: 10_290 }));
    const lateMagnitude = Math.hypot(late.output.shakeOffset.x, late.output.shakeOffset.y);
    expect(lateMagnitude).toBeLessThan(earlyMagnitude);
    const done = stepStudioCameraDirector(late.state, input({ now: 10_400 }));
    expect(done.output.shakeOffset.x).toBe(0);
    expect(done.output.shakeOffset.y).toBe(0);
  });

  it("약한 흔들림은 진행 중인 강한 흔들림을 덮지 않는다", () => {
    let state = createStudioCameraDirectorState();
    state = requestStudioCameraShake(state, 0.9, 300, 10_000);
    const overwritten = requestStudioCameraShake(state, 0.3, 300, 10_050);
    expect(overwritten.shakeIntensity).toBe(0.9);
  });

  it("reduced-motion이면 룩어헤드·줌·흔들림이 모두 꺼진다", () => {
    let state = createStudioCameraDirectorState();
    state = requestStudioCameraShake(state, 1, 300, 10_000);
    const { output } = stepStudioCameraDirector(
      state,
      input({ velocity: { x: 340, y: 0 }, reducedMotion: true, now: 10_050 }),
    );
    expect(output.target.x).toBeCloseTo(400, 5);
    expect(output.zoomFactor).toBe(1);
    expect(output.shakeOffset.x).toBe(0);
    expect(output.shakeOffset.y).toBe(0);
  });
});

describe("캔버스용 카메라 디렉터(가변 상태)", () => {
  function frameInput(overrides: Partial<ReturnType<typeof createStudioCameraDirectorFrameInput>> = {}) {
    return Object.assign(createStudioCameraDirectorFrameInput(), {
      x: 400, y: 300, maxSpeed: 340, roomId: "room-a", now: 10_000, deltaSeconds: 1 / 60, lookAheadSeconds: 0.16,
    }, overrides);
  }

  it("순수 스텝과 같은 룩어헤드·흔들림을 내고 매번 같은 객체를 돌려준다", () => {
    const director = new StudioCameraDirector();
    let state = createStudioCameraDirectorState();
    state = requestStudioCameraShake(state, 0.6, 300, 10_000);
    director.requestShake(0.6, 300, 10_000);
    const pure = stepStudioCameraDirector(state, input({ velocity: { x: 200, y: -80 }, now: 10_040 }));
    const first = director.step(frameInput({ velocityX: 200, velocityY: -80, now: 10_040 }));
    expect(first.targetX).toBeCloseTo(pure.output.target.x, 9);
    expect(first.targetY).toBeCloseTo(pure.output.target.y, 9);
    expect(first.shakeX).toBeCloseTo(pure.output.shakeOffset.x, 9);
    expect(first.shakeY).toBeCloseTo(pure.output.shakeOffset.y, 9);
    expect(first.roomTransitioning).toBe(pure.output.roomTransitioning);
    const second = director.step(frameInput({ now: 10_500 }));
    expect(second).toBe(first);
    expect(second.shakeX).toBe(0);
  });

  it("포커스는 시간에 따라 목표를 상대 쪽으로 당기고 확대한 뒤 풀면 돌아온다", () => {
    const director = new StudioCameraDirector();
    director.step(frameInput({ now: 9_000 }));
    director.setFocus(500, 300);
    let frame = director.step(frameInput({ now: 9_016, deltaSeconds: 0.016 }));
    expect(frame.targetX).toBeGreaterThan(400);
    expect(frame.targetX).toBeLessThan(410);
    for (let index = 0; index < 80; index += 1) frame = director.step(frameInput({ now: 9_016 + index * 16, deltaSeconds: 0.016 }));
    expect(frame.targetX).toBeCloseTo(400 + 100 * 0.35, 1);
    expect(frame.zoomFactor).toBeCloseTo(STUDIO_CAMERA_FOCUS_ZOOM, 2);
    director.setFocus(null);
    for (let index = 0; index < 90; index += 1) frame = director.step(frameInput({ now: 10_000 + index * 16, deltaSeconds: 0.016 }));
    expect(frame.targetX).toBeCloseTo(400, 1);
    expect(frame.zoomFactor).toBeCloseTo(1, 3);
  });

  it("속도 줌은 달리기 중에만 순수 스텝 값으로 부드럽게 다가가고 걷기에서는 1에 머문다", () => {
    const pure = stepStudioCameraDirector(createStudioCameraDirectorState(), input({ velocity: { x: 300, y: 0 } }));
    const walking = new StudioCameraDirector();
    const sprinting = new StudioCameraDirector();
    let walkFrame = walking.step(frameInput({ velocityX: 300 }));
    let sprintFrame = sprinting.step(frameInput({ velocityX: 300, sprinting: true }));
    expect(sprintFrame.zoomFactor).toBeLessThan(1);
    expect(sprintFrame.zoomFactor).toBeGreaterThan(pure.output.zoomFactor);
    for (let index = 1; index <= 120; index += 1) {
      walkFrame = walking.step(frameInput({ velocityX: 300, now: 10_000 + index * 16, deltaSeconds: 0.016 }));
      sprintFrame = sprinting.step(frameInput({ velocityX: 300, sprinting: true, now: 10_000 + index * 16, deltaSeconds: 0.016 }));
    }
    expect(walkFrame.zoomFactor).toBe(1);
    expect(sprintFrame.zoomFactor).toBeCloseTo(pure.output.zoomFactor, 4);
  });

  it("reduced-motion이면 포커스·줌·흔들림을 모두 무시한다", () => {
    const director = new StudioCameraDirector();
    director.requestShake(1, 300, 10_000);
    director.setFocus(800, 300);
    const frame = director.step(frameInput({ velocityX: 340, reducedMotion: true, sprinting: true, now: 10_050 }));
    expect(frame.targetX).toBe(400);
    expect(frame.zoomFactor).toBe(1);
    expect(frame.shakeX).toBe(0);
    expect(frame.shakeY).toBe(0);
  });
});
