import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Grid2x2,
  Images,
  LoaderCircle,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent as ReactClipboardEvent,
  type DragEvent as ReactDragEvent,
} from "react";

import {
  loadImageFileForCanvas,
  STUDIO_CANVAS_IMAGE_ACCEPT,
} from "./canvas/studio-canvas-image-io";
import { CANVAS_W } from "./studio-assets";
import { elBounds } from "./studio-element-geometry";
import {
  computeStudioInsertBatchPlacements,
  formatStudioInsertBatchBytes,
  selectStudioInsertBatchFiles,
  STUDIO_INSERT_BATCH_LAYOUT_LABELS,
  STUDIO_INSERT_BATCH_MAX_ITEMS,
  STUDIO_INSERT_BATCH_SPACING_LABELS,
  STUDIO_INSERT_BATCH_TARGET_LABELS,
  type StudioInsertBatchFileRejection,
  type StudioInsertBatchLayout,
  type StudioInsertBatchPlacement,
  type StudioInsertBatchRect,
  type StudioInsertBatchSpacing,
  type StudioInsertBatchTargetMode,
} from "./studio-insert-batch-model";

import type { StudioToolBeltContentProps } from "./StudioToolBeltContent";

import { cn } from "@/shared/lib/utils";

const REVIEW_LOCKED_MESSAGE =
  "이 페이지는 검토 잠금 상태예요. 잠금을 해제한 뒤 이미지를 삽입해 주세요.";
const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-panel";
const CONTROL = `min-h-11 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg-2 transition-colors hover:bg-raised disabled:cursor-not-allowed disabled:opacity-45 ${FOCUS}`;
const LAYOUT_OPTIONS: readonly StudioInsertBatchLayout[] = [
  "grid",
  "row",
  "column",
  "cascade",
];
const TARGET_OPTIONS: readonly StudioInsertBatchTargetMode[] = [
  "page",
  "selection",
];
const SPACING_OPTIONS: readonly StudioInsertBatchSpacing[] = [
  "compact",
  "comfortable",
  "wide",
];

const PREVIEW_WIDTH = 240;
const PREVIEW_HEIGHT = 160;

interface PreparedImage {
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly isAnimatedGif: boolean;
}

type BatchItem =
  | {
      readonly id: string;
      readonly file: File;
      readonly status: "preparing";
    }
  | {
      readonly id: string;
      readonly file: File;
      readonly status: "ready";
      readonly prepared: PreparedImage;
    }
  | {
      readonly id: string;
      readonly file: File;
      readonly status: "error";
      readonly message: string;
    };

interface BatchNotice {
  readonly tone: "info" | "success" | "error";
  readonly message: string;
}

let fallbackItemSequence = 0;

