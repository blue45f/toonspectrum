// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { createSpectacleOverlayCanvas, pickSpectacle } from "./spectacle-canvas";

describe("pickSpectacle", () => {
  it("목록 안에서 원소를 고른다", () => {
    const list = ["a", "b", "c"] as const;
    let s = 11;
    const random = () => {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return s / 4294967296;
    };
    for (let i = 0; i < 30; i++) {
      expect(list).toContain(pickSpectacle(random, list));
    }
  });

  it("결정적 시드로 재현 가능하다", () => {
    const make = () => {
      let s = 5;
      return () => {
        s = (s * 1664525 + 1013904223) % 4294967296;
        return s / 4294967296;
      };
    };
    const list = [1, 2, 3, 4, 5];
    expect(pickSpectacle(make(), list)).toBe(pickSpectacle(make(), list));
  });
});

describe("createSpectacleOverlayCanvas", () => {
  it("2D 컨텍스트가 없으면 null을 반환하고 예외를 던지지 않는다", () => {
    // jsdom에는 canvas 2D 구현이 없어 null이 정상이다
    const overlay = createSpectacleOverlayCanvas();
    expect(overlay).toBeNull();
    expect(document.querySelector(".spectacle-confetti-canvas")).toBeNull();
  });
});
