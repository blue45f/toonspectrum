// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioWebtoonCanvasPresetPicker } from "./StudioWebtoonCanvasPresetPicker";

import { useI18n } from "@/shared/lib/i18n";

afterEach(cleanup);

beforeEach(() => {
  useI18n.getState().setLang("ko");
});

describe("StudioWebtoonCanvasPresetPicker", () => {
  it("marks the current Kakao aspect and applies Naver to the current drawing", () => {
    const onApplyPreset = vi.fn();
    render(
      <StudioWebtoonCanvasPresetPicker
        currentSize={{ width: 720, height: 8_000 }}
        onApplyPreset={onApplyPreset}
      />,
    );

    expect(
      screen.getByRole("button", { name: "카카오 720 × 8000px 규격 적용" })
        .getAttribute("aria-pressed"),
    ).toBe("true");

    fireEvent.click(
      screen.getByRole("button", { name: "네이버 690 × 8000px 규격 적용" }),
    );

    expect(onApplyPreset).toHaveBeenCalledExactlyOnceWith({
      id: "webtoon-naver",
      label: "네이버 연재형 · 690 × 8000px",
      hint: "690 × 8000px 플랫폼 비율로 현재 캔버스를 바꿉니다.",
      aspectW: 690,
      aspectH: 8_000,
    });
  });

  it("disables every platform action when document controls are locked", () => {
    render(<StudioWebtoonCanvasPresetPicker disabled onApplyPreset={vi.fn()} />);

    expect(screen.getAllByRole("button").every((button) => button.hasAttribute("disabled")))
      .toBe(true);
  });
});
