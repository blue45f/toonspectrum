/**
 * Saved layer-view panel.
 *
 * Keeps the persisted Layer Comp schema for project compatibility while presenting
 * the feature as a ToonStudio-native "saved view" workflow.
 */

import {
  Bookmark,
  Check,
  Download,
  Eye,
  FolderSync,
  Layers,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  captureLayerComp,
  planLayerCompsBatchExport,
  STUDIO_LAYER_COMPS_MAX_COUNT,
  updateLayerCompWithCurrentLayers,
  type StudioLayerComp,
  type StudioLayerCompGroupLike,
  type StudioLayerLikeItem,
} from "./studio-layer-comps";

import {
  STUDIO_EASE,
  STUDIO_FOCUS_RING,
  StudioContextPill,
  StudioEmptyState,
  StudioSectionHeader,
} from "../studio-panel-ui";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

export interface StudioLayerCompsPanelProps<T extends StudioLayerLikeItem = StudioLayerLikeItem> {
  readonly layers: readonly T[];
  readonly groups?: readonly StudioLayerCompGroupLike[];
  readonly comps?: readonly StudioLayerComp[];
  readonly activeCompId?: string | null;
  readonly onApplyComp: (comp: StudioLayerComp) => void | Promise<boolean>;
  readonly onCompsChange?: (
    nextComps: readonly StudioLayerComp[],
    expectedComps?: readonly StudioLayerComp[],
  ) => void | boolean | Promise<boolean>;
  /** The editor captures from its flushed document; standalone consumers may use `layers`. */
  readonly onCaptureComp?: (name: string, compId?: string) => boolean | Promise<boolean>;
  readonly onBatchExportPlan?: (
    plan: ReturnType<typeof planLayerCompsBatchExport>,
  ) => void;
  readonly className?: string;
  readonly disabled?: boolean;
}

