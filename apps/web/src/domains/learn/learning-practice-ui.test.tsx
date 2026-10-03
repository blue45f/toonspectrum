// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { LearnPage } from "./LearnPage";
import { PRACTICE_STORAGE_KEY } from "./learning-practice";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function renderLesson() {
  return render(
    <MemoryRouter initialEntries={["/learn/lessons/story-board"]}>
      <Routes>
        <Route path="/learn/*" element={<LearnPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("강좌 상세 실습 미션", () => {
  it("미션 카드와 스튜디오 실습 링크를 보여주고 완료 전에는 완료 버튼이 비활성이다", () => {
    renderLesson();
    expect(screen.getByRole("heading", { name: /스튜디오 실습/u })).toBeTruthy();
    const studioLink = screen.getByRole("link", { name: /스튜디오에서 실습하기/u });
    expect(studioLink.getAttribute("href")).toBe(
      "/studio/canvas?practice=lesson&lesson=story-board&mission=mission-story-board",
    );
    expect(studioLink.getAttribute("target")).toBe("_blank");
    expect(screen.getByText("시작 전", { selector: ".learn-mission-status" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "실습 완료로 표시" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("스튜디오로 이동하면 진행 중이 되고, 체크를 모두 채우면 실습 완료를 기록할 수 있다", () => {
    renderLesson();
    fireEvent.click(screen.getByRole("link", { name: /스튜디오에서 실습하기/u }));
    expect(screen.getByText("진행 중")).toBeTruthy();

    fireEvent.click(screen.getByRole("checkbox", { name: /주인공의 목표와 방해 요소/u }));
    fireEvent.click(screen.getByRole("checkbox", { name: /각 컷의 역할을/u }));
    fireEvent.click(screen.getByRole("checkbox", { name: /대사를 가려도/u }));
    expect(screen.getByText("완료할 수 있음")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "실습 완료로 표시" }));
    expect(screen.getByText("실습 완료", { selector: ".learn-mission-status" })).toBeTruthy();
    const stored = JSON.parse(window.localStorage.getItem(PRACTICE_STORAGE_KEY) ?? "{}") as {
      missions?: Record<string, { completedAt: string | null }>;
    };
    expect(stored.missions?.["story-board"]?.completedAt).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "실습 완료 취소" }));
    expect(screen.getByText("완료할 수 있음")).toBeTruthy();
  });

  it("강좌를 완료하면 다음 실습 미션을 제안한다", () => {
    renderLesson();
    fireEvent.click(screen.getByRole("checkbox", { name: /주인공의 목표와 방해 요소/u }));
    fireEvent.click(screen.getByRole("checkbox", { name: /각 컷의 역할을/u }));
    fireEvent.click(screen.getByRole("checkbox", { name: /대사를 가려도/u }));
    fireEvent.click(screen.getByRole("radio", { name: /컷마다 전달되는 정보와 읽는 순서/u }));
    fireEvent.click(screen.getByRole("button", { name: "실습 완료로 표시" }));
    fireEvent.click(screen.getByRole("button", { name: "이 강좌 학습 완료" }));

    expect(screen.getByRole("heading", { name: "수업을 완료했습니다" })).toBeTruthy();
    const suggestion = screen.getByRole("heading", { name: /다음 실습 미션/u });
    expect(suggestion.textContent).toContain("컷과 여백으로 스크롤의 호흡 만들기");
    expect(screen.getByRole("link", { name: /미션 강좌로 이동/u }).getAttribute("href")).toBe(
      "/learn/lessons/scroll-rhythm#scroll-rhythm-practice",
    );
  });
});
