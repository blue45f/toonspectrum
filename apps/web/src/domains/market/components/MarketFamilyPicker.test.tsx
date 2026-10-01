// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { marketResourceBrowseHref, marketResourceFamilyForKind } from "../models/market-resource-taxonomy";

import { MarketFamilyPicker } from "./MarketFamilyPicker";

afterEach(cleanup);

const LABELS = ["전체", "템플릿", "2D 에셋", "3D", "브러시", "색·보정"];

function picker(node: ReactNode) {
  return render(
    <MemoryRouter>
      <p id="picker-title">무엇을 찾고 있나요?</p>
      {node}
    </MemoryRouter>,
  );
}

describe("MarketFamilyPicker", () => {
  it("shows the five user-facing families plus 'all' as links named by the visible title", () => {
    picker(
      <MarketFamilyPicker
        labelledBy="picker-title"
        selected={null}
        target={{ kind: "link", hrefFor: (family) => (family ? marketResourceBrowseHref(family.subcategories[0]) : "/market/browse") }}
      />,
    );
    const group = screen.getByRole("group", { name: "무엇을 찾고 있나요?" });
    const links = within(group).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(LABELS);
    expect(within(group).getByRole("link", { name: "전체" }).getAttribute("href")).toBe("/market/browse");
    expect(within(group).getByRole("link", { name: "브러시" }).getAttribute("href")).toBe("/market/browse?kind=brush");
    expect(links.every((link) => link.getAttribute("aria-current") === null)).toBe(true);
  });

  it("keeps each label on one line so narrow grids never break words letter by letter", () => {
    picker(<MarketFamilyPicker labelledBy="picker-title" selected="all" target={{ kind: "button", onSelect: vi.fn() }} />);
    for (const button of screen.getAllByRole("button")) {
      expect(button.className).toContain("whitespace-nowrap");
      expect(button.className).toContain("min-h-11");
    }
    // 좁은 화면은 3열 격자로 두 줄, 넓은 화면은 한 줄로 흐른다(가로 스크롤에 숨기지 않는다).
    const group = screen.getByRole("group");
    expect(group.className).toContain("grid-cols-3");
    expect(group.className).not.toContain("overflow-x-auto");
  });

  it("reports the chosen family to the page filter and marks the selection as pressed", () => {
    const onSelect = vi.fn();
    picker(<MarketFamilyPicker labelledBy="picker-title" selected="3d" target={{ kind: "button", onSelect }} />);
    expect(screen.getByRole("button", { name: "3D" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "전체" }).getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "색·보정" }));
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ id: "look" }));
    fireEvent.click(screen.getByRole("button", { name: "전체" }));
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });
});

describe("marketResourceFamilyForKind", () => {
  it.each([
    ["template", "template"],
    ["asset", "2d"],
    ["3d-asset", "3d"],
    ["3d-preset", "3d"],
    ["brush", "brush"],
    ["palette", "look"],
    ["filter", "look"],
  ])("maps %s to the %s family", (kind, family) => {
    expect(marketResourceFamilyForKind(kind)?.id).toBe(family);
  });

  it("ignores unknown or inherited keys", () => {
    expect(marketResourceFamilyForKind(null)).toBeNull();
    expect(marketResourceFamilyForKind("toString")).toBeNull();
    expect(marketResourceFamilyForKind("video")).toBeNull();
  });
});
