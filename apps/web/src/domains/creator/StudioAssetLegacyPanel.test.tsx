// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { StudioToolBeltContentProps } from "./StudioToolBeltContent";

import { StudioAssetLegacyPanel } from "./StudioAssetLegacyPanel";

const mocks = vi.hoisted(() => ({
  panelProps: null as Record<string, unknown> | null,
}));

vi.mock("./studio-page-lazy-ui", () => ({
  StudioAssetMenuPanel: (props: Record<string, unknown>) => {
    mocks.panelProps = props;
    return <div data-testid="asset-menu-panel" />;
  },
}));
vi.mock("./StudioLazySurfaceFallback", () => ({
  StudioPanelLoading: () => <div>불러오는 중</div>,
}));
vi.mock("./use-studio-community-marketplace-initial-view", () => ({
  useStudioCommunityMarketplaceInitialView: () => "share",
}));
vi.mock("./studio-asset-insertion-outcome", () => ({
  completeStudioAssetInsertion: (
    insert: () => unknown,
    close: () => void,
  ) => {
    const result = insert();
    if (result !== false) close();
    return result;
  },
}));

function createToolBelt() {
  const setMenu = vi.fn();
  const addRenderedImage = vi.fn(() => true);
  const noop = vi.fn();
  const toolBelt = {
    assetFavoriteOnly: false,
    assetFavoriteState: {},
    assetGenerating: false,
    assetPrompt: "",
    assetPromptName: "",
    assetPromptQuality: "standard",
    assetPromptSize: "1024x1024",
    assets: [],
    assetSearchQuery: "",
    assetsLoading: false,
    assetSortOrder: "recent",
    assetTab: "mine",
    publishingId: null,
    renamingAssetId: null,
    renamingAssetName: "",
    setAssetFavoriteOnly: noop,
    setAssetPrompt: noop,
    setAssetPromptName: noop,
    setAssetPromptQuality: noop,
    setAssetPromptSize: noop,
    setAssetSearchQuery: noop,
    setAssetSortOrder: noop,
    setAssetTab: noop,
    setMenu,
    setRenamingAssetId: noop,
    setRenamingAssetName: noop,
    shared: [],
    sharedError: null,
    sharedHasMore: false,
    sharedLoading: false,
    sharedLoadingMore: false,
    stableHandlers: {
      addRenderedImage,
      handleRenameAsset: noop,
      loadMoreSharedAssets: noop,
      loadSharedAssets: noop,
      onDeleteAsset: noop,
      onDeleteSharedAsset: noop,
      onGenerateAsset: noop,
      onReportSharedAsset: noop,
      onShareAsset: noop,
      onUploadAsset: noop,
      onUseSharedAsset: noop,
      toggleAssetFavorite: noop,
    },
  } as unknown as StudioToolBeltContentProps;
  return { toolBelt, setMenu, addRenderedImage };
}

afterEach(() => {
  cleanup();
  mocks.panelProps = null;
});

describe("StudioAssetLegacyPanel", () => {
  it("passes the library contract and closes after a safe local insertion", () => {
    const { toolBelt, setMenu, addRenderedImage } = createToolBelt();
    render(<StudioAssetLegacyPanel toolBelt={toolBelt} />);

    expect(screen.getByTestId("asset-menu-panel")).toBeTruthy();
    expect(mocks.panelProps?.communityMarketplaceInitialView).toBe("share");

    const asset = {
      id: "local",
      name: "내 에셋",
      dataUrl: "data:image/png;base64,AA==",
      width: 20,
      height: 30,
      createdAt: 1,
    };
    const onUseLocalAsset = mocks.panelProps?.onUseLocalAsset as
      | ((value: typeof asset) => unknown)
      | undefined;
    expect(onUseLocalAsset).toBeTypeOf("function");
    onUseLocalAsset?.(asset);

    expect(addRenderedImage).toHaveBeenCalledWith(asset.dataUrl, 20, 30);
    expect(setMenu).toHaveBeenCalledWith(null);
  });
});
