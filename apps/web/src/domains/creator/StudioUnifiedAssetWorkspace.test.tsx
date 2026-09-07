// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioUnifiedAssetWorkspace } from "./StudioUnifiedAssetWorkspace";

import type { StudioUnifiedAssetItem } from "./studio-unified-asset-catalog";

const items: readonly StudioUnifiedAssetItem[] = [
  {
    id: "scene:school",
    category: "scene",
    scope: "studio",
    title: "비 오는 밤 학교",
    description: "학원 배경",
    categoryLabel: "2D 배경",
    keywords: ["학교", "밤", "비"],
    badges: ["검수 추천"],
    preview: { kind: "none" },
    useMode: "insert",
    useLabel: "배경 삽입",
    discoverability: "featured",
    sortPriority: 100,
    source: {
      kind: "background",
      value: { id: "school", label: "학교", genre: "학원" },
    },
  },
  {
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
      value: {
        id: "chair",
        kind: "vrm-prop",
        sourceId: "chair",
        label: "교실 의자",
        family: "prop-body",
        familyLabel: "몸 소품",
        keywords: ["의자"],
        hint: null,
        openTarget: "vrm-poser",
        defaultWidth: 280,
        defaultHeight: 280,
      },
    },
  },
  {
    id: "local:mine",
    category: "mine",
    scope: "mine",
    title: "내 창문 소품",
    description: "512 × 512px",
    categoryLabel: "내 에셋",
    keywords: ["창문"],
    badges: ["내 에셋"],
    preview: { kind: "image", src: "data:image/png;base64,AA==" },
    useMode: "insert",
    useLabel: "에셋 삽입",
    discoverability: "standard",
    sortPriority: 80,
    source: {
      kind: "local",
      value: {
        id: "mine",
        name: "내 창문 소품",
        dataUrl: "data:image/png;base64,AA==",
        width: 512,
        height: 512,
        createdAt: 1,
      },
    },
  },
];

afterEach(cleanup);

describe("StudioUnifiedAssetWorkspace", () => {
  it("searches across asset kinds from one input", () => {
    render(
      <StudioUnifiedAssetWorkspace
        items={items}
        legacyContent={<div>기존 보관함</div>}
        onUseItem={vi.fn()}
        onOpenAi={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByRole("searchbox", { name: "에셋 통합 검색" }), {
      target: { value: "의자" },
    });

    expect(screen.getByText("교실 의자")).toBeTruthy();
    expect(screen.queryByText("비 오는 밤 학교")).toBeNull();
  });

  it("routes a result through the supplied safe-use handler", async () => {
    const onUseItem = vi.fn().mockResolvedValue(true);
    render(
      <StudioUnifiedAssetWorkspace
        items={items}
        legacyContent={<div>기존 보관함</div>}
        onUseItem={onUseItem}
        onOpenAi={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "교실 의자 3D 도구 열기" }));
    await waitFor(() => expect(onUseItem).toHaveBeenCalledWith(items[1]));
    expect(await screen.findByText("교실 의자 편집 도구를 열었습니다.")).toBeTruthy();
  });

  it("keeps the existing library and marketplace reachable", () => {
    render(
      <StudioUnifiedAssetWorkspace
        items={items}
        legacyContent={<div data-testid="legacy-library">기존 보관함</div>}
        onUseItem={vi.fn()}
        onOpenAi={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "보관함 · 마켓" }));
    expect(screen.getByTestId("legacy-library")).toBeTruthy();
  });

  it("hands an unresolved search to the AI workspace", () => {
    const onOpenAi = vi.fn();
    render(
      <StudioUnifiedAssetWorkspace
        items={items}
        legacyContent={<div>기존 보관함</div>}
        onUseItem={vi.fn()}
        onOpenAi={onOpenAi}
      />,
    );

    fireEvent.change(screen.getByRole("searchbox", { name: "에셋 통합 검색" }), {
      target: { value: "심해 우주 정거장" },
    });
    fireEvent.click(screen.getByRole("button", { name: "AI 도구에서 만들기" }));
    expect(onOpenAi).toHaveBeenCalledWith("심해 우주 정거장");
  });
});
