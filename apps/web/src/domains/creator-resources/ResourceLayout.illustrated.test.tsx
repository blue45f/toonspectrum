// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AssetCard } from "./ReferenceAssetGallery";
import { LocalSaveNotice, ResourceLayout } from "./ResourceLayout";

import type { CreatorResource } from "@/shared/lib/creator-resources";

afterEach(cleanup);

function renderLayout(path: string) {
  return render(<MemoryRouter initialEntries={[path]}>
    <ResourceLayout title="작업 화면" intro="현재 작업을 이어갑니다.">
      <button type="button">내 작업</button>
      <LocalSaveNotice error="저장 공간 부족" writable={false} />
    </ResourceLayout>
  </MemoryRouter>);
}

describe("일러스트 리서치 표면", () => {
  it("중첩 기획 노트에서도 상위 메뉴를 선택 표시하고 작업과 오류 안내를 보존한다", () => {
    const { container } = renderLayout("/research/catalog/notebook");
    const navigation = screen.getByRole("navigation", { name: "창작 리서치 메뉴" });
    expect(within(navigation).getByRole("link", { name: "작품 리서치 랩" }).getAttribute("aria-current")).toBe("page");
    expect(within(navigation).getByRole("link", { name: "창작 레퍼런스" }).getAttribute("aria-current")).toBeNull();
    expect(screen.getByRole("button", { name: "내 작업" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("저장 공간 부족");
    expect(screen.getByText(/읽기·내보내기는 가능/)).toBeTruthy();
    expect(container.querySelector(".resource-illustrated")).toBeTruthy();
    expect(container.querySelector(".resource-masthead-image")).toBeNull();
  });

  it("스토리 안내 아트는 결과나 사용자 작품으로 읽히지 않는 장식 이미지다", () => {
    const { container } = renderLayout("/story-lab");
    const art = container.querySelector<HTMLImageElement>(".resource-masthead-image");
    expect(art?.getAttribute("src")).toBe("/brand/illustrated-20260928/canvas-noir.webp");
    expect(art?.alt).toBe("");
    expect(art?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.queryAllByRole("img")).toHaveLength(0);
  });

  it("관찰 관점 선택은 기존 검색 경로를 유지하며 안내 아트를 검색 결과로 표현하지 않는다", () => {
    renderLayout("/research");
    const lenses = screen.getByRole("group", { name: "장면 관찰 관점" });
    fireEvent.click(within(lenses).getByRole("button", { name: "복식과 소품" }));
    expect(within(lenses).getByRole("button", { name: "복식과 소품" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(lenses).getByRole("button", { name: "공간과 구도" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("link", { name: "복식과 소품 레퍼런스 찾기" }).getAttribute("href")).toBe("/research/assets?q=costume&page=1");
    expect(screen.getByText("VISUAL STUDY / CONCEPT ART")).toBeTruthy();
  });

  it("갤러리 선택 강조와 저장·비교·상세 동작을 함께 유지한다", () => {
    const item: CreatorResource = {
      id: "met:1", provider: "met", title: "참고 복식", creator: "제작자", description: "복식 자료",
      sourceUrl: "https://www.metmuseum.org/art/collection/search/1", license: "CC0", licenseUrl: "",
      credit: "Met", fetchedAt: "2026-09-28T00:00:00.000Z",
    };
    const onOpen = vi.fn();
    const onToggleSaved = vi.fn();
    const onToggleCompare = vi.fn();
    const { rerender } = render(<AssetCard item={item} density="compact" saved compared savingDisabled={false} onOpen={onOpen} onToggleSaved={onToggleSaved} onToggleCompare={onToggleCompare} />);
    expect(screen.getByRole("article").getAttribute("data-saved")).toBe("true");
    expect(screen.getByRole("article").getAttribute("data-compared")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "저장됨" }));
    fireEvent.click(screen.getByRole("button", { name: "비교에서 제거" }));
    fireEvent.click(screen.getByRole("button", { name: "참고 복식 상세 보기" }));
    expect(onToggleSaved).toHaveBeenCalledTimes(1);
    expect(onToggleCompare).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(screen.getByRole("button", { name: "참고 복식 상세 보기" }));
    rerender(<AssetCard item={item} density="compact" saved={false} compared={false} savingDisabled onOpen={onOpen} onToggleSaved={onToggleSaved} onToggleCompare={onToggleCompare} />);
    expect(screen.getByRole("article").hasAttribute("data-saved")).toBe(false);
    expect(screen.getByRole("article").hasAttribute("data-compared")).toBe(false);
    expect(screen.getByRole("button", { name: "저장" }).hasAttribute("disabled")).toBe(true);
  });
});
