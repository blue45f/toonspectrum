// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Title } from "@/shared/lib/types";

import { DiscoverRecentShelf } from "./DiscoverRecentShelf";

const mocks = vi.hoisted(() => ({
  recentlyViewed: [] as string[],
  hydrated: true,
  read: vi.fn(),
}));

vi.mock("@/shared/lib/store", () => ({
  useApp: (selector: (state: { recentlyViewed: string[] }) => unknown) => selector({ recentlyViewed: mocks.recentlyViewed }),
  useHydrated: () => mocks.hydrated,
}));
vi.mock("@/platform/use-api-resource", () => ({ useApiResource: mocks.read }));
vi.mock("@/shared/components/title-card", () => ({
  TitleCard: ({ title }: { readonly title: Title }) => <a href={`/title/${title.slug}`}>{title.title}</a>,
}));
vi.mock("@/shared/components/section", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/components/section")>()),
  Rail: ({ children, ariaLabel }: { readonly children: ReactNode; readonly ariaLabel?: string }) => (
    <div role="list" aria-label={ariaLabel}>{children}</div>
  ),
}));

function title(id: string): Title {
  return { id, slug: id, title: `작품-${id}` } as Title;
}

beforeEach(() => {
  mocks.read.mockReset();
  mocks.recentlyViewed = [];
  mocks.hydrated = true;
});
afterEach(cleanup);

function renderShelf() {
  return render(
    <MemoryRouter>
      <DiscoverRecentShelf />
    </MemoryRouter>,
  );
}

describe("DiscoverRecentShelf", () => {
  it("stays hidden and does not fetch when this device has no visit history", () => {
    mocks.read.mockReturnValue({ data: null, loading: false, error: null });
    const { container } = renderShelf();
    expect(mocks.read).toHaveBeenCalledWith(null, expect.any(String));
    expect(container.textContent).toBe("");
  });

  it("lists recently viewed stories in visit order with a path to the library", () => {
    mocks.recentlyViewed = ["b", "a"];
    mocks.read.mockReturnValue({ data: { items: [title("a"), title("b")] }, loading: false, error: null });
    renderShelf();
    expect(mocks.read).toHaveBeenCalledWith(`/api/titles?ids=${encodeURIComponent("b,a")}`, expect.any(String));
    const rail = screen.getByRole("list", { name: "최근 본 작품" });
    expect(within(rail).getAllByRole("link").map((link) => link.textContent)).toEqual(["작품-b", "작품-a"]);
    expect(screen.getByRole("link", { name: /내 서재/ }).getAttribute("href")).toBe("/library");
  });

  it("hides itself when the stories cannot be loaded", () => {
    mocks.recentlyViewed = ["a"];
    mocks.read.mockReturnValue({ data: null, loading: false, error: "실패" });
    const { container } = renderShelf();
    expect(container.textContent).toBe("");
  });
});
