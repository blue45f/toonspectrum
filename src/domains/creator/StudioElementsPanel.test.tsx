// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioElementsPanel } from "./StudioElementsPanel";

afterEach(() => {
  cleanup();
  globalThis.localStorage.clear();
});

describe("StudioElementsPanel expanded catalog UX", () => {
  it("keeps the large catalog navigable with scrollable categories and touch targets", () => {
    render(<StudioElementsPanel onAdd={vi.fn()} />);

    expect(screen.getByText("요소 · 도형")).toBeTruthy();
    expect(screen.getByRole("searchbox", { name: "요소 검색" }).className).toContain("min-h-10");
    expect(screen.getByRole("tab", { name: "도형" }).className).toContain("pointer-coarse:min-h-11");
    expect(screen.getByRole("tab", { name: "컷 패널" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "말풍선" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "효과음" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "효과선" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "배경 패턴" })).toBeTruthy();
    expect(screen.getByTitle("슈퍼타원")).toBeTruthy();
    expect(screen.getByTitle("베지어 곡선")).toBeTruthy();
  });

  it("switches packs and places the selected SVG asset", () => {
    const onAdd = vi.fn();
    render(<StudioElementsPanel onAdd={onAdd} />);

    fireEvent.click(screen.getByRole("tab", { name: "컷 패널" }));
    expect(screen.getByText("10개")).toBeTruthy();
    fireEvent.click(screen.getByTitle("5컷 만화 리듬"));

    expect(onAdd).toHaveBeenCalledOnce();
    expect(onAdd.mock.calls[0]?.[0]).toMatchObject({
      id: "panel-five-manga",
      category: "panel",
    });
  });

  it("supports multi-term purpose search and a clear action", () => {
    render(<StudioElementsPanel onAdd={vi.fn()} />);

    fireEvent.click(screen.getByRole("tab", { name: "전체" }));
    const search = screen.getByRole("searchbox", { name: "요소 검색" });
    fireEvent.change(search, { target: { value: "focus corner" } });

    expect(screen.getByTitle("코너 집중선")).toBeTruthy();
    expect(screen.queryByTitle("중앙 집중선")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "검색어 지우기" }));
    expect((search as HTMLInputElement).value).toBe("");
  });
});
