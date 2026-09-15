// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  StudioUnifiedAssetItem,
  StudioUnifiedAssetSource,
} from "./studio-unified-asset-catalog";
import type { StudioToolBeltContentProps } from "./StudioToolBeltContent";

import { StudioAssetToolPopoverWorkspace } from "./StudioAssetToolPopoverWorkspace";

const mocks = vi.hoisted(() => ({
  catalog: [] as StudioUnifiedAssetItem[],
}));

vi.mock("./studio-bg-scenes", () => ({ BG_SCENES: [] }));
vi.mock("./studio-bg-scenes-extra", () => ({ BG_SCENES_EXTRA: [] }));
vi.mock("./studio-scene-templates", () => ({ SCENE_TEMPLATES: [] }));
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
}));
vi.mock("./StudioUnifiedAssetPreviewSurface", () => ({
  StudioUnifiedAssetPreviewSurface: ({ preview }: { preview: { kind: string } }) => (
    <div data-testid={`preview-${preview.kind}`}>미리보기</div>
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

function contractForSource(source: StudioUnifiedAssetSource): {
  useMode: StudioUnifiedAssetItem["useMode"];
  useLabel: string;
} {
  if (source.kind === "scene-template") {
    return { useMode: "apply", useLabel: "장면 배치" };
  }
  if (source.kind === "object-3d") {
    return { useMode: "open", useLabel: "3D 도구 열기" };
  }
  if (source.kind === "native-tool") {
    return { useMode: "open", useLabel: "도구 열기" };
  }
  return { useMode: "insert", useLabel: "캔버스에 삽입" };
}

function createItem(source: StudioUnifiedAssetSource): StudioUnifiedAssetItem {
  const contract = contractForSource(source);
  return {
    id: "test:item",
    category:
      source.kind === "object-3d"
        ? "3d"
        : source.kind === "local"
          ? "mine"
          : source.kind === "background" || source.kind === "scene-template"
            ? "scene"
            : "element",
    scope: source.kind === "local" ? "mine" : "studio",
    title: "테스트 에셋",
    description: "테스트 설명",
    categoryLabel: "테스트",
    keywords: ["테스트"],
    badges: ["검증"],
    preview: { kind: "none" },
    ...contract,
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
    addSceneTemplate: vi.fn(async () => undefined),
    addText: vi.fn(),
    applyAiAssistPresetPrompt: vi.fn(),
    onPickImage: vi.fn(async () => undefined),
    openStudioObjectInsert: vi.fn(),
  };
  const setMenu = vi.fn();
  const toolBelt = {
    menu: "asset",
    assetTab: "mine",
    activeSurfaceReviewLocked: false,
    assets: [],
    canvasH: 1_200,
    sceneTemplates: { templates: [] },
    selected: null,
    studioOptionalAssets: { bgSceneSections: [] },
    stableHandlers,
    setBg3dOpen: vi.fn(),
    setMenu,
    ...overrides,
  } as unknown as StudioToolBeltContentProps;
  return { toolBelt, stableHandlers, setMenu };
}

async function clickAssetUseButton(item: StudioUnifiedAssetItem): Promise<void> {
  fireEvent.click(
    await screen.findByRole("button", {
      name: `${item.title} ${item.useLabel}`,
    }),
  );
}

async function renderRoute(source: StudioUnifiedAssetSource) {
  const item = createItem(source);
  mocks.catalog = [item];
  const context = createToolBelt();
  render(<StudioAssetToolPopoverWorkspace toolBelt={context.toolBelt} />);
  await clickAssetUseButton(item);
  return { ...context, item };
}

beforeAll(async () => {
  await Promise.all([
    import("./StudioUnifiedAssetToolPopoverContent"),
    import("./StudioUnifiedAssetToolPopoverContentDirectDrag"),
  ]);
});

afterEach(cleanup);
beforeEach(() => {
  mocks.catalog = [];
  window.localStorage.clear();
});

describe("StudioAssetToolPopoverWorkspace", () => {
  it.each([
    ["background", false],
    ["element", false],
    ["background", true],
    ["element", true],
  ] as const)("reports the actual %s insertion outcome: %s", async (kind, accepted) => {
    const source: StudioUnifiedAssetSource = kind === "background"
      ? { kind, value: { id: "bg", label: "배경", genre: "학원" } }
      : {
          kind,
          value: {
            id: "element",
            label: "요소",
            category: "shape",
            keywords: [],
            width: 10,
            height: 10,
            svg: '<svg xmlns="http://www.w3.org/2000/svg"/>',
          },
        };
    const item = createItem(source);
    mocks.catalog = [item];
    const { toolBelt, stableHandlers } = createToolBelt();
    const insert = kind === "background"
      ? stableHandlers.addBgScene
      : stableHandlers.addCatalogElement;
    insert.mockReturnValue(accepted);
    render(<StudioAssetToolPopoverWorkspace toolBelt={toolBelt} />);
    await clickAssetUseButton(item);
    if (accepted) {
      expect(await screen.findByText("테스트 에셋을(를) 캔버스에 삽입했습니다.")).toBeTruthy();
    } else {
      expect(await screen.findByText("현재 캔버스 상태에서는 이 에셋을 사용할 수 없습니다.")).toBeTruthy();
      expect(screen.queryByText("테스트 에셋을(를) 캔버스에 삽입했습니다.")).toBeNull();
    }
  });

  it("opens community deep links inside the same workspace", async () => {
    const { toolBelt } = createToolBelt({ assetTab: "community" });
    render(<StudioAssetToolPopoverWorkspace toolBelt={toolBelt} />);

    expect(await screen.findByTestId("legacy-panel")).toBeTruthy();
    expect(screen.getByRole("button", { name: "보관함 · 마켓" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "통합 탐색" }));
    expect(await screen.findByRole("searchbox", { name: "에셋 통합 검색" })).toBeTruthy();
  });

  it("falls back to the owned legacy body outside the asset menu", () => {
    const { toolBelt } = createToolBelt({ menu: "scene" });
    render(<StudioAssetToolPopoverWorkspace toolBelt={toolBelt} />);
    expect(screen.getByTestId("legacy-body")).toBeTruthy();
  });

  it("renders one integrated workspace without the previous duplicate subtabs", async () => {
    const { toolBelt } = createToolBelt();
    render(<StudioAssetToolPopoverWorkspace toolBelt={toolBelt} />);
    expect(await screen.findByRole("region", { name: "통합 에셋 작업 공간" })).toBeTruthy();
    expect(screen.getByTestId("menu-header")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "에셋 탭" })).toBeNull();
  });

  it("routes backgrounds through the existing background inserter", async () => {
    const source = {
      kind: "background" as const,
      value: { id: "bg", label: "배경", genre: "학원" },
    };
    const { stableHandlers } = await renderRoute(source);
    await waitFor(() =>
      expect(stableHandlers.addBgScene).toHaveBeenCalledWith(source.value),
    );
  });

  it("applies scene templates directly to the current page", async () => {
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
    const { stableHandlers, setMenu } = await renderRoute(source);
    await waitFor(() =>
      expect(stableHandlers.addSceneTemplate).toHaveBeenCalledWith(source.value),
    );
    expect(setMenu).not.toHaveBeenCalledWith("scene");
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
    const { stableHandlers } = await renderRoute(source);
    await waitFor(() =>
      expect(stableHandlers.addCatalogElement).toHaveBeenCalledWith(source.value),
    );
  });

  it("routes 3D objects through the owned editable insert surface", async () => {
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
    const { stableHandlers, setMenu } = await renderRoute(source);
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
    const { stableHandlers } = await renderRoute(source);
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
    const { setMenu } = await renderRoute(source);
    await waitFor(() => expect(setMenu).toHaveBeenCalledWith("bubble"));
  });

  it("disables immediate mutations while the active surface is review-locked", async () => {
    const { toolBelt, stableHandlers } = createToolBelt({
      activeSurfaceReviewLocked: true,
    });
    render(<StudioAssetToolPopoverWorkspace toolBelt={toolBelt} />);

    const textButton = await screen.findByRole("button", { name: "텍스트" });
    expect((textButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(textButton);
    expect(stableHandlers.addText).not.toHaveBeenCalled();
  });

  it("blocks direct file input changes while review-locked", async () => {
    const { toolBelt, stableHandlers } = createToolBelt({
      activeSurfaceReviewLocked: true,
    });
    const view = render(<StudioAssetToolPopoverWorkspace toolBelt={toolBelt} />);
    await screen.findByRole("searchbox", { name: "에셋 통합 검색" });
    const input = view.container.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("에셋 워크스페이스 파일 입력이 없습니다.");
    }

    fireEvent.change(input, {
      target: {
        files: [new File(["pixel"], "locked.png", { type: "image/png" })],
      },
    });

    expect(
      await screen.findByText("검토 잠금을 해제한 뒤 이미지를 가져와 주세요."),
    ).toBeTruthy();
    expect(stableHandlers.onPickImage).not.toHaveBeenCalled();
  });

  it("hands empty-search context to the AI background tool", async () => {
    const { toolBelt, stableHandlers, setMenu } = createToolBelt();
    render(<StudioAssetToolPopoverWorkspace toolBelt={toolBelt} />);
    fireEvent.change(
      await screen.findByRole("searchbox", { name: "에셋 통합 검색" }),
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
