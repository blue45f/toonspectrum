// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SupportPage } from "./SupportPage";

vi.mock("@/shared/seo/use-document-title", () => ({ useDocumentTitle: vi.fn() }));

afterEach(cleanup);
beforeEach(() => window.history.replaceState({}, "", "/support?token=private#draft"));

describe("support center", () => {
  it("separates private-safe troubleshooting from the public feedback board", () => {
    render(<MemoryRouter><SupportPage /></MemoryRouter>);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("막힌 작업");
    expect(screen.getByRole("link", { name: /공개 이용 질문/u }).getAttribute("href")).toBe("/feedback?type=question");
    expect(screen.getByRole("link", { name: /버그 제보/u }).getAttribute("href")).toBe("/feedback?type=bug");
  });

  it("filters resolution paths by symptoms and never includes query secrets in diagnostics", () => {
    render(<MemoryRouter><SupportPage /></MemoryRouter>);
    const input = screen.getByRole("searchbox", { name: "지원 항목 검색" });
    fireEvent.change(input, { target: { value: "브러시" } });
    expect(screen.getByRole("status").textContent).toContain("1개의 해결 경로");
    expect(screen.getByRole("heading", { level: 3, name: "드로잉·브러시·편집기" })).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 3, name: "계정·로그인·데이터" })).toBeNull();
    const diagnostic = screen.getByLabelText("복사될 진단 정보").textContent ?? "";
    expect(diagnostic).toContain("경로: /support");
    expect(diagnostic).not.toContain("token=private");
    expect(diagnostic).not.toContain("draft");
  });

  it("shows the first three resolution paths on phones and reveals the rest on demand", () => {
    render(<MemoryRouter><SupportPage /></MemoryRouter>);
    const cards = () => Array.from(document.querySelectorAll<HTMLElement>(".support-center__path-grid article"));
    expect(cards()).toHaveLength(6);
    // 넓은 화면은 모두 보이고, 휴대폰 스타일시트만 data-mobile-hidden 항목을 숨긴다.
    expect(cards().map((card) => card.hasAttribute("data-mobile-hidden"))).toEqual([false, false, false, true, true, true]);
    fireEvent.click(screen.getByRole("button", { name: "해결 경로 3개 더 보기" }));
    expect(cards().some((card) => card.hasAttribute("data-mobile-hidden"))).toBe(false);
    expect(screen.queryByRole("button", { name: /더 보기/u })).toBeNull();

    // 검색어가 바뀌면 다시 접힌다.
    fireEvent.change(screen.getByRole("searchbox", { name: "지원 항목 검색" }), { target: { value: "저장" } });
    expect(cards().length).toBeGreaterThan(0);
    expect(cards().length).toBeLessThanOrEqual(3);
  });

  it("keeps the diagnostic text behind a folded preview and still offers the copy action", () => {
    render(<MemoryRouter><SupportPage /></MemoryRouter>);
    const preview = document.querySelector("details.support-center__preview") as HTMLDetailsElement;
    expect(preview.open).toBe(false);
    expect(screen.getByRole("button", { name: /진단 정보 복사/u })).toBeTruthy();
  });
});

