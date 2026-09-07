import { Suspense } from "react";

import { completeStudioAssetInsertion } from "./studio-asset-insertion-outcome";
import { StudioAssetMenuPanel } from "./studio-page-lazy-ui";
import { StudioPanelLoading } from "./StudioLazySurfaceFallback";
import { useStudioCommunityMarketplaceInitialView } from "./use-studio-community-marketplace-initial-view";

import type { StudioToolBeltContentProps } from "./StudioToolBeltContent";

export interface StudioAssetLegacyPanelProps {
  readonly toolBelt: StudioToolBeltContentProps;
}

export function StudioAssetLegacyPanel({
  toolBelt,
}: StudioAssetLegacyPanelProps) {
  const communityMarketplaceInitialView =
    useStudioCommunityMarketplaceInitialView();
  const {
    assetFavoriteOnly,
    assetFavoriteState,
    assetGenerating,
    assetPrompt,
    assetPromptName,
    assetPromptQuality,
    assetPromptSize,
    assets,
    assetSearchQuery,
    assetsLoading,
    assetSortOrder,
    assetTab,
    publishingId,
    renamingAssetId,
    renamingAssetName,
    setAssetFavoriteOnly,
    setAssetPrompt,
    setAssetPromptName,
    setAssetPromptQuality,
    setAssetPromptSize,
    setAssetSearchQuery,
    setAssetSortOrder,
    setAssetTab,
    setMenu,
    setRenamingAssetId,
    setRenamingAssetName,
    shared,
    sharedError,
    sharedHasMore,
    sharedLoading,
    sharedLoadingMore,
  } = toolBelt;
  const {
    addRenderedImage,
    handleRenameAsset,
    loadMoreSharedAssets,
    loadSharedAssets,
    onDeleteAsset,
    onDeleteSharedAsset,
    onGenerateAsset,
    onReportSharedAsset,
    onShareAsset,
    onUploadAsset,
    onUseSharedAsset,
    toggleAssetFavorite,
  } = toolBelt.stableHandlers;

  return (
    <Suspense fallback={<StudioPanelLoading label="에셋 보관함을 여는 중..." />}>
      <StudioAssetMenuPanel
        assetTab={assetTab}
        setAssetTab={setAssetTab}
        communityMarketplaceInitialView={communityMarketplaceInitialView}
        onUploadAsset={onUploadAsset}
        assetPrompt={assetPrompt}
        setAssetPrompt={setAssetPrompt}
        assetPromptName={assetPromptName}
        setAssetPromptName={setAssetPromptName}
        assetPromptSize={assetPromptSize}
        setAssetPromptSize={setAssetPromptSize}
        assetPromptQuality={assetPromptQuality}
        setAssetPromptQuality={setAssetPromptQuality}
        assetGenerating={assetGenerating}
        onGenerateAsset={onGenerateAsset}
        assetSearchQuery={assetSearchQuery}
        setAssetSearchQuery={setAssetSearchQuery}
        assetSortOrder={assetSortOrder}
        setAssetSortOrder={setAssetSortOrder}
        favoriteState={assetFavoriteState}
        favoriteOnly={assetFavoriteOnly}
        setFavoriteOnly={setAssetFavoriteOnly}
        onToggleFavorite={toggleAssetFavorite}
        assets={assets}
        assetsLoading={assetsLoading}
        renamingAssetId={renamingAssetId}
        setRenamingAssetId={setRenamingAssetId}
        renamingAssetName={renamingAssetName}
        setRenamingAssetName={setRenamingAssetName}
        handleRenameAsset={handleRenameAsset}
        onUseLocalAsset={(asset) => completeStudioAssetInsertion(
          () => addRenderedImage(asset.dataUrl, asset.width, asset.height),
          () => setMenu(null),
        )}
        onShareAsset={onShareAsset}
        onDeleteAsset={onDeleteAsset}
        publishingId={publishingId}
        shared={shared}
        sharedLoading={sharedLoading}
        sharedLoadingMore={sharedLoadingMore}
        sharedHasMore={sharedHasMore}
        sharedError={sharedError}
        loadSharedAssets={loadSharedAssets}
        loadMoreSharedAssets={loadMoreSharedAssets}
        onUseSharedAsset={onUseSharedAsset}
        onDeleteSharedAsset={onDeleteSharedAsset}
        onReportSharedAsset={onReportSharedAsset}
      />
    </Suspense>
  );
}
