// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { StudioQuickShapeGuide } from "./StudioQuickShapeGuide";
import { useI18n } from "@/shared/lib/i18n";

beforeEach(() => {
  useI18n.getState().setLang("ko");
});

afterEach(() => {
  cleanup();
  useI18n.getState().setLang("ko");
});

describe("StudioQuickShapeGuide", () => {
  it("10초 규칙 헤드라인을 렌더링한다", () => {
    render(<StudioQuickShapeGuide />);
    expect(
      screen.getByText("그리고 잠깐 누르고 있으면 삐뚤빼뚤한 선이 반듯한 도형으로"),
    ).toBeTruthy();
    expect(
      screen.getByRole("img", {
        name: "퀵쉐이프 동작 데모: 삐뚤빼뚤한 타원이 홀드 후 반듯한 타원으로 보정됩니다",
      }),
    ).toBeTruthy();
  });

  it("영어 로케일에서는 영어 카피를 보여준다", () => {
    useI18n.getState().setLang("en");
    render(<StudioQuickShapeGuide />);
    expect(
      screen.getByText("Draw, hold a moment, and a wobbly line becomes a clean shape"),
    ).toBeTruthy();
  });

  it("분류기의 신뢰도를 표시한다", () => {
    const { container } = render(<StudioQuickShapeGuide />);
    const text = container.textContent ?? "";
    expect(text).toContain("인식 신뢰도");
    // 타원으로 분류되어 신뢰도가 표시된다 (NN%)
    expect(text).toMatch(/\d+%/);
  });

  it("완벽 도형 토글이 두 번째 손가락 상태를 바꾼다", () => {
    render(<StudioQuickShapeGuide />);
    const toggle = screen.getByRole("button", { name: /완벽 도형/ });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(
      screen.getByText("두 번째 손가락을 대면 완벽한 원·정사각형·정삼각형이 됩니다"),
    ).toBeTruthy();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(
      screen.getByText("두 번째 손가락을 댄 상태 — 완벽한 원이 됩니다"),
    ).toBeTruthy();
  });

  it("다시 보기 버튼이 있다", () => {
    const { container } = render(<StudioQuickShapeGuide />);
    const replay = screen.getByRole("button", { name: "다시 보기" });
    const svgBefore = container.querySelector("svg");
    fireEvent.click(replay);
    // key 변경으로 svg 가 다시 마운트된다
    expect(container.querySelector("svg")).toBeTruthy();
    expect(container.querySelector("svg")).not.toBe(svgBefore);
  });

  it("3단계 안내와 주의 문구를 렌더링한다", () => {
    render(<StudioQuickShapeGuide />);
    expect(screen.getByText("대충 그립니다")).toBeTruthy();
    expect(screen.getByText("펜을 떼지 말고 0.5초 유지")).toBeTruthy();
    expect(screen.getByText("반듯한 도형으로 보정")).toBeTruthy();
    expect(
      screen.getByText("애매하면 원본을 그대로 둡니다. 직선은 15° 단위로 스냅됩니다."),
    ).toBeTruthy();
  });
});
