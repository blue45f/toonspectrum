// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { ShowcaseWorkGrid } from "./ShowcaseWorkGrid";

import type { WorkSummary } from "@/platform/creator-client";

function work(index: number): WorkSummary {
  return {
    id: `w${index}`,
    title: `작품 ${index}`,
    description: "",
    cover: "",
    tags: [],
    format: "upload",
    titleId: null,
    status: "published",
    author: { id: "author", name: "작가", avatar: "#7c5cfc" },
    likes: 0,
    comments: 0,
    views: 0,
    liked: false,
    createdAt: "2026-09-01T00:00:00.000Z",
  };
}

const works = (count: number): WorkSummary[] => Array.from({ length: count }, (_, index) => work(index + 1));

function renderGrid(items: readonly WorkSummary[], resetKey: string) {
  return (
    <MemoryRouter>
      <ShowcaseWorkGrid works={items} resetKey={resetKey} initial={4} step={4} />
    </MemoryRouter>
  );
}

afterEach(cleanup);

describe("ShowcaseWorkGrid", () => {
  it("처음에는 한 화면 분량만 그리고 남은 개수를 알리며 더 보기로 이어 붙인다", () => {
    render(renderGrid(works(10), "a"));
    expect(screen.getAllByRole("link")).toHaveLength(4);
    const more = screen.getByRole("button", { name: "더 보기 · 남은 작품 6개" });

    fireEvent.click(more);
    expect(screen.getAllByRole("link")).toHaveLength(8);
    fireEvent.click(screen.getByRole("button", { name: "더 보기 · 남은 작품 2개" }));
    expect(screen.getAllByRole("link")).toHaveLength(10);
    // 다 보여 주면 버튼이 사라진다.
    expect(screen.queryByRole("button", { name: /더 보기/u })).toBeNull();
  });

  it("분량 이하의 작품이면 더 보기 버튼을 그리지 않는다", () => {
    render(renderGrid(works(4), "a"));
    expect(screen.getAllByRole("link")).toHaveLength(4);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("목록 조건이 바뀌면(resetKey) 처음 분량으로 돌아가고, 같은 조건의 갱신에서는 펼친 분량을 지킨다", () => {
    const { rerender } = render(renderGrid(works(10), "latest"));
    fireEvent.click(screen.getByRole("button", { name: /더 보기/u }));
    expect(screen.getAllByRole("link")).toHaveLength(8);

    // 같은 조건에서 목록만 새로 받아도 펼친 분량은 유지한다.
    rerender(renderGrid(works(11), "latest"));
    expect(screen.getAllByRole("link")).toHaveLength(8);

    rerender(renderGrid(works(10), "likes"));
    expect(screen.getAllByRole("link")).toHaveLength(4);
  });
});
