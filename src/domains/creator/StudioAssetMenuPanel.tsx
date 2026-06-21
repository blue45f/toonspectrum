import { Check, Globe, ImagePlus, Loader2, Pencil, Search, Share2, Sparkles, X } from "lucide-react";

import type { StudioAsset } from "./studio-asset-library";
import type {
  GeneratedAssetQuality,
  GeneratedAssetSize,
  SharedAsset,
} from "@/src/infrastructure/creator-client";
import type { ChangeEvent, Dispatch, DragEvent, KeyboardEvent, SetStateAction } from "react";

import { cx } from "@/lib/cx";


export type StudioAssetTab = "mine" | "community";
export type StudioAssetSortOrder = "newest" | "name" | "size";

export interface StudioAssetMenuPanelProps {
  assetTab: StudioAssetTab;
  setAssetTab: Dispatch<SetStateAction<StudioAssetTab>>;
  onUploadAsset: (event: ChangeEvent<HTMLInputElement>) => void;
  assetPrompt: string;
  setAssetPrompt: Dispatch<SetStateAction<string>>;
  assetPromptName: string;
  setAssetPromptName: Dispatch<SetStateAction<string>>;
  assetPromptSize: GeneratedAssetSize;
  setAssetPromptSize: Dispatch<SetStateAction<GeneratedAssetSize>>;
  assetPromptQuality: GeneratedAssetQuality;
  setAssetPromptQuality: Dispatch<SetStateAction<GeneratedAssetQuality>>;
  assetGenerating: boolean;
  onGenerateAsset: () => void;
  assetSearchQuery: string;
  setAssetSearchQuery: Dispatch<SetStateAction<string>>;
  assetSortOrder: StudioAssetSortOrder;
  setAssetSortOrder: Dispatch<SetStateAction<StudioAssetSortOrder>>;
  assets: StudioAsset[];
  assetsLoading: boolean;
  renamingAssetId: string | null;
  setRenamingAssetId: Dispatch<SetStateAction<string | null>>;
  renamingAssetName: string;
  setRenamingAssetName: Dispatch<SetStateAction<string>>;
  handleRenameAsset: (id: string) => void;
  onUseLocalAsset: (asset: StudioAsset) => void;
  onShareAsset: (asset: StudioAsset) => void;
  onDeleteAsset: (id: string) => void;
  publishingId: string | null;
  shared: SharedAsset[];
  sharedLoading: boolean;
  sharedError: string | null;
  loadSharedAssets: () => void;
  onUseSharedAsset: (asset: SharedAsset) => void;
  onDeleteSharedAsset: (id: string) => void;
}

function sortLocalAssets(assets: StudioAsset[], query: string, sortOrder: StudioAssetSortOrder): StudioAsset[] {
  let list = assets;
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery) {
    list = list.filter((asset) => asset.name.toLowerCase().includes(normalizedQuery));
  }
  const sorted = list.slice();
  if (sortOrder === "newest") {
    sorted.sort((a, b) => b.createdAt - a.createdAt);
  } else if (sortOrder === "name") {
    sorted.sort((a, b) => a.name.localeCompare(b.name, "ko", { sensitivity: "base" }));
  } else {
    sorted.sort((a, b) => b.width * b.height - a.width * a.height);
  }
  return sorted;
}

function sortSharedAssets(assets: SharedAsset[], query: string, sortOrder: StudioAssetSortOrder): SharedAsset[] {
  let list = assets;
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery) {
    list = list.filter((asset) => asset.name.toLowerCase().includes(normalizedQuery));
  }
  const sorted = list.slice();
  if (sortOrder === "newest") {
    sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } else if (sortOrder === "name") {
    sorted.sort((a, b) => a.name.localeCompare(b.name, "ko", { sensitivity: "base" }));
  } else {
    sorted.sort((a, b) => b.width * b.height - a.width * a.height);
  }
  return sorted;
}

function dragAssetData(event: DragEvent<HTMLElement>, asset: Pick<StudioAsset, "dataUrl" | "width" | "height">) {
  event.dataTransfer.setData(
    "application/json-asset",
    JSON.stringify({ src: asset.dataUrl, width: asset.width, height: asset.height })
  );
}

