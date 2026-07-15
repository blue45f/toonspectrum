// "에셋" 툴바 그룹 팝오버 안에 서브탭 콘텐츠로 얹히는 컴포넌트 — 팝오버 위치·z-index·max-height는
// 호출부(StudioPage.tsx의 에셋 그룹 wrapper)가 담당한다(2026-07-05 툴바 그룹화로 이관, 자체 wrapper 없음).
import {
  BadgeCheck,
  Check,
  Globe,
  ImagePlus,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Share2,
  Sparkles,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";

import {
  createStudioAssetFavoriteId,
  favoriteFirst,
  favoriteOnly as filterFavoriteOnly,
  isStudioAssetFavorite,
} from "./studio-asset-favorites";

import type {
  StudioAssetFavoriteId,
  StudioAssetFavoriteState,
} from "./studio-asset-favorites";
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

const CONTROL_FOCUS_CLASS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-panel";
const TOUCH_CONTROL_CLASS = `min-h-11 ${CONTROL_FOCUS_CLASS}`;
const CARD_ACTION_CLASS =
  `flex min-h-11 w-full items-center justify-center gap-1 rounded-md px-1.5 text-[0.62rem] font-semibold transition-colors ${CONTROL_FOCUS_CLASS}`;

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
  favoriteState: StudioAssetFavoriteState;
  favoriteOnly: boolean;
  setFavoriteOnly: Dispatch<SetStateAction<boolean>>;
  onToggleFavorite: (id: StudioAssetFavoriteId) => void;
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

function AssetFavoriteButton({
  assetName,
  favoriteId,
  favoriteState,
  onToggleFavorite,
}: {
  assetName: string;
  favoriteId: StudioAssetFavoriteId;
  favoriteState: StudioAssetFavoriteState;
  onToggleFavorite: (id: StudioAssetFavoriteId) => void;
}) {
  const favorite = isStudioAssetFavorite(favoriteState, favoriteId);
  const label = `${assetName} 즐겨찾기${favorite ? "에서 제거" : "에 추가"}`;

  return (
    <button
      type="button"
      draggable={false}
      onPointerDown={(event) => event.stopPropagation()}
      onDragStart={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.stopPropagation();
        onToggleFavorite(favoriteId);
      }}
      aria-label={label}
      aria-pressed={favorite}
      title={label}
      data-favorite-id={favoriteId}
      className={cx(
        "absolute right-1.5 top-1.5 z-10 flex size-11 items-center justify-center rounded-md border shadow-sm transition-colors",
        CONTROL_FOCUS_CLASS,
        favorite
          ? "border-accent bg-panel text-accent"
          : "border-line bg-panel/95 text-fg-2 hover:border-accent/60 hover:text-accent"
      )}
    >
      <Star size={16} className={favorite ? "fill-current" : undefined} aria-hidden />
    </button>
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
  favoriteState,
  favoriteOnly,
  setFavoriteOnly,
  onToggleFavorite,
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
  const localFavoriteId = (asset: StudioAsset) => createStudioAssetFavoriteId("local", asset.id);
  const sharedFavoriteId = (asset: SharedAsset) => createStudioAssetFavoriteId("community", asset.id);
  const sortedAssets = favoriteFirst(
    sortLocalAssets(assets, assetSearchQuery, assetSortOrder),
    favoriteState,
    localFavoriteId
  );
  const sortedShared = favoriteFirst(
    sortSharedAssets(shared, assetSearchQuery, assetSortOrder),
    favoriteState,
    sharedFavoriteId
  );
  const filteredAssets = favoriteOnly
    ? filterFavoriteOnly(sortedAssets, favoriteState, localFavoriteId)
    : sortedAssets;
  const filteredShared = favoriteOnly
    ? filterFavoriteOnly(sortedShared, favoriteState, sharedFavoriteId)
    : sortedShared;

  return (
    <>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-0.5 rounded-lg border border-line bg-card p-0.5">
          <button
            type="button"
            onClick={() => setAssetTab("mine")}
            aria-pressed={assetTab === "mine"}
            className={cx(
              TOUCH_CONTROL_CLASS,
              "rounded-md px-2 text-[0.65rem] font-semibold transition-colors",
              assetTab === "mine" ? "bg-accent text-on-accent shadow-sm" : "text-fg-3 hover:bg-raised"
            )}
          >
            내 에셋
          </button>
          <button
            type="button"
            onClick={() => setAssetTab("community")}
            aria-pressed={assetTab === "community"}
            className={cx(
              TOUCH_CONTROL_CLASS,
              "flex items-center gap-1 rounded-md px-2 text-[0.65rem] font-semibold transition-colors",
              assetTab === "community" ? "bg-accent text-on-accent shadow-sm" : "text-fg-3 hover:bg-raised"
            )}
          >
            <Globe size={13} aria-hidden /> 커뮤니티
          </button>
        </div>
        {assetTab === "mine" && (
          <label
            className={cx(
              "flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg bg-accent px-2.5 text-[0.65rem] font-semibold text-on-accent transition-colors hover:bg-accent/90",
              "focus-within:outline-none focus-within:ring-2 focus-within:ring-accent focus-within:ring-offset-1 focus-within:ring-offset-panel"
            )}
          >
            <ImagePlus size={14} aria-hidden /> 업로드
            <input type="file" accept="image/*" className="sr-only" onChange={onUploadAsset} aria-label="이미지 에셋 업로드" />
          </label>
        )}
      </div>

      {assetTab === "mine" && (
        <div className="mb-2 rounded-lg border border-line bg-card/70 p-2">
          <div className="mb-1.5 flex items-center gap-1 text-[0.65rem] font-semibold text-fg-2">
            <Sparkles size={12} className="text-accent" />
            AI 에셋 생성
          </div>
          {/* 생성형 AI 고지(정책 필수) — 결과물이 생성형 AI 산출물임을 항상 명시한다. */}
          <p className="mb-1.5 rounded-md border border-line bg-panel/60 px-2 py-1 text-[0.58rem] leading-relaxed text-fg-3">
            생성형 AI(OpenAI)로 이미지를 만들어요. 결과물에는 <span className="font-semibold text-accent">AI</span> 배지가 표시되며,
            타인의 저작물·실존 인물은 생성하지 않아요.
          </p>
          <textarea
            value={assetPrompt}
            onChange={(event) => setAssetPrompt(event.target.value.slice(0, 1000))}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") onGenerateAsset();
            }}
            placeholder="예: 비 오는 골목 배경, 마법 소품, 놀란 표정 캐릭터"
            rows={2}
            aria-label="AI 에셋 설명"
            className={cx(
              "h-16 w-full resize-none rounded-md border border-line bg-panel px-2 py-2 text-[0.65rem] leading-snug text-fg outline-none transition-colors placeholder:text-fg-3 focus:border-accent",
              CONTROL_FOCUS_CLASS
            )}
          />
          <div className="mt-1.5 grid grid-cols-[1fr_auto] gap-1.5">
            <input
              type="text"
              value={assetPromptName}
              onChange={(event) => setAssetPromptName(event.target.value.slice(0, 60))}
              placeholder="이름"
              aria-label="생성할 에셋 이름"
              className={cx(
                TOUCH_CONTROL_CLASS,
                "min-w-0 rounded-md border border-line bg-panel px-2 text-[0.65rem] text-fg outline-none transition-colors placeholder:text-fg-3 focus:border-accent"
              )}
            />
            <button
              type="button"
              onClick={onGenerateAsset}
              disabled={!assetPrompt.trim() || assetGenerating}
              aria-busy={assetGenerating || undefined}
              aria-label={assetGenerating ? "AI 에셋 생성 중" : "AI 에셋 생성"}
              className={cx(
                TOUCH_CONTROL_CLASS,
                "inline-flex items-center gap-1.5 rounded-md bg-accent px-3 text-[0.65rem] font-semibold text-on-accent transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-55"
              )}
            >
              {assetGenerating ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Sparkles size={14} aria-hidden />}
              {assetGenerating ? "생성 중" : "생성"}
            </button>
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            <select
              value={assetPromptSize}
              onChange={(event) => setAssetPromptSize(event.target.value as GeneratedAssetSize)}
              aria-label="생성 이미지 크기"
              className={cx(
                TOUCH_CONTROL_CLASS,
                "rounded-md border border-line bg-panel px-2 text-[0.65rem] text-fg-2 outline-none focus:border-accent"
              )}
            >
              <option value="1024x1024">정사각</option>
              <option value="1536x1024">가로 배경</option>
              <option value="1024x1536">세로 컷</option>
            </select>
            <select
              value={assetPromptQuality}
              onChange={(event) => setAssetPromptQuality(event.target.value as GeneratedAssetQuality)}
              aria-label="생성 이미지 품질"
              className={cx(
                TOUCH_CONTROL_CLASS,
                "rounded-md border border-line bg-panel px-2 text-[0.65rem] text-fg-2 outline-none focus:border-accent"
              )}
            >
              <option value="low">빠르게</option>
              <option value="medium">표준</option>
              <option value="high">고품질</option>
              <option value="auto">자동</option>
            </select>
          </div>
        </div>
      )}

      <div className="mb-2 grid grid-cols-2 gap-1.5">
        <div className="relative col-span-2">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-fg-3" />
          <input
            type="text"
            placeholder="에셋 검색..."
            value={assetSearchQuery}
            onChange={(event) => setAssetSearchQuery(event.target.value)}
            aria-label="에셋 검색"
            className={cx(
              TOUCH_CONTROL_CLASS,
              "w-full rounded-lg border border-line bg-card pl-7 pr-11 text-[0.65rem] placeholder:text-fg-3 outline-none transition-colors focus:border-accent"
            )}
          />
          {assetSearchQuery && (
            <button
              type="button"
              onClick={() => setAssetSearchQuery("")}
              className={cx(
                "absolute right-0 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-md text-fg-3 transition-colors hover:bg-raised hover:text-fg-2",
                CONTROL_FOCUS_CLASS
              )}
              aria-label="에셋 검색어 지우기"
            >
              <X size={15} aria-hidden />
            </button>
          )}
        </div>
        <select
          value={assetSortOrder}
          onChange={(event) => setAssetSortOrder(event.target.value as StudioAssetSortOrder)}
          aria-label="에셋 정렬"
          className={cx(
            TOUCH_CONTROL_CLASS,
            "w-full cursor-pointer rounded-lg border border-line bg-card px-2 text-[0.65rem] text-fg-2 outline-none transition-colors focus:border-accent"
          )}
        >
          <option value="newest">최신순</option>
          <option value="name">이름순</option>
          <option value="size">크기순</option>
        </select>
        <button
          type="button"
          onClick={() => setFavoriteOnly((current) => !current)}
          aria-pressed={favoriteOnly}
          aria-label="즐겨찾기만"
          className={cx(
            TOUCH_CONTROL_CLASS,
            "inline-flex w-full items-center justify-center gap-1.5 rounded-lg border px-2 text-[0.65rem] font-semibold transition-colors",
            favoriteOnly
              ? "border-accent bg-accent-soft text-accent"
              : "border-line bg-card text-fg-2 hover:bg-raised"
          )}
        >
          <Star size={14} className={favoriteOnly ? "fill-current" : undefined} aria-hidden />
          즐겨찾기만
        </button>
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
          favoriteState={favoriteState}
          favoriteOnly={favoriteOnly}
          onToggleFavorite={onToggleFavorite}
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
          favoriteState={favoriteState}
          favoriteOnly={favoriteOnly}
          onToggleFavorite={onToggleFavorite}
        />
      )}
    </>
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
  favoriteState,
  favoriteOnly,
  onToggleFavorite,
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
  | "favoriteState"
  | "favoriteOnly"
  | "onToggleFavorite"
