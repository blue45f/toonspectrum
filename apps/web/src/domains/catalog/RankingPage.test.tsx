// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RANK_AXES } from "@/shared/lib/ranking";

import { RankingPage } from "./RankingPage";

vi.mock("@/shared/components/ranking-board", () => ({ RankingBoard: () => <div data-testid="ranking-board" /> }));
vi.mock("@/shared/components/ranking-method", () => ({ RankingMethod: () => <p>산식 본문</p> }));
vi.mock("@/shared/components/share-page-button", () => ({ SharePageButton: () => <button type="button">랭킹 공유</button> }));

afterEach(cleanup);

function renderPage(entry = "/ranking") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <RankingPage />
    </MemoryRouter>,
  );
}

describe("통합 랭킹 페이지", () => {
  it("순위 보드 다음에 탐색·비교·커뮤니티로 이어지는 행동을 보여 준다", () => {
    renderPage();
    const next = screen.getByRole("navigation", { name: /랭킹 다음 행동/u });
    const hrefs = within(next).getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual(["/explore", "/compare", "/community"]);
    const board = screen.getByTestId("ranking-board");
    expect(board.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("산식 설명은 접어 두고, 접힌 줄에 관점 수를 알려 준다", () => {
    const { container } = renderPage();
    const details = container.querySelector<HTMLDetailsElement>("details[data-site-disclosure]");
    expect(details).not.toBeNull();
    expect(details?.open).toBe(false);
    expect(within(details as HTMLElement).getByText(new RegExp(`${RANK_AXES.length}가지 관점`, "u"))).toBeTruthy();
    expect(within(details as HTMLElement).getByText("산식 본문")).toBeTruthy();
  });

  it("현재 축을 주소에서 읽어 머리말에 사람이 읽는 이름으로 표시한다", () => {
    renderPage("/ranking?axis=rating");
    const label = RANK_AXES.find((axis) => axis.key === "rating")?.label ?? "";
    expect(label).not.toBe("");
    const current = screen.getByText(/현재 축:/u);
    expect(current.textContent).toContain(label);
    expect(current.textContent).not.toContain("rating");
  });
});
