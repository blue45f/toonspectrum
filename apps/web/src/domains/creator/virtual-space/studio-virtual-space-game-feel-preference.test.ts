// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import {
  applyInputSensitivity,
  applyMotionIntensity,
  DEFAULT_STUDIO_VIRTUAL_GAME_FEEL,
  parseStudioVirtualGameFeelPreference,
  readStudioVirtualGameFeelPreference,
  resolveStudioGameFeel,
  scalePhysicsAcceleration,
  studioOsPrefersReducedMotion,
  writeStudioVirtualGameFeelPreference,
} from "./studio-virtual-space-game-feel-preference";

afterEach(() => window.localStorage.clear());

describe("게임필 설정 파싱·저장", () => {
  it("기본값은 화면 흔들림 켜짐·파티클 80%·모션 100%다", () => {
    expect(DEFAULT_STUDIO_VIRTUAL_GAME_FEEL).toEqual({
      version: 1,
      screenShake: true,
      particleDensity: 0.8,
      motionIntensity: 1,
      followOsReducedMotion: true,
      inputSensitivity: 1,
      accelerationScale: 1,
    });
  });

  it("localStorage에 저장하고 읽어온다", () => {
    const value = { ...DEFAULT_STUDIO_VIRTUAL_GAME_FEEL, screenShake: false, particleDensity: 0.3 };
    expect(writeStudioVirtualGameFeelPreference(value)).toBe(true);
    expect(readStudioVirtualGameFeelPreference()).toEqual(value);
  });

  it("범위를 벗어난 값은 0~1로 고정한다", () => {
    const parsed = parseStudioVirtualGameFeelPreference({
      version: 1, screenShake: true, particleDensity: 2.5, motionIntensity: -1, followOsReducedMotion: true,
    });
    expect(parsed?.particleDensity).toBe(1);
    expect(parsed?.motionIntensity).toBe(0);
  });

  it("버전이 다르면 파싱을 거부한다", () => {
    expect(parseStudioVirtualGameFeelPreference({ version: 2, screenShake: true })).toBeNull();
    expect(parseStudioVirtualGameFeelPreference(null)).toBeNull();
    expect(parseStudioVirtualGameFeelPreference("shake")).toBeNull();
  });

  it("저장된 값이 없으면 기본값을 반환한다", () => {
    expect(readStudioVirtualGameFeelPreference()).toEqual(DEFAULT_STUDIO_VIRTUAL_GAME_FEEL);
  });
});

describe("OS reduced-motion 연동", () => {
  it("follow가 꺼져 있으면 OS 설정과 무관하게 적용된다", () => {
    const value = { ...DEFAULT_STUDIO_VIRTUAL_GAME_FEEL, followOsReducedMotion: false };
    const effective = resolveStudioGameFeel(value, true);
    expect(effective.reducedMotion).toBe(false);
    expect(effective.screenShakeEnabled).toBe(true);
    expect(effective.particleDensity).toBe(0.8);
  });

  it("follow가 켜져 있고 OS가 모션 감소를 요구하면 모든 효과가 꺼진다", () => {
    const effective = resolveStudioGameFeel(DEFAULT_STUDIO_VIRTUAL_GAME_FEEL, true);
    expect(effective.reducedMotion).toBe(true);
    expect(effective.screenShakeEnabled).toBe(false);
    expect(effective.particleDensity).toBe(0);
    expect(effective.motionIntensity).toBe(0);
  });

  it("OS가 모션 감소를 요구하지 않으면 설정 그대로 적용된다", () => {
    const effective = resolveStudioGameFeel(DEFAULT_STUDIO_VIRTUAL_GAME_FEEL, false);
    expect(effective.reducedMotion).toBe(false);
    expect(effective.screenShakeEnabled).toBe(true);
  });

  it("matchMedia가 없으면 false를 반환한다", () => {
    const original = globalThis.matchMedia;
    // @ts-expect-error matchMedia 삭제 시뮬레이션
    delete globalThis.matchMedia;
    expect(studioOsPrefersReducedMotion()).toBe(false);
    globalThis.matchMedia = original;
  });
});

describe("모션 강도 적용", () => {
  it("강도 0이면 진폭이 0이다", () => {
    expect(applyMotionIntensity(10, 0)).toBe(0);
  });

  it("강도 1이면 그대로다", () => {
    expect(applyMotionIntensity(10, 1)).toBe(10);
  });

  it("강도 0.5면 절반이다", () => {
    expect(applyMotionIntensity(10, 0.5)).toBe(5);
  });
});

describe("감도·가속 설정", () => {
  it("구버전 저장값(필드 없음)도 기본값으로 파싱된다", () => {
    const parsed = parseStudioVirtualGameFeelPreference({
      version: 1, screenShake: true, particleDensity: 0.8, motionIntensity: 1, followOsReducedMotion: true,
    });
    expect(parsed?.inputSensitivity).toBe(1);
    expect(parsed?.accelerationScale).toBe(1);
  });

  it("범위를 벗어난 감도·가속은 범위로 고정한다", () => {
    const parsed = parseStudioVirtualGameFeelPreference({
      version: 1, screenShake: true, particleDensity: 0.8, motionIntensity: 1, followOsReducedMotion: true,
      inputSensitivity: 9, accelerationScale: -3,
    });
    expect(parsed?.inputSensitivity).toBe(1.5);
    expect(parsed?.accelerationScale).toBe(0.5);
  });

  it("감도 1.5는 작은 입력을 증폭한다", () => {
    const boosted = applyInputSensitivity({ x: 0.4, y: 0 }, 1.5);
    expect(Math.hypot(boosted.x, boosted.y)).toBeCloseTo(0.6, 5);
  });

  it("감도 0.5는 입력을 둔화한다", () => {
    const dulled = applyInputSensitivity({ x: 0.8, y: 0 }, 0.5);
    expect(Math.hypot(dulled.x, dulled.y)).toBeCloseTo(0.4, 5);
  });

  it("출력 크기는 1을 넘지 않는다", () => {
    const clamped = applyInputSensitivity({ x: 1, y: 1 }, 1.5);
    expect(Math.hypot(clamped.x, clamped.y)).toBeLessThanOrEqual(1);
  });

  it("가속 배율은 가속도·감속도를 함께 스케일한다", () => {
    const config = { acceleration: 1600, deceleration: 2200 };
    const scaled = scalePhysicsAcceleration(config, 1.5);
    expect(scaled.acceleration).toBe(2400);
    expect(scaled.deceleration).toBe(3300);
  });

  it("배율 1이면 같은 객체를 반환한다", () => {
    const config = { acceleration: 1600, deceleration: 2200 };
    expect(scalePhysicsAcceleration(config, 1)).toBe(config);
  });
});
