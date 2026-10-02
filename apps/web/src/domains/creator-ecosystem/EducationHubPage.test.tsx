// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EducationHubPage } from "./EducationHubPage";

vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({
  useBilingual: () => (ko: string) => ko,
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/ecosystem/education"]}>
      <EducationHubPage />
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe("교육 허브 페이지", () => {
  it("교육기관 디렉터리를 렌더링한다", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "웹툰 성장 · 교육 허브" })).toBeTruthy();
    expect(screen.getByText("청강문화산업대학교 만화콘텐츠스쿨")).toBeTruthy();
    expect(screen.getByText("MBC C&I AI Multi-contents Creator Academy")).toBeTruthy();
  });

  it("유형 필터를 걸면 해당 유형만 남는다", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "대학 · 학과" }));
    expect(screen.getByText("청강문화산업대학교 만화콘텐츠스쿨")).toBeTruthy();
    expect(screen.queryByText("서울IT아카데미 홍대 · 웹툰/애니메이션")).toBeNull();
    expect(screen.queryByText("한국만화웹툰아카데미")).toBeNull();
  });

  it("검색 결과가 없으면 빈 상태와 초기화 행동을 보여준다", () => {
    renderPage();
    fireEvent.change(screen.getByPlaceholderText(/웹툰, 콘티, 취업, AI, 지역 등으로 검색/), {
      target: { value: "그런기관없음" },
    });
    expect(screen.getByText("조건에 맞는 교육기관이 없어요")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "검색 초기화" }));
    expect(screen.getByText("청강문화산업대학교 만화콘텐츠스쿨")).toBeTruthy();
  });
});
