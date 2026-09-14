// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioBrushV6RecipeShelf } from "./StudioBrushV6RecipeShelf";
import { BRUSH_STUDIO_V6_RECIPES } from "./brush-studio-v6-engine";
import { searchBrushStudioV6Recipes } from "./brush-studio-v6-recipe-search";

afterEach(cleanup);
describe("executable recipe discovery", () => {
  it("matches Korean labels, English IDs, multiple words and normalized full-width text", () => {
    expect(searchBrushStudioV6Recipes("지퍼").map((r) => r.id)).toEqual(["zipper-teeth"]);
    expect(searchBrushStudioV6Recipes("  LINKED   chain ").map((r) => r.id)).toEqual(["linked-chain"]);
    expect(searchBrushStudioV6Recipes("ＬＩＮＫＥＤ").map((r) => r.id)).toEqual(["linked-chain"]);
    expect(searchBrushStudioV6Recipes("꽃잎", "의상·장식")).toEqual([]);
    expect(searchBrushStudioV6Recipes("")).toEqual(BRUSH_STUDIO_V6_RECIPES);
  });
  it("filters without choosing a brush and restores the complete inventory", () => {
    const onChoose = vi.fn();
    render(<StudioBrushV6RecipeShelf selectedId="clean-ink" onChoose={onChoose} />);
    const query = screen.getByRole("searchbox", { name: "브러시 레시피 검색" });
    fireEvent.change(query, { target: { value: "지퍼" } });
    expect(screen.getByRole("status").textContent).toBe(`1 / ${BRUSH_STUDIO_V6_RECIPES.length}개 레시피`);
    expect(onChoose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /지퍼 이빨/u }));
    expect(onChoose).toHaveBeenCalledExactlyOnceWith("zipper-teeth");
    fireEvent.change(query, { target: { value: "unmatched brush 1234" } });
    fireEvent.click(screen.getByRole("button", { name: "검색·필터 초기화" }));
    expect(screen.getAllByRole("button")).toHaveLength(BRUSH_STUDIO_V6_RECIPES.length);
  });
  it("combines purpose and query, supports Escape and exposes selected state", () => {
    render(<StudioBrushV6RecipeShelf selectedId="linked-chain" onChoose={vi.fn()} />);
    expect(screen.getByRole("button", { name: /교차 금속 체인/u }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.change(screen.getByRole("combobox", { name: "브러시 용도" }), { target: { value: "배경·자연" } });
    expect(screen.getAllByRole("button")).toHaveLength(3);
    const query = screen.getByRole("searchbox", { name: "브러시 레시피 검색" });
    fireEvent.change(query, { target: { value: "꽃잎" } });
    expect(screen.getAllByRole("button")).toHaveLength(1);
    fireEvent.keyDown(query, { key: "Escape" });
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });
});
