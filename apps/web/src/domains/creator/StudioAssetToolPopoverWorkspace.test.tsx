// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  StudioUnifiedAssetItem,
  StudioUnifiedAssetSource,
} from "./studio-unified-asset-catalog";
import type { StudioToolBeltContentProps } from "./StudioToolBeltContent";

const mocks = vi.hoisted(() => ({
  catalog: [] as StudioUnifiedAssetItem[],
  preload: vi.fn(),
}));

vi.mock("./studio-bg-scenes", () => ({ BG_SCENES: [] }));
vi.mock("./studio-bg-scenes-extra", () => ({ BG_SCENES_EXTRA: [] }));
vi.mock("./studio-scene-templates", () => ({ SCENE_TEMPLATES: [] }));
vi.mock("./studio-page-lazy-ui", () => ({
  preloadStudioAssetMenuPanel: mocks.preload,
}));
vi.mock("./StudioAssetLegacyPanel", () => ({
  StudioAssetLegacyPanel: () => (
    <div data-testid="legacy-panel">기존 보관함</div>
  ),
}));
vi.mock("./StudioAssetToolPopoverBody", () => ({
  StudioAssetToolPopoverBody: () => (
    <div data-testid="legacy-body">기존 도구</div>
  ),
}));
vi.mock("./studio-chrome-ui", () => ({
  StudioMenuPopoverHeader: () => <div data-testid="menu-header" />,
  StudioMenuSubtabs: ({
    onSelect,
  }: {
    readonly onSelect: (id: string) => void;
  }) => (
    <button type="button" onClick={() => onSelect("asset")}>
      에셋 탭
    </button>
  ),
}));
vi.mock("./studio-unified-asset-catalog", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("./studio-unified-asset-catalog")
  >();
  return {
    ...actual,
    buildStudioUnifiedAssetCatalog: vi.fn(() => mocks.catalog),
  };
});

import { StudioAssetToolPopoverWorkspace } from "./StudioAssetToolPopoverWorkspace";

function createItem(source: StudioUnifiedAssetSource): StudioUnifiedAssetItem {
  return {
    id: "test:item",
    category:
      source.kind === "object-3d"
        ? "3d"
        : source.kind === "local"
          ? "mine"
          : "element",
    scope: source.kind === "local" ? "mine" : "studio",
    title: "테스트 에셋",
    description: "테스트 설명",
    categoryLabel: "테스트",
    keywords: ["테스트"],
    badges: ["검증"],
    preview: { kind: "none" },
    useMode:
      source.kind === "native-tool" || source.kind === "object-3d"
        ? "open"
        : "insert",
    useLabel: "사용",
    discoverability: "standard",
    sortPriority: 1,
    source,
  };
}

function createToolBelt(overrides: Record<string, unknown> = {}) {
  const stableHandlers = {
    addBgScene: vi.fn(),
    addCatalogElement: vi.fn(),
    addRenderedImage: vi.fn(() => true),
    applyAiAssistPresetPrompt: vi.fn(),
    openStudioObjectInsert: vi.fn(),
  };
  const setMenu = vi.fn();
  const toolBelt = {
    menu: "asset",
    assetTab: "mine",
    assets: [],
    sceneTemplates: { templates: [] },
    studioOptionalAssets: { bgSceneSections: [] },
    stableHandlers,
    setMenu,
    ...overrides,
  } as unknown as StudioToolBeltContentProps;
  return { toolBelt, stableHandlers, setMenu };
}

function renderRoute(source: StudioUnifiedAssetSource) {
  mocks.catalog = [createItem(source)];
  const context = createToolBelt();
  render(<StudioAssetToolPopoverWorkspace toolBelt={context.toolBelt} />);
  fireEvent.click(screen.getByRole("button", { name: /테스트 에셋/ }));
  return context;
}

afterEach(cleanup);
beforeEach(() => {
  mocks.catalog = [];
  mocks.preload.mockReset();
});

