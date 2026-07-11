// "에셋" 툴바 그룹 팝오버 안에 서브탭 콘텐츠로 얹히는 컴포넌트 — 팝오버 위치·z-index·max-height는
// 호출부(StudioPage.tsx의 에셋 그룹 wrapper)가 담당한다(2026-07-05 툴바 그룹화로 이관, 자체 wrapper 없음).
import {
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
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";

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
              assetTab === "mine" ? "bg-accent text-white" : "text-fg-3 hover:bg-raised"
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
              assetTab === "community" ? "bg-accent text-white" : "text-fg-3 hover:bg-raised"
            )}
          >
            <Globe size={13} aria-hidden /> 커뮤니티
          </button>
        </div>
        {assetTab === "mine" && (
          <label
            className={cx(
              "flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg bg-accent px-2.5 text-[0.65rem] font-semibold text-white transition-colors hover:bg-accent/90",
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
                "inline-flex items-center gap-1.5 rounded-md bg-accent px-3 text-[0.65rem] font-semibold text-white transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-55"
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

      <div className="mb-2 flex items-center gap-1.5">
        <div className="relative flex-1">
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
            "cursor-pointer rounded-lg border border-line bg-card px-2 text-[0.65rem] text-fg-2 outline-none transition-colors focus:border-accent"
          )}
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
      <div className="flex h-32 flex-col items-center justify-center rounded-lg border border-dashed border-line p-4 text-center">
        <p className="text-xs text-fg-3">업로드한 에셋이 없습니다 …</p>
        <p className="mt-1 text-[0.6rem] leading-normal text-fg-3">자주 쓰는 이미지를 업로드해 편리하게 사용해 보세요.</p>
      </div>
    );
  }
  if (filteredAssets.length === 0) {
    return <EmptySearchResult />;
  }
  return (
    <div className="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto pr-1">
      {filteredAssets.map((asset) => {
        const actionRegionId = `local-asset-actions-${asset.id}`;
        const actionsOpen = openActionsId === asset.id;
        const isRenaming = renamingAssetId === asset.id;

        return (
          <div
            key={asset.id}
            className="group relative flex cursor-grab flex-col items-stretch rounded-lg border border-line bg-card p-1.5 transition-colors hover:border-accent/50 focus-within:border-accent/50 active:cursor-grabbing"
            draggable
            onDragStart={(event) => dragAssetData(event, asset)}
          >
            <button
              type="button"
              onClick={() => onUseLocalAsset(asset)}
              className={cx(
                "relative flex h-20 w-full cursor-pointer items-center justify-center overflow-hidden rounded-md bg-neutral-100 dark:bg-neutral-800",
                CONTROL_FOCUS_CLASS
              )}
              title={asset.kind === "ai" ? `${asset.name} · AI 생성 이미지` : asset.name}
              aria-label={`${asset.name} 캔버스에 추가`}
            >
              <img
                src={asset.dataUrl}
                alt=""
                className="max-h-full max-w-full object-contain transition-transform group-hover:scale-105"
              />
              {/* 생성형 AI 결과물 라벨(정책 필수) — 콘텐츠로 위장하지 않도록 항상 보이는 배지. */}
              {asset.kind === "ai" && (
                <span className="pointer-events-none absolute left-1 top-1 inline-flex items-center gap-0.5 rounded bg-accent px-1 py-px text-[0.5rem] font-bold uppercase leading-none tracking-wide text-white shadow">
                  <Sparkles size={7} aria-hidden /> AI
                </span>
              )}
              <span className="pointer-events-none absolute bottom-1 right-1 inline-flex items-center gap-0.5 rounded bg-black/70 px-1.5 py-0.5 text-[0.55rem] font-semibold text-white shadow-sm">
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
            "flex min-h-11 items-center justify-center rounded-md bg-accent text-white transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-55",
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
}: Pick<
  StudioAssetMenuPanelProps,
  "shared" | "sharedLoading" | "sharedError" | "loadSharedAssets" | "onUseSharedAsset" | "onDeleteSharedAsset"
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
      <div className="flex h-32 flex-col items-center justify-center rounded-lg border border-dashed border-line p-4 text-center">
        <p className="text-xs text-fg-3">아직 공유된 에셋이 없어요.</p>
        <p className="mt-1 text-[0.6rem] leading-normal text-fg-3">내 에셋 탭에서 공유 버튼을 눌러 첫 에셋을 올려보세요.</p>
      </div>
    );
  }
  if (filteredShared.length === 0) {
    return <EmptySearchResult />;
  }
  return (
    <div className="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto pr-1">
      {filteredShared.map((asset) => {
        const actionRegionId = `shared-asset-actions-${asset.id}`;
        const actionsOpen = openActionsId === asset.id;

        return (
          <div
            key={asset.id}
            className="group relative flex cursor-grab flex-col items-stretch rounded-lg border border-line bg-card p-1.5 transition-colors hover:border-accent/50 focus-within:border-accent/50 active:cursor-grabbing"
            draggable
            onDragStart={(event) => dragAssetData(event, asset)}
          >
            <button
              type="button"
              onClick={() => onUseSharedAsset(asset)}
              className={cx(
                "relative flex h-20 w-full cursor-pointer items-center justify-center overflow-hidden rounded-md bg-neutral-100 dark:bg-neutral-800",
                CONTROL_FOCUS_CLASS
              )}
              title={`${asset.name} · ${asset.author.name}`}
              aria-label={`${asset.name} 캔버스에 추가`}
            >
              <img
                src={asset.dataUrl}
                alt=""
                className="max-h-full max-w-full object-contain transition-transform group-hover:scale-105"
              />
              <span className="pointer-events-none absolute bottom-1 right-1 inline-flex items-center gap-0.5 rounded bg-black/70 px-1.5 py-0.5 text-[0.55rem] font-semibold text-white shadow-sm">
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
