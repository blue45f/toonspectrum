// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FandomCosplayPage } from "./FandomCosplayPage";

vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({
  useBilingual: () => (ko: string) => ko,
}));

vi.mock("@/domains/community/components/fan-cafe-panel", () => ({
  FanCafePanel: () => <div data-testid="fan-cafe-panel" />,
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/ecosystem/fandom"]}>
      <FandomCosplayPage />
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe("팬덤 · 코스프레 허브 페이지", () => {
  it("안전 가이드와 팬 피드를 함께 렌더링한다", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "팬덤 · 코스프레 허브" })).toBeTruthy();
    expect(screen.getByText("팬덤 문화를 지키는 세 가지 약속")).toBeTruthy();
    expect(screen.getByText("촬영 동의 우선")).toBeTruthy();
    expect(screen.getByText("개인정보 · 미성년자 보호")).toBeTruthy();
    expect(screen.getByTestId("fan-cafe-panel")).toBeTruthy();
  });

  it("행사 글 모아보기는 커뮤니티로 연결된다", () => {
    renderPage();
    const link = screen.getByRole("link", { name: /행사 글 모아보기/ });
    expect(link.getAttribute("href")).toBe("/community");
  });
});
