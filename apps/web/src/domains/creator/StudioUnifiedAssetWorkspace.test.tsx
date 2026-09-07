// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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
  {
    id: "element:spark",
    category: "element",
    scope: "studio",
    title: "반짝 효과",
    description: "편집 가능한 벡터 효과",
    categoryLabel: "효과",
    keywords: ["반짝", "효과"],
    badges: ["벡터"],
    preview: {
      kind: "svg",
      svg: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><path d="M16 2L19 13L30 16L19 19L16 30L13 19L2 16L13 13Z"/></svg>',
    },
    useMode: "insert",
    useLabel: "요소 삽입",
    discoverability: "standard",
    sortPriority: 70,
    source: {
      kind: "element",
      value: {
        id: "spark",
        label: "반짝 효과",
        category: "effect",
        keywords: ["반짝", "효과"],
        width: 32,
        height: 32,
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><path d="M16 2L19 13L30 16L19 19L16 30L13 19L2 16L13 13Z"/></svg>',
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

    fireEvent.change(
      screen.getByRole("searchbox", { name: "에셋 통합 검색" }),
      {
        target: { value: "의자" },
      },
    );

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

    fireEvent.click(
      screen.getByRole("button", { name: "교실 의자 3D 도구 열기" }),
    );
    await waitFor(() => expect(onUseItem).toHaveBeenCalledWith(items[1]));
    expect(
      await screen.findByText("교실 의자 편집 도구를 열었습니다."),
    ).toBeTruthy();
  });

  it("reports a regular canvas insertion as completed", async () => {
    const onUseItem = vi.fn().mockResolvedValue(true);
    render(
      <StudioUnifiedAssetWorkspace
        items={items}
        legacyContent={<div>기존 보관함</div>}
        onUseItem={onUseItem}
        onOpenAi={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "비 오는 밤 학교 배경 삽입" }),
    );
    await waitFor(() => expect(onUseItem).toHaveBeenCalledWith(items[0]));
    expect(
      await screen.findByText("비 오는 밤 학교을(를) 캔버스에 삽입했습니다."),
    ).toBeTruthy();
  });

  it("supports quick search, scope and category filtering, and reset", () => {
    render(
      <StudioUnifiedAssetWorkspace
        items={items}
        legacyContent={<div>기존 보관함</div>}
        onUseItem={vi.fn()}
        onOpenAi={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "효과" }));
    expect(screen.getByText("반짝 효과")).toBeTruthy();
    expect(screen.queryByText("교실 의자")).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "통합 에셋 검색어 지우기" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "내 에셋" }));
    expect(screen.getByText("내 창문 소품")).toBeTruthy();
    expect(screen.queryByText("반짝 효과")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "초기화" }));
    expect(screen.getByText("비 오는 밤 학교")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "내 에셋" }));
    fireEvent.click(screen.getByRole("button", { name: "3D 0" }));
    expect(screen.getByText("조건에 맞는 에셋이 없습니다.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "조건 넓히기" }));
    expect(screen.getByText("교실 의자")).toBeTruthy();
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

    fireEvent.change(
      screen.getByRole("searchbox", { name: "에셋 통합 검색" }),
      {
        target: { value: "심해 우주 정거장" },
      },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "AI 도구에서 만들기" }),
    );
    expect(onOpenAi).toHaveBeenCalledWith("심해 우주 정거장");
  });

  it("opens the legacy library immediately for marketplace deep links", () => {
    render(
      <StudioUnifiedAssetWorkspace
        initialView="library"
        items={items}
        legacyContent={
          <div data-testid="deep-linked-library">기존 보관함</div>
        }
        onUseItem={vi.fn()}
        onOpenAi={vi.fn()}
      />,
    );

    expect(screen.getByTestId("deep-linked-library")).toBeTruthy();
    expect(
      screen.queryByRole("searchbox", { name: "에셋 통합 검색" }),
    ).toBeNull();
  });

  it("reports a rejected safe-use route without a false success message", async () => {
    render(
      <StudioUnifiedAssetWorkspace
        items={items}
        legacyContent={<div>기존 보관함</div>}
        onUseItem={vi.fn().mockResolvedValue(false)}
        onOpenAi={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "교실 의자 3D 도구 열기" }),
    );
    expect(
      await screen.findByText(
        "현재 캔버스 상태에서는 이 에셋을 사용할 수 없습니다.",
      ),
    ).toBeTruthy();
    expect(
      screen.queryByText("교실 의자 편집 도구를 열었습니다."),
    ).toBeNull();
  });
});
