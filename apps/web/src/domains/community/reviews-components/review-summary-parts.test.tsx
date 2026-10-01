// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { ReviewStatsSummary } from "./review-stats-summary";
import { TopReviewedList } from "./top-reviewed-list";

afterEach(cleanup);

describe("review summary parts", () => {
  it("shows placeholders instead of fake zero totals while stats are unknown", () => {
    const { container, rerender } = render(<ReviewStatsSummary stats={null} loading />);
    const values = [...container.querySelectorAll("dd")].map((node) => node.textContent);
    expect(values).toEqual(["—", "—", "—", "—"]);
    expect(container.querySelector("dl")?.getAttribute("aria-busy")).toBe("true");

    // 실패한 뒤에도 0이 아닌 자리 표시를 유지하되, 더 이상 "불러오는 중"으로 알리지 않는다.
    rerender(<ReviewStatsSummary stats={null} />);
    expect([...container.querySelectorAll("dd")].map((node) => node.textContent)).toEqual(["—", "—", "—", "—"]);
    expect(container.querySelector("dl")?.hasAttribute("aria-busy")).toBe(false);
  });

  it("renders real totals once the feed responds", () => {
    const { container } = render(
      <ReviewStatsSummary stats={{ total: 1234, avg: 4.256, spoilerPct: 12, distinctTitles: 56 }} />,
    );
    expect(container.textContent).toContain("1,234");
    expect(container.textContent).toContain("4.26");
    expect(container.textContent).toContain("12%");
    expect(container.querySelector("dl")?.hasAttribute("aria-busy")).toBe(false);
  });

  it("shows skeleton rows while loading instead of claiming the ranking is empty", () => {
    render(
      <MemoryRouter>
        <TopReviewedList items={[]} status="loading" />
      </MemoryRouter>,
    );
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(status.textContent).toContain("리뷰 집계를 불러오는 중");
    expect(screen.queryByText("아직 집계된 리뷰가 없습니다.")).toBeNull();
    expect(screen.queryByText("리뷰 집계를 지금은 불러올 수 없어요.")).toBeNull();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("separates an unavailable ranking from an empty one", () => {
    const { rerender } = render(
      <MemoryRouter>
        <TopReviewedList items={[]} status="unavailable" />
      </MemoryRouter>,
    );
    expect(screen.getByText("리뷰 집계를 지금은 불러올 수 없어요.")).toBeTruthy();
    expect(screen.queryByText("아직 집계된 리뷰가 없습니다.")).toBeNull();
    rerender(
      <MemoryRouter>
        <TopReviewedList items={[]} status="ready" />
      </MemoryRouter>,
    );
    expect(screen.getByText("아직 집계된 리뷰가 없습니다.")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
