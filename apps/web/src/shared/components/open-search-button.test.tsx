// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenSearchButton } from "./open-search-button";

const open = vi.hoisted(() => vi.fn());
vi.mock("@/shared/lib/ui-store", () => ({
  useUi: (select: (state: { openCommandPalette: () => void }) => unknown) => select({ openCommandPalette: open }),
}));
afterEach(() => { cleanup(); open.mockClear(); });
describe("accessible search action", () => {
  it("retains an accessible name when responsive text and icon are hidden from accessibility", () => {
    render(<OpenSearchButton ariaLabel="작품·도구·메뉴 검색"><span hidden>작품·도구·메뉴 검색</span><svg aria-hidden="true" /></OpenSearchButton>);
    const button = screen.getByRole("button", { name: "작품·도구·메뉴 검색" });
    button.focus();
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    expect(open).toHaveBeenCalledTimes(1);
  });
  it("preserves visible text names for existing callers", () => {
    render(<OpenSearchButton>Search</OpenSearchButton>);
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(open).toHaveBeenCalledTimes(1);
  });
});
