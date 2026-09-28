// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useI18n } from "@/shared/lib/i18n";
import { Studio3dIllustration } from "./Studio3dIllustration";

beforeEach(() => useI18n.getState().setLang("ko"));
afterEach(() => { cleanup(); useI18n.getState().setLang("ko"); });

describe("3D 스튜디오 예시 일러스트", () => {
  it("안내용 일러스트임을 명시하고 실제 모델이나 편집 도구로 가장하지 않는다", () => {
    const { container } = render(<Studio3dIllustration />);
    expect(screen.getByText("창작 영감을 위한 예시 일러스트")).toBeTruthy();
    const images = [...container.querySelectorAll("img")];
    expect(images.map((image) => image.getAttribute("src"))).toEqual([
      "/brand/illustrated-20260928/character-pink.webp",
      "/brand/illustrated-20260928/character-blue.webp",
    ]);
    for (const image of images) {
      expect(image.alt).toBe("");
      expect(image.getAttribute("loading")).toBe("lazy");
      expect(image.closest('[aria-hidden="true"]')).toBeTruthy();
    }
    expect(container.querySelector("canvas, button, input")).toBeNull();
  });

  it("영문 UI에서도 예시임을 밝히며 compact 표시는 기존 편집 상태를 요구하지 않는다", () => {
    useI18n.getState().setLang("en");
    const { container } = render(<Studio3dIllustration compact />);
    expect(screen.getByText("Illustrations for creative inspiration")).toBeTruthy();
    expect(screen.getByText("Prepare your character’s first scene")).toBeTruthy();
    expect(container.querySelector('figure[data-compact="true"]')).toBeTruthy();
  });
});
