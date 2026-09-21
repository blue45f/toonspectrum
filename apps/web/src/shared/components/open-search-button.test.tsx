// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { OpenSearchButton } from "./open-search-button";

const open = vi.hoisted(() => vi.fn());
vi.mock("@/shared/lib/ui-store", () => ({
  useUi: (select: (state: { openCommandPalette: () => void }) => unknown) => select({ openCommandPalette: open }),
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("keeps an accessible search name when responsive chrome shows only an icon", () => {
  render(<OpenSearchButton aria-label="작품·도구·메뉴 검색"><span aria-hidden="true">⌕</span></OpenSearchButton>);
  const button = screen.getByRole("button", { name: "작품·도구·메뉴 검색" });
  button.focus();
  expect(document.activeElement).toBe(button);
  fireEvent.click(button);
  expect(open).toHaveBeenCalledTimes(1);
});

it("preserves existing text names when no explicit label is supplied", () => {
  render(<OpenSearchButton>검색</OpenSearchButton>);
  fireEvent.click(screen.getByRole("button", { name: "검색" }));
  expect(open).toHaveBeenCalledTimes(1);
});