> & {
  filteredAssets: StudioAsset[];
}) {
  const [openActionsId, setOpenActionsId] = useState<string | null>(null);

  if (assetsLoading) {
    return (
      <div className="flex h-32 items-center justify-center text-fg-3">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (assets.length === 0) {
    return (
      <div
        data-studio-asset-empty="true"
        className="relative flex h-36 flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-line/80 p-4 text-center"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{
            backgroundImage:
              "linear-gradient(145deg, oklch(0.24 0.02 42 / 0.12), transparent 55%), radial-gradient(oklch(0.5 0.01 70 / 0.12) 1px, transparent 1px)",
            backgroundSize: "auto, 8px 8px",
          }}
        />
        <span className="relative mb-2 grid size-11 place-items-center rounded-2xl border border-line bg-card text-fg-3 shadow-sm">
          <ImagePlus size={18} aria-hidden />
        </span>
        <p className="relative text-xs font-semibold text-fg-2">업로드한 에셋이 없습니다</p>
        <p className="relative mt-1 max-w-[28ch] text-[0.6rem] leading-normal text-fg-3">
          자주 쓰는 이미지를 올려 두면 컷에 바로 끌어다 쓸 수 있어요.
        </p>
      </div>
    );
  }
  if (filteredAssets.length === 0) {
    return favoriteOnly ? <EmptyFavoriteResult /> : <EmptySearchResult />;
  }
  return (
    <div
      data-studio-asset-grid="true"
      className="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto pr-1"
    >
      {filteredAssets.map((asset) => {
        const actionRegionId = `local-asset-actions-${asset.id}`;
        const actionsOpen = openActionsId === asset.id;
        const isRenaming = renamingAssetId === asset.id;
        const favoriteId = createStudioAssetFavoriteId("local", asset.id);

        return (
          <div
            key={asset.id}
            data-studio-asset-card="true"
            className="group relative flex cursor-grab flex-col items-stretch rounded-xl border border-line/80 bg-card p-1.5 shadow-[inset_0_1px_0_oklch(0.97_0.01_85/0.04)] transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-md focus-within:border-accent/50 active:cursor-grabbing"
            draggable
            onDragStart={(event) => dragAssetData(event, asset)}
          >
            <AssetFavoriteButton
              assetName={asset.name}
              favoriteId={favoriteId}
              favoriteState={favoriteState}
              onToggleFavorite={onToggleFavorite}
            />
            <button
              type="button"
              onClick={() => onUseLocalAsset(asset)}
              className={cx(
                "relative flex h-20 w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg",
                CONTROL_FOCUS_CLASS
              )}
              style={{
                // Warm checkerboard (Canva/Photopea asset preview) — not cold neutral-800.
                backgroundColor: "oklch(0.22 0.01 66)",
                backgroundImage:
                  "linear-gradient(45deg, oklch(0.26 0.01 66) 25%, transparent 25%), linear-gradient(-45deg, oklch(0.26 0.01 66) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, oklch(0.26 0.01 66) 75%), linear-gradient(-45deg, transparent 75%, oklch(0.26 0.01 66) 75%)",
                backgroundSize: "10px 10px",
                backgroundPosition: "0 0, 0 5px, 5px -5px, -5px 0",
              }}
              title={asset.kind === "ai" ? `${asset.name} · AI 생성 이미지` : asset.name}
              aria-label={`${asset.name} 캔버스에 추가`}
            >
              <img
                src={asset.dataUrl}
                alt=""
                className="max-h-full max-w-full object-contain drop-shadow-sm transition-transform duration-150 group-hover:scale-105"
              />
              {asset.kind === "ai" && (
                <span className="pointer-events-none absolute left-1 top-1 inline-flex items-center gap-0.5 rounded-md bg-accent px-1 py-px text-[0.5rem] font-bold uppercase leading-none tracking-wide text-on-accent shadow">
                  <Sparkles size={7} aria-hidden /> AI
                </span>
              )}
              {asset.kind === "bg3d" && (
                <span className="pointer-events-none absolute left-1 top-1 inline-flex items-center gap-0.5 rounded-md border border-line/70 bg-panel/90 px-1 py-px text-[0.5rem] font-bold leading-none tracking-wide text-fg-2 shadow backdrop-blur-sm">
                  <BadgeCheck size={8} className="text-good" aria-hidden /> 권리 인증
                </span>
              )}
              <span className="pointer-events-none absolute bottom-1 right-1 inline-flex items-center gap-0.5 rounded-md border border-line/40 bg-panel/90 px-1.5 py-0.5 text-[0.55rem] font-semibold text-fg shadow-sm backdrop-blur-sm">
                <Plus size={10} aria-hidden /> 추가
              </span>
            </button>

            {isRenaming ? (
              <RenameAssetInline
                asset={asset}
                renamingAssetName={renamingAssetName}
                setRenamingAssetName={setRenamingAssetName}
                setRenamingAssetId={setRenamingAssetId}
                handleRenameAsset={handleRenameAsset}
              />
            ) : (
              <>
                <span
                  className="mt-1 block w-full cursor-text truncate text-center text-[0.6rem] font-medium text-fg-2"
                  title={asset.name}
                  onDoubleClick={() => {
                    setOpenActionsId(null);
                    setRenamingAssetId(asset.id);
                    setRenamingAssetName(asset.name);
                  }}
                >
                  {asset.name}
                </span>
                <button
                  type="button"
                  onClick={() => setOpenActionsId((current) => (current === asset.id ? null : asset.id))}
                  className={cx(CARD_ACTION_CLASS, "mt-1 border border-line bg-panel text-fg-2 hover:bg-raised")}
                  aria-expanded={actionsOpen}
                  aria-controls={actionRegionId}
                  aria-label={`${asset.name} 관리 작업 ${actionsOpen ? "닫기" : "열기"}`}
                >
                  <MoreHorizontal size={15} aria-hidden /> 작업
                </button>
                {actionsOpen && (
                  <div
                    id={actionRegionId}
                    role="group"
                    aria-label={`${asset.name} 관리 작업`}
                    className="mt-1 space-y-1 border-t border-line/60 pt-1"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setOpenActionsId(null);
                        setRenamingAssetId(asset.id);
                        setRenamingAssetName(asset.name);
                      }}
                      className={cx(CARD_ACTION_CLASS, "bg-panel text-fg-2 hover:bg-raised")}
                      aria-label={`${asset.name} 이름 변경`}
                    >
                      <Pencil size={13} aria-hidden /> 이름
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOpenActionsId(null);
                        onShareAsset(asset);
                      }}
                      disabled={publishingId === asset.id}
                      aria-busy={publishingId === asset.id || undefined}
                      className={cx(
                        CARD_ACTION_CLASS,
                        "bg-panel text-fg-2 hover:bg-raised disabled:cursor-not-allowed disabled:opacity-55"
                      )}
                      aria-label={`${asset.name} 커뮤니티에 공유`}
                    >
                      {publishingId === asset.id ? (
                        <Loader2 size={13} className="animate-spin" aria-hidden />
                      ) : (
                        <Share2 size={13} aria-hidden />
                      )}
                      {publishingId === asset.id ? "공유 중" : "공유"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOpenActionsId(null);
                        onDeleteAsset(asset.id);
                      }}
                      className={cx(CARD_ACTION_CLASS, "bg-bad/5 text-bad hover:bg-bad/10")}
                      aria-label={`${asset.name} 삭제`}
                    >
                      <Trash2 size={13} aria-hidden /> 삭제
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
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
    <div className="mt-1 flex w-full flex-col gap-1">
      <input
        type="text"
        value={renamingAssetName}
        onChange={(event) => setRenamingAssetName(event.target.value)}
        aria-label={`${asset.name} 새 이름`}
        className={cx(
          TOUCH_CONTROL_CLASS,
          "w-full min-w-0 rounded-md border border-accent bg-panel px-2 text-[0.62rem] text-fg-1 outline-none"
        )}
        // eslint-disable-next-line jsx-a11y/no-autofocus -- inline rename field opens only on user action; focusing it immediately is correct edit-on-demand UX
        autoFocus
        onKeyDown={onKeyDown}
      />
      <div className="grid grid-cols-2 gap-1">
        <button
          type="button"
          onClick={() => handleRenameAsset(asset.id)}
          disabled={!renamingAssetName.trim()}
          className={cx(
            "flex min-h-11 items-center justify-center rounded-md bg-accent text-on-accent transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-55",
            CONTROL_FOCUS_CLASS
          )}
          title="이름 저장"
          aria-label={`${asset.name} 이름 저장`}
        >
          <Check size={15} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => setRenamingAssetId(null)}
          className={cx(
            "flex min-h-11 items-center justify-center rounded-md border border-line bg-panel text-fg-3 transition-colors hover:bg-raised",
            CONTROL_FOCUS_CLASS
          )}
          title="이름 변경 취소"
          aria-label={`${asset.name} 이름 변경 취소`}
        >
          <X size={15} aria-hidden />
        </button>
      </div>
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
  favoriteState,
  favoriteOnly,
  onToggleFavorite,
}: Pick<
  StudioAssetMenuPanelProps,
  "shared" | "sharedLoading" | "sharedError" | "loadSharedAssets" | "onUseSharedAsset" | "onDeleteSharedAsset"
  | "favoriteState"
  | "favoriteOnly"
  | "onToggleFavorite"
> & {
  filteredShared: SharedAsset[];
}) {
  const [openActionsId, setOpenActionsId] = useState<string | null>(null);

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
          className={cx(
            TOUCH_CONTROL_CLASS,
            "mt-2 rounded-md border border-line px-3 text-[0.65rem] font-semibold text-fg-2 transition-colors hover:bg-raised"
          )}
        >
          다시 시도
        </button>
      </div>
    );
  }
  if (shared.length === 0) {
    return (
      <div
        data-studio-asset-empty="true"
        className="relative flex h-36 flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-line/80 p-4 text-center"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(oklch(0.72 0.185 42 / 0.08) 0.7px, transparent 0.8px)",
            backgroundSize: "9px 9px",
          }}
        />
        <p className="relative text-xs font-semibold text-fg-2">아직 공유된 에셋이 없어요</p>
        <p className="relative mt-1 max-w-[28ch] text-[0.6rem] leading-normal text-fg-3">
          내 에셋 탭에서 공유 버튼을 눌러 첫 에셋을 올려보세요.
        </p>
      </div>
    );
  }
  if (filteredShared.length === 0) {
    return favoriteOnly ? <EmptyFavoriteResult /> : <EmptySearchResult />;
  }
  return (
    <div data-studio-asset-grid="true" className="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto pr-1">
      {filteredShared.map((asset) => {
        const actionRegionId = `shared-asset-actions-${asset.id}`;
        const actionsOpen = openActionsId === asset.id;
        const favoriteId = createStudioAssetFavoriteId("community", asset.id);

        return (
          <div
            key={asset.id}
            data-studio-asset-card="true"
            className="group relative flex cursor-grab flex-col items-stretch rounded-xl border border-line/80 bg-card p-1.5 shadow-[inset_0_1px_0_oklch(0.97_0.01_85/0.04)] transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-md focus-within:border-accent/50 active:cursor-grabbing"
            draggable
            onDragStart={(event) => dragAssetData(event, asset)}
          >
            <AssetFavoriteButton
              assetName={asset.name}
              favoriteId={favoriteId}
              favoriteState={favoriteState}
              onToggleFavorite={onToggleFavorite}
            />
            <button
              type="button"
              onClick={() => onUseSharedAsset(asset)}
              className={cx(
                "relative flex h-20 w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg",
                CONTROL_FOCUS_CLASS
              )}
              style={{
                backgroundColor: "oklch(0.22 0.01 66)",
                backgroundImage:
                  "linear-gradient(45deg, oklch(0.26 0.01 66) 25%, transparent 25%), linear-gradient(-45deg, oklch(0.26 0.01 66) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, oklch(0.26 0.01 66) 75%), linear-gradient(-45deg, transparent 75%, oklch(0.26 0.01 66) 75%)",
                backgroundSize: "10px 10px",
                backgroundPosition: "0 0, 0 5px, 5px -5px, -5px 0",
              }}
              title={`${asset.name} · ${asset.author.name}`}
              aria-label={`${asset.name} 캔버스에 추가`}
            >
              <img
                src={asset.dataUrl}
                alt=""
                className="max-h-full max-w-full object-contain drop-shadow-sm transition-transform duration-150 group-hover:scale-105"
              />
              <span className="pointer-events-none absolute bottom-1 right-1 inline-flex items-center gap-0.5 rounded-md border border-line/40 bg-panel/90 px-1.5 py-0.5 text-[0.55rem] font-semibold text-fg shadow-sm backdrop-blur-sm">
                <Plus size={10} aria-hidden /> 추가
              </span>
            </button>
            <span className="mt-1 block w-full truncate text-center text-[0.6rem] font-medium text-fg-2" title={asset.name}>
              {asset.name}
            </span>
            <span className="block w-full truncate text-center text-[0.55rem] text-fg-3">{asset.author.name}</span>
            {asset.isOwner && (
              <>
                <button
                  type="button"
                  onClick={() => setOpenActionsId((current) => (current === asset.id ? null : asset.id))}
                  className={cx(CARD_ACTION_CLASS, "mt-1 border border-line bg-panel text-fg-2 hover:bg-raised")}
                  aria-expanded={actionsOpen}
                  aria-controls={actionRegionId}
                  aria-label={`${asset.name} 공유 관리 작업 ${actionsOpen ? "닫기" : "열기"}`}
                >
                  <MoreHorizontal size={15} aria-hidden /> 작업
                </button>
                {actionsOpen && (
                  <div
                    id={actionRegionId}
                    role="group"
                    aria-label={`${asset.name} 공유 관리 작업`}
                    className="mt-1 border-t border-line/60 pt-1"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setOpenActionsId(null);
                        onDeleteSharedAsset(asset.id);
                      }}
                      className={cx(CARD_ACTION_CLASS, "bg-bad/5 text-bad hover:bg-bad/10")}
                      aria-label={`${asset.name} 커뮤니티 공유 취소`}
                    >
                      <Trash2 size={13} aria-hidden /> 공유 취소
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function EmptySearchResult() {
  return (
    <div className="flex h-32 flex-col items-center justify-center rounded-lg border border-dashed border-line p-4 text-center">
      <p className="text-xs text-fg-3">검색 결과가 없습니다.</p>
      <p className="mt-1 text-[0.6rem] leading-normal text-fg-3">다른 검색어로 찾아보세요.</p>
    </div>
  );
}

function EmptyFavoriteResult() {
  return (
    <div
      role="status"
      className="flex h-32 flex-col items-center justify-center rounded-lg border border-dashed border-line p-4 text-center"
    >
      <Star size={18} className="text-fg-3" aria-hidden />
      <p className="mt-2 text-xs font-semibold text-fg-2">조건에 맞는 즐겨찾기가 없습니다.</p>
      <p className="mt-1 text-[0.6rem] leading-normal text-fg-3">별표를 추가하거나 검색 조건을 바꿔보세요.</p>
    </div>
  );
}
