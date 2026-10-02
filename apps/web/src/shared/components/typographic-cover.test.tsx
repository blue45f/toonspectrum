// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { coverHueFromSeed } from "@/shared/lib/cover-hue";

import { TypographicCover } from "./typographic-cover";

describe("coverHueFromSeed", () => {
  it("같은 seed는 항상 같은 색상환을 돌려준다", () => {
    expect(coverHueFromSeed("polyhaven:moon-lab")).toBe(coverHueFromSeed("polyhaven:moon-lab"));
  });

  it("항상 0~359 범위를 유지한다", () => {
    for (const seed of ["a", "툰스튜디오", "research/3d-assets", "x".repeat(80)]) {
      const hue = coverHueFromSeed(seed);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });

  it("다른 seed는 다른 색을 만든다", () => {
    expect(coverHueFromSeed("alpha")).not.toBe(coverHueFromSeed("beta"));
  });
});

describe("TypographicCover", () => {
  it("장식 영역으로 표시되고 제목 첫 글자와 라벨을 보여 준다", () => {
    const { container } = render(<TypographicCover title="밤의 실험실" seed="item-1" eyebrow="Poly Haven" />);
    const root = container.firstElementChild;
    expect(root?.getAttribute("aria-hidden")).toBe("true");
    expect(root?.textContent).toContain("밤");
    expect(root?.textContent).toContain("Poly Haven");
  });

  it("제목 전문을 커버에 다시 쓰지 않는다(본문 제목과 중복 방지)", () => {
    const { container } = render(<TypographicCover title="밤의 실험실 전경" seed="item-2" />);
    expect(container.textContent).not.toContain("밤의 실험실 전경");
  });
});
