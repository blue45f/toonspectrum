// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { LearningClassroomPage } from "./LearningClassroomPage";
import { LearningResourcesPage } from "./LearningResourcesPage";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("academy product surfaces", () => {
  it("renders the curated resource hub with role and production filters", () => {
    render(<MemoryRouter initialEntries={["/learn/resources?role=artist"]}><LearningResourcesPage /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: /좋은 강의를 찾고/u })).toBeTruthy();
    expect((screen.getByLabelText("직군") as HTMLSelectElement).value).toBe("artist");
    expect(screen.getByLabelText("제작 단계")).toBeTruthy();
    expect(screen.getAllByText("공식·검증 출처").length).toBeGreaterThan(0);
  });

  it("builds a classroom curriculum and adds a locally managed assignment", () => {
    render(<MemoryRouter initialEntries={["/learn/classroom"]}><LearningClassroomPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /스토리·콘티 집중/u }));
    expect(screen.getByDisplayValue("스토리·콘티 집중 · 6주")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("강좌·자료"), { target: { value: "lesson:inking" } });
    fireEvent.click(screen.getByRole("button", { name: "주차에 추가" }));
    const addedLesson = screen.getByRole("link", { name: /선 굵기와 필압/u });
    expect(addedLesson).toBeTruthy();
    const removeButton = addedLesson.parentElement?.querySelector("button");
    expect(removeButton).toBeTruthy();
    fireEvent.click(removeButton as HTMLButtonElement);
    expect(screen.queryByRole("link", { name: /선 굵기와 필압/u })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "주차 추가" }));
    // 새 주차는 수업 설계 탭의 자료 배치 선택지와 과제 탭의 주차 선택지에 모두 생긴다.
    fireEvent.click(screen.getByRole("tab", { name: /과제/u }));
    expect(screen.getAllByRole("option", { name: /7주차 · 새 학습 주차 7/u, hidden: true })).toHaveLength(2);

    fireEvent.change(screen.getByLabelText("과제 이름"), { target: { value: "3컷 콘티 제출" } });
    fireEvent.click(screen.getByRole("button", { name: "과제 추가" }));
    expect(screen.getByRole("heading", { name: "3컷 콘티 제출" })).toBeTruthy();
    // 과제가 생기면 탭 옆에 완료 현황이 보인다.
    expect(screen.getByRole("tab", { name: /과제.*0\/1/u })).toBeTruthy();
  });

  it("splits the classroom into design, assignment and expansion tabs and folds the weeks", () => {
    render(<MemoryRouter initialEntries={["/learn/classroom"]}><LearningClassroomPage /></MemoryRouter>);
    expect(screen.getByRole("tab", { name: /수업 설계/u }).getAttribute("aria-selected")).toBe("true");

    // 주차는 접는 목록 — 처음에는 첫 주차만 펼쳐 모바일에서 8주가 한 줄씩만 보인다.
    const weeks = Array.from(document.querySelectorAll<HTMLDetailsElement>("details.academy-week"));
    expect(weeks.length).toBe(8);
    expect(weeks.map((week) => week.open)).toEqual([true, false, false, false, false, false, false, false]);
    fireEvent.click(screen.getByRole("button", { name: "모두 펼치기" }));
    expect(weeks.every((week) => week.open)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "모두 접기" }));
    expect(weeks.every((week) => !week.open)).toBe(true);

    // 과제가 없으면 "새 과제 추가"가 펼쳐져 있고, 기관 확장 계획은 별도 탭에 있다.
    fireEvent.click(screen.getByRole("tab", { name: /과제/u }));
    const addAssignment = screen.getByText("새 과제 추가").closest("details") as HTMLDetailsElement;
    expect(addAssignment.open).toBe(true);
    expect(screen.getByRole("heading", { name: "아직 만든 과제가 없습니다." })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /기관 확장/u }));
    expect(screen.getByRole("heading", { name: "교육기관 확장을 위한 다음 연결점" })).toBeTruthy();
    // 다음 행동: 자료 라이브러리와 리서치 데스크로 이어진다.
    expect(screen.getAllByRole("link", { name: /강좌·자료 라이브러리/u }).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /리서치 데스크/u }).getAttribute("href")).toBe("/research");
  });
});
