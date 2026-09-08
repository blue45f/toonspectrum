import {
  FolderOpen,
  Layers,
  LoaderCircle,
  Save,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  PIXEL_SELECTION_SMOOTH_PRESETS,
  canSmoothPixelSelection,
  smoothPixelSelection,
  type PixelSelectionSmoothPresetId,
} from "./studio-selection-refinement";
import {
  STUDIO_SELECTION_SUBJECT_THRESHOLD_DEFAULT,
  STUDIO_SELECTION_SUBJECT_THRESHOLD_RANGE,
} from "./studio-selection-source";
import {
  selectOpaqueFromImageSource,
  selectSubjectFromImageSource,
  studioSelectionSourceErrorMessage,
} from "./studio-selection-source-browser";
import {
  STUDIO_SAVED_SELECTION_MAX_ITEMS,
  readStudioSavedSelectionLibrary,
  removeStudioSavedSelection,
  studioSavedSelectionStorageKey,
  upsertStudioSavedSelection,
  writeStudioSavedSelectionLibrary,
  type StudioSavedSelectionLibrary,
  type StudioSelectionStorage,
} from "./studio-saved-selections";
import {
  SELECTION_OPERATION_MODES,
  isSelectionUsable,
  type PixelSelection,
  type SelectionOperationMode,
} from "./studio-selection-tools";
import { cn } from "@/shared/lib/utils";

export type StudioSelectionWorkbenchCommitIntent =
  | "select-opaque"
  | "select-subject"
  | "smooth"
  | "restore-saved";

export interface StudioSelectionWorkbenchPanelProps {
  readonly selection: PixelSelection | null;
  readonly operation: SelectionOperationMode;
  readonly imageSource: string | null;
  readonly scopeKey: string;
  readonly aspect?: number;
  readonly flipX?: boolean;
  readonly flipY?: boolean;
  readonly busy?: boolean;
  readonly storage?: StudioSelectionStorage | null;
  readonly onCommitSelection: (
    selection: PixelSelection | null,
    intent: StudioSelectionWorkbenchCommitIntent,
  ) => void;
}

type SourceJob = "opaque" | "subject" | null;

