// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RESOURCE_MENU_GROUPS, RESOURCE_PAGES } from "./navigation";
import { AssetCard } from "./ReferenceAssetGallery";
import { ResearchSceneStudy } from "./ResearchSceneStudy";
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
    // 현재 화면이 속한 묶음이 열리고, 그 안에서 현재 목적지를 표시한다.
    expect(within(navigation).getByRole("button", { name: /작품·스토리 연구/ }).getAttribute("aria-pressed")).toBe("true");
    expect(within(navigation).getByRole("link", { name: "작품 리서치 랩" }).getAttribute("aria-current")).toBe("page");
    fireEvent.click(within(navigation).getByRole("button", { name: /레퍼런스·고증/ }));
    expect(within(navigation).getByRole("link", { name: "창작 레퍼런스" }).getAttribute("aria-current")).toBeNull();
    expect(within(navigation).queryByRole("link", { name: "작품 리서치 랩" })).toBeNull();
    expect(screen.getByRole("button", { name: "내 작업" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("저장 공간 부족");
    expect(screen.getByText(/읽기·내보내기는 가능/)).toBeTruthy();
    expect(container.querySelector(".resource-illustrated")).toBeTruthy();
    expect(container.querySelector(".resource-masthead-image")).toBeNull();
  });

  it("리서치 목적지 20개를 제목 있는 5묶음으로 나누고 모바일 전체 메뉴에서도 묶어서 보여 준다", () => {
    renderLayout("/research");
    for (const page of RESOURCE_PAGES.slice(1)) {
      expect(RESOURCE_MENU_GROUPS.filter((group) => group.paths.includes(page.path))).toHaveLength(1);
    }
    expect(RESOURCE_MENU_GROUPS.flatMap((group) => group.paths)).toHaveLength(RESOURCE_PAGES.length - 1);
    const groups = screen.getByRole("group", { name: "리서치 메뉴 묶음" });
    expect(within(groups).getAllByRole("button")).toHaveLength(5);
    // 데스크(현재 목적지 없음)에서는 첫 묶음이 열린다.
    expect(within(groups).getByRole("button", { name: /재료·3D/ }).getAttribute("aria-pressed")).toBe("true");
    const mobile = screen.getByRole("navigation", { name: "모바일 창작 리서치 메뉴" });
    expect(within(mobile).getAllByRole("group")).toHaveLength(5);
    expect(within(mobile).getAllByRole("link")).toHaveLength(RESOURCE_PAGES.length - 1);
    expect(within(within(mobile).getByRole("group", { name: "데이터·정책" })).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/about/data", "/about/crawler"]);
  });

  it("공통 Container 폭 계약을 따른다", () => {
    const { container } = renderLayout("/research/assets");
    expect(container.querySelector("[data-page-container]")?.getAttribute("data-page-container")).toBe("default");
  });

  it("스토리 안내 아트는 결과나 사용자 작품으로 읽히지 않는 장식 이미지다", () => {
    const { container } = renderLayout("/story-lab");
    const art = container.querySelector<HTMLImageElement>(".resource-masthead-image");
    expect(art?.getAttribute("src")).toBe("/brand/illustrated-20260928/canvas-noir.webp");
    expect(art?.alt).toBe("");
    expect(art?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.queryAllByRole("img")).toHaveLength(0);
  });

  it("머리말 보조 영역(heroAside)을 주면 기본 안내 아트 대신 그 영역을 쓰고, 첫 행동(heroContent)을 설명 아래에 둔다", () => {
    const { container } = render(<MemoryRouter initialEntries={["/story-lab"]}>
      <ResourceLayout title="데스크" intro="소개" heroContent={<button type="button">통합 검색</button>} heroAside={<aside aria-label="장면 관찰" />} menu={false}>
        <p>본문</p>
      </ResourceLayout>
    </MemoryRouter>);
    expect(screen.getByRole("button", { name: "통합 검색" })).toBeTruthy();
    expect(screen.getByRole("complementary", { name: "장면 관찰" })).toBeTruthy();
    expect(container.querySelector(".resource-masthead-image")).toBeNull();
    expect(container.querySelector(".resource-masthead--desk")).toBeTruthy();
    // 모든 도구를 본문에서 보여 주는 화면(menu=false)은 묶음 메뉴를 다시 그리지 않는다.
    expect(screen.queryByRole("navigation", { name: "창작 리서치 메뉴" })).toBeNull();
  });

  it("compact 머리말은 안내 아트를 빼고 한 줄 설명을 휴대폰에서 숨기며, 리서치 데스크 자신은 제목을 링크로 만들지 않는다", () => {
    const { container, rerender } = render(<MemoryRouter initialEntries={["/now"]}>
      <ResourceLayout title="오늘의 영감" intro="매일 바뀌는 장면" compact><p>본문</p></ResourceLayout>
    </MemoryRouter>);
    expect(container.querySelector(".resource-masthead--compact")).toBeTruthy();
    expect(container.querySelector(".resource-masthead-image")).toBeNull();
    expect(screen.getByText("매일 바뀌는 장면").className).toContain("max-sm:hidden");
    // 하위 화면에서는 데스크로 돌아가는 링크, 데스크 자신은 자기 자신을 가리키는 링크를 두지 않는다.
    expect(screen.getByRole("link", { name: /TOONSTUDIO \/ 리서치 데스크/u }).getAttribute("href")).toBe("/research");
    rerender(<MemoryRouter initialEntries={["/research"]}>
      <ResourceLayout title="데스크" intro="소개" heroAside={<aside aria-label="장면 관찰" />} menu={false}><p>본문</p></ResourceLayout>
    </MemoryRouter>);
    expect(screen.queryByRole("link", { name: /TOONSTUDIO \/ 리서치 데스크/u })).toBeNull();
    expect(screen.getByText(/TOONSTUDIO \/ 리서치 데스크/u)).toBeTruthy();
  });

  it("관찰 관점 선택은 기존 검색 경로를 유지하며 안내 아트를 검색 결과로 표현하지 않는다", () => {
    // 리서치 데스크는 장면 관찰 카드를 머리말 보조 영역(heroAside)으로 넘긴다.
    render(<MemoryRouter initialEntries={["/research"]}><ResearchSceneStudy /></MemoryRouter>);
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