describe("StudioAssetToolPopoverWorkspace", () => {
  it("keeps the workspace mounted while legacy asset tabs switch", () => {
    const first = createToolBelt({ assetTab: "community" });
    const { rerender } = render(
      <StudioAssetToolPopoverWorkspace toolBelt={first.toolBelt} />,
    );
    expect(screen.getByTestId("legacy-panel")).toBeTruthy();

    const second = {
      ...first.toolBelt,
      assetTab: "mine",
    } as StudioToolBeltContentProps;
    rerender(<StudioAssetToolPopoverWorkspace toolBelt={second} />);

    expect(screen.getByTestId("legacy-panel")).toBeTruthy();
    expect(
      screen.queryByRole("searchbox", { name: "에셋 통합 검색" }),
    ).toBeNull();
  });

  it("falls back to the owned legacy body outside the asset menu", () => {
    const { toolBelt } = createToolBelt({ menu: "scene" });
    render(<StudioAssetToolPopoverWorkspace toolBelt={toolBelt} />);
    expect(screen.getByTestId("legacy-body")).toBeTruthy();
  });

  it("preloads the asset surface from the subtab", () => {
    const { toolBelt, setMenu } = createToolBelt();
    render(<StudioAssetToolPopoverWorkspace toolBelt={toolBelt} />);
    fireEvent.click(screen.getByRole("button", { name: "에셋 탭" }));
    expect(mocks.preload).toHaveBeenCalledTimes(1);
    expect(setMenu).toHaveBeenCalledWith("asset");
  });

  it("routes backgrounds through the existing background inserter", async () => {
    const source = {
      kind: "background" as const,
      value: { id: "bg", label: "배경", genre: "학원" },
    };
    const { stableHandlers } = renderRoute(source);
    await waitFor(() =>
      expect(stableHandlers.addBgScene).toHaveBeenCalledWith(source.value),
    );
  });

  it("routes scene templates to their preview surface", async () => {
    const source = {
      kind: "scene-template" as const,
      value: {
        id: "scene",
        label: "장면",
        category: "romance",
        description: "장면",
        build: () => [],
      },
    };
    const { setMenu } = renderRoute(source);
    await waitFor(() => expect(setMenu).toHaveBeenCalledWith("scene"));
  });

  it("routes vector elements through the catalog inserter", async () => {
    const source = {
      kind: "element" as const,
      value: {
        id: "element",
        label: "요소",
        category: "shape" as const,
        keywords: [],
        width: 10,
        height: 10,
        svg: '<svg xmlns="http://www.w3.org/2000/svg"/>',
      },
    };
    const { stableHandlers } = renderRoute(source);
    await waitFor(() =>
      expect(stableHandlers.addCatalogElement).toHaveBeenCalledWith(
        source.value,
      ),
    );
  });

  it("routes 3D objects through the owned insert surface", async () => {
    const source = {
      kind: "object-3d" as const,
      value: {
        id: "chair",
        kind: "vrm-prop" as const,
        sourceId: "chair",
        label: "의자",
        family: "prop-body" as const,
        familyLabel: "몸 소품",
        keywords: [],
        hint: null,
        openTarget: "vrm-poser" as const,
        defaultWidth: 100,
        defaultHeight: 100,
      },
    };
    const { stableHandlers, setMenu } = renderRoute(source);
    await waitFor(() => {
      expect(setMenu).toHaveBeenCalledWith(null);
      expect(stableHandlers.openStudioObjectInsert).toHaveBeenCalledWith({
        openTarget: "vrm-poser",
        sourceId: "chair",
      });
    });
  });

  it("routes local assets through rendered image insertion", async () => {
    const source = {
      kind: "local" as const,
      value: {
        id: "local",
        name: "내 에셋",
        dataUrl: "data:image/png;base64,AA==",
        width: 10,
        height: 10,
        createdAt: 1,
      },
    };
    const { stableHandlers } = renderRoute(source);
    await waitFor(() =>
      expect(stableHandlers.addRenderedImage).toHaveBeenCalledWith(
        source.value.dataUrl,
        source.value.width,
        source.value.height,
      ),
    );
  });

  it("routes semantic native assets to their owned editor", async () => {
    const source = {
      kind: "native-tool" as const,
      value: {
        id: "bubble" as const,
        menu: "bubble" as const,
        title: "말풍선",
        description: "편집 가능한 말풍선",
        keywords: [],
      },
    };
    const { setMenu } = renderRoute(source);
    await waitFor(() => expect(setMenu).toHaveBeenCalledWith("bubble"));
  });

  it("hands empty-search context to the AI background tool", () => {
    const { toolBelt, stableHandlers, setMenu } = createToolBelt();
    render(<StudioAssetToolPopoverWorkspace toolBelt={toolBelt} />);
    fireEvent.change(
      screen.getByRole("searchbox", { name: "에셋 통합 검색" }),
      { target: { value: "심해 정거장" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "AI 도구에서 만들기" }),
    );
    expect(stableHandlers.applyAiAssistPresetPrompt).toHaveBeenCalledWith(
      "background",
      "심해 정거장",
    );
    expect(setMenu).toHaveBeenCalledWith("aiAssist");
  });
});
