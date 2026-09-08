// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SavedBoard } from "./SavedBoard";

import type { CreatorResource } from "@/shared/lib/creator-resources";

function item(index: number, provider: CreatorResource["provider"] = "met"): CreatorResource {
  return {
    id: `${provider}:${index}`,
    provider,
    title: `Reference ${String(index).padStart(2, "0")}`,
    creator: `Creator ${index}`,
    description: index === 1 ? "blue silk costume" : "visual research material",
    sourceUrl: provider === "bizinfo" ? `https://www.bizinfo.go.kr/example-${index}` : `https://www.metmuseum.org/art/collection/search/${index}`,
    license: provider === "met" ? "CC0" : "metadata-only",
    licenseUrl: "",
    credit: "Provider",
    fetchedAt: "2026-09-08T00:00:00.000Z",
    ...(provider === "bizinfo" ? { deadline: index % 2 ? "2099-12-31" : "2020-01-01" } : {}),
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("saved research board", () => {
  it("renders a bounded first page and incrementally reveals the remaining cards", () => {
    const items = Array.from({ length: 13 }, (_, index) => item(index + 1));
    render(<SavedBoard items={items} onRemove={vi.fn()} />);
    expect(screen.getAllByRole("article")).toHaveLength(12);
    const more = screen.getByRole("button", { name: "자료 더 보기 · 1개 남음" });
    fireEvent.click(more);
    expect(screen.getAllByRole("article")).toHaveLength(13);
    expect(screen.queryByRole("button", { name: /자료 더 보기/u })).toBeNull();
  });

  it("searches descriptions, combines provider and deadline filters, and resets to the safe default", () => {
    const items = [item(1), item(2), item(3, "bizinfo"), item(4, "bizinfo")];
    render(<SavedBoard items={items} onRemove={vi.fn()} />);
    const board = screen.getByRole("heading", { name: "저장한 자료 찾기" }).closest("section")!;
    const query = within(board).getByRole("searchbox", { name: "제목·저작자·설명·ISBN 검색" });
    fireEvent.change(query, { target: { value: "blue silk" } });
    expect(within(board).getByRole("status").textContent).toContain("전체 4개 중 1개");

    fireEvent.change(within(board).getByRole("combobox", { name: "제공처" }), { target: { value: "bizinfo" } });
    fireEvent.change(within(board).getByRole("combobox", { name: "공고 마감 날짜" }), { target: { value: "upcoming" } });
    fireEvent.change(query, { target: { value: "" } });
    expect(within(board).getByRole("status").textContent).toContain("전체 4개 중 1개");
    expect(within(board).getByRole("heading", { name: "Reference 03" })).toBeTruthy();

    fireEvent.click(within(board).getByRole("button", { name: "필터 초기화" }));
    expect((within(board).getByRole("combobox", { name: "제공처" }) as HTMLSelectElement).value).toBe("all");
    expect((within(board).getByRole("combobox", { name: "정렬" }) as HTMLSelectElement).value).toBe("saved");
    expect(within(board).getByRole("status").textContent).toContain("전체 4개 중 4개");
  });

  it("keeps source access available while disabling destructive board changes", () => {
    const remove = vi.fn();
    render(<SavedBoard items={[item(1)]} onRemove={remove} disabled />);
    expect(screen.getByRole("link", { name: "원문 확인 ↗" })).toBeTruthy();
    const removeButton = screen.getByRole("button", { name: "Reference 01 저장 해제" });
    expect(removeButton).toHaveProperty("disabled", true);
    fireEvent.click(removeButton);
    expect(remove).not.toHaveBeenCalled();
  });
});
