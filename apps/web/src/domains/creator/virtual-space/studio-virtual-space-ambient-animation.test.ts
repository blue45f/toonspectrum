import { describe, expect, it } from "vitest";
import {
  advanceStudioAmbientAnimations,
  STUDIO_AMBIENT_ANIMATION_KINDS,
  studioAmbientAnimationLabel,
  type StudioAmbientObject,
} from "./studio-virtual-space-ambient-animation";

const VIEWPORT = { x: 0, y: 0, width: 1280, height: 960 };

function run(objects: readonly StudioAmbientObject[], nowMs: number, ambientLevel = 0.5, reducedMotion = false) {
  return advanceStudioAmbientAnimations(objects, {
    nowMs,
    ambientLevel,
    viewport: VIEWPORT,
    reducedMotion,
  });
}

describe("advanceStudioAmbientAnimations", () => {
  it("12종의 애니메이션 종류를 지원한다", () => {
    expect(STUDIO_AMBIENT_ANIMATION_KINDS).toHaveLength(12);
  });

  it("화면 밖 오브젝트는 컬링한다 (visible=false)", () => {
    const objects: readonly StudioAmbientObject[] = [
      { id: "inside", kind: "flag-wave", x: 640, y: 480 },
      { id: "outside", kind: "flag-wave", x: 5000, y: 5000 },
    ];
    const frames = run(objects, 1000);
    expect(frames[0]!.visible).toBe(true);
    expect(frames[1]!.visible).toBe(false);
    expect(frames[1]!.rotation).toBe(0);
  });

  it("viewport가 null이면 컬링하지 않는다", () => {
    const frames = advanceStudioAmbientAnimations(
      [{ id: "far", kind: "windmill-spin", x: 9000, y: 9000 }],
      { nowMs: 1000, ambientLevel: 0.5, viewport: null, reducedMotion: false },
    );
    expect(frames[0]!.visible).toBe(true);
  });

  it("풍차·물레방아는 시간이 지남에 따라 회전한다", () => {
    const objects: readonly StudioAmbientObject[] = [{ id: "mill", kind: "windmill-spin", x: 100, y: 100 }];
    const first = run(objects, 0)[0]!;
    const second = run(objects, 2000)[0]!;
    expect(second.rotation).toBeGreaterThan(first.rotation);
  });

  it("밤이 되면 조명 계열 강도가 올라간다 (낮/밤 사이클 연동)", () => {
    const objects: readonly StudioAmbientObject[] = [
      { id: "lamp", kind: "lamp-glow", x: 100, y: 100 },
      { id: "neon", kind: "neon-flicker", x: 200, y: 100 },
      { id: "win", kind: "window-flicker", x: 300, y: 100 },
      { id: "bldg", kind: "building-glow", x: 400, y: 100 },
    ];
    const day = run(objects, 5000, 1.0);   // 정오
    const night = run(objects, 5000, 0.3); // 심야
    for (let index = 0; index < objects.length; index += 1) {
      expect(night[index]!.intensity).toBeGreaterThan(day[index]!.intensity);
    }
    expect(night[0]!.intensity).toBeGreaterThan(0.5);
    expect(day[3]!.intensity).toBeLessThan(0.1);
  });

  it("분수는 주기적으로 사이클 번호가 바뀐다", () => {
    const objects: readonly StudioAmbientObject[] = [{ id: "fountain", kind: "fountain-spray", x: 100, y: 100 }];
    const first = run(objects, 0)[0]!;
    const second = run(objects, 3000)[0]!;
    expect(second.cycle).toBeGreaterThan(first.cycle);
  });

  it("reduced-motion에서는 움직임이 멈춘다", () => {
    const objects: readonly StudioAmbientObject[] = [{ id: "mill", kind: "windmill-spin", x: 100, y: 100 }];
    const first = run(objects, 0, 0.5, true)[0]!;
    const second = run(objects, 5000, 0.5, true)[0]!;
    expect(second.rotation).toBe(first.rotation);
  });

  it("같은 시각에는 같은 프레임을 낸다 (결정적)", () => {
    const objects: readonly StudioAmbientObject[] = [
      { id: "flag", kind: "flag-wave", x: 100, y: 100, seed: "a" },
      { id: "smoke", kind: "smoke-rise", x: 200, y: 100, seed: "b" },
    ];
    expect(run(objects, 4242)).toEqual(run(objects, 4242));
  });
});

describe("studioAmbientAnimationLabel", () => {
  it("한·영 라벨을 반환한다", () => {
    expect(studioAmbientAnimationLabel("flag-wave")).toEqual({ ko: "깃발 펄럭임", en: "Flag waving" });
    expect(studioAmbientAnimationLabel("fountain-spray")).toEqual({ ko: "분수 물줄기", en: "Fountain spray" });
  });
});
