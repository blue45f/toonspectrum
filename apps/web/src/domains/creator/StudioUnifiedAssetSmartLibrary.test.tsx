// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioUnifiedAssetSmartLibrary } from "./StudioUnifiedAssetSmartLibrary";

import type { StudioUnifiedAssetItem } from "./studio-unified-asset-catalog";

const school: StudioUnifiedAssetItem = {
  id: "background:school-night",
  category: "scene",
  scope: "studio",
  title: "비 오는 밤 학교",
  description: "학원 배경",
  categoryLabel: "2D 배경",
  keywords: ["학교", "밤", "비"],
  badges: ["검수 추천"],
  preview: { kind: "image", src: "/school.webp" },
  useMode: "insert",
  useLabel: "배경 삽입",
  discoverability: "featured",
  sortPriority: 100,
  source: {
    kind: "background",
    value: { id: "school-night", label: "학교", genre: "학원" },
  },
};

const chair = {
  id: "3d:chair",
  category: "3d",
  scope: "studio",
  title: "교실 의자",
  description: "3D 소품",
  categoryLabel: "몸 소품",
  keywords: ["학교", "의자", "3d"],
  badges: ["3D"],
  preview: { kind: "none" },
  useMode: "open",
  useLabel: "3D 도구 열기",
  discoverability: "standard",
  sortPriority: 90,
  source: {
    kind: "object-3d",
    value: {},
  },
} as unknown as StudioUnifiedAssetItem;

const spark = {
  id: "element:spark",
  category: "element",
  scope: "studio",
  title: "반짝 효과",
  description: "편집 가능한 벡터 효과",
  categoryLabel: "연출 효과",
  keywords: ["반짝", "효과"],
  badges: ["벡터"],
  preview: { kind: "svg", svg: "<svg />" },
  useMode: "insert",
  useLabel: "요소 삽입",
  discoverability: "standard",
  sortPriority: 80,
  source: {
    kind: "element",
    value: {},
  },
} as unknown as StudioUnifiedAssetItem;

const items = [school, chair, spark] as const;

function renderLibrary(onUseItem = vi.fn().mockResolvedValue(true)) {
  render(
    <StudioUnifiedAssetSmartLibrary items={items} onUseItem={onUseItem}>
      {({ items: visible, onUseItem: useItem }) => (
        <div>
          <p data-testid="visible-items">{visible.map((item) => item.title).join("|")}</p>
          {visible.map((item) => (
            <button key={item.id} type="button" onClick={() => void useItem(item)}>
              {item.title} 사용
            </button>
          ))}
        </div>
      )}
    </StudioUnifiedAssetSmartLibrary>,
  );
  return onUseItem;
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("StudioUnifiedAssetSmartLibrary", () => {
  it("adds assets to favorites and the project tray from the bounded manager", async () => {
    renderLibrary();
    fireEvent.click(screen.getByRole("button", { name: "즐겨찾기 · 프로젝트 트레이 관리" }));
    fireEvent.click(screen.getByRole("button", { name: "비 오는 밤 학교 즐겨찾기 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "비 오는 밤 학교 프로젝트 트레이 추가" }));

    fireEvent.click(screen.getByRole("button", { name: "즐겨찾기 1" }));
    expect(screen.getByTestId("visible-items").textContent).toBe("비 오는 밤 학교");

    fireEvent.click(screen.getByRole("button", { name: "트레이 1" }));
    expect(screen.getByTestId("visible-items").textContent).toBe("비 오는 밤 학교");
  });

  it("records only successful insertions in the recent shelf", async () => {
    const onUseItem = renderLibrary();
    fireEvent.click(screen.getByRole("button", { name: "교실 의자 사용" }));
    await waitFor(() => expect(onUseItem).toHaveBeenCalledWith(chair));
    fireEvent.click(await screen.findByRole("button", { name: "최근 1" }));
    expect(screen.getByTestId("visible-items").textContent).toBe("교실 의자");
  });

  it("does not record a rejected safe-use route", async () => {
    const onUseItem = vi.fn().mockResolvedValue(false);
    renderLibrary(onUseItem);
    fireEvent.click(screen.getByRole("button", { name: "교실 의자 사용" }));
    await waitFor(() => expect(onUseItem).toHaveBeenCalledWith(chair));
    fireEvent.click(screen.getByRole("button", { name: "최근 0" }));
    expect(screen.getByTestId("visible-items").textContent).toBe("");
  });

  it("combines format and editability filters before rendering the existing workspace", () => {
    renderLibrary();
    fireEvent.click(screen.getByRole("button", { name: "에셋 형식 3D" }));
    expect(screen.getByTestId("visible-items").textContent).toBe("교실 의자");

    fireEvent.click(screen.getByRole("button", { name: "에셋 형식 전체 형식" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "계속 편집 가능한 에셋만" }));
    expect(screen.getByTestId("visible-items").textContent).toContain("교실 의자");
    expect(screen.getByTestId("visible-items").textContent).toContain("반짝 효과");
    expect(screen.getByTestId("visible-items").textContent).not.toContain("비 오는 밤 학교");
  });

  it("restores versioned preferences after remounting", async () => {
    const first = renderLibrary();
    fireEvent.click(screen.getByRole("button", { name: "교실 의자 사용" }));
    await waitFor(() => expect(first).toHaveBeenCalled());
    cleanup();

    renderLibrary();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "최근 1" })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: "최근 1" }));
    expect(screen.getByTestId("visible-items").textContent).toBe("교실 의자");
  });
});