function browserStorage(explicit: StudioSelectionStorage | null | undefined): StudioSelectionStorage | null {
  if (explicit !== undefined) return explicit;
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function makeSavedSelectionId(): string {
  try {
    const id = globalThis.crypto?.randomUUID?.();
    if (id) return `selection-${id}`;
  } catch {
    // Fall through to the monotonic-enough local fallback.
  }
  return `selection-${Date.now().toString(36)}`;
}

function operationLabel(operation: SelectionOperationMode): string {
  return SELECTION_OPERATION_MODES.find((candidate) => candidate.id === operation)?.label ?? "새 선택";
}

function selectionDescription(selection: PixelSelection): string {
  if (selection.invert && selection.subpaths.length === 0) return "전체 이미지";
  const count = selection.subpaths.length;
  const feather = Math.round(selection.featherPx);
  return `${count}개 영역 · 페더 ${feather}px${selection.invert ? " · 반전" : ""}`;
}

export function StudioSelectionWorkbenchPanel({
  selection,
  operation,
  imageSource,
  scopeKey,
  aspect,
  flipX,
  flipY,
  busy = false,
  storage,
  onCommitSelection,
}: StudioSelectionWorkbenchPanelProps) {
  const nameInputId = useId();
  const thresholdInputId = useId();
  const resolvedStorage = useMemo(() => browserStorage(storage), [storage]);
  const [library, setLibrary] = useState<StudioSavedSelectionLibrary>(() => (
    readStudioSavedSelectionLibrary(resolvedStorage, scopeKey)
  ));
  const [name, setName] = useState("선택 1");
  const [subjectThreshold, setSubjectThreshold] = useState(
    STUDIO_SELECTION_SUBJECT_THRESHOLD_DEFAULT,
  );
  const [sourceJob, setSourceJob] = useState<SourceJob>(null);
  const [status, setStatus] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setSourceJob(null);
    setLibrary(readStudioSavedSelectionLibrary(resolvedStorage, scopeKey));
  }, [resolvedStorage, scopeKey]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (storage !== undefined || typeof window === "undefined") return undefined;
    const key = studioSavedSelectionStorageKey(scopeKey);
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== key) return;
      setLibrary(readStudioSavedSelectionLibrary(resolvedStorage, scopeKey));
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [resolvedStorage, scopeKey, storage]);

  const selectionReady = isSelectionUsable(selection);
  const sourceDisabled = busy || sourceJob !== null || !imageSource;
  const smoothDisabled = busy || sourceJob !== null || !canSmoothPixelSelection(selection);
  const selectedOperationLabel = operationLabel(operation);

  const runSourceSelection = async (kind: Exclude<SourceJob, null>) => {
    if (!imageSource || sourceDisabled) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setSourceJob(kind);
    setStatus(kind === "subject" ? "기기에서 피사체를 분석하고 있습니다." : "레이어 투명도를 읽고 있습니다.");
    try {
      if (kind === "opaque") {
        const next = await selectOpaqueFromImageSource({
          src: imageSource,
          selection,
          operation,
          aspect,
          flipX,
          flipY,
          signal: controller.signal,
        });
        onCommitSelection(next, "select-opaque");
        setStatus(next ? `레이어 불투명도를 ${selectedOperationLabel}으로 적용했습니다.` : "선택 영역이 비었습니다.");
      } else {
        const result = await selectSubjectFromImageSource({
          src: imageSource,
          selection,
          operation,
          aspect,
          flipX,
          flipY,
          threshold: subjectThreshold,
          signal: controller.signal,
        });
        onCommitSelection(result.selection, "select-subject");
        const transparency = result.sourceTransparencyApplied
          ? "원본 투명도 결합"
          : "보안 정책으로 원본 투명도 결합 생략";
        setStatus(
          result.selection
            ? `AI 피사체 선택 완료 · ${result.receipt.activeDelegate} · ${transparency} · 이미지 업로드 없음`
            : "피사체 선택 결과가 비었습니다.",
        );
      }
    } catch (error) {
      if ((error as { name?: string } | null)?.name !== "AbortError") {
        setStatus(studioSelectionSourceErrorMessage(error));
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setSourceJob((current) => current === kind ? null : current);
    }
  };

  const applySmoothPreset = (presetId: PixelSelectionSmoothPresetId) => {
    if (!selection || smoothDisabled) return;
    const preset = PIXEL_SELECTION_SMOOTH_PRESETS.find((candidate) => candidate.id === presetId);
    if (!preset) return;
    const next = smoothPixelSelection(selection, preset);
    onCommitSelection(next, "smooth");
    setStatus(`선택 경계를 ${preset.label} 다듬었습니다.`);
  };

  const persistLibrary = (next: StudioSavedSelectionLibrary, successMessage: string) => {
    if (!writeStudioSavedSelectionLibrary(resolvedStorage, scopeKey, next)) {
      setStatus("브라우저 저장소를 사용할 수 없어 선택을 저장하지 못했습니다.");
      return false;
    }
    setLibrary(next);
    setStatus(successMessage);
    return true;
  };

  const saveCurrentSelection = () => {
    if (!selection || !selectionReady || busy) return;
    try {
      const next = upsertStudioSavedSelection(library, {
        id: makeSavedSelectionId(),
        name,
        selection,
      });
      if (persistLibrary(next, `“${name.trim()}” 선택을 이 기기에 저장했습니다.`)) {
        setName(`선택 ${Math.min(STUDIO_SAVED_SELECTION_MAX_ITEMS, next.items.length + 1)}`);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "선택을 저장하지 못했습니다.");
    }
  };

  return (
    <section
      className="space-y-3 rounded-xl border border-line bg-card/40 p-3"
      data-studio-selection-workbench="true"
      aria-busy={sourceJob !== null}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="flex items-center gap-1.5 text-xs font-semibold text-fg">
            <Wand2 className="size-3.5" aria-hidden="true" />
            선택 작업대
          </h4>
          <p className="mt-1 text-[0.68rem] leading-relaxed text-fg-3">
            레이어 픽셀과 로컬 AI로 영역을 만들고, 경계를 다듬어 이름으로 다시 불러옵니다.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[0.62rem] font-medium text-accent">
          {selectedOperationLabel}
        </span>
      </div>

      <div className="space-y-2 rounded-lg border border-line/80 bg-bg/35 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[0.68rem] font-semibold text-fg-2">선택 소스</span>
          <span className="text-[0.6rem] text-fg-3">최대 640px 추적 · 원본 비파괴</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className={cn(
              "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-2 text-[0.68rem] font-medium text-fg-2 transition hover:border-accent/50 hover:text-fg",
              "disabled:cursor-not-allowed disabled:opacity-45 pointer-coarse:min-h-11",
            )}
            disabled={sourceDisabled}
            onClick={() => void runSourceSelection("opaque")}
            aria-label="레이어 불투명도로 픽셀 선택"
          >
            {sourceJob === "opaque"
              ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
              : <Layers className="size-3.5" aria-hidden="true" />}
            불투명도
          </button>
          <button
            type="button"
            className={cn(
              "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-accent/35 bg-accent/10 px-2 text-[0.68rem] font-semibold text-fg transition hover:bg-accent/15",
              "disabled:cursor-not-allowed disabled:opacity-45 pointer-coarse:min-h-11",
            )}
            disabled={sourceDisabled}
            onClick={() => void runSourceSelection("subject")}
            aria-label="로컬 AI로 주요 피사체 선택"
          >
            {sourceJob === "subject"
              ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
              : <Sparkles className="size-3.5" aria-hidden="true" />}
            AI 피사체
          </button>
        </div>
        <label htmlFor={thresholdInputId} className="grid grid-cols-[1fr_auto] items-center gap-x-2 text-[0.65rem] text-fg-3">
          <span>피사체 경계 기준</span>
          <output htmlFor={thresholdInputId} className="tabular-nums text-fg-2">
            {Math.round(subjectThreshold * 100)}%
          </output>
          <input
            id={thresholdInputId}
            className="col-span-2 mt-1 w-full accent-accent disabled:opacity-45"
            type="range"
            min={STUDIO_SELECTION_SUBJECT_THRESHOLD_RANGE.min}
            max={STUDIO_SELECTION_SUBJECT_THRESHOLD_RANGE.max}
            step={STUDIO_SELECTION_SUBJECT_THRESHOLD_RANGE.step}
            value={subjectThreshold}
            disabled={busy || sourceJob !== null || !imageSource}
            onChange={(event) => setSubjectThreshold(Number(event.currentTarget.value))}
          />
        </label>
        {!imageSource ? (
          <p className="text-[0.62rem] leading-relaxed text-warning">
            검증된 이미지 픽셀을 준비한 뒤 선택 소스를 사용할 수 있습니다.
          </p>
        ) : null}
      </div>

      <div className="space-y-2 rounded-lg border border-line/80 bg-bg/35 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[0.68rem] font-semibold text-fg-2">경계 스무딩</span>
          <span className="text-[0.6rem] text-fg-3">면적·중심 보존</span>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {PIXEL_SELECTION_SMOOTH_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="min-h-8 rounded-md border border-line bg-card px-1.5 text-[0.65rem] font-medium text-fg-2 transition hover:border-accent/50 hover:text-fg disabled:cursor-not-allowed disabled:opacity-45 pointer-coarse:min-h-11"
              disabled={smoothDisabled}
              onClick={() => applySmoothPreset(preset.id)}
              aria-label={`선택 경계 ${preset.label} 스무딩`}
            >
              {preset.label}
            </button>
          ))}
        </div>
        {!canSmoothPixelSelection(selection) ? (
          <p className="text-[0.62rem] leading-relaxed text-fg-3">
            자유형 또는 점이 충분한 선택 경계에서 사용할 수 있습니다.
          </p>
        ) : null}
      </div>

      <div className="space-y-2 rounded-lg border border-line/80 bg-bg/35 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[0.68rem] font-semibold text-fg-2">저장된 선택</span>
          <span className="text-[0.6rem] text-fg-3">이 이미지 · 이 기기 · {library.items.length}/{STUDIO_SAVED_SELECTION_MAX_ITEMS}</span>
        </div>
        <div className="flex gap-1.5">
          <label htmlFor={nameInputId} className="sr-only">저장할 선택 이름</label>
          <input
            id={nameInputId}
            className="min-w-0 flex-1 rounded-md border border-line bg-bg px-2 py-1.5 text-[0.68rem] text-fg outline-none placeholder:text-fg-3 focus:border-accent"
            value={name}
            maxLength={48}
            disabled={busy}
            onChange={(event) => setName(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                saveCurrentSelection();
              }
            }}
            placeholder="선택 이름"
          />
          <button
            type="button"
            className="inline-flex min-h-8 items-center gap-1 rounded-md border border-accent/35 bg-accent/10 px-2 text-[0.65rem] font-semibold text-fg transition hover:bg-accent/15 disabled:cursor-not-allowed disabled:opacity-45 pointer-coarse:min-h-11"
            disabled={busy || !selectionReady || name.trim().length === 0}
            onClick={saveCurrentSelection}
            aria-label="현재 픽셀 선택 저장"
          >
            <Save className="size-3.5" aria-hidden="true" />
            저장
          </button>
        </div>
        {library.items.length > 0 ? (
          <ul className="max-h-40 space-y-1 overflow-y-auto pr-0.5" aria-label="저장된 픽셀 선택 목록">
            {library.items.map((item) => (
              <li key={item.id} className="flex items-center gap-1.5 rounded-md border border-line/70 bg-card/60 p-1.5">
                <button
                  type="button"
                  className="min-w-0 flex-1 rounded px-1 py-0.5 text-left transition hover:bg-accent/10 disabled:opacity-45"
                  disabled={busy || sourceJob !== null}
                  onClick={() => {
                    onCommitSelection(item.selection, "restore-saved");
                    setStatus(`“${item.name}” 선택을 불러왔습니다.`);
                  }}
                  aria-label={`${item.name} 선택 불러오기`}
                >
                  <span className="flex items-center gap-1.5 text-[0.67rem] font-medium text-fg-2">
                    <FolderOpen className="size-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">{item.name}</span>
                  </span>
                  <span className="mt-0.5 block truncate pl-5 text-[0.58rem] text-fg-3">
                    {selectionDescription(item.selection)}
                  </span>
                </button>
                <button
                  type="button"
                  className="grid size-8 shrink-0 place-items-center rounded text-fg-3 transition hover:bg-danger/10 hover:text-danger disabled:opacity-45 pointer-coarse:size-11"
                  disabled={busy || sourceJob !== null}
                  onClick={() => {
                    const next = removeStudioSavedSelection(library, item.id);
                    persistLibrary(next, `“${item.name}” 저장 선택을 삭제했습니다.`);
                  }}
                  aria-label={`${item.name} 저장 선택 삭제`}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[0.62rem] leading-relaxed text-fg-3">
            자주 다시 쓰는 선택 경계를 이름으로 저장해 두세요. 프로젝트 데이터에는 포함되지 않습니다.
          </p>
        )}
      </div>

      <p
        className={cn(
          "min-h-4 text-[0.62rem] leading-relaxed",
          status.includes("못") || status.includes("없") ? "text-warning" : "text-fg-3",
        )}
        role="status"
        aria-live="polite"
      >
        {status}
      </p>
    </section>
  );
}