export function StudioLayerCompsPanel<T extends StudioLayerLikeItem = StudioLayerLikeItem>({
  layers,
  groups,
  comps,
  activeCompId = null,
  onApplyComp,
  onCompsChange,
  onCaptureComp,
  onBatchExportPlan,
  className,
  disabled = false,
}: StudioLayerCompsPanelProps<T>) {
  const [internalComps, setInternalComps] = useState<readonly StudioLayerComp[]>([]);
  const effectiveComps = comps ?? internalComps;

  const updateComps = (next: readonly StudioLayerComp[]) => {
    if (onCompsChange) {
      return onCompsChange(next, effectiveComps);
    }
    setInternalComps(next);
    return true;
  };

  const [newCompName, setNewCompName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [editingCompId, setEditingCompId] = useState<string | null>(null);
  const [editNameText, setEditNameText] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const operationRef = useRef<object | null>(null);
  useEffect(() => () => { operationRef.current = null; }, []);

  const runAction = (
    action: () => void | boolean | Promise<boolean>,
    errorMessage: string,
    onSuccess?: () => void,
  ) => {
    if (disabled || operationRef.current) return;
    const operation = {};
    operationRef.current = operation;
    setBusy(true);
    setActionError(null);
    const finish = (success: boolean) => {
      if (operationRef.current !== operation) return;
      if (success) onSuccess?.();
      operationRef.current = null;
      setBusy(false);
    };
    const fail = () => {
      if (operationRef.current !== operation) return;
      setActionError(errorMessage);
      finish(false);
    };
    try {
      const result = action();
      if (typeof result === "boolean" || result === undefined) finish(result !== false);
      else void result.then((success) => finish(success !== false), fail);
    } catch {
      fail();
    }
  };

  const handleApplyComp = (comp: StudioLayerComp) => {
    runAction(() => onApplyComp(comp), "저장한 보기를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.");
  };

  const handleCreateComp = () => {
    if (disabled || effectiveComps.length >= STUDIO_LAYER_COMPS_MAX_COUNT) return;
    const trimmed = newCompName.trim();
    const defaultName = `보기 ${effectiveComps.length + 1}`;
    const nameToUse = trimmed || defaultName;
    runAction(
      () => onCaptureComp
        ? onCaptureComp(nameToUse)
        : updateComps([...effectiveComps, captureLayerComp(nameToUse, layers, undefined, Date.now(), groups)]),
      "레이어 보기를 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.",
      () => { setNewCompName(""); setIsCreating(false); },
    );
  };

  const handleUpdateComp = (compId: string) => {
    const target = effectiveComps.find((c) => c.id === compId);
    if (!target) return;
    runAction(
      () => onCaptureComp
        ? onCaptureComp(target.name, target.id)
        : updateComps(effectiveComps.map((c) => c.id === compId
          ? updateLayerCompWithCurrentLayers(target, layers, groups) : c)),
      "저장한 보기를 현재 상태로 바꾸지 못했어요. 잠시 뒤 다시 시도해 주세요.",
    );
  };

  const handleDeleteComp = (compId: string) => {
    runAction(
      () => updateComps(effectiveComps.filter((c) => c.id !== compId)),
      "저장한 보기를 삭제하지 못했어요. 잠시 뒤 다시 시도해 주세요.",
      () => { if (editingCompId === compId) setEditingCompId(null); },
    );
  };

  const handleSaveRename = () => {
    if (!editingCompId) return;
    const trimmed = editNameText.trim();
    runAction(
      () => trimmed ? updateComps(
        effectiveComps.map((c) =>
          c.id === editingCompId ? { ...c, name: trimmed } : c,
        ),
      ) : true,
      "보기 이름을 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.",
      () => setEditingCompId(null),
    );
  };

  const handleBatchExport = () => {
    if (disabled || operationRef.current || effectiveComps.length === 0 || !onBatchExportPlan) return;
    const plan = planLayerCompsBatchExport(effectiveComps, "webtoon_cut", "png");
    onBatchExportPlan(plan);
  };

return (
    <fieldset
      disabled={disabled || busy}
      aria-busy={busy}
      aria-label="레이어 보기"
      className={cn(
        "flex min-w-0 shrink-0 flex-col gap-3 rounded-xl border border-line bg-card p-3 text-xs text-fg shadow-sm",
        className,
      )}
      data-testid="studio-layer-comps-panel"
    >
      <StudioSectionHeader
        title={
          <span className="flex items-center gap-1.5">
            <Bookmark size={15} className="text-accent" aria-hidden />
            <span>레이어 보기</span>
          </span>
        }
        description={
          <>
            레이어 표시·불투명도·합성 상태를 저장해 필요한 버전을 한 번에 다시 불러옵니다.
            {onBatchExportPlan ? " 저장한 보기는 한꺼번에 내보낼 수도 있어요." : null}
          </>
        }
        action={
          <button
            type="button"
            onClick={() => {
              if (!disabled && !operationRef.current) setIsCreating(!isCreating);
            }}
            disabled={effectiveComps.length >= STUDIO_LAYER_COMPS_MAX_COUNT}
            className={buttonClass({
              size: "sm",
              variant: "outline",
              className: cn(
                "h-7 gap-1 px-2 text-[11px] text-fg-2 hover:border-accent/40 hover:bg-raised hover:text-fg",
                STUDIO_EASE,
                STUDIO_FOCUS_RING,
              ),
            })}
            title={
              effectiveComps.length >= STUDIO_LAYER_COMPS_MAX_COUNT
                ? "페이지마다 레이어 보기를 64개까지 저장할 수 있습니다"
                : "현재 레이어 상태를 보기로 저장"
            }
          >
            <Plus size={13} aria-hidden />
            <span>현재 보기 저장</span>
          </button>
        }
      />

      {actionError ? (
        <p
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger/10 px-2.5 py-2 text-[0.7rem] leading-relaxed text-danger"
        >
          {actionError}
        </p>
      ) : null}

      {isCreating ? (
        <div className="flex items-center gap-1.5 rounded-xl border border-accent/35 bg-accent-soft/25 p-2">
          <input
            type="text"
            aria-label="저장할 보기 이름"
            data-studio-escape-scope="true"
            maxLength={160}
            value={newCompName}
            onChange={(e) => setNewCompName(e.target.value)}
            onKeyDown={(e) => {
              if (disabled || operationRef.current) {
                e.preventDefault();
                e.stopPropagation();
                return;
              }
              if (e.key === "Enter") handleCreateComp();
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                setIsCreating(false);
              }
            }}
            placeholder="이름 (예: 대사 없는 클린본)"
            className={cn(
              "min-w-0 flex-1 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs text-fg placeholder:text-fg-3",
              STUDIO_FOCUS_RING,
            )}
          />
          <button
            type="button"
            onClick={handleCreateComp}
            className={buttonClass({
              size: "sm",
              variant: "solid",
              className: cn("h-7 px-2.5 text-[11px]", STUDIO_FOCUS_RING),
            })}
          >
            보기 저장
          </button>
        </div>
      ) : null}

      <div className="flex max-h-60 flex-col gap-1.5 overflow-y-auto pr-0.5">
        {effectiveComps.length === 0 ? (
          <StudioEmptyState
            icon={<Layers size={20} aria-hidden />}
            title="저장한 레이어 보기가 없어요"
            description="선화만 보기, 대사 없는 버전, 조명별 버전처럼 자주 확인하는 상태를 저장해 보세요."
            className="border border-dashed border-line/80 bg-panel/35 py-4"
          />
        ) : (
          effectiveComps.map((comp) => {
            const isActive = comp.id === activeCompId;
            const visibleCount = Object.values(comp.layerStates).filter(
              (state) =>
                state.visible &&
                (state.groupId === undefined || comp.groupStates?.[state.groupId]?.visible !== false),
            ).length;
            const totalCount = Object.keys(comp.layerStates).length;

            return (
              <div
                key={comp.id}
                className={cn(
                  "group flex items-center justify-between gap-2 rounded-xl border p-2 transition-colors",
                  isActive
                    ? "border-accent/45 bg-accent-soft/35"
                    : "border-line/70 bg-panel/45 hover:border-line-strong hover:bg-raised/70",
                )}
              >
                {editingCompId === comp.id ? (
                  <div className="mr-1 flex min-w-0 flex-1 items-center gap-1.5">
                    <input
                      type="text"
                      aria-label={`${comp.name} 이름 수정`}
                      data-studio-escape-scope="true"
                      maxLength={160}
                      value={editNameText}
                      onChange={(e) => setEditNameText(e.target.value)}
                      onKeyDown={(e) => {
                        if (disabled || operationRef.current) {
                          e.preventDefault();
                          e.stopPropagation();
                          return;
                        }
                        if (e.key === "Enter") handleSaveRename();
                        if (e.key === "Escape") {
                          e.preventDefault();
                          e.stopPropagation();
                          setEditingCompId(null);
                        }
                      }}
                      className={cn(
                        "w-full rounded-lg border border-accent/50 bg-card px-2 py-1 text-xs text-fg",
                        STUDIO_FOCUS_RING,
                      )}
                    />
                    <button
                      type="button"
                      onClick={handleSaveRename}
                      aria-label="보기 이름 저장"
                      title="보기 이름 저장"
                      className={cn(
                        "rounded-md p-1.5 text-accent hover:bg-accent-soft",
                        STUDIO_EASE,
                        STUDIO_FOCUS_RING,
                      )}
                    >
                      <Check size={13} aria-hidden />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className={cn(
                      "flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-transparent p-1 text-left text-inherit",
                      STUDIO_EASE,
                      STUDIO_FOCUS_RING,
                    )}
                    onClick={() => handleApplyComp(comp)}
                    title="이 보기 불러오기"
                    aria-current={isActive ? "true" : undefined}
                  >
                    <Eye size={14} className={isActive ? "text-accent" : "text-fg-3"} aria-hidden />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-[12px] font-semibold text-fg">{comp.name}</span>
                        {isActive ? <StudioContextPill tone="accent">사용 중</StudioContextPill> : null}
                      </span>
                      <span className="mt-0.5 text-[10px] text-fg-3">
                        보이는 레이어 {visibleCount} / {totalCount}
                      </span>
                    </span>
                  </button>
                )}

                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => handleUpdateComp(comp.id)}
                    aria-label="현재 레이어 상태로 덮어쓰기"
                    title="현재 레이어 상태로 덮어쓰기"
                    className={cn(
                      "rounded-md p-1.5 text-fg-3 hover:bg-raised hover:text-fg",
                      STUDIO_EASE,
                      STUDIO_FOCUS_RING,
                    )}
                  >
                    <FolderSync size={13} aria-hidden />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (disabled || operationRef.current) return;
                      setEditingCompId(comp.id);
                      setEditNameText(comp.name);
                    }}
                    aria-label="보기 이름 바꾸기"
                    title="보기 이름 바꾸기"
                    className={cn(
                      "rounded-md p-1.5 text-fg-3 hover:bg-raised hover:text-fg",
                      STUDIO_EASE,
                      STUDIO_FOCUS_RING,
                    )}
                  >
                    <Pencil size={12} aria-hidden />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteComp(comp.id)}
                    aria-label="저장한 보기 삭제"
                    title="저장한 보기 삭제"
                    className={cn(
                      "rounded-md p-1.5 text-fg-3 hover:bg-danger/10 hover:text-danger",
                      STUDIO_EASE,
                      STUDIO_FOCUS_RING,
                    )}
                  >
                    <Trash2 size={12} aria-hidden />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {effectiveComps.length > 0 && onBatchExportPlan ? (
        <div className="flex items-center justify-between border-t border-line/60 pt-2">
          <span className="text-[11px] text-fg-3">저장한 보기 {effectiveComps.length}개</span>
          <button
            type="button"
            onClick={handleBatchExport}
            className={buttonClass({
              size: "sm",
              variant: "outline",
              className: cn(
                "h-7 gap-1.5 px-2 text-[11px] text-fg-2 hover:border-accent/40 hover:bg-raised hover:text-fg",
                STUDIO_EASE,
                STUDIO_FOCUS_RING,
              ),
            })}
          >
            <Download size={12} aria-hidden />
            <span>모두 내보내기</span>
          </button>
        </div>
      ) : null}
    </fieldset>
  );
}
