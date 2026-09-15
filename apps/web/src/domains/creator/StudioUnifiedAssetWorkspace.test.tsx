// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioUnifiedAssetWorkspace } from "./StudioUnifiedAssetWorkspace";

import type { SceneTemplate } from "./studio-scene-templates";
import type { StudioUnifiedAssetItem } from "./studio-unified-asset-catalog";

vi.mock("./StudioUnifiedAssetPreviewSurface", () => ({
  StudioUnifiedAssetPreviewSurface: ({
    preview,
    mode = "thumbnail",
  }: {
    preview: { kind: string };
    mode?: string;
  }) => (
    <div data-testid={`preview-${preview.kind}`} data-preview-mode={mode}>
      {preview.kind}
    </div>
  ),
}));

const template: SceneTemplate = {
  id: "conversation",
  label: "교실 대화 장면",
  category: "school",
  description: "프레임과 말풍선이 포함된 장면",
  build: () => [
    {
      type: "frame",
      x: 20,
      y: 20,
      width: 680,
      height: 420,
      bgColor: "#ffffff",
    },
    {
      type: "bubble",
      variant: "speech",
      text: "안녕",
      x: 50,
      y: 60,
      width: 180,
      height: 80,
      fill: "#ffffff",
      textFill: "#111111",
      rotation: 0,
    },
  ],
};

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
    preview: {
      kind: "svg",
      svg: '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="480"><rect width="720" height="480" fill="#223"/></svg>',
    },
    useMode: "insert",
    useLabel: "배경 삽입",
    discoverability: "featured",
    sortPriority: 100,
    source: {
      kind: "background",
      value: {
        id: "school",
        label: "학교",
        genre: "학원",
        width: 720,
        height: 480,
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="480"><rect width="720" height="480" fill="#223"/></svg>',
      },
    },
  },
  {
    id: "scene-template:conversation",
    category: "scene",
    scope: "studio",
    title: template.label,
    description: template.description,
    categoryLabel: "장면 템플릿",
    keywords: ["학교", "대화", "장면"],
    badges: ["장면 레시피"],
    preview: { kind: "none" },
    useMode: "apply",
    useLabel: "장면 배치",
    discoverability: "featured",
    sortPriority: 95,
    source: { kind: "scene-template", value: template },
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
        sourceId: "smartphone",
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
  {
    id: "scene:caution",
    category: "scene",
    scope: "studio",
    title: "출처 확인 배경",
    description: "사용 조건을 확인해야 하는 배경",
    categoryLabel: "2D 배경",
    keywords: ["권리", "출처"],
    badges: ["권리 미확인"],
    preview: {
      kind: "svg",
      svg: '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="480"><rect width="720" height="480" fill="#eee"/></svg>',
    },
    useMode: "insert",
    useLabel: "배경 삽입",
    discoverability: "caution",
    sortPriority: 10,
    source: {
      kind: "background",
      value: {
        id: "caution",
        label: "출처 확인 배경",
        genre: "기타",
        width: 720,
        height: 480,
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="480"><rect width="720" height="480" fill="#eee"/></svg>',
      },
    },
  },
];

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe("StudioUnifiedAssetWorkspace", () => {
  it("searches every asset kind from one visual workspace", () => {
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

    expect(screen.getAllByText("교실 의자").length).toBeGreaterThan(0);
    expect(screen.queryByText("비 오는 밤 학교")).toBeNull();
  });

  it("inserts a safe asset directly without a review gate", async () => {
    const onUseItem = vi.fn().mockResolvedValue(true);
    render(
      <StudioUnifiedAssetWorkspace
        items={items}
        legacyContent={<div>기존 보관함</div>}
        onUseItem={onUseItem}
        onOpenAi={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "비 오는 밤 학교 배경 삽입" }));
    await waitFor(() => expect(onUseItem).toHaveBeenCalledWith(items[0], "auto"));
    expect(await screen.findByText("비 오는 밤 학교을(를) 캔버스에 삽입했습니다.")).toBeTruthy();
  });

  it("uses double click as a fast path for safe cards", async () => {
    const onUseItem = vi.fn().mockResolvedValue(true);
    render(
      <StudioUnifiedAssetWorkspace
        items={items}
        legacyContent={<div>기존 보관함</div>}
        onUseItem={onUseItem}
        onOpenAi={vi.fn()}
      />,
    );

    fireEvent.doubleClick(screen.getByRole("button", { name: "비 오는 밤 학교 상세 미리보기" }));
    await waitFor(() => expect(onUseItem).toHaveBeenCalledWith(items[0], "auto"));
  });

  it("uses Enter as the keyboard insertion shortcut while Space keeps selection semantics", async () => {
    const onUseItem = vi.fn().mockResolvedValue(true);
    render(
      <StudioUnifiedAssetWorkspace
        items={items}
        legacyContent={<div>기존 보관함</div>}
        onUseItem={onUseItem}
        onOpenAi={vi.fn()}
      />,
    );

    const card = screen.getByRole("button", { name: "비 오는 밤 학교 상세 미리보기" });
    fireEvent.keyDown(card, { key: "Enter" });
    await waitFor(() => expect(onUseItem).toHaveBeenCalledWith(items[0], "auto"));
  });

  it("shows an interactive 3D detail preview and routes the selected model", async () => {
    const onUseItem = vi.fn().mockResolvedValue(true);
    const { container } = render(
      <StudioUnifiedAssetWorkspace
        items={items}
        legacyContent={<div>기존 보관함</div>}
        onUseItem={onUseItem}
        onOpenAi={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "교실 의자 상세 미리보기" }));
    const detail = container.querySelector('[data-studio-asset-detail="3d:chair"]');
    expect(detail).toBeTruthy();
    expect(within(detail as HTMLElement).getByTestId("preview-three").getAttribute("data-preview-mode")).toBe("interactive");

    fireEvent.click(screen.getByRole("button", { name: "교실 의자 3D 도구 열기" }));
    await waitFor(() => expect(onUseItem).toHaveBeenCalledWith(items[2], "auto"));
  });

  it("renders scene templates as a visual scene recipe", () => {
    render(
      <StudioUnifiedAssetWorkspace
        items={items}
        legacyContent={<div>기존 보관함</div>}
        onUseItem={vi.fn()}
        onOpenAi={vi.fn()}
      />,
    );

    expect(screen.getAllByTestId("preview-scene-template").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "교실 대화 장면 상세 미리보기" }));
    expect(screen.getByText("프레임 1")).toBeTruthy();
    expect(screen.getByText("말풍선 1")).toBeTruthy();
  });

  it("requires an explicit rights acknowledgement only for caution assets", async () => {
    const onUseItem = vi.fn().mockResolvedValue(true);
    const { container } = render(
      <StudioUnifiedAssetWorkspace
        items={items}
        legacyContent={<div>기존 보관함</div>}
        onUseItem={onUseItem}
        onOpenAi={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "출처 확인 배경 배경 삽입" }));
    expect(onUseItem).not.toHaveBeenCalled();
    expect(await screen.findByText(/권리와 출처 확인이 필요한 에셋/)).toBeTruthy();

    const detail = container.querySelector('[data-studio-asset-detail="scene:caution"]');
    expect(detail).toBeTruthy();
    fireEvent.click(within(detail as HTMLElement).getByRole("checkbox"));
    fireEvent.click(within(detail as HTMLElement).getByRole("button", { name: "배경 삽입" }));
    await waitFor(() => expect(onUseItem).toHaveBeenCalledWith(items[5], "auto"));
  });

  it("keeps placement choices in the selected asset detail instead of before results", async () => {
    const onUseItem = vi.fn().mockResolvedValue(true);
    const { container } = render(
      <StudioUnifiedAssetWorkspace
        items={items}
        legacyContent={<div>기존 보관함</div>}
        selectionPlacementAvailable
        onUseItem={onUseItem}
        onOpenAi={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "내 창문 소품 상세 미리보기" }));
    const detail = container.querySelector('[data-studio-asset-detail="local:mine"]');
    expect(detail).toBeTruthy();
    fireEvent.click(within(detail as HTMLElement).getByRole("button", { name: "페이지 맞춤" }));
    fireEvent.click(within(detail as HTMLElement).getByRole("button", { name: "에셋 삽입" }));
    await waitFor(() => expect(onUseItem).toHaveBeenCalledWith(items[3], "page"));
  });

  it("persists favorites and recent use with the existing v1 storage contract", async () => {
    const onUseItem = vi.fn().mockResolvedValue(true);
    render(
      <StudioUnifiedAssetWorkspace
        items={items}
        legacyContent={<div>기존 보관함</div>}
        onUseItem={onUseItem}
        onOpenAi={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "비 오는 밤 학교 즐겨찾기 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "비 오는 밤 학교 배경 삽입" }));
    await waitFor(() => expect(onUseItem).toHaveBeenCalled());
    const saved = window.localStorage.getItem("toonspectrum-studio-insert-hub:v1") ?? "";
    expect(saved).toContain("scene:school");
  });

  it("exposes an explicit direct-drag handle for compatible assets", () => {
    render(
      <StudioUnifiedAssetWorkspace
        items={items}
        legacyContent={<div>기존 보관함</div>}
        onUseItem={vi.fn()}
        onOpenAi={vi.fn()}
      />,
    );

    const handle = screen.getByRole("button", { name: "비 오는 밤 학교 캔버스로 끌어 놓기" });
    expect(handle.getAttribute("draggable")).toBe("true");
    expect(handle.getAttribute("data-studio-insert-drag-handle")).toBe("true");
  });

  it("filters by category and resets the discovery state", () => {
    render(
      <StudioUnifiedAssetWorkspace
        items={items}
        legacyContent={<div>기존 보관함</div>}
        onUseItem={vi.fn()}
        onOpenAi={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /2D 배경/ }));
    expect(screen.getAllByText("비 오는 밤 학교").length).toBeGreaterThan(0);
    expect(screen.queryByText("교실 대화 장면")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /장면 레시피/ }));
    expect(screen.getAllByText("교실 대화 장면").length).toBeGreaterThan(0);
    expect(screen.queryByText("비 오는 밤 학교")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /스토리 연출/ }));
    expect(screen.getAllByText("반짝 효과").length).toBeGreaterThan(0);
    expect(screen.queryByText("교실 의자")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "초기화" }));
    expect(screen.getAllByText("교실 의자").length).toBeGreaterThan(0);
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

  it("opens legacy library immediately for marketplace deep links", () => {
    render(
      <StudioUnifiedAssetWorkspace
        initialView="library"
        items={items}
        legacyContent={<div data-testid="deep-linked-library">기존 보관함</div>}
        onUseItem={vi.fn()}
        onOpenAi={vi.fn()}
      />,
    );

    expect(screen.getByTestId("deep-linked-library")).toBeTruthy();
    expect(screen.queryByRole("searchbox", { name: "에셋 통합 검색" })).toBeNull();
  });

  it("reports a rejected route without a false success message", async () => {
    render(
      <StudioUnifiedAssetWorkspace
        items={items}
        legacyContent={<div>기존 보관함</div>}
        onUseItem={vi.fn().mockResolvedValue(false)}
        onOpenAi={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "교실 의자 3D 도구 열기" }));
    expect(await screen.findByText("현재 캔버스 상태에서는 이 에셋을 사용할 수 없습니다.")).toBeTruthy();
    expect(screen.queryByText("교실 의자 편집 도구를 열었습니다.")).toBeNull();
  });
});
