import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  FlipHorizontal2,
  FlipVertical2,
  Image as ImageIcon,
  ImagePlus,
  Images,
  Loader2,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  canonicalizeStudioAssetContentHash,
  ensureStudioAssetContentHash,
  listAssets,
  type StudioAsset,
} from "./studio-asset-library";
import {
  addStudioReferenceBoardItem,
  createStudioReferenceBoardItem,
  removeStudioReferenceBoardItem,
  reorderStudioReferenceBoardItem,
  STUDIO_REFERENCE_BOARD_MAX_ITEMS,
  updateStudioReferenceBoardItem,
  type StudioReferenceBoardDocument,
  type StudioReferenceBoardItem,
  type StudioReferenceBoardItemView,
} from "./studio-reference-board";
import {
  clampReferencePanelRect,
  defaultReferencePanelSettings,
  deserializeReferencePanelSettings,
  dragReferencePanelRect,
  filterReferenceAssetsByName,
  REFERENCE_PANEL_STORAGE_KEY,
  resetReferencePanelSize,
  resizeReferencePanelRect,
  resolvePinnedAsset,
  serializeReferencePanelSettings,
  type ReferencePanelSettings,
} from "./studio-reference-panel";

import type { KeyboardEvent, PointerEvent as ReactPointerEvent, ReactElement } from "react";

export interface StudioReferencePanelProps {
  open: boolean;
  onClose: () => void;
  /** Project-owned reference content and back-to-front z-order authority. */
  document: StudioReferenceBoardDocument;
  /** One durable project commit. Preview-only pointer/range updates never call this callback. */
  onChange: (next: StudioReferenceBoardDocument) => boolean | void;
}

type DragKind = "move" | "resize";
type PanelDragSession = {
  kind: DragKind;
  startRect: { x: number; y: number; width: number; height: number };
  startPointer: { x: number; y: number };
};
type ItemDragSession = {
  itemId: string;
  pointerId: number;
  startPointer: { x: number; y: number };
  startView: StudioReferenceBoardItemView;
  boardRect: DOMRect;
};
type LibraryStatus = "idle" | "loading" | "ready" | "error";

const CONTROL_BUTTON =
  "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45";
const ICON_BUTTON =
  "inline-grid size-9 shrink-0 place-items-center rounded-lg border border-line bg-card text-fg-3 transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40";

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

function readViewport(): { w: number; h: number } {
  return { w: window.innerWidth, h: window.innerHeight };
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function createReferenceItemId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `reference-${Date.now()}-${Math.random().toString(36).slice(2)}`; // NOSONAR S2245 — document identity, not a security token.
}

function assetMimeType(asset: StudioAsset): string | undefined {
  const match = /^data:([^;,]+)/iu.exec(asset.dataUrl);
  const mimeType = match?.[1]?.trim().toLowerCase();
  return mimeType?.startsWith("image/") ? mimeType : undefined;
}

function buildReferenceItem(asset: StudioAsset, itemCount: number, flipX = false): StudioReferenceBoardItem | null {
  const contentHash = canonicalizeStudioAssetContentHash(asset.contentHash);
  if (!contentHash) return null;
  const offsetColumn = itemCount % 5;
  const offsetRow = Math.floor(itemCount / 5) % 3;
  return createStudioReferenceBoardItem({
    id: createReferenceItemId(),
    asset: {
      sha256: contentHash,
      assetId: asset.id,
      name: asset.name,
      ...(assetMimeType(asset) ? { mimeType: assetMimeType(asset) } : {}),
      width: asset.width,
      height: asset.height,
    },
    view: {
      centerX: clampUnit(0.4 + offsetColumn * 0.05),
      centerY: clampUnit(0.4 + offsetRow * 0.08),
      zoom: 1,
      rotationDeg: 0,
      flipX,
      flipY: false,
      opacity: 1,
      grayscale: false,
    },
  });
}

/** SHA-256 is authoritative; assetId is only a device-local legacy lookup hint. */
function resolveReferenceAsset(item: StudioReferenceBoardItem, assets: readonly StudioAsset[]): StudioAsset | null {
  const byHash = assets.find(
    (asset) => canonicalizeStudioAssetContentHash(asset.contentHash) === item.asset.sha256
  );
  if (byHash) return byHash;
  if (!item.asset.assetId) return null;
  return assets.find((asset) => asset.id === item.asset.assetId) ?? null;
}

function referenceItemLabel(item: StudioReferenceBoardItem, asset: StudioAsset | null): string {
  return asset?.name ?? item.asset.name ?? "해석할 수 없는 참고 이미지";
}

