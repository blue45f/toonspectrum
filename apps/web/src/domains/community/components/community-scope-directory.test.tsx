// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { CommunityScopeDirectory, type DirectoryScope } from "./community-scope-directory";

const resource = vi.hoisted(() => ({ read: vi.fn(), reload: vi.fn() }));
vi.mock("@/infrastructure/use-api-resource", () => ({ useApiResource: resource.read }));
vi.mock("@/shared/lib/i18n", () => ({ useT: () => (key: string) => key }));

beforeEach(() => {
  resource.read.mockReset(); resource.reload.mockReset();
  resource.read.mockReturnValue({ data: { items: [] }, loading: false, error: null, notFound: false, reload: resource.reload });
});
afterEach(cleanup);
const show = (scope: DirectoryScope = "title") => render(<MemoryRouter initialEntries={[`/community/${scope}`]}><CommunityScopeDirectory scope={scope} /></MemoryRouter>);

describe("community category directories", () => {
  it.each(["title", "author", "pencafe"] as const)("uses the board directory rather than an invalid targetless post feed: %s", (scope) => {
    show(scope);
    const url = new URL(resource.read.mock.calls.at(-1)?.[0], "https://example.test");
    expect(url.pathname).toBe("/api/community/boards");
    expect(url.searchParams.get("scope")).toBe(scope);
    expect(url.searchParams.get("targetId")).toBeNull();
    expect(screen.getByRole("link", { name: "통합 커뮤니티로 돌아가기" })).not.toBeNull();
  });
  it("sends Korean search and sorting through the URL and supports clearing", () => {
    show();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "한글 작품" } });
    fireEvent.submit(screen.getByRole("search"));
    expect(resource.read.mock.calls.at(-1)?.[0]).toContain("q=%ED%95%9C%EA%B8%80+%EC%9E%91%ED%92%88");
    fireEvent.change(screen.getByRole("combobox", { name: "정렬" }), { target: { value: "recent" } });
    expect(resource.read.mock.calls.at(-1)?.[0]).toContain("sort=recent");
    fireEvent.click(screen.getByRole("button", { name: "검색 지우기" }));
    expect(resource.read.mock.calls.at(-1)?.[0]).not.toContain("&q=");
  });
  it("links a matching board to its actual target and ignores wrong-scope or malformed rows", () => {
    resource.read.mockReturnValue({ data: { items: [
      { scope: "title", targetId: "nw-123", targetLabel: "별빛 이야기" },
      { scope: "author", targetId: "other", targetLabel: "wrong category" }, null,
    ] }, loading: false, error: null, reload: resource.reload });
    show();
    expect(screen.getByRole("link", { name: /별빛 이야기/ }).getAttribute("href")).toBe("/title/nw-123");
    expect(screen.queryByText("wrong category")).toBeNull();
  });
  it("offers an explicit retry and public exit on failed loading", () => {
    resource.read.mockReturnValue({ data: null, loading: false, error: "Unavailable", reload: resource.reload });
    show();
    expect(screen.getByRole("alert")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /common.retry/ }));
    expect(resource.reload).toHaveBeenCalledOnce();
    expect(screen.getByRole("link", { name: /이야기 나눌 작품 찾기/ })).not.toBeNull();
  });
  it("does not confuse an in-flight request with an empty community", () => {
    resource.read.mockReturnValue({ data: null, loading: true, error: null, reload: resource.reload });
    show();
    expect(screen.getByRole("status").textContent).toContain("찾고 있습니다");
    expect(screen.queryByText("아직 등록된 대화가 없어요")).toBeNull();
  });
});