export function StudioAssetMenuPanel({
  assetTab,
  setAssetTab,
  onUploadAsset,
  assetPrompt,
  setAssetPrompt,
  assetPromptName,
  setAssetPromptName,
  assetPromptSize,
  setAssetPromptSize,
  assetPromptQuality,
  setAssetPromptQuality,
  assetGenerating,
  onGenerateAsset,
  assetSearchQuery,
  setAssetSearchQuery,
  assetSortOrder,
  setAssetSortOrder,
  assets,
  assetsLoading,
  renamingAssetId,
  setRenamingAssetId,
  renamingAssetName,
  setRenamingAssetName,
  handleRenameAsset,
  onUseLocalAsset,
  onShareAsset,
  onDeleteAsset,
  publishingId,
  shared,
  sharedLoading,
  sharedError,
  loadSharedAssets,
  onUseSharedAsset,
  onDeleteSharedAsset,
}: StudioAssetMenuPanelProps) {
  const filteredAssets = sortLocalAssets(assets, assetSearchQuery, assetSortOrder);
  const filteredShared = sortSharedAssets(shared, assetSearchQuery, assetSortOrder);

  return (
    <div className="fixed inset-x-2 top-48 z-30 max-h-[calc(100dvh-13rem)] overflow-y-auto rounded-xl border border-line bg-panel p-3 shadow-lg sm:absolute sm:left-0 sm:right-auto sm:top-full sm:mt-1 sm:w-80 sm:max-h-none sm:overflow-visible">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-0.5 rounded-lg border border-line bg-card p-0.5">
          <button
            type="button"
            onClick={() => setAssetTab("mine")}
            className={cx(
              "rounded-md px-2 py-1 text-[0.65rem] font-semibold transition-colors",
              assetTab === "mine" ? "bg-accent text-white" : "text-fg-3 hover:bg-raised"
            )}
          >
            내 에셋
          </button>
          <button
            type="button"
            onClick={() => setAssetTab("community")}
            className={cx(
              "flex items-center gap-1 rounded-md px-2 py-1 text-[0.65rem] font-semibold transition-colors",
              assetTab === "community" ? "bg-accent text-white" : "text-fg-3 hover:bg-raised"
            )}
          >
            <Globe size={11} /> 커뮤니티
          </button>
        </div>
        {assetTab === "mine" && (
          <label className="flex cursor-pointer items-center gap-1 rounded-lg bg-accent px-2 py-1 text-[0.65rem] font-medium text-white transition-colors hover:bg-accent/90">
            <ImagePlus size={12} /> 업로드
            <input type="file" accept="image/*" className="hidden" onChange={onUploadAsset} />
          </label>
        )}
      </div>

      {assetTab === "mine" && (
        <div className="mb-2 rounded-lg border border-line bg-card/70 p-2">
          <div className="mb-1.5 flex items-center gap-1 text-[0.65rem] font-semibold text-fg-2">
            <Sparkles size={12} className="text-accent" />
            AI 에셋 생성
          </div>
          <textarea
            value={assetPrompt}
            onChange={(event) => setAssetPrompt(event.target.value.slice(0, 1000))}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") onGenerateAsset();
            }}
            placeholder="예: 비 오는 골목 배경, 마법 소품, 놀란 표정 캐릭터"
            rows={2}
            className="h-14 w-full resize-none rounded-md border border-line bg-panel px-2 py-1 text-[0.65rem] leading-snug text-fg outline-none transition-colors placeholder:text-fg-4 focus:border-accent"
          />
          <div className="mt-1.5 grid grid-cols-[1fr_auto] gap-1.5">
            <input
              type="text"
              value={assetPromptName}
              onChange={(event) => setAssetPromptName(event.target.value.slice(0, 60))}
              placeholder="이름"
              className="min-w-0 rounded-md border border-line bg-panel px-2 py-1 text-[0.65rem] text-fg outline-none transition-colors placeholder:text-fg-4 focus:border-accent"
            />
            <button
              type="button"
              onClick={onGenerateAsset}
              disabled={!assetPrompt.trim() || assetGenerating}
              className="inline-flex h-7 items-center gap-1 rounded-md bg-accent px-2 text-[0.65rem] font-semibold text-white transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-55"
            >
              {assetGenerating ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
              생성
            </button>
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            <select
              value={assetPromptSize}
              onChange={(event) => setAssetPromptSize(event.target.value as GeneratedAssetSize)}
              className="rounded-md border border-line bg-panel px-1.5 py-1 text-[0.6rem] text-fg-2 outline-none focus:border-accent"
            >
              <option value="1024x1024">정사각</option>
              <option value="1536x1024">가로 배경</option>
              <option value="1024x1536">세로 컷</option>
            </select>
            <select
              value={assetPromptQuality}
              onChange={(event) => setAssetPromptQuality(event.target.value as GeneratedAssetQuality)}
              className="rounded-md border border-line bg-panel px-1.5 py-1 text-[0.6rem] text-fg-2 outline-none focus:border-accent"
            >
              <option value="low">빠르게</option>
              <option value="medium">표준</option>
              <option value="high">고품질</option>
              <option value="auto">자동</option>
            </select>
          </div>
        </div>
      )}

      <div className="mb-2 flex items-center gap-1.5">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-fg-4" />
          <input
            type="text"
            placeholder="에셋 검색..."
            value={assetSearchQuery}
            onChange={(event) => setAssetSearchQuery(event.target.value)}
            className="w-full rounded-lg border border-line bg-card py-1 pl-6 pr-5 text-[0.65rem] placeholder-fg-4 outline-none transition-colors focus:border-accent"
          />
          {assetSearchQuery && (
            <button
              type="button"
              onClick={() => setAssetSearchQuery("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-fg-4 transition-colors hover:text-fg-2"
              aria-label="에셋 검색어 지우기"
            >
              <X size={10} />
            </button>
          )}
        </div>
        <select
          value={assetSortOrder}
          onChange={(event) => setAssetSortOrder(event.target.value as StudioAssetSortOrder)}
          className="cursor-pointer rounded-lg border border-line bg-card px-1.5 py-1 text-[0.65rem] text-fg-2 outline-none transition-colors focus:border-accent"
        >
          <option value="newest">최신순</option>
          <option value="name">이름순</option>
          <option value="size">크기순</option>
        </select>
      </div>

      {assetTab === "mine" ? (
        <LocalAssetGrid
          assets={assets}
          filteredAssets={filteredAssets}
          assetsLoading={assetsLoading}
          renamingAssetId={renamingAssetId}
          setRenamingAssetId={setRenamingAssetId}
          renamingAssetName={renamingAssetName}
          setRenamingAssetName={setRenamingAssetName}
          handleRenameAsset={handleRenameAsset}
          onUseLocalAsset={onUseLocalAsset}
          onShareAsset={onShareAsset}
          onDeleteAsset={onDeleteAsset}
          publishingId={publishingId}
        />
      ) : (
        <SharedAssetGrid
          shared={shared}
          filteredShared={filteredShared}
          sharedLoading={sharedLoading}
          sharedError={sharedError}
          loadSharedAssets={loadSharedAssets}
          onUseSharedAsset={onUseSharedAsset}
          onDeleteSharedAsset={onDeleteSharedAsset}
        />
      )}
    </div>
  );
}

function LocalAssetGrid({
  assets,
  filteredAssets,
  assetsLoading,
  renamingAssetId,
  setRenamingAssetId,
  renamingAssetName,
  setRenamingAssetName,
  handleRenameAsset,
  onUseLocalAsset,
  onShareAsset,
  onDeleteAsset,
  publishingId,
}: Pick<
  StudioAssetMenuPanelProps,
  | "assets"
  | "assetsLoading"
  | "renamingAssetId"
  | "setRenamingAssetId"
  | "renamingAssetName"
  | "setRenamingAssetName"
  | "handleRenameAsset"
  | "onUseLocalAsset"
  | "onShareAsset"
  | "onDeleteAsset"
  | "publishingId"
> & {
  filteredAssets: StudioAsset[];
}) {
  if (assetsLoading) {
    return (
      <div className="flex h-32 items-center justify-center text-fg-3">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (assets.length === 0) {
    return (
      <div className="flex h-32 flex-col items-center justify-center rounded-lg border border-dashed border-line p-4 text-center">
        <p className="text-xs text-fg-3">업로드한 에셋이 없습니다 …</p>
        <p className="mt-1 text-[0.6rem] leading-normal text-fg-4">자주 쓰는 이미지를 업로드해 편리하게 사용해 보세요.</p>
      </div>
    );
  }
  if (filteredAssets.length === 0) {
    return <EmptySearchResult />;
  }
  return (
    <div className="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto pr-1">
      {filteredAssets.map((asset) => (
        <div
          key={asset.id}
          className="group relative flex cursor-grab flex-col items-center rounded-lg border border-line bg-card p-1.5 hover:border-accent/50 active:cursor-grabbing"
          draggable
          onDragStart={(event) => dragAssetData(event, asset)}
        >
          <button
            type="button"
            onClick={() => onUseLocalAsset(asset)}
            className="flex h-16 w-full cursor-pointer items-center justify-center overflow-hidden rounded bg-neutral-100 dark:bg-neutral-800"
            title={asset.name}
          >
            <img
              src={asset.dataUrl}
              alt={asset.name}
              className="max-h-full max-w-full object-contain transition-transform group-hover:scale-105"
            />
          </button>
          {renamingAssetId === asset.id ? (
            <RenameAssetInline
              asset={asset}
              renamingAssetName={renamingAssetName}
              setRenamingAssetName={setRenamingAssetName}
              setRenamingAssetId={setRenamingAssetId}
              handleRenameAsset={handleRenameAsset}
            />
          ) : (
            <span
              className="mt-1 block w-full cursor-text truncate text-center text-[0.6rem] font-medium text-fg-2"
              title={asset.name}
              onDoubleClick={() => {
                setRenamingAssetId(asset.id);
                setRenamingAssetName(asset.name);
              }}
            >
              {asset.name}
            </span>
          )}
          <div className="absolute right-1 top-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              onClick={() => {
                setRenamingAssetId(asset.id);
                setRenamingAssetName(asset.name);
              }}
              className="flex size-5 items-center justify-center rounded bg-black/60 text-white hover:bg-accent"
              title="이름 변경"
            >
              <Pencil size={10} />
            </button>
            <button
              type="button"
              onClick={() => onShareAsset(asset)}
              disabled={publishingId === asset.id}
              className="flex size-5 items-center justify-center rounded bg-black/60 text-white hover:bg-accent disabled:opacity-50"
              title="커뮤니티에 공유"
            >
              {publishingId === asset.id ? <Loader2 size={10} className="animate-spin" /> : <Share2 size={10} />}
            </button>
            <button
              type="button"
              onClick={() => onDeleteAsset(asset.id)}
              className="flex size-5 items-center justify-center rounded bg-black/60 text-white hover:bg-red-500"
              title="삭제"
            >
              <X size={10} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function RenameAssetInline({
  asset,
  renamingAssetName,
  setRenamingAssetName,
  setRenamingAssetId,
  handleRenameAsset,
}: {
  asset: StudioAsset;
  renamingAssetName: string;
  setRenamingAssetName: Dispatch<SetStateAction<string>>;
  setRenamingAssetId: Dispatch<SetStateAction<string | null>>;
  handleRenameAsset: (id: string) => void;
}) {
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      handleRenameAsset(asset.id);
    } else if (event.key === "Escape") {
      setRenamingAssetId(null);
    }
  };

  return (
    <div className="mt-1 flex w-full items-center gap-0.5">
      <input
        type="text"
        value={renamingAssetName}
        onChange={(event) => setRenamingAssetName(event.target.value)}
        className="w-full min-w-0 rounded border border-accent bg-panel px-1 py-0.5 text-[0.55rem] text-fg-1 outline-none"
        // eslint-disable-next-line jsx-a11y/no-autofocus -- inline rename field opens only on user action; focusing it immediately is correct edit-on-demand UX
        autoFocus
        onKeyDown={onKeyDown}
      />
      <button
        type="button"
        onClick={() => handleRenameAsset(asset.id)}
        className="shrink-0 rounded bg-accent p-0.5 text-white hover:bg-accent/90"
        title="확인"
      >
        <Check size={8} />
      </button>
      <button
        type="button"
        onClick={() => setRenamingAssetId(null)}
        className="shrink-0 rounded bg-line p-0.5 text-fg-3 hover:bg-raised"
        title="취소"
      >
        <X size={8} />
      </button>
    </div>
  );
}

function SharedAssetGrid({
  shared,
  filteredShared,
  sharedLoading,
  sharedError,
  loadSharedAssets,
  onUseSharedAsset,
  onDeleteSharedAsset,
}: Pick<
  StudioAssetMenuPanelProps,
  "shared" | "sharedLoading" | "sharedError" | "loadSharedAssets" | "onUseSharedAsset" | "onDeleteSharedAsset"
> & {
  filteredShared: SharedAsset[];
}) {
  if (sharedLoading) {
    return (
      <div className="flex h-32 items-center justify-center text-fg-3">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (sharedError) {
    return (
      <div className="flex h-32 flex-col items-center justify-center rounded-lg border border-dashed border-line p-4 text-center">
        <p className="text-xs text-fg-3">{sharedError}</p>
        <button
          type="button"
          onClick={loadSharedAssets}
          className="mt-2 rounded-md border border-line px-2 py-1 text-[0.6rem] text-fg-2 hover:bg-raised"
        >
          다시 시도
        </button>
      </div>
    );
  }
  if (shared.length === 0) {
    return (
      <div className="flex h-32 flex-col items-center justify-center rounded-lg border border-dashed border-line p-4 text-center">
        <p className="text-xs text-fg-3">아직 공유된 에셋이 없어요.</p>
        <p className="mt-1 text-[0.6rem] leading-normal text-fg-4">내 에셋 탭에서 공유 버튼을 눌러 첫 에셋을 올려보세요.</p>
      </div>
    );
  }
  if (filteredShared.length === 0) {
    return <EmptySearchResult />;
  }
  return (
    <div className="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto pr-1">
      {filteredShared.map((asset) => (
        <div
          key={asset.id}
          className="group relative flex cursor-grab flex-col items-center rounded-lg border border-line bg-card p-1.5 hover:border-accent/50 active:cursor-grabbing"
          draggable
          onDragStart={(event) => dragAssetData(event, asset)}
        >
          <button
            type="button"
            onClick={() => onUseSharedAsset(asset)}
            className="flex h-16 w-full cursor-pointer items-center justify-center overflow-hidden rounded bg-neutral-100 dark:bg-neutral-800"
            title={`${asset.name} · ${asset.author.name}`}
          >
            <img
              src={asset.dataUrl}
              alt={asset.name}
              className="max-h-full max-w-full object-contain transition-transform group-hover:scale-105"
            />
          </button>
          <span className="mt-1 block w-full truncate text-center text-[0.6rem] font-medium text-fg-2" title={asset.name}>
            {asset.name}
          </span>
          <span className="block w-full truncate text-center text-[0.55rem] text-fg-4">{asset.author.name}</span>
          {asset.isOwner && (
            <button
              type="button"
              onClick={() => onDeleteSharedAsset(asset.id)}
              className="absolute right-1 top-1 flex size-5 items-center justify-center rounded bg-black/60 text-white opacity-0 transition-opacity hover:bg-red-500 group-hover:opacity-100"
              title="공유 취소(삭제)"
            >
              <X size={10} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function EmptySearchResult() {
  return (
    <div className="flex h-32 flex-col items-center justify-center rounded-lg border border-dashed border-line p-4 text-center">
      <p className="text-xs text-fg-3">검색 결과가 없습니다.</p>
      <p className="mt-1 text-[0.6rem] leading-normal text-fg-4">다른 검색어로 찾아보세요.</p>
    </div>
  );
}
