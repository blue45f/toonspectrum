// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { CommunityPage, CommunityScopePage } from "./CommunityPage";

vi.mock("@/shared/components/fan-cafe-panel", () => ({
  FanCafePanel: (props: { targetLabel?: string }) => (
    <div data-testid="fan-cafe-panel">{props.targetLabel}</div>
  ),
}));
vi.mock("@/shared/seo/use-document-title", () => ({
  useDocumentTitle: () => undefined,
}));
vi.mock("./components/community-scope-directory", () => ({
  CommunityScopeDirectory: (props: { scope: string }) => (
    <div data-testid="scope-directory">{props.scope}</div>
  ),
}));

afterEach(cleanup);

function renderScope(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/community/:scope" element={<CommunityScopePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("CommunityPage", () => {
  it("renders the bilingual hero, promotion, and directory sections", () => {
    render(
      <MemoryRouter initialEntries={["/community"]}>
        <CommunityPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "혼자 그린 이야기, 함께 넓어지는 세계." })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "아마추어 작가의 첫 연재, 새로운 웹툰의 첫 독자" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "어떤 이야기부터 나눌까요?" })).toBeTruthy();
    // 디렉터리 카드 라벨/설명이 바이링구얼 키로 렌더링되고, 카드 전체가 해당 범주로 이동한다.
    expect(screen.getByText("펜카페")).toBeTruthy();
    expect(screen.getByText("회원 카페")).toBeTruthy();
    expect(screen.getByText("번역·편집·작가 팬모임 공간")).toBeTruthy();
    expect(screen.getByRole("link", { name: /펜카페.*번역·편집·작가 팬모임 공간/ }).getAttribute("href")).toBe("/community/pencafe");
    expect(screen.getByRole("link", { name: /회원 카페/ }).getAttribute("href")).toBe("/community/cafes");
    expect(screen.getByTestId("fan-cafe-panel").textContent).toBe("통합 커뮤니티 피드");
    expect(screen.getByRole("region", { name: "통합 커뮤니티 피드" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /창작자 갤러리/ }).getAttribute("href")).toBe("/showcase");
    // 홍보 공간은 텍스트 화살표 대신 같은 카드 문법으로 이어진다.
    expect(screen.getByRole("link", { name: /트레일러 상영관/ }).getAttribute("href")).toBe("/community/promote?kind=trailer");
    // 이모지 아이콘을 쓰지 않는다(사이트 공통 아이콘 문법).
    expect(document.body.textContent).not.toMatch(/[📚🖋☕🫧]/u);
  });
});

describe("CommunityScopePage", () => {
  it("renders a bilingual scope header for a valid scope", () => {
    renderScope("/community/pencafe");

    expect(screen.getByRole("heading", { level: 1, name: "펜카페 커뮤니티" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "통합 커뮤니티로 이동" }).getAttribute("href")).toBe("/community");
    expect(screen.getByText("번역·편집·연재 운영 노하우를 함께 정리합니다.")).toBeTruthy();
    expect(screen.getByTestId("scope-directory").textContent).toBe("pencafe");
  });

  it("renders a bilingual not-found state for an unknown scope", () => {
    renderScope("/community/unknown");

    expect(screen.getByRole("heading", { name: "커뮤니티 범주를 찾을 수 없어요" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "통합 커뮤니티로 이동" })).toBeTruthy();
  });
});