function ReferenceRangeControl({
  label,
  ariaLabel,
  value,
  min,
  max,
  step,
  format,
  onPreview,
  onCommit,
  onCancel,
}: {
  label: string;
  ariaLabel: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onPreview: (value: number) => void;
  onCommit: (value: number) => void;
  onCancel: () => void;
}): ReactElement {
  const [draft, setDraft] = useState(value);
  const draftRef = useRef(value);
  const editingRef = useRef(false);
  const startValueRef = useRef(value);

  useEffect(() => {
    if (editingRef.current) return;
    draftRef.current = value;
    setDraft(value);
  }, [value]);

  function beginEditing(): void {
    if (editingRef.current) return;
    editingRef.current = true;
    startValueRef.current = value;
  }

  function preview(next: number): void {
    beginEditing();
    draftRef.current = next;
    setDraft(next);
    onPreview(next);
  }

  function finish(): void {
    if (!editingRef.current) return;
    editingRef.current = false;
    const next = draftRef.current;
    if (next !== startValueRef.current) onCommit(next);
    else onCancel();
  }

  function rollback(): void {
    if (!editingRef.current) return;
    editingRef.current = false;
    const startValue = startValueRef.current;
    draftRef.current = startValue;
    setDraft(startValue);
    onCancel();
  }

  return (
    <label className="grid grid-cols-[3.25rem_minmax(4rem,1fr)_3rem] items-center gap-1.5 text-[0.65rem] text-fg-3">
      <span>{label}</span>
      <input
        type="range"
        aria-label={ariaLabel}
        min={min}
        max={max}
        step={step}
        value={draft}
        className="h-5 min-w-0 accent-accent"
        onPointerDown={beginEditing}
        onChange={(event) => preview(Number(event.target.value))}
        onPointerUp={finish}
        onPointerCancel={rollback}
        onLostPointerCapture={rollback}
        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          rollback();
        }}
        onKeyUp={finish}
        onBlur={finish}
      />
      <output className="text-right font-medium tabular-nums text-fg-2">{format(draft)}</output>
    </label>
  );
}

