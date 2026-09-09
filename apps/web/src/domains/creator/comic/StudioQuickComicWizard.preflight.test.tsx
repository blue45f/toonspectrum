// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioQuickComicWizard } from "./StudioQuickComicWizard";

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.body.style.overflow = "";
  document.documentElement.style.overflow = "";
});

function moveToDialogueStep(): void {
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
}

describe("StudioQuickComicWizard preflight", () => {
  it("audits dense dialogue live and applies the recommended panel flow", () => {
    render(<StudioQuickComicWizard onApply={vi.fn()} onCancel={vi.fn()} />);
    moveToDialogueStep();
    const script = Array.from(
      { length: 8 },
      (_, index) => `${index % 2 === 0 ? "민수" : "지영"}: ${index + 1}번째 대사`,
    ).join("\n");

    fireEvent.change(screen.getByRole("textbox", { name: "웹툰 대사" }), {
      target: { value: script },
    });

    expect(document.querySelector("[data-studio-comic-preflight='true']")).toBeTruthy();
    expect(screen.getByText("한 컷에 대사가 몰립니다")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "추천 레이아웃 적용" }));
    expect(screen.getByText("추천 구성 사용 중")).toBeTruthy();
  });

  it("splits long dialogue from the live audit without dropping speaker labels", () => {
    render(<StudioQuickComicWizard onApply={vi.fn()} onCancel={vi.fn()} />);
    moveToDialogueStep();
    const textarea = screen.getByRole("textbox", { name: "웹툰 대사" }) as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: {
        value: `민수: ${"길고 중요한 설명을 자연스럽게 여러 말풍선으로 나누어야 합니다. ".repeat(4)}`,
      },
    });

    expect(screen.getByText("긴 말풍선이 있어요")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "긴 대사 자동 나누기" }));

    const splitLines = textarea.value.split("\n");
    expect(splitLines.length).toBeGreaterThan(1);
    expect(splitLines.every((line) => line.startsWith("민수: "))).toBe(true);
  });
});