function createBatchItemId(file: File): string {
  const randomId = globalThis.crypto?.randomUUID?.();
  if (randomId) return randomId;
  fallbackItemSequence += 1;
  return `${file.name}:${file.lastModified}:${fallbackItemSequence}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "이미지를 준비하지 못했습니다.";
}

function resolveSelectionBounds(
  toolBelt: StudioToolBeltContentProps,
): StudioInsertBatchRect | null {
  if (!toolBelt.selected) return null;
  const bounds = elBounds(toolBelt.selected);
  if (
    !Number.isFinite(bounds.x) ||
    !Number.isFinite(bounds.y) ||
    !Number.isFinite(bounds.w) ||
    !Number.isFinite(bounds.h) ||
    bounds.w <= 0 ||
    bounds.h <= 0
  ) {
    return null;
  }
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.w,
    height: bounds.h,
  };
}

function readyItem(
  item: BatchItem,
): item is Extract<BatchItem, { readonly status: "ready" }> {
  return item.status === "ready";
}

function summarizeRejections(
  rejected: readonly StudioInsertBatchFileRejection<File>[],
): string {
  const first = rejected[0];
  if (!first) return "";
  if (rejected.length === 1) {
    return `${first.file.name}: ${first.reason}`;
  }
  return `${first.file.name}: ${first.reason} 외 ${rejected.length - 1}개 파일을 제외했습니다.`;
}

function itemStatusLabel(item: BatchItem): string {
  if (item.status === "preparing") return "안전 검사·미리보기 준비 중";
  if (item.status === "error") return item.message;
  const animation = item.prepared.isAnimatedGif ? " · 애니메이션 GIF" : "";
  return `${item.prepared.width} × ${item.prepared.height}${animation}`;
}

function BatchThumbnail({ item }: { readonly item: BatchItem }) {
  if (item.status === "ready") {
    return (
      <img
        src={item.prepared.src}
        alt=""
        className="size-12 rounded-lg border border-line bg-panel object-contain"
      />
    );
  }
  if (item.status === "error") {
    return (
      <span className="grid size-12 place-items-center rounded-lg border border-danger/30 bg-danger/10 text-danger">
        <AlertTriangle size={19} aria-hidden />
      </span>
    );
  }
  return (
    <span className="grid size-12 place-items-center rounded-lg border border-line bg-panel text-accent">
      <LoaderCircle size={19} className="animate-spin" aria-hidden />
    </span>
  );
}

function BatchLayoutPreview({
  items,
  layout,
  spacing,
  target,
}: {
  readonly items: readonly Extract<BatchItem, { readonly status: "ready" }>[];
  readonly layout: StudioInsertBatchLayout;
  readonly spacing: StudioInsertBatchSpacing;
  readonly target: StudioInsertBatchRect;
}) {
  if (items.length === 0) return null;
  const scale = Math.min(
    PREVIEW_WIDTH / target.width,
    PREVIEW_HEIGHT / target.height,
  );
  if (!Number.isFinite(scale) || scale <= 0) return null;
  const previewTarget = {
    x: (PREVIEW_WIDTH - target.width * scale) / 2,
    y: (PREVIEW_HEIGHT - target.height * scale) / 2,
    width: target.width * scale,
    height: target.height * scale,
  };
  let placements: readonly StudioInsertBatchPlacement[];
  try {
    placements = computeStudioInsertBatchPlacements(
      items.map((item) => ({
        id: item.id,
        width: item.prepared.width * scale,
        height: item.prepared.height * scale,
      })),
      { layout, spacing, target: previewTarget },
    );
  } catch {
    return null;
  }
  const itemById = new Map(items.map((item) => [item.id, item] as const));

  return (
    <div className="mt-3 rounded-xl border border-line bg-panel p-2">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-[0.6875rem] font-bold text-fg-3">배치 미리보기</p>
        <p className="text-[0.6875rem] text-fg-3">
          {STUDIO_INSERT_BATCH_LAYOUT_LABELS[layout]} ·{" "}
          {STUDIO_INSERT_BATCH_SPACING_LABELS[spacing]}
        </p>
      </div>
      <div
        role="img"
        aria-label={`${items.length}개 이미지의 ${STUDIO_INSERT_BATCH_LAYOUT_LABELS[layout]} 배치 미리보기`}
        className="relative mx-auto h-40 w-full max-w-60 overflow-hidden rounded-lg bg-card"
      >
        <span
          aria-hidden
          className="absolute border border-dashed border-line bg-raised/40"
          style={{
            left: `${(previewTarget.x / PREVIEW_WIDTH) * 100}%`,
            top: `${(previewTarget.y / PREVIEW_HEIGHT) * 100}%`,
            width: `${(previewTarget.width / PREVIEW_WIDTH) * 100}%`,
            height: `${(previewTarget.height / PREVIEW_HEIGHT) * 100}%`,
          }}
        />
        {placements.map((placement, index) => {
          const item = itemById.get(placement.id);
          if (!item) return null;
          return (
            <span
              key={placement.id}
              aria-hidden
              className="absolute overflow-hidden rounded border border-accent/70 bg-panel shadow-sm"
              style={{
                left: `${(placement.x / PREVIEW_WIDTH) * 100}%`,
                top: `${(placement.y / PREVIEW_HEIGHT) * 100}%`,
                width: `${(placement.width / PREVIEW_WIDTH) * 100}%`,
                height: `${(placement.height / PREVIEW_HEIGHT) * 100}%`,
                zIndex: index + 1,
              }}
            >
              <img
                src={item.prepared.src}
                alt=""
                className="size-full object-contain"
              />
            </span>
          );
        })}
      </div>
    </div>
  );
}

export interface StudioInsertBatchPreflightProps {
  readonly toolBelt: StudioToolBeltContentProps;
}

export function StudioInsertBatchPreflight({
  toolBelt,
}: StudioInsertBatchPreflightProps) {
  const titleId = useId();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<readonly BatchItem[]>([]);
  const aliveRef = useRef(true);
  const [expanded, setExpanded] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [items, setItems] = useState<readonly BatchItem[]>([]);
  const [layout, setLayout] = useState<StudioInsertBatchLayout>("grid");
  const [targetMode, setTargetMode] =
    useState<StudioInsertBatchTargetMode>("page");
  const [spacing, setSpacing] =
    useState<StudioInsertBatchSpacing>("comfortable");
  const [inserting, setInserting] = useState(false);
  const [notice, setNotice] = useState<BatchNotice | null>(null);

  const selectionBounds = resolveSelectionBounds(toolBelt);
  const readyItems = useMemo(() => items.filter(readyItem), [items]);
  const preparingCount = items.reduce(
    (count, item) => count + Number(item.status === "preparing"),
    0,
  );
  const errorCount = items.reduce(
    (count, item) => count + Number(item.status === "error"),
    0,
  );
  const totalBytes = items.reduce((sum, item) => sum + item.file.size, 0);
  const activeTarget: StudioInsertBatchRect =
    targetMode === "selection" && selectionBounds
      ? selectionBounds
      : {
          x: 0,
          y: 0,
          width: CANVAS_W,
          height: toolBelt.canvasH,
        };
  const canInsert =
    readyItems.length > 0 &&
    preparingCount === 0 &&
    !inserting &&
    !toolBelt.activeSurfaceReviewLocked;

  function commitItems(
    update: (
      current: readonly BatchItem[],
    ) => readonly BatchItem[],
  ): void {
    const next = update(itemsRef.current);
    itemsRef.current = next;
    setItems(next);
  }

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (selectionBounds || targetMode !== "selection") return;
    setTargetMode("page");
  }, [selectionBounds, targetMode]);

  async function prepareAccepted(
    accepted: readonly { readonly id: string; readonly file: File }[],
  ): Promise<void> {
    const queue = [...accepted];
    async function worker(): Promise<void> {
      while (queue.length > 0) {
        const next = queue.shift();
        if (!next) continue;
        try {
          const prepared = await loadImageFileForCanvas(next.file);
          if (!aliveRef.current) return;
          commitItems((current) =>
            current.map((item) =>
              item.id === next.id
                ? {
                    id: item.id,
                    file: item.file,
                    status: "ready",
                    prepared,
                  }
                : item,
            ),
          );
        } catch (error) {
          if (!aliveRef.current) return;
          commitItems((current) =>
            current.map((item) =>
              item.id === next.id
                ? {
                    id: item.id,
                    file: item.file,
                    status: "error",
                    message: errorMessage(error),
                  }
                : item,
            ),
          );
        }
      }
    }

    const workerCount = Math.min(2, queue.length);
    await Promise.all(
      Array.from({ length: workerCount }, async () => worker()),
    );
  }

  function addFiles(incoming: readonly File[]): void {
    if (incoming.length === 0) return;
    const existing = itemsRef.current.map((item) => item.file);
    const selection = selectStudioInsertBatchFiles(existing, incoming);
    const staged = selection.accepted.map((file) => ({
      id: createBatchItemId(file),
      file,
    }));

    if (staged.length > 0) {
      commitItems((current) => [
        ...current,
        ...staged.map(
          ({ id, file }): BatchItem => ({
            id,
            file,
            status: "preparing",
          }),
        ),
      ]);
      setExpanded(true);
      setNotice({
        tone: "info",
        message: `${staged.length}개 이미지를 안전하게 준비하고 있습니다.`,
      });
      void prepareAccepted(staged).then(() => {
        if (!aliveRef.current) return;
        const stagedIds = new Set(staged.map((item) => item.id));
        const prepared = itemsRef.current.filter((item) =>
          stagedIds.has(item.id),
        );
        const readyCount = prepared.reduce(
          (count, item) => count + Number(item.status === "ready"),
          0,
        );
        const failedCount = prepared.length - readyCount;
        setNotice((current) => {
          if (current?.tone === "error") return current;
          if (failedCount > 0) {
            return {
              tone: "error",
              message: `${readyCount}개 준비 완료 · ${failedCount}개 파일은 목록에서 오류를 확인해 주세요.`,
            };
          }
          return {
            tone: "success",
            message: `${readyCount}개 파일의 준비를 마쳤습니다.`,
          };
        });
      });
    }

    if (selection.rejected.length > 0) {
      setNotice({
        tone: "error",
        message: summarizeRejections(selection.rejected),
      });
    }
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>): void {
    addFiles(Array.from(event.currentTarget.files ?? []));
    event.currentTarget.value = "";
  }

  function handlePaste(event: ReactClipboardEvent<HTMLElement>): void {
    const pasted = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);
    if (pasted.length === 0) return;
    event.preventDefault();
    addFiles(pasted);
  }

  function handleDragOver(event: ReactDragEvent<HTMLElement>): void {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDragActive(true);
  }

  function handleDrop(event: ReactDragEvent<HTMLElement>): void {
    const dropped = Array.from(event.dataTransfer.files);
    if (dropped.length === 0) return;
    event.preventDefault();
    setDragActive(false);
    addFiles(dropped);
  }

  function removeItem(id: string): void {
    commitItems((current) => current.filter((item) => item.id !== id));
    setNotice(null);
  }

  function clearItems(): void {
    commitItems(() => []);
    setNotice(null);
  }

  function moveItem(id: string, offset: -1 | 1): void {
    commitItems((current) => {
      const index = current.findIndex((item) => item.id === id);
      const nextIndex = index + offset;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }
      const reordered = [...current];
      const moved = reordered[index];
      if (!moved) return current;
      reordered.splice(index, 1);
      reordered.splice(nextIndex, 0, moved);
      return reordered;
    });
  }

  async function retryErrors(): Promise<void> {
    const retryItems = itemsRef.current
      .filter(
        (
          item,
        ): item is Extract<BatchItem, { readonly status: "error" }> =>
          item.status === "error",
      )
      .map((item) => ({ id: item.id, file: item.file }));
    if (retryItems.length === 0) return;
    commitItems((current) =>
      current.map((item) =>
        item.status === "error"
          ? { id: item.id, file: item.file, status: "preparing" }
          : item,
      ),
    );
    setNotice({
      tone: "info",
      message: `${retryItems.length}개 오류 파일을 다시 준비하고 있습니다.`,
    });
    await prepareAccepted(retryItems);
    if (!aliveRef.current) return;
    const retryIds = new Set(retryItems.map((item) => item.id));
    const failedCount = itemsRef.current.reduce(
      (count, item) =>
        count +
        Number(retryIds.has(item.id) && item.status === "error"),
      0,
    );
    setNotice(
      failedCount > 0
        ? {
            tone: "error",
            message: `${failedCount}개 파일을 다시 준비하지 못했습니다.`,
          }
        : {
            tone: "success",
            message: `${retryItems.length}개 파일을 다시 준비했습니다.`,
          },
    );
  }

  async function insertReadyItems(): Promise<void> {
    if (!canInsert) {
      if (toolBelt.activeSurfaceReviewLocked) {
        setNotice({ tone: "error", message: REVIEW_LOCKED_MESSAGE });
      }
      return;
    }

    const target = activeTarget;
    let placements: readonly StudioInsertBatchPlacement[];
    try {
      placements = computeStudioInsertBatchPlacements(
        readyItems.map((item) => ({
          id: item.id,
          width: item.prepared.width,
          height: item.prepared.height,
        })),
        { layout, spacing, target },
      );
    } catch (error) {
      setNotice({ tone: "error", message: errorMessage(error) });
      return;
    }

    const placementById = new Map(
      placements.map((placement) => [placement.id, placement] as const),
    );
    const succeeded = new Set<string>();
    const failures: string[] = [];
    setInserting(true);
    setNotice({
      tone: "info",
      message: `${readyItems.length}개 이미지를 캔버스에 삽입하고 있습니다.`,
    });

    try {
      for (const item of readyItems) {
        const placement = placementById.get(item.id);
        if (!placement) {
          failures.push(`${item.file.name}: 배치 위치를 만들지 못했습니다.`);
          continue;
        }
        try {
          const result = await Promise.resolve(
            toolBelt.stableHandlers.addRenderedImage(
              item.prepared.src,
              item.prepared.width,
              item.prepared.height,
              undefined,
              undefined,
              {
                x: placement.x,
                y: placement.y,
                width: placement.width,
                height: placement.height,
              },
            ),
          );
          if (result === false) {
            throw new Error("캔버스가 이미지 삽입을 거절했습니다.");
          }
          succeeded.add(item.id);
        } catch (error) {
          failures.push(`${item.file.name}: ${errorMessage(error)}`);
        }
      }
    } finally {
      setInserting(false);
    }

    if (succeeded.size > 0) {
      commitItems((current) =>
        current.filter((item) => !succeeded.has(item.id)),
      );
    }
    if (failures.length > 0) {
      setNotice({
        tone: "error",
        message: `${succeeded.size}개 삽입, ${failures.length}개 실패 · ${failures[0]}`,
      });
      return;
    }
    setNotice({
      tone: "success",
      message: `${succeeded.size}개 이미지를 ${STUDIO_INSERT_BATCH_LAYOUT_LABELS[layout]}로 삽입했습니다.`,
    });
  }

  return (
    <section
      aria-labelledby={titleId}
      onPasteCapture={handlePaste}
      onDragOver={handleDragOver}
      onDragLeave={() => setDragActive(false)}
      onDrop={handleDrop}
      className={cn(
        "mx-3 mt-3 rounded-xl border bg-card/70 shadow-sm transition-colors",
        dragActive ? "border-accent bg-accent/5" : "border-line",
      )}
    >
      <button
        type="button"
        aria-expanded={expanded}
        className={cn(
          "flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-2 text-left",
          FOCUS,
        )}
        onClick={() => setExpanded((current) => !current)}
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent">
          <Images size={18} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span id={titleId} className="block text-xs font-bold text-fg">
            여러 이미지 한 번에 배치
          </span>
          <span className="block truncate text-[0.6875rem] text-fg-3">
            파일 선택·드롭·붙여넣기 → 미리보기 → 안전하게 삽입
          </span>
        </span>
        {items.length > 0 ? (
          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[0.6875rem] font-bold text-accent">
            {items.length}/{STUDIO_INSERT_BATCH_MAX_ITEMS}
          </span>
        ) : null}
        {expanded ? (
          <ChevronUp size={17} aria-hidden />
        ) : (
          <ChevronDown size={17} aria-hidden />
        )}
      </button>

      {expanded ? (
        <div className="border-t border-line p-3">
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            aria-label="여러 이미지 파일 선택"
            accept={STUDIO_CANVAS_IMAGE_ACCEPT}
            multiple
            className="sr-only"
            onChange={handleInputChange}
          />
          <div
            className={cn(
              "rounded-xl border border-dashed p-3 text-center transition-colors",
              dragActive
                ? "border-accent bg-accent/10"
                : "border-line bg-panel",
            )}
          >
            <Upload className="mx-auto text-accent" size={24} aria-hidden />
            <p className="mt-1 text-xs font-semibold text-fg">
              이미지를 놓거나 클립보드에서 붙여넣으세요
            </p>
            <p className="mt-0.5 text-[0.6875rem] text-fg-3">
              최대 {STUDIO_INSERT_BATCH_MAX_ITEMS}개 · 파일별 해상도·용량·형식 검사
            </p>
            <button
              type="button"
              className={cn(CONTROL, "mt-2")}
              onClick={() => inputRef.current?.click()}
            >
              파일 선택
            </button>
          </div>

          <div className="mt-3 grid gap-3">
            <fieldset>
              <legend className="mb-1 text-[0.6875rem] font-bold text-fg-3">
                배치 대상
              </legend>
              <div className="grid grid-cols-2 gap-1.5">
                {TARGET_OPTIONS.map((option) => {
                  const disabled =
                    option === "selection" && selectionBounds === null;
                  return (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={targetMode === option}
                      disabled={disabled}
                      title={
                        disabled
                          ? "먼저 캔버스에서 배치할 요소나 영역을 선택하세요."
                          : undefined
                      }
                      className={cn(
                        CONTROL,
                        targetMode === option &&
                          "border-accent bg-accent/10 text-accent",
                      )}
                      onClick={() => setTargetMode(option)}
                    >
                      {STUDIO_INSERT_BATCH_TARGET_LABELS[option]}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <fieldset>
              <legend className="mb-1 text-[0.6875rem] font-bold text-fg-3">
                자동 배치
              </legend>
              <div className="grid grid-cols-2 gap-1.5">
                {LAYOUT_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={layout === option}
                    className={cn(
                      CONTROL,
                      layout === option &&
                        "border-accent bg-accent/10 text-accent",
                    )}
                    onClick={() => setLayout(option)}
                  >
                    {option === "grid" ? (
                      <Grid2x2
                        size={14}
                        className="mr-1 inline"
                        aria-hidden
                      />
                    ) : null}
                    {STUDIO_INSERT_BATCH_LAYOUT_LABELS[option]}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="mb-1 text-[0.6875rem] font-bold text-fg-3">
                이미지 간격
              </legend>
              <div className="grid grid-cols-3 gap-1.5">
                {SPACING_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={spacing === option}
                    className={cn(
                      CONTROL,
                      spacing === option &&
                        "border-accent bg-accent/10 text-accent",
                    )}
                    onClick={() => setSpacing(option)}
                  >
                    {STUDIO_INSERT_BATCH_SPACING_LABELS[option]}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>

          <BatchLayoutPreview
            items={readyItems}
            layout={layout}
            spacing={spacing}
            target={activeTarget}
          />

          {items.length > 0 ? (
            <div className="mt-3">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="text-[0.6875rem] font-bold text-fg-3">
                  준비 목록 · {readyItems.length}개 준비 완료
                  {preparingCount > 0 ? ` · ${preparingCount}개 검사 중` : ""}
                  {errorCount > 0 ? ` · ${errorCount}개 오류` : ""}
                </p>
                <span className="text-[0.6875rem] text-fg-3">
                  {formatStudioInsertBatchBytes(totalBytes)}
                </span>
              </div>
              <ul className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                {items.map((item, index) => (
                  <li
                    key={item.id}
                    className="flex min-h-16 items-center gap-2 rounded-xl border border-line bg-panel p-2"
                  >
                    <BatchThumbnail item={item} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-fg">
                        {item.file.name}
                      </span>
                      <span
                        className={cn(
                          "block truncate text-[0.6875rem]",
                          item.status === "error"
                            ? "text-danger"
                            : "text-fg-3",
                        )}
                      >
                        {itemStatusLabel(item)}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center">
                      <button
                        type="button"
                        aria-label={`${item.file.name} 위로 이동`}
                        disabled={index === 0 || inserting}
                        className={cn(
                          "grid size-11 place-items-center rounded-lg text-fg-3 hover:bg-raised hover:text-fg disabled:opacity-30",
                          FOCUS,
                        )}
                        onClick={() => moveItem(item.id, -1)}
                      >
                        <ArrowUp size={15} aria-hidden />
                      </button>
                      <button
                        type="button"
                        aria-label={`${item.file.name} 아래로 이동`}
                        disabled={index === items.length - 1 || inserting}
                        className={cn(
                          "grid size-11 place-items-center rounded-lg text-fg-3 hover:bg-raised hover:text-fg disabled:opacity-30",
                          FOCUS,
                        )}
                        onClick={() => moveItem(item.id, 1)}
                      >
                        <ArrowDown size={15} aria-hidden />
                      </button>
                      <button
                        type="button"
                        aria-label={`${item.file.name} 준비 목록에서 제거`}
                        disabled={inserting}
                        className={cn(
                          "grid size-11 place-items-center rounded-lg text-fg-3 hover:bg-raised hover:text-fg disabled:opacity-30",
                          FOCUS,
                        )}
                        onClick={() => removeItem(item.id)}
                      >
                        <X size={17} aria-hidden />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {toolBelt.activeSurfaceReviewLocked ? (
            <p className="mt-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
              {REVIEW_LOCKED_MESSAGE}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={cn(CONTROL, "inline-flex items-center gap-1.5")}
              disabled={items.length === 0 || inserting}
              onClick={clearItems}
            >
              <Trash2 size={15} aria-hidden />
              목록 비우기
            </button>
            {errorCount > 0 ? (
              <button
                type="button"
                className={cn(CONTROL, "inline-flex items-center gap-1.5")}
                disabled={inserting || preparingCount > 0}
                onClick={() => void retryErrors()}
              >
                <RefreshCw size={15} aria-hidden />
                오류 다시 시도
              </button>
            ) : null}
            <button
              type="button"
              className={cn(
                CONTROL,
                "ml-auto inline-flex items-center gap-1.5 border-accent bg-accent px-4 text-accent-fg hover:bg-accent/90",
              )}
              disabled={!canInsert}
              onClick={() => void insertReadyItems()}
            >
              {inserting ? (
                <LoaderCircle size={15} className="animate-spin" aria-hidden />
              ) : (
                <CheckCircle2 size={15} aria-hidden />
              )}
              준비된 이미지 {readyItems.length}개 삽입
            </button>
          </div>

          <div
            role={notice?.tone === "error" ? "alert" : "status"}
            aria-live="polite"
            className={cn(
              "mt-2 min-h-5 text-[0.6875rem]",
              notice?.tone === "error" && "text-danger",
              notice?.tone === "success" && "text-success",
              (!notice || notice.tone === "info") && "text-fg-3",
            )}
          >
            {notice?.message ?? "파일은 확정 전까지 캔버스와 문서 기록을 변경하지 않습니다."}
          </div>
        </div>
      ) : null}
    </section>
  );
}