export function StudioReferencePanel({
  open,
  onClose,
  document,
  onChange,
}: StudioReferencePanelProps): ReactElement | null {
  const [settings, setSettings] = useState<ReferencePanelSettings>(() => {
    if (typeof window === "undefined") return defaultReferencePanelSettings(1280, 800);
    const { w, h } = readViewport();
    let raw: string | null;
    try {
      raw = window.localStorage.getItem(REFERENCE_PANEL_STORAGE_KEY);
    } catch {
      raw = null;
    }
    return deserializeReferencePanelSettings(raw, w, h);
  });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [assets, setAssets] = useState<StudioAsset[]>([]);
  const [libraryStatus, setLibraryStatus] = useState<LibraryStatus>("idle");
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [addingAssetId, setAddingAssetId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<DragKind | null>(null);
  const [dragPreview, setDragPreview] = useState<{ itemId: string; view: StudioReferenceBoardItemView } | null>(null);
  const [transformPreview, setTransformPreview] = useState<{ itemId: string; view: StudioReferenceBoardItemView } | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const panelDragSessionRef = useRef<PanelDragSession | null>(null);
  const panelDragListenersRef = useRef<{ onMove: (event: PointerEvent) => void; onEnd: () => void } | null>(null);
  const itemDragSessionRef = useRef<ItemDragSession | null>(null);
  const dragPreviewRef = useRef<{ itemId: string; view: StudioReferenceBoardItemView } | null>(null);
  const settingsRef = useRef(settings);
  const latestDocumentRef = useRef(document);
  const onChangeRef = useRef(onChange);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  const legacyMigrationAttemptedRef = useRef(false);
  settingsRef.current = settings;
  latestDocumentRef.current = document;
  onChangeRef.current = onChange;

  function emitDocumentChange(next: StudioReferenceBoardDocument): boolean {
    if (next === latestDocumentRef.current) return true;
    const accepted = onChangeRef.current(next);
    if (accepted === false) return false;
    latestDocumentRef.current = next;
    return true;
  }

  useEffect(() => {
    if (!open) return;
    const requestId = ++requestIdRef.current;
    setLibraryStatus("loading");
    setLibraryError(null);
    listAssets()
      .then((list) => {
        if (requestIdRef.current !== requestId) return;
        setAssets(list);
        setLibraryStatus("ready");
      })
      .catch(() => {
        if (requestIdRef.current !== requestId) return;
        setLibraryStatus("error");
        setLibraryError("에셋 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      });
    return () => {
      if (requestIdRef.current === requestId) requestIdRef.current += 1;
    };
  }, [open, pickerOpen, refreshNonce]);

  // v1 workspace settings carried one pinned image. Migrate it once into an empty project board,
  // then clear the workspace hint so an intentional later delete cannot resurrect the old image.
  useEffect(() => {
    if (
      !open
      || libraryStatus !== "ready"
      || legacyMigrationAttemptedRef.current
      || settings.assetId === null
    ) {
      return;
    }
    legacyMigrationAttemptedRef.current = true;
    const legacyAsset = resolvePinnedAsset(assets, settings.assetId);
    const legacyFlip = settings.flipped;
    setSettings((previous) => ({ ...previous, assetId: null, flipped: false }));
    if (!legacyAsset || latestDocumentRef.current.items.length > 0) return;

    void ensureStudioAssetContentHash(legacyAsset)
      .then((ensuredAsset) => {
        const current = latestDocumentRef.current;
        if (current.items.length > 0) return;
        const item = buildReferenceItem(ensuredAsset, 0, legacyFlip);
        if (!item) return;
        const next = addStudioReferenceBoardItem(current, item);
        if (next !== current) {
          const accepted = onChangeRef.current(next);
          if (accepted !== false) {
            latestDocumentRef.current = next;
            setSelectedItemId(item.id);
          }
        }
      })
      .catch(() => {
        setLibraryError("이전 참고 이미지의 콘텐츠 해시를 계산하지 못했습니다.");
      });
  }, [assets, libraryStatus, open, settings.assetId, settings.flipped]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      try {
        window.localStorage.setItem(REFERENCE_PANEL_STORAGE_KEY, serializeReferencePanelSettings(settingsRef.current));
      } catch {
        // Storage-blocked environments keep a working, non-persistent panel.
      }
    }, 200);
    saveTimerRef.current = timer;
    return () => clearTimeout(timer);
  }, [open, settings]);

  useEffect(() => {
    return () => {
      if (!saveTimerRef.current) return;
      clearTimeout(saveTimerRef.current);
      try {
        window.localStorage.setItem(REFERENCE_PANEL_STORAGE_KEY, serializeReferencePanelSettings(settingsRef.current));
      } catch {
        // Same fallback as the debounced save above.
      }
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onResize = () => {
      const { w, h } = readViewport();
      setSettings((previous) => ({ ...previous, ...clampReferencePanelRect(previous, w, h) }));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  useEffect(() => {
    if (!dragging) return;
    const previousCursor = window.document.body.style.cursor;
    const previousUserSelect = window.document.body.style.userSelect;
    window.document.body.style.cursor = dragging === "resize" ? "nwse-resize" : "grabbing";
    window.document.body.style.userSelect = "none";
    return () => {
      window.document.body.style.cursor = previousCursor;
      window.document.body.style.userSelect = previousUserSelect;
    };
  }, [dragging]);

  useEffect(() => {
    return () => {
      const listeners = panelDragListenersRef.current;
      if (!listeners) return;
      window.removeEventListener("pointermove", listeners.onMove);
      window.removeEventListener("pointerup", listeners.onEnd);
      window.removeEventListener("pointercancel", listeners.onEnd);
    };
  }, []);

  function retryLoadAssets(): void {
    setRefreshNonce((nonce) => nonce + 1);
  }

  function beginPanelDrag(kind: DragKind, event: ReactPointerEvent): void {
    event.preventDefault();
    panelDragSessionRef.current = {
      kind,
      startRect: { x: settings.x, y: settings.y, width: settings.width, height: settings.height },
      startPointer: { x: event.clientX, y: event.clientY },
    };
    setDragging(kind);
    const onMove = (nextEvent: PointerEvent) => {
      const session = panelDragSessionRef.current;
      if (!session) return;
      const { w, h } = readViewport();
      const pointer = { x: nextEvent.clientX, y: nextEvent.clientY };
      const nextRect = session.kind === "move"
        ? dragReferencePanelRect(session.startRect, session.startPointer, pointer, w, h)
        : resizeReferencePanelRect(session.startRect, session.startPointer, pointer, w, h);
      setSettings((previous) => ({ ...previous, ...nextRect }));
    };
    const onEnd = () => {
      panelDragSessionRef.current = null;
      setDragging(null);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      panelDragListenersRef.current = null;
    };
    panelDragListenersRef.current = { onMove, onEnd };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
  }

  function resizeByKeyboard(event: KeyboardEvent<HTMLButtonElement>): void {
    const step = event.shiftKey ? 32 : 16;
    const { w, h } = readViewport();
    let dw = 0;
    let dh = 0;
    if (event.key === "ArrowRight") dw = step;
    else if (event.key === "ArrowLeft") dw = -step;
    else if (event.key === "ArrowDown") dh = step;
    else if (event.key === "ArrowUp") dh = -step;
    else return;
    event.preventDefault();
    setSettings((previous) => ({
      ...previous,
      ...resizeReferencePanelRect(previous, { x: 0, y: 0 }, { x: dw, y: dh }, w, h),
    }));
  }

  async function addAssetToBoard(asset: StudioAsset): Promise<void> {
    if (latestDocumentRef.current.items.length >= STUDIO_REFERENCE_BOARD_MAX_ITEMS) return;
    setAddingAssetId(asset.id);
    setLibraryError(null);
    try {
      const ensuredAsset = await ensureStudioAssetContentHash(asset);
      setAssets((previous) => previous.map((candidate) => candidate.id === ensuredAsset.id ? ensuredAsset : candidate));
      const current = latestDocumentRef.current;
      const item = buildReferenceItem(ensuredAsset, current.items.length);
      if (!item) throw new Error("invalid reference item");
      const next = addStudioReferenceBoardItem(current, item);
      if (next === current) return;
      if (emitDocumentChange(next)) {
        setSelectedItemId(item.id);
        setInspectorOpen(false);
      }
    } catch {
      setLibraryError("이미지를 보드에 추가할 수 없습니다. 콘텐츠 해시 지원을 확인해 주세요.");
    } finally {
      setAddingAssetId(null);
    }
  }

  function beginItemDrag(item: StudioReferenceBoardItem, event: ReactPointerEvent<HTMLButtonElement>): void {
    if (event.button !== 0) return;
    const board = event.currentTarget.closest<HTMLElement>("[data-reference-board-canvas]");
    if (!board) return;
    event.stopPropagation();
    setSelectedItemId(item.id);
    setTransformPreview(null);
    itemDragSessionRef.current = {
      itemId: item.id,
      pointerId: event.pointerId,
      startPointer: { x: event.clientX, y: event.clientY },
      startView: item.view,
      boardRect: board.getBoundingClientRect(),
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function previewItemDrag(event: ReactPointerEvent<HTMLButtonElement>): void {
    const session = itemDragSessionRef.current;
    if (!session || event.pointerId !== session.pointerId) return;
    event.stopPropagation();
    const width = Math.max(1, session.boardRect.width);
    const height = Math.max(1, session.boardRect.height);
    const view = {
      ...session.startView,
      centerX: clampUnit(session.startView.centerX + (event.clientX - session.startPointer.x) / width),
      centerY: clampUnit(session.startView.centerY + (event.clientY - session.startPointer.y) / height),
    };
    dragPreviewRef.current = { itemId: session.itemId, view };
    setDragPreview({ itemId: session.itemId, view });
  }

  function finishItemDrag(event: ReactPointerEvent<HTMLButtonElement>): void {
    const session = itemDragSessionRef.current;
    if (!session || event.pointerId !== session.pointerId) return;
    event.stopPropagation();
    const finalPreview = dragPreviewRef.current?.itemId === session.itemId
      ? dragPreviewRef.current.view
      : session.startView;
    itemDragSessionRef.current = null;
    dragPreviewRef.current = null;
    setDragPreview(null);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    if (
      finalPreview.centerX === session.startView.centerX
      && finalPreview.centerY === session.startView.centerY
    ) {
      return;
    }
    emitDocumentChange(updateStudioReferenceBoardItem(latestDocumentRef.current, session.itemId, {
      view: { centerX: finalPreview.centerX, centerY: finalPreview.centerY },
    }));
  }

  function cancelItemDrag(event?: ReactPointerEvent<HTMLButtonElement>): void {
    const session = itemDragSessionRef.current;
    if (!session || (event && event.pointerId !== session.pointerId)) return;
    event?.stopPropagation();
    itemDragSessionRef.current = null;
    dragPreviewRef.current = null;
    setDragPreview(null);
  }

  function patchSelectedView(patch: Partial<StudioReferenceBoardItemView>): void {
    const itemId = effectiveSelectedItem?.id;
    if (!itemId) return;
    setTransformPreview(null);
    emitDocumentChange(updateStudioReferenceBoardItem(latestDocumentRef.current, itemId, { view: patch }));
  }

  function previewSelectedView(patch: Partial<StudioReferenceBoardItemView>): void {
    if (!effectiveSelectedItem) return;
    const base = transformPreview?.itemId === effectiveSelectedItem.id
      ? transformPreview.view
      : effectiveSelectedItem.view;
    setTransformPreview({ itemId: effectiveSelectedItem.id, view: { ...base, ...patch } });
  }

  function clearTransformPreview(): void {
    setTransformPreview(null);
  }

  if (!open) return null;

  const effectiveSelectedItem = document.items.find((item) => item.id === selectedItemId)
    ?? document.items.at(-1)
    ?? null;
  const effectiveSelectedId = effectiveSelectedItem?.id ?? null;
  const selectedIndex = effectiveSelectedId
    ? document.items.findIndex((item) => item.id === effectiveSelectedId)
    : -1;
  const selectedView = effectiveSelectedItem
    ? transformPreview?.itemId === effectiveSelectedItem.id
      ? transformPreview.view
      : effectiveSelectedItem.view
    : null;
  const filteredAssets = filterReferenceAssetsByName(assets, pickerQuery);
  const atItemLimit = document.items.length >= STUDIO_REFERENCE_BOARD_MAX_ITEMS;

  return (
    <div
      role="region"
      aria-label="포즈 참고 보드"
      className="fixed z-[70] flex flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-[0_12px_36px_oklch(0.05_0.01_70/0.4)]"
      style={{ left: settings.x, top: settings.y, width: settings.width, height: settings.height }}
    >
      <header
        className="flex shrink-0 cursor-grab items-center justify-between gap-1 border-b border-line bg-card px-2 py-1.5 active:cursor-grabbing"
        style={{ touchAction: "none" }}
        onPointerDown={(event) => beginPanelDrag("move", event)}
      >
        <span className="flex min-w-0 items-center gap-1.5 text-xs font-bold text-fg">
          <Images size={13} className="shrink-0 text-accent" aria-hidden />
          <span className="truncate">포즈 참고 보드</span>
          <span className="rounded-full border border-line bg-raised px-1.5 py-0.5 text-[0.6rem] font-semibold tabular-nums text-fg-3">
            {document.items.length}/{STUDIO_REFERENCE_BOARD_MAX_ITEMS}
          </span>
        </span>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            aria-label="선택 이미지 속성"
            title="선택 이미지 속성"
            aria-pressed={inspectorOpen}
            disabled={!effectiveSelectedItem}
            className={cx(ICON_BUTTON, "size-8", inspectorOpen && "border-accent/60 bg-accent-soft text-accent")}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => {
              setTransformPreview(null);
              setInspectorOpen((value) => !value);
            }}
          >
            <SlidersHorizontal size={13} aria-hidden />
          </button>
          <button
            type="button"
            aria-label="참고 이미지 추가"
            title={atItemLimit ? `최대 ${STUDIO_REFERENCE_BOARD_MAX_ITEMS}개까지 추가할 수 있어요.` : "참고 이미지 추가"}
            aria-pressed={pickerOpen}
            disabled={atItemLimit}
            className={cx(ICON_BUTTON, "size-8", pickerOpen && "border-accent/60 bg-accent-soft text-accent")}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => {
              setPickerOpen((value) => !value);
              setTransformPreview(null);
              setInspectorOpen(false);
            }}
          >
            <ImagePlus size={13} aria-hidden />
          </button>
          <button
            type="button"
            aria-label="포즈 참고 보드 닫기"
            title="닫기"
            className={cx(ICON_BUTTON, "size-8")}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onClose}
          >
            <X size={13} aria-hidden />
          </button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1 overflow-hidden bg-[oklch(0.14_0.008_70)]">
        <div
          data-reference-board-canvas="true"
          data-testid="reference-board-canvas"
          className="absolute inset-0 bottom-12 overflow-hidden"
          style={{
            backgroundImage:
              "linear-gradient(oklch(0.35 0.012 68 / 0.16) 1px, transparent 1px), linear-gradient(90deg, oklch(0.35 0.012 68 / 0.16) 1px, transparent 1px)",
            backgroundSize: "20px 20px",
          }}
          onPointerDown={(event) => {
            if (event.target !== event.currentTarget) return;
            setSelectedItemId(null);
            setInspectorOpen(false);
          }}
        >
          {document.items.length === 0 ? (
            <div className="grid h-full place-items-center p-4 text-center">
              <div>
                <ImageIcon className="mx-auto text-fg-3" size={23} aria-hidden />
                <p className="mt-2 text-[0.72rem] font-semibold text-fg">함께 볼 참고 이미지를 모아보세요</p>
                <p className="mx-auto mt-1 max-w-[28ch] text-[0.65rem] leading-relaxed text-fg-3">
                  여러 이미지를 겹쳐 배치하고 크기·각도·투명도를 비교할 수 있어요.
                </p>
                <button
                  type="button"
                  className={cx(CONTROL_BUTTON, "mt-3 border-accent/60 bg-accent text-on-accent hover:bg-accent-2")}
                  onClick={() => setPickerOpen(true)}
                >
                  <ImagePlus size={13} aria-hidden /> 이미지 추가
                </button>
              </div>
            </div>
          ) : null}

          {document.items.map((item) => {
            const asset = resolveReferenceAsset(item, assets);
            const isSelected = item.id === effectiveSelectedId;
            const view = dragPreview?.itemId === item.id
              ? dragPreview.view
              : transformPreview?.itemId === item.id
                ? transformPreview.view
                : item.view;
            const width = item.asset.width ?? asset?.width ?? 1;
            const height = item.asset.height ?? asset?.height ?? 1;
            const aspect = Math.max(0.05, Math.min(20, width / Math.max(1, height)));
            const baseWidth = aspect >= 1 ? 54 : 54 * aspect;
            const baseHeight = aspect >= 1 ? 54 / aspect : 54;
            const label = referenceItemLabel(item, asset);
            return (
              <button
                key={item.id}
                type="button"
                aria-label={`${label} 이동 및 선택`}
                aria-pressed={isSelected}
                title={asset ? `${label} — 드래그해서 이동` : `${label} — 원본 에셋을 찾을 수 없음`}
                className={cx(
                  "absolute grid touch-none select-none place-items-center border bg-card/20 p-0 outline-none",
                  isSelected
                    ? "border-accent shadow-[0_0_0_1px_oklch(0.72_0.185_42/0.35)]"
                    : "border-transparent hover:border-line-strong focus-visible:border-accent"
                )}
                style={{
                  left: `${view.centerX * 100}%`,
                  top: `${view.centerY * 100}%`,
                  width: `${baseWidth}%`,
                  height: `${baseHeight}%`,
                  opacity: view.opacity,
                  filter: view.grayscale ? "grayscale(1)" : undefined,
                  transform: `translate(-50%, -50%) rotate(${view.rotationDeg}deg) scale(${view.zoom * (view.flipX ? -1 : 1)}, ${view.zoom * (view.flipY ? -1 : 1)})`,
                  transformOrigin: "center",
                }}
                onPointerDown={(event) => beginItemDrag(item, event)}
                onPointerMove={previewItemDrag}
                onPointerUp={finishItemDrag}
                onPointerCancel={cancelItemDrag}
                onLostPointerCapture={cancelItemDrag}
              >
                {asset ? (
                  <img
                    src={asset.dataUrl}
                    alt=""
                    draggable={false}
                    className="pointer-events-none h-full w-full object-contain"
                  />
                ) : (
                  <span className="pointer-events-none flex h-full w-full flex-col items-center justify-center gap-1 border border-dashed border-line bg-card/90 p-2 text-center text-[0.55rem] leading-tight text-fg-3">
                    <AlertTriangle size={14} className="text-warn" aria-hidden />
                    원본 없음
                  </span>
                )}
                {asset?.kind === "ai" ? (
                  <span className="pointer-events-none absolute left-1 top-1 inline-flex items-center gap-0.5 rounded bg-accent px-1 py-0.5 text-[0.48rem] font-bold text-on-accent">
                    <Sparkles size={7} aria-hidden /> AI
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div
          role="group"
          aria-label="참고 이미지 레이어 (뒤에서 앞으로)"
          className="absolute inset-x-0 bottom-0 flex h-12 items-center gap-1 overflow-x-auto border-t border-line bg-card px-2"
        >
          {document.items.length === 0 ? (
            <span className="text-[0.62rem] text-fg-3">이미지를 추가하면 레이어가 여기에 표시됩니다.</span>
          ) : document.items.map((item, index) => {
            const asset = resolveReferenceAsset(item, assets);
            const label = referenceItemLabel(item, asset);
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={item.id === effectiveSelectedId}
                aria-label={`레이어 ${index + 1}: ${label}`}
                title={`${index + 1}. ${label}`}
                className={cx(
                  "relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-md border bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
                  item.id === effectiveSelectedId ? "border-accent" : "border-line hover:border-line-strong"
                )}
                onClick={() => {
                  setSelectedItemId(item.id);
                  setPickerOpen(false);
                }}
              >
                {asset ? (
                  <img src={asset.dataUrl} alt="" className="h-full w-full object-cover" draggable={false} />
                ) : (
                  <AlertTriangle size={13} className="text-warn" aria-hidden />
                )}
                <span className="pointer-events-none absolute bottom-0 right-0 rounded-tl bg-panel/90 px-1 text-[0.45rem] tabular-nums text-fg-2">
                  {index + 1}
                </span>
              </button>
            );
          })}
        </div>

        {pickerOpen ? (
          <div className="absolute inset-0 z-20 flex flex-col overflow-hidden bg-panel p-2">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[0.72rem] font-bold text-fg">보드에 이미지 추가</p>
              <button
                type="button"
                className="text-[0.68rem] font-semibold text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                onClick={() => setPickerOpen(false)}
              >
                보드로 돌아가기
              </button>
            </div>
            <label className="relative mb-2 block shrink-0">
              <Search size={12} aria-hidden className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-fg-3" />
              <input
                type="search"
                value={pickerQuery}
                onChange={(event) => setPickerQuery(event.target.value)}
                placeholder={`이름으로 찾기 (${assets.length}개)`}
                aria-label="에셋 이름 검색"
                className="h-8 w-full rounded-lg border border-line bg-card pl-7 pr-2 text-[0.7rem] text-fg outline-none placeholder:text-fg-3 focus:border-accent/60"
              />
            </label>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {libraryStatus === "loading" ? (
                <div className="space-y-1.5" aria-label="에셋 목록 불러오는 중">
                  {Array.from({ length: 6 }, (_, index) => (
                    <div key={index} className="h-14 animate-pulse rounded-lg border border-line bg-card" />
                  ))}
                </div>
              ) : libraryStatus === "error" ? (
                <div className="flex flex-col items-center gap-2 px-2 py-6 text-center">
                  <AlertTriangle className="text-warn" size={17} aria-hidden />
                  <p className="text-[0.68rem] leading-relaxed text-fg-3">{libraryError}</p>
                  <button
                    type="button"
                    className={cx(CONTROL_BUTTON, "border-line bg-card text-fg-2 hover:bg-raised")}
                    onClick={retryLoadAssets}
                  >
                    다시 시도
                  </button>
                </div>
              ) : assets.length === 0 ? (
                <p className="px-3 py-7 text-center text-[0.68rem] leading-relaxed text-fg-3">
                  저장된 에셋이 없어요. 스튜디오의 에셋 메뉴에서 이미지를 먼저 업로드해 주세요.
                </p>
              ) : filteredAssets.length === 0 ? (
                <p className="px-3 py-7 text-center text-[0.68rem] text-fg-3">
                  &ldquo;{pickerQuery}&rdquo;와 일치하는 에셋이 없어요.
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-1.5">
                  {filteredAssets.map((asset) => (
                    <button
                      key={asset.id}
                      type="button"
                      aria-label={`${asset.name} 보드에 추가`}
                      title={`${asset.name} 보드에 추가`}
                      disabled={atItemLimit || addingAssetId !== null}
                      className="group relative flex h-16 items-center justify-center overflow-hidden rounded-lg border border-line bg-card transition-colors hover:border-accent/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:opacity-45"
                      onClick={() => void addAssetToBoard(asset)}
                    >
                      <img src={asset.dataUrl} alt="" className="max-h-full max-w-full object-contain" />
                      <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-panel/90 px-1 py-0.5 text-[0.5rem] text-fg-2">
                        {asset.name}
                      </span>
                      {addingAssetId === asset.id ? (
                        <Loader2 size={16} className="absolute animate-spin text-accent" aria-hidden />
                      ) : null}
                      {asset.kind === "ai" ? (
                        <span className="pointer-events-none absolute left-1 top-1 inline-flex items-center gap-0.5 rounded bg-accent px-1 py-px text-[0.45rem] font-bold text-on-accent">
                          <Sparkles size={6} aria-hidden /> AI
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              )}
              {libraryError && libraryStatus !== "error" ? (
                <p role="status" className="mt-2 rounded-lg border border-warn/40 bg-warn/10 px-2 py-1.5 text-[0.65rem] leading-relaxed text-warn">
                  {libraryError}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {inspectorOpen && effectiveSelectedItem && selectedView ? (
          <div className="absolute inset-x-0 bottom-12 z-20 max-h-[58%] overflow-y-auto border-t border-line bg-panel/95 p-2 shadow-[0_-8px_22px_oklch(0.08_0.01_70/0.35)]">
            <div className="mb-2 flex items-center gap-1">
              <p className="mr-auto min-w-0 truncate text-[0.68rem] font-semibold text-fg">
                {referenceItemLabel(effectiveSelectedItem, resolveReferenceAsset(effectiveSelectedItem, assets))}
              </p>
              <button
                type="button"
                aria-label="한 단계 뒤로"
                title="한 단계 뒤로"
                disabled={selectedIndex <= 0}
                className={cx(ICON_BUTTON, "size-7")}
                onClick={() => emitDocumentChange(reorderStudioReferenceBoardItem(document, effectiveSelectedItem.id, selectedIndex - 1))}
              >
                <ChevronLeft size={12} aria-hidden />
              </button>
              <button
                type="button"
                aria-label="한 단계 앞으로"
                title="한 단계 앞으로"
                disabled={selectedIndex < 0 || selectedIndex >= document.items.length - 1}
                className={cx(ICON_BUTTON, "size-7")}
                onClick={() => emitDocumentChange(reorderStudioReferenceBoardItem(document, effectiveSelectedItem.id, selectedIndex + 1))}
              >
                <ChevronRight size={12} aria-hidden />
              </button>
              <button
                type="button"
                aria-label="좌우 반전"
                title="좌우 반전"
                aria-pressed={selectedView.flipX}
                className={cx(ICON_BUTTON, "size-7", selectedView.flipX && "border-accent/60 bg-accent-soft text-accent")}
                onClick={() => patchSelectedView({ flipX: !selectedView.flipX })}
              >
                <FlipHorizontal2 size={12} aria-hidden />
              </button>
              <button
                type="button"
                aria-label="상하 반전"
                title="상하 반전"
                aria-pressed={selectedView.flipY}
                className={cx(ICON_BUTTON, "size-7", selectedView.flipY && "border-accent/60 bg-accent-soft text-accent")}
                onClick={() => patchSelectedView({ flipY: !selectedView.flipY })}
              >
                <FlipVertical2 size={12} aria-hidden />
              </button>
              <button
                type="button"
                aria-label={selectedView.grayscale ? "원본 색상으로 보기" : "흑백으로 보기"}
                title="흑백 보기"
                aria-pressed={selectedView.grayscale}
                className={cx(ICON_BUTTON, "size-7", selectedView.grayscale && "border-accent/60 bg-accent-soft text-accent")}
                onClick={() => patchSelectedView({ grayscale: !selectedView.grayscale })}
              >
                <span className="size-3 rounded-full border border-current bg-[linear-gradient(90deg,currentColor_50%,transparent_50%)]" aria-hidden />
              </button>
              <button
                type="button"
                aria-label="선택 이미지 삭제"
                title="선택 이미지 삭제"
                className={cx(ICON_BUTTON, "size-7 hover:border-bad/50 hover:bg-bad/10 hover:text-bad")}
                onClick={() => {
                  const next = removeStudioReferenceBoardItem(document, effectiveSelectedItem.id);
                  if (emitDocumentChange(next)) {
                    setSelectedItemId(null);
                    setTransformPreview(null);
                    setInspectorOpen(false);
                  }
                }}
              >
                <Trash2 size={12} aria-hidden />
              </button>
            </div>
            <div className="space-y-1.5">
              <ReferenceRangeControl
                label="크기"
                ariaLabel="선택 이미지 크기"
                value={selectedView.zoom * 100}
                min={5}
                max={3200}
                step={5}
                format={(value) => `${Math.round(value)}%`}
                onPreview={(value) => previewSelectedView({ zoom: value / 100 })}
                onCommit={(value) => patchSelectedView({ zoom: value / 100 })}
                onCancel={clearTransformPreview}
              />
              <ReferenceRangeControl
                label="회전"
                ariaLabel="선택 이미지 회전"
                value={selectedView.rotationDeg}
                min={-180}
                max={179}
                step={1}
                format={(value) => `${Math.round(value)}°`}
                onPreview={(value) => previewSelectedView({ rotationDeg: value })}
                onCommit={(value) => patchSelectedView({ rotationDeg: value })}
                onCancel={clearTransformPreview}
              />
              <ReferenceRangeControl
                label="불투명도"
                ariaLabel="선택 이미지 불투명도"
                value={selectedView.opacity * 100}
                min={0}
                max={100}
                step={1}
                format={(value) => `${Math.round(value)}%`}
                onPreview={(value) => previewSelectedView({ opacity: value / 100 })}
                onCommit={(value) => patchSelectedView({ opacity: value / 100 })}
                onCancel={clearTransformPreview}
              />
            </div>
          </div>
        ) : null}
      </div>

      <button
        type="button"
        aria-label="패널 크기 조절 (방향키로도 조절 가능, 더블클릭으로 기본 크기)"
        title="드래그해서 크기 조절 (더블클릭: 기본 크기)"
        className="absolute bottom-0 right-0 z-30 size-4 cursor-nwse-resize border-none bg-transparent p-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
        style={{
          touchAction: "none",
          clipPath: "polygon(100% 0, 100% 100%, 0 100%)",
          backgroundColor: "oklch(0.55 0.01 70 / 0.35)",
        }}
        onPointerDown={(event) => beginPanelDrag("resize", event)}
        onKeyDown={resizeByKeyboard}
        onDoubleClick={() => {
          const { w, h } = readViewport();
          setSettings((previous) => ({ ...previous, ...resetReferencePanelSize(previous, w, h) }));
        }}
      />
    </div>
  );
}
