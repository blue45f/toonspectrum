// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { LESSONS } from "./learning-content";
import { LearningHome } from "./LearningHome";

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

function renderHome(entry = "/learn") {
  return render(<MemoryRouter initialEntries={[entry]}><LearningHome /><LocationProbe /></MemoryRouter>);
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("학습 홈 탭 구성", () => {
  it("첫 화면은 오늘의 학습 탭과 다음 단계(리서치→실습)를 보여 주고, 설정은 접어 둔다", () => {
    renderHome();
    const today = screen.getByRole("tab", { name: "오늘의 학습" });
    expect(today.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("heading", { name: /분 안에 이어갈 학습/u })).toBeTruthy();
    const plan = document.getElementById("learn-plan") as HTMLDetailsElement;
    expect(plan.open).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "학습 설정 바꾸기" }));
    expect(plan.open).toBe(true);

    const nextSteps = screen.getByRole("list", { name: "학습 다음 단계" });
    const hrefs = within(nextSteps).getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(hrefs[0]).toBe("/research");
    expect(hrefs).toContain("/learn/classroom");
    // 예전 자료 카드의 중복(같은 목적지 두 번)이 없다.
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("공유된 섹션 앵커와 강좌 필터 주소는 해당 탭으로 바로 열린다", async () => {
    renderHome("/learn#learning-paths");
    await waitFor(() => expect(screen.getByRole("tab", { name: /학습 경로/u }).getAttribute("aria-selected")).toBe("true"));
    expect(screen.getByRole("heading", { name: "목표까지 길을 잃지 않는 학습 경로" })).toBeTruthy();
    cleanup();

    renderHome("/learn?track=foundation");
    expect(screen.getByRole("tab", { name: /전체 강좌/u }).getAttribute("aria-selected")).toBe("true");
    expect((screen.getByLabelText("학습 과정") as HTMLSelectElement).value).toBe("foundation");
  });

  it("전체 강좌는 처음 6개만 보여 주고 '더 보기'로 늘리며, 필터 초기화는 탭을 유지한다", () => {
    renderHome("/learn?view=library");
    const library = screen.getByRole("heading", { name: "필요한 수업을 바로 찾는 전체 강좌" }).closest("section")!;
    const visibleCards = () => within(library).getAllByRole("article").length;
    expect(visibleCards()).toBe(Math.min(6, LESSONS.length));
    if (LESSONS.length > 6) {
      fireEvent.click(within(library).getByRole("button", { name: /강좌 더 보기/u }));
      expect(visibleCards()).toBe(Math.min(12, LESSONS.length));
    }

    fireEvent.change(within(library).getByLabelText("난이도"), { target: { value: "starter" } });
    fireEvent.click(within(library).getByRole("button", { name: "필터 초기화" }));
    expect(screen.getByTestId("location").textContent).toBe("/learn?view=library");
    expect(screen.getByRole("tab", { name: /전체 강좌/u }).getAttribute("aria-selected")).toBe("true");
  });
});
