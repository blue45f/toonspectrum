// 브러시 라이브러리 패널 — StudioPage가 소유하는 단일 목록을 데스크톱/모바일과 공유하는
// controlled consumer다. 이름 붙은 브러시 설정을 저장·고정·복제·이름변경·안전 삭제하고,
// 앱 전용 JSON·Photoshop ABR·libmypaint MYB·Krita KPP 를 가져오고, 안전한 앱 전용 JSON으로
// 내보낸다. MYB/KPP 는 그릴 수 있는 범위만 등록하고 나머지는 경고로 노출한다
// (studio-brush-pack-import.ts).
import {
  Check,
  ChevronDown,
  Copy,
  Download,
  LoaderCircle,
  Pencil,
  Pin,
  RefreshCw,
  Rows3,
  Save,
  Share2,
  Trash2,
  Upload,
  Waves,
} from "lucide-react";
import { useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";

import { BRUSH_PRESETS } from "./studio-brush";
import { studioCoreBrushCatalogItemById } from "./studio-brush-catalog-core";
import {
  browserBrushLibraryStorage,
  brushFileName,
  createBrush,
  deleteBrushWithRecord,
  duplicateBrush,
  importBrushFromJson,
  MAX_BRUSHES,
  renameBrushWithResult,
  saveBrushBatchWithResult,
  saveBrushWithResult,
  sortBrushesForLibrary,
  toggleBrushPinnedWithResult,
  updateBrushSnapshotWithResult,
  writeBrushJson,
  type DeletedBrushRecord,
  type StudioBrushSnapshot,
  type StudioSavedBrush,
} from "./studio-brush-library";
import {
  STUDIO_BRUSH_PACK_ACCEPT,
  studioBrushPackFormatOf,
} from "./studio-brush-pack-format";
import { studioBrushPackDescriptorById } from "./studio-brush-pack-index";
import {
  studioBrushPreviewDashArray,
  studioBrushPreviewDotCenters,
  studioBrushPreviewOpacity,
  studioBrushPreviewPathD,
  studioBrushPreviewRibbonD,
  studioBrushPreviewStrokeWidth,
} from "./studio-brush-visual";
import { downloadBlob } from "./studio-export";
import { useStudioInspectorFocusScroll } from "./studio-inspector-focus-effect";
import { STUDIO_STABILIZER_MODES } from "./studio-stroke-stabilizer";

import { cx } from "@/lib/cx";

const MAX_IMPORT_FILE_BYTES = 2 * 1024 * 1024;
const PREVIEW_SWATCH_MIN = 10;
const PREVIEW_SWATCH_MAX = 30;
const SAVED_PREVIEW_WIDTH = 84;
const SAVED_PREVIEW_HEIGHT = 28;

function brushPresetLabel(brushId: string): string {
  return BRUSH_PRESETS.find((preset) => preset.id === brushId)?.name ?? brushId;
}

function savedBrushPresetLabel(brush: StudioSavedBrush): string {
  const sourcePresetName = brush.sourcePresetName?.trim();
  if (sourcePresetName) return sourcePresetName;
  return studioBrushPackDescriptorById(brush.sourcePresetId)?.catalogName
    ?? brushPresetLabel(brush.brushId);
}

function stabilizerModeLabel(mode: StudioSavedBrush["stabilizerMode"]): string {
  return STUDIO_STABILIZER_MODES.find((candidate) => candidate.id === mode)?.label ?? mode;
}

function previewSize(strokeWidth: number): number {
  return Math.round(
    PREVIEW_SWATCH_MIN
      + (Math.min(48, Math.max(1, strokeWidth)) / 48) * (PREVIEW_SWATCH_MAX - PREVIEW_SWATCH_MIN)
  );
}

function SavedBrushStrokePreview({ brush }: { brush: StudioSavedBrush }) {
  const sourceDescriptor = studioBrushPackDescriptorById(brush.sourcePresetId);
  const catalogItem = studioCoreBrushCatalogItemById(
    brush.sourcePresetId ?? brush.brushId
  ) ?? studioCoreBrushCatalogItemById(brush.brushId);
  const style = sourceDescriptor?.previewStyle ?? catalogItem?.previewStyle ?? "solid";
  const weight = Math.min(1, Math.max(0.18, brush.strokeWidth / 36));
  const strokeWidth = studioBrushPreviewStrokeWidth(weight, style);
  const path = studioBrushPreviewPathD(style, SAVED_PREVIEW_WIDTH, SAVED_PREVIEW_HEIGHT);
  const ribbon = studioBrushPreviewRibbonD(
    style,
    SAVED_PREVIEW_WIDTH,
    SAVED_PREVIEW_HEIGHT,
    weight
  );
  const dash = studioBrushPreviewDashArray(style);
  const opacity = studioBrushPreviewOpacity(brush.brushOpacity);
  const dotStyle = style === "dashed" ? "texture" : style;
  const dots = studioBrushPreviewDotCenters(dotStyle, 36, 16).map((dot) => ({
    x: 4 + dot.x * ((SAVED_PREVIEW_WIDTH - 8) / 36),
    y: 3 + dot.y * ((SAVED_PREVIEW_HEIGHT - 6) / 16),
    r: dot.r * Math.min(
      (SAVED_PREVIEW_WIDTH - 8) / 36,
      (SAVED_PREVIEW_HEIGHT - 6) / 16
    ),
  }));
  const diffuse = style === "soft" || style === "glow" || style === "neon";

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${SAVED_PREVIEW_WIDTH} ${SAVED_PREVIEW_HEIGHT}`}
      data-studio-saved-brush-preview={style}
      data-studio-saved-brush-preview-opacity={opacity}
      className="h-9 w-24 shrink-0"
    >
      <rect
        x={0.5}
        y={0.5}
        width={(SAVED_PREVIEW_WIDTH - 1) / 2}
        height={SAVED_PREVIEW_HEIGHT - 1}
        rx={5}
        fill="oklch(0.9 0.008 70)"
      />
      <rect
        x={SAVED_PREVIEW_WIDTH / 2}
        y={0.5}
        width={(SAVED_PREVIEW_WIDTH - 1) / 2}
        height={SAVED_PREVIEW_HEIGHT - 1}
        rx={5}
        fill="oklch(0.19 0.009 68)"
      />
      <rect
        x={0.5}
        y={0.5}
        width={SAVED_PREVIEW_WIDTH - 1}
        height={SAVED_PREVIEW_HEIGHT - 1}
        rx={5}
        fill="none"
        stroke="oklch(0.42 0.013 64 / 0.7)"
      />
      {dots.length > 0 ? (
        <g fill={brush.color} opacity={opacity}>
          {dots.map((dot, index) => (
            <circle key={index} cx={dot.x} cy={dot.y} r={dot.r} />
          ))}
        </g>
      ) : (
        <>
          {diffuse ? (
            <path
              d={path}
              fill="none"
              stroke={brush.color}
              strokeWidth={strokeWidth * 2.1}
              strokeLinecap="round"
              opacity={opacity * 0.18}
            />
          ) : null}
          {ribbon ? (
            <path d={ribbon} fill={brush.color} opacity={opacity} />
          ) : (
            <path
              d={path}
              fill="none"
              stroke={brush.color}
              strokeWidth={strokeWidth}
              strokeLinecap={brush.tipRoundness < 0.35 ? "butt" : "round"}
              strokeLinejoin="round"
              strokeDasharray={dash}
              opacity={opacity}
            />
          )}
        </>
      )}
    </svg>
  );
}

const storageErrorMessage = "브러시를 이 브라우저에 저장하지 못했어요. 저장소 권한이나 여유 공간을 확인해주세요.";
const libraryUnreadableMessage = "저장된 브러시 데이터를 안전하게 읽지 못해 변경을 막았어요. 브라우저 저장 데이터를 백업한 뒤 복구해주세요.";
const capacityMessage = `브러시가 ${MAX_BRUSHES}/${MAX_BRUSHES}개예요. 기존 브러시를 내보낸 뒤 삭제하면 새 브러시를 저장할 수 있어요.`;

export interface StudioBrushLibraryPanelProps {
  currentSnapshot: StudioBrushSnapshot;
  brushes: StudioSavedBrush[];
  activeBrushId?: string | null;
  onBrushesChange: (brushes: StudioSavedBrush[]) => void;
  onApplyBrush: (brush: StudioSavedBrush) => void;
  onBrushDeleted: (deleted: DeletedBrushRecord) => void;
}

export function StudioBrushLibraryPanel({
  currentSnapshot,
  brushes,
  activeBrushId = null,
  onBrushesChange,
  onApplyBrush,
  onBrushDeleted,
}: StudioBrushLibraryPanelProps) {
  const [error, setError] = useState<string | null>(null);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renamingName, setRenamingName] = useState("");
  const [importing, setImporting] = useState(false);
  const [viewMode, setViewMode] = useState<"stroke" | "text">("stroke");
  const saveTriggerRef = useRef<HTMLButtonElement>(null);
  const renameReturnFocusRef = useRef<HTMLButtonElement | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const orderedBrushes = sortBrushesForLibrary(brushes);

  // 그리기 ▸ 내 브러시 메뉴 항목이 인스펙터를 열고 이 목록까지 스크롤한다.
  useStudioInspectorFocusScroll("brush.saved-library", sectionRef);

  function setMutationError(status: "storage-error" | "library-unreadable") {
    setError(status === "library-unreadable" ? libraryUnreadableMessage : storageErrorMessage);
    setDoneMsg(null);
  }

  function handleDelete(id: string) {
    setError(null);
    setDoneMsg(null);
    const result = deleteBrushWithRecord(browserBrushLibraryStorage(), id);
    if (result.status === "storage-error" || result.status === "library-unreadable") {
      setMutationError(result.status);
      return;
    }
    if (!result.deleted) return;
    onBrushesChange(result.brushes);
    onBrushDeleted(result.deleted);
  }

  function handleTogglePinned(id: string) {
    setError(null);
    setDoneMsg(null);
    const result = toggleBrushPinnedWithResult(browserBrushLibraryStorage(), id);
    if (result.status === "storage-error" || result.status === "library-unreadable") {
      setMutationError(result.status);
      return;
    }
    if (result.status === "updated") onBrushesChange(result.brushes);
  }

  function handleOverwrite(brush: StudioSavedBrush) {
    setError(null);
    setDoneMsg(null);
    const result = updateBrushSnapshotWithResult(browserBrushLibraryStorage(), brush.id, currentSnapshot);
    if (result.status === "storage-error" || result.status === "library-unreadable") {
      setMutationError(result.status);
      return;
    }
    if (result.status !== "updated") return;
    onBrushesChange(result.brushes);
    setDoneMsg(`"${brush.name}" 브러시를 지금 설정으로 덮어썼어요.`);
  }

  function handleDuplicate(id: string) {
    setError(null);
    setDoneMsg(null);
    const result = duplicateBrush(browserBrushLibraryStorage(), id);
    if (result.status === "full") {
      setError(capacityMessage);
      return;
    }
    if (result.status === "storage-error" || result.status === "library-unreadable") {
      setMutationError(result.status);
      return;
    }
    if (result.status !== "duplicated" || !result.brush) return;
    onBrushesChange(result.brushes);
    setDoneMsg(`"${result.brush.name}" 브러시를 복제했어요.`);
    setError(null);
    setRenamingId(result.brush.id);
    setRenamingName(result.brush.name);
  }

  function startRename(brush: StudioSavedBrush, trigger: HTMLButtonElement) {
    renameReturnFocusRef.current = trigger;
    setRenamingId(brush.id);
    setRenamingName(brush.name);
  }

  function finishRenameFocus() {
    globalThis.requestAnimationFrame?.(() => {
      if (renameReturnFocusRef.current?.isConnected) {
        renameReturnFocusRef.current.focus({ preventScroll: true });
      }
      renameReturnFocusRef.current = null;
    });
  }

  function commitRename(restoreFocus = false) {
    if (!renamingId) return;
    setError(null);
    setDoneMsg(null);
    const result = renameBrushWithResult(browserBrushLibraryStorage(), renamingId, renamingName);
    if (result.status === "storage-error" || result.status === "library-unreadable") {
      setMutationError(result.status);
    } else if (result.status === "updated") {
      onBrushesChange(result.brushes);
    }
    setRenamingId(null);
    if (restoreFocus) finishRenameFocus();
  }

  function handleRenameKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") commitRename(true);
    else if (event.key === "Escape") {
      setRenamingId(null);
      finishRenameFocus();
    }
  }

  function storeNewBrush(brush: StudioSavedBrush, successMessage: string) {
    const result = saveBrushWithResult(browserBrushLibraryStorage(), brush);
    if (result.status === "full") {
      setError(capacityMessage);
      return false;
    }
    if (result.status === "storage-error" || result.status === "library-unreadable") {
      setMutationError(result.status);
      return false;
    }
    onBrushesChange(result.brushes);
    setError(null);
    setDoneMsg(successMessage);
    return true;
  }

  function handleSaveCurrent() {
    const created = createBrush(newName, currentSnapshot);
    if (!storeNewBrush(created, `"${created.name}" 브러시를 저장했어요.`)) return;
    setNewName("");
    setCreatorOpen(false);
    globalThis.requestAnimationFrame?.(() => saveTriggerRef.current?.focus({ preventScroll: true }));
  }

  /**
   * libmypaint `.myb` and Krita `.kpp` are single presets whose parsers live in
   * the format gateway. Only the fields with a drawable counterpart become
   * brush settings; everything else comes back as `warnings`/`unmapped` and is
   * shown, because a preset that imports "successfully" and then draws nothing
   * like the source is worse than a refusal.
   */
  async function importBrushProgramFile(file: File, format: "myb" | "kpp") {
    setImporting(true);
    try {
      const { importStudioBrushProgramFile } = await import("./studio-brush-pack-import");
      const result = await importStudioBrushProgramFile(file, format);
      const candidate = result.brushes[0];
      if (!candidate) {
        setError("이 파일에서 가져올 수 있는 브러시를 찾지 못했어요.");
        return;
      }
      const created = createBrush(candidate.name, candidate.snapshot);
      const label = format === "myb" ? "libmypaint" : "Krita";
      if (!storeNewBrush(created, `${label} 브러시 "${created.name}"을(를) 가져왔어요.`)) return;
      const notes = [...result.warnings];
      if (result.unmapped.length > 0) {
        const shown = result.unmapped.slice(0, 4).join(", ");
        const rest = result.unmapped.length - Math.min(4, result.unmapped.length);
        notes.push(
          `이 포맷 전용 설정 ${result.unmapped.length}개(${shown}${rest > 0 ? ` 외 ${rest}개` : ""})는 옮기지 못했어요.`,
        );
      }
      if (notes.length > 0) {
        setDoneMsg(`${label} 브러시 "${created.name}"을(를) 가져왔어요. ${notes.join(" ")}`);
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "브러시 프리셋 파일을 가져오지 못했어요.",
      );
    } finally {
      setImporting(false);
    }
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    setDoneMsg(null);
    const format = studioBrushPackFormatOf(file.name, file.type);
    if (format === "myb" || format === "kpp") {
      await importBrushProgramFile(file, format);
      return;
    }
    if (format === "abr") {
      setImporting(true);
      try {
        const { importStudioAbrFile } = await import("./studio-abr-import-client");
        const result = await importStudioAbrFile(file);
        const imported = result.brushes.map((candidate) => createBrush(candidate.name, candidate.snapshot));
        const saved = saveBrushBatchWithResult(browserBrushLibraryStorage(), imported);
        if (saved.status === "storage-error" || saved.status === "library-unreadable") {
          setMutationError(saved.status);
          return;
        }
        if (saved.status === "full") {
          setError(capacityMessage);
          return;
        }
        onBrushesChange(saved.brushes);
        const details = [`ABR에서 브러시 ${saved.savedCount}개를 가져왔어요.`];
        const skipped = result.skippedBrushCount + saved.skippedCount;
        if (skipped > 0) details.push(`${skipped}개는 펜촉 누락 또는 라이브러리 한도로 건너뛰었어요.`);
        if (result.approximatedBrushCount > 0) {
          details.push(`${result.approximatedBrushCount}개의 Photoshop 전용 효과는 가장 가까운 Studio 다이내믹스로 변환했어요.`);
        }
        setDoneMsg(details.join(" "));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "ABR 브러시 팩을 가져오지 못했어요.");
      } finally {
        setImporting(false);
      }
      return;
    }
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      setError("파일이 너무 커요. 2MB 이하 브러시 설정(.json) 파일만 가져올 수 있어요.");
      return;
    }
    setImporting(true);
    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const text = loadEvent.target?.result;
      if (typeof text !== "string") {
        setError("브러시 설정 파일을 읽지 못했어요.");
        setImporting(false);
        return;
      }
      try {
        const fallbackName = file.name.replace(/\.json$/i, "");
        const { brush: imported, adjustedFields } = importBrushFromJson(text, fallbackName);
        const parts = [`"${imported.name}" 브러시를 가져왔어요.`];
        if (adjustedFields.length > 0) {
          parts.push(`일부 값(${adjustedFields.join(", ")})은 안전 범위로 보정했어요.`);
        }
        storeNewBrush(imported, parts.join(" "));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "브러시 설정 파일을 가져오지 못했어요.");
      } finally {
        setImporting(false);
      }
    };
    reader.onerror = () => {
      setError("브러시 설정 파일을 읽지 못했어요.");
      setImporting(false);
    };
    reader.readAsText(file);
  }

  function handleExport(brush: StudioSavedBrush) {
    downloadBlob(
      new Blob([writeBrushJson(brush)], { type: "application/json;charset=utf-8" }),
      brushFileName(brush)
    );
  }

  async function handleShare(brush: StudioSavedBrush) {
    setError(null);
    setDoneMsg(null);
    const file = new File(
      [writeBrushJson(brush)],
      brushFileName(brush),
      { type: "application/json;charset=utf-8" }
    );
    const canShareFile =
      typeof navigator.share === "function"
      && (typeof navigator.canShare !== "function" || navigator.canShare({ files: [file] }));
    if (!canShareFile) {
      downloadBlob(file, file.name);
      setDoneMsg(`공유 시트를 지원하지 않아 "${brush.name}" 파일을 내려받았어요.`);
      return;
    }
    try {
      await navigator.share({
        title: `${brush.name} · ToonSpectrum 브러시`,
        text: "이 브러시 설정을 ToonSpectrum에서 가져올 수 있어요.",
        files: [file],
      });
      setDoneMsg(`"${brush.name}" 브러시를 공유했어요.`);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError("브러시 공유를 열지 못했어요. 내보내기로 파일을 저장해 다시 시도해 주세요.");
    }
  }

  return (
    <section
      ref={sectionRef}
      className="space-y-2 border-t border-line/35 pt-2"
      aria-label="내 브러시"
      data-studio-brush-library-scope="saved"
      data-studio-brush-surface-role="user-library-management"
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[0.68rem] font-semibold text-fg-2">내 브러시 · 사용자 설정</p>
          <p className="text-[0.6rem] tabular-nums text-fg-3">
            저장·가져오기·공유·재적용 · {brushes.length}/{MAX_BRUSHES}
          </p>
        </div>
        <label className="flex min-h-11 shrink-0 cursor-pointer items-center gap-1 rounded-lg border border-line px-2 text-[0.62rem] font-semibold text-fg-2 transition-colors hover:bg-raised focus-within:outline focus-within:outline-2 focus-within:outline-accent lg:min-h-8">
          {importing
            ? <LoaderCircle size={12} className="animate-spin" aria-hidden />
            : <Upload size={12} aria-hidden />}
          {importing ? "변환 중…" : "가져오기"}
          <input
            type="file"
            accept={STUDIO_BRUSH_PACK_ACCEPT}
            aria-label="브러시 설정 · Photoshop ABR · libmypaint MYB · Krita KPP 가져오기"
            className="sr-only"
            disabled={importing}
            onChange={handleImportFile}
          />
        </label>
      </div>

      {error ? <p className="text-[0.64rem] leading-relaxed text-bad" role="alert">{error}</p> : null}
      {doneMsg && !error ? <p className="text-[0.64rem] leading-relaxed text-good" role="status">{doneMsg}</p> : null}

      <button
        ref={saveTriggerRef}
        type="button"
        onClick={() => setCreatorOpen((open) => !open)}
        aria-expanded={creatorOpen}
        className={cx(
          "flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-line text-[0.68rem] font-semibold transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent lg:min-h-9",
          creatorOpen ? "bg-raised text-fg" : "text-fg-2"
        )}
      >
        <Save size={13} aria-hidden /> 현재 브러시 저장
      </button>
      {creatorOpen ? (
        <div className="flex flex-col gap-1.5 rounded-lg border border-line bg-card p-2">
          <input
            type="text"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="브러시 이름"
            aria-label="새 브러시 이름"
            // eslint-disable-next-line jsx-a11y/no-autofocus -- 명시적 저장 동작 뒤 열리는 짧은 이름 입력 단계다.
            autoFocus
            onKeyDown={(event) => {
              if (event.key === "Enter") handleSaveCurrent();
              else if (event.key === "Escape") {
                setCreatorOpen(false);
                globalThis.requestAnimationFrame?.(() => saveTriggerRef.current?.focus({ preventScroll: true }));
              }
            }}
            className="h-11 rounded-lg border border-line bg-panel px-2 text-xs text-fg outline-none focus:border-accent lg:h-8"
          />
          <button type="button" onClick={handleSaveCurrent} className="min-h-11 rounded-lg bg-accent text-[0.68rem] font-semibold text-on-accent hover:bg-accent-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent lg:min-h-8">
            저장
          </button>
        </div>
      ) : null}

      {orderedBrushes.length > 0 ? (
        <div className="flex min-w-0 items-center justify-between gap-2">
          <span className="shrink-0 text-[0.62rem] font-semibold text-fg-3">표시</span>
          <div
            role="group"
            aria-label="내 브러시 표시 방식"
            className="grid min-w-0 flex-1 grid-cols-2 rounded-xl border border-line bg-card p-0.5"
          >
            <button
              type="button"
              title="저장 브러시 획 미리보기"
              aria-label="저장 브러시 획 미리보기"
              aria-pressed={viewMode === "stroke"}
              data-studio-saved-brush-view-option="stroke"
              onClick={() => setViewMode("stroke")}
              className={cx(
                "flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-lg px-2 text-[0.62rem] font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent lg:min-h-8",
                viewMode === "stroke"
                  ? "bg-raised text-fg"
                  : "text-fg-3 hover:bg-raised/70 hover:text-fg"
              )}
            >
              <Waves size={13} strokeWidth={1.8} aria-hidden />
              획
            </button>
            <button
              type="button"
              title="저장 브러시 이름 목록"
              aria-label="저장 브러시 이름 목록"
              aria-pressed={viewMode === "text"}
              data-studio-saved-brush-view-option="text"
              onClick={() => setViewMode("text")}
              className={cx(
                "flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-lg px-2 text-[0.62rem] font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent lg:min-h-8",
                viewMode === "text"
                  ? "bg-raised text-fg"
                  : "text-fg-3 hover:bg-raised/70 hover:text-fg"
              )}
            >
              <Rows3 size={13} strokeWidth={1.8} aria-hidden />
              목록
            </button>
          </div>
        </div>
      ) : null}

      {orderedBrushes.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-[0.64rem] leading-relaxed text-fg-3">
          현재 펜 설정을 저장하면 모바일에서도 바로 꺼내 쓸 수 있어요.
        </p>
      ) : (
        <ul
          data-studio-saved-brush-view={viewMode}
          className={cx(
            "lg:max-h-80 lg:overflow-y-auto lg:pr-1",
            viewMode === "stroke" ? "space-y-1.5" : "space-y-1"
          )}
        >
          {orderedBrushes.map((brush) => (
            <li
              key={brush.id}
              className={cx(
                "rounded-xl border bg-card p-2 transition-colors",
                activeBrushId === brush.id ? "border-accent/70 bg-accent-soft/20" : "border-line"
              )}
            >
              <div className="mb-1.5 flex min-h-8 items-center gap-1">
                {renamingId === brush.id ? (
                  <input
                    type="text"
                    value={renamingName}
                    onChange={(event) => setRenamingName(event.target.value)}
                    aria-label={`${brush.name} 새 이름`}
                    onBlur={() => commitRename(false)}
                    onKeyDown={handleRenameKeyDown}
                    // eslint-disable-next-line jsx-a11y/no-autofocus -- 사용자가 복제/이름 변경을 요청한 직후의 인라인 편집이다.
                    autoFocus
                    className="min-h-11 min-w-0 flex-1 rounded-md border border-accent bg-panel px-2 py-1 text-[0.7rem] text-fg outline-none lg:min-h-8"
                  />
                ) : (
                  <span className="min-w-0 flex-1 truncate text-[0.7rem] font-semibold text-fg" title={brush.name}>
                    {brush.name}
                  </span>
                )}
                {activeBrushId === brush.id ? (
                  <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-accent-soft px-1.5 py-0.5 text-[0.55rem] font-bold text-accent">
                    <Check size={10} strokeWidth={3} aria-hidden /> 사용 중
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => handleTogglePinned(brush.id)}
                  aria-label={`${brush.name} ${brush.pinned ? "고정 해제" : "빠른 선반에 고정"}`}
                  aria-pressed={brush.pinned}
                  title={brush.pinned ? "고정 해제" : "빠른 선반에 고정"}
                  className={cx(
                    "grid size-11 shrink-0 place-items-center rounded-lg transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent lg:size-8",
                    brush.pinned ? "text-accent" : "text-fg-3"
                  )}
                >
                  <Pin size={14} className={brush.pinned ? "fill-current" : undefined} aria-hidden />
                </button>
              </div>

              <button
                type="button"
                onClick={() => onApplyBrush(brush)}
                aria-pressed={activeBrushId === brush.id}
                aria-label={`${brush.name} 브러시 적용, ${savedBrushPresetLabel(brush)}, ${brush.strokeWidth}px, ${Math.round(brush.brushOpacity * 100)}퍼센트`}
                className={cx(
                  "flex w-full items-center gap-2 rounded-lg border border-line/60 bg-panel/50 px-2 text-left transition-colors hover:border-accent hover:bg-accent-soft/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                  viewMode === "stroke" ? "min-h-16" : "min-h-12"
                )}
              >
                {viewMode === "stroke" ? (
                  <SavedBrushStrokePreview brush={brush} />
                ) : (
                  <span
                    className="grid shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-[linear-gradient(135deg,#f8fafc_0_50%,#242936_50%_100%)] p-px"
                    style={{
                      width: previewSize(brush.strokeWidth),
                      height: previewSize(brush.strokeWidth),
                    }}
                    aria-hidden
                  >
                    <span
                      className="block size-full rounded-full"
                      style={{
                        background: brush.color,
                        opacity: brush.brushOpacity,
                      }}
                    />
                  </span>
                )}
                <span className="min-w-0 flex-1 text-[0.62rem] leading-snug text-fg-3">
                  <span className="block truncate text-fg-2">{savedBrushPresetLabel(brush)} · {brush.strokeWidth}px · {Math.round(brush.brushOpacity * 100)}%</span>
                  {viewMode === "stroke" ? (
                    <>
                      <span className="block">{stabilizerModeLabel(brush.stabilizerMode)} {brush.stabilizer} · 후보정 {brush.postCorrection}</span>
                      {brush.brushId === "calligraphy" ? <span className="block">촉 {Math.round(brush.tipAngle)}° · 원형도 {Math.round(brush.tipRoundness * 100)}%</span> : null}
                    </>
                  ) : null}
                </span>
              </button>

              <details className="group mt-1.5 border-t border-line/50 pt-1.5">
                <summary
                  onKeyDown={(event) => {
                    if (event.key !== "Escape") return;
                    event.preventDefault();
                    const details = event.currentTarget.parentElement;
                    if (details instanceof HTMLDetailsElement) details.open = false;
                    event.currentTarget.focus({ preventScroll: true });
                  }}
                  className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-lg px-2 text-[0.62rem] font-semibold text-fg-3 hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent lg:min-h-8 [&::-webkit-details-marker]:hidden"
                >
                  <span>관리 · 덮어쓰기, 복제, 공유</span>
                  <ChevronDown
                    size={13}
                    className="transition-transform group-open:rotate-180"
                    aria-hidden
                  />
                </summary>
                <div className="grid grid-cols-3 gap-1 pt-1 sm:grid-cols-6">
                <button type="button" onClick={() => handleOverwrite(brush)} aria-label={`${brush.name} 브러시를 지금 설정으로 덮어쓰기`} title="지금 설정으로 덮어쓰기 (같은 브러시에 저장)" className="flex min-h-11 items-center justify-center gap-1 rounded-lg text-[0.6rem] font-medium text-fg-3 hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent lg:min-h-8">
                  <RefreshCw size={12} aria-hidden /> 덮어쓰기
                </button>
                <button type="button" onClick={() => handleDuplicate(brush.id)} aria-label={`${brush.name} 복제`} className="flex min-h-11 items-center justify-center gap-1 rounded-lg text-[0.6rem] font-medium text-fg-3 hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent lg:min-h-8">
                  <Copy size={12} aria-hidden /> 복제
                </button>
                <button type="button" onClick={(event) => startRename(brush, event.currentTarget)} aria-label={`${brush.name} 이름 변경`} className="flex min-h-11 items-center justify-center gap-1 rounded-lg text-[0.6rem] font-medium text-fg-3 hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent lg:min-h-8">
                  <Pencil size={12} aria-hidden /> 이름
                </button>
                <button type="button" onClick={() => handleExport(brush)} aria-label={`${brush.name} 내보내기`} className="flex min-h-11 items-center justify-center gap-1 rounded-lg text-[0.6rem] font-medium text-fg-3 hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent lg:min-h-8">
                  <Download size={12} aria-hidden /> 내보내기
                </button>
                <button type="button" onClick={() => void handleShare(brush)} aria-label={`${brush.name} 브러시 공유`} className="flex min-h-11 items-center justify-center gap-1 rounded-lg text-[0.6rem] font-medium text-fg-3 hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent lg:min-h-8">
                  <Share2 size={12} aria-hidden /> 공유
                </button>
                <button type="button" onClick={() => handleDelete(brush.id)} aria-label={`${brush.name} 브러시 삭제`} className="flex min-h-11 items-center justify-center gap-1 rounded-lg text-[0.6rem] font-medium text-fg-3 hover:bg-bad/10 hover:text-bad focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent lg:min-h-8">
                  <Trash2 size={12} aria-hidden /> 삭제
                </button>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
