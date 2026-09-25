// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TagsPage } from "./TagsPage";

const resource = vi.hoisted(() => ({ read: vi.fn(), reload: vi.fn() }));
vi.mock("@/platform/use-api-resource", () => ({ useApiResource: resource.read }));

const tags = Array.from({ length: 130 }, (_, index) => ({
  tag: `태그${String(index).padStart(3, "0")}`,
  count: 1_000 - index,
}));

beforeEach(() => {
  resource.read.mockReset();
  resource.reload.mockReset();
  resource.read.mockReturnValue({
    data: { tags },
    loading: false,
    error: null,
    reload: resource.reload,
  });
});

afterEach(cleanup);

describe("tags page progressive directory", () => {
  it("renders a bounded initial set and expands on demand", () => {
    render(<MemoryRouter initialEntries={["/tags"]}><TagsPage /></MemoryRouter>);
    expect(screen.getAllByRole("link")).toHaveLength(120);
    expect(screen.getByRole("status").textContent).toContain("130개 태그 중 120개 표시");
    fireEvent.click(screen.getByRole("button", { name: "다음 10개 태그 보기" }));
    expect(screen.getAllByRole("link")).toHaveLength(130);
    expect(screen.getByRole("status").textContent).toContain("130개 태그 중 130개 표시");
  });

  it("restores search and sort conditions from the URL", () => {
    render(<MemoryRouter initialEntries={["/tags?q=%ED%83%9C%EA%B7%B812&sort=name"]}><TagsPage /></MemoryRouter>);
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("태그12");
    expect(screen.getByRole("button", { name: "이름순" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("status").textContent).toContain("10개 태그 중 10개 표시");
    expect(screen.getAllByRole("link")).toHaveLength(10);
  });
});
