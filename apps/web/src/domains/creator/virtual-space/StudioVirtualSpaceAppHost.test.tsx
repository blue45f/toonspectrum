// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioVirtualSpaceAppHost } from "./StudioVirtualSpaceAppHost";
import { listQuizQuestions } from "./studio-virtual-space-app-store";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("가상공간 앱 호스트", () => {
  it("설치된 앱이 없으면 스토어 열기를 안내한다", () => {
    const onOpenStore = vi.fn();
    render(<StudioVirtualSpaceAppHost installedAppIds={[]} onOpenStore={onOpenStore} />);
    expect(screen.getByText("설치된 앱이 없어요. 스토어에서 미니 앱을 설치하세요.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "스토어 열기" }));
    expect(onOpenStore).toHaveBeenCalledOnce();
  });

  it("설치된 앱 목록에서 앱을 실행하면 앱별 화면을 보여준다", () => {
    render(<StudioVirtualSpaceAppHost installedAppIds={["conte-template-pack", "drawing-quiz"]} />);
    expect(screen.getByRole("button", { name: /콘티 템플릿 팩/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /콘티 템플릿 팩/ }));
    expect(screen.getByText("기본 4컷")).toBeTruthy();
    expect(screen.getByText("임팩트 스플래시")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "앱 목록으로" }));
    expect(screen.getByRole("button", { name: /작화 퀴즈/ })).toBeTruthy();
  });

  it("작화 퀴즈를 풀고 채점한다", () => {
    const questions = listQuizQuestions();
    render(<StudioVirtualSpaceAppHost installedAppIds={["drawing-quiz"]} />);
    fireEvent.click(screen.getByRole("button", { name: /작화 퀴즈/ }));

    questions.forEach((question) => {
      const fieldset = screen.getByText(question.prompt[0]).closest("fieldset");
      if (!fieldset) throw new Error("문항 fieldset을 찾지 못했습니다.");
      const radios = within(fieldset).getAllByRole("radio");
      const correct = radios[question.answerIndex];
      if (!correct) throw new Error("정답 선택지를 찾지 못했습니다.");
      fireEvent.click(correct);
    });

    fireEvent.click(screen.getByRole("button", { name: "채점하기" }));
    expect(
      screen.getByText(`채점 결과: ${questions.length}문제 중 ${questions.length}문제 정답`),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "다시 풀기" }));
    expect(screen.queryByText(/채점 결과/)).toBeNull();
  });

  it("포즈 챌린지는 주제를 뽑고 타이머가 동작한다", () => {
    vi.useFakeTimers();
    render(<StudioVirtualSpaceAppHost installedAppIds={["pose-challenge"]} />);
    fireEvent.click(screen.getByRole("button", { name: /포즈 챌린지/ }));

    const timer = screen.getByRole("timer");
    expect(timer.textContent).toMatch(/남은 시간 \d+초/);
    const before = timer.textContent;

    fireEvent.click(screen.getByRole("button", { name: "시작" }));
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByRole("timer").textContent).not.toBe(before);
    expect(screen.getByRole("timer").textContent).toMatch(/남은 시간 \d+초/);
  });
});
