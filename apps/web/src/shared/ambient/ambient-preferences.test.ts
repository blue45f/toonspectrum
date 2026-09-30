// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AMBIENT_DEFAULT_EFFECT,
  AMBIENT_DEFAULT_INTENSITY,
  AMBIENT_PREFERENCES_EVENT,
  AMBIENT_STORAGE_KEYS,
  readAmbientPreferences,
  subscribeAmbientPreferences,
  writeAmbientEffect,
  writeAmbientIntensity,
  writeAmbientLocation,
} from "./ambient-preferences";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("readAmbientPreferences", () => {
  it("처음에는 은은하게·자동·위치 미설정이다", () => {
    expect(readAmbientPreferences()).toEqual({ intensity: "subtle", effect: "auto", location: null });
    expect(AMBIENT_DEFAULT_INTENSITY).toBe("subtle");
    expect(AMBIENT_DEFAULT_EFFECT).toBe("auto");
  });

  it("이미 '끔'을 저장한 사용자는 그대로 꺼져 있다(기존 키 유지)", () => {
    localStorage.setItem("toonstudio.ambient.intensity.v1", "off");
    expect(readAmbientPreferences().intensity).toBe("off");
  });

  it("정해진 키 이름을 쓴다", () => {
    expect(AMBIENT_STORAGE_KEYS).toEqual({
      intensity: "toonstudio.ambient.intensity.v1",
      effect: "toonstudio.ambient.effect.v1",
      location: "toonstudio.ambient.location.v1",
    });
  });

  it("잘못된 값은 기본값으로 대체한다", () => {
    localStorage.setItem(AMBIENT_STORAGE_KEYS.intensity, "ultra");
    localStorage.setItem(AMBIENT_STORAGE_KEYS.effect, "tornado");
    localStorage.setItem(AMBIENT_STORAGE_KEYS.location, "maybe");
    expect(readAmbientPreferences()).toEqual({ intensity: "subtle", effect: "auto", location: null });
  });

  it("저장소 읽기가 막혀도 예외 없이 이번 세션에 고른 값을 쓴다", () => {
    writeAmbientEffect("snow");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    expect(() => readAmbientPreferences()).not.toThrow();
    expect(readAmbientPreferences().effect).toBe("snow");
  });
});

describe("write*", () => {
  it("강도·효과·위치를 저장하고 다시 읽는다", () => {
    writeAmbientIntensity("vivid");
    writeAmbientEffect("petals");
    writeAmbientLocation("on");
    expect(readAmbientPreferences()).toEqual({ intensity: "vivid", effect: "petals", location: "on" });
    expect(localStorage.getItem(AMBIENT_STORAGE_KEYS.effect)).toBe("petals");
  });

  it("저장소 쓰기가 막혀도 예외를 던지지 않는다", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    expect(() => writeAmbientIntensity("off")).not.toThrow();
  });

  it("같은 탭에 변경 이벤트를 보낸다(스펙터클 연출과 같은 이벤트 이름)", () => {
    const listener = vi.fn();
    window.addEventListener(AMBIENT_PREFERENCES_EVENT, listener);
    writeAmbientEffect("rain");
    window.removeEventListener(AMBIENT_PREFERENCES_EVENT, listener);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(AMBIENT_PREFERENCES_EVENT).toBe("toonstudio:ambient-intensity");
  });
});

describe("subscribeAmbientPreferences", () => {
  it("같은 탭 변경과 다른 탭의 관련 키 변경만 알린다", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAmbientPreferences(listener);
    writeAmbientIntensity("vivid");
    window.dispatchEvent(new StorageEvent("storage", { key: AMBIENT_STORAGE_KEYS.location }));
    window.dispatchEvent(new StorageEvent("storage", { key: "unrelated.key" }));
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    writeAmbientIntensity("subtle");
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
