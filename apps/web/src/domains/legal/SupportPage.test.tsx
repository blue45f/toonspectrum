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
});
