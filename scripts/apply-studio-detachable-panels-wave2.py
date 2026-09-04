from __future__ import annotations

from pathlib import Path


def read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    Path(path).write_text(content, encoding="utf-8")


def replace_once(path: str, needle: str, replacement: str) -> None:
    source = read(path)
    if replacement in source:
        return
    count = source.count(needle)
    if count != 1:
        raise RuntimeError(f"Expected one anchor in {path}, found {count}: {needle[:120]!r}")
    write(path, source.replace(needle, replacement, 1))


def replace_tail(path: str, marker: str, replacement: str) -> None:
    source = read(path)
    index = source.find(marker)
    if index < 0:
        raise RuntimeError(f"Missing tail marker in {path}: {marker!r}")
    write(path, source[:index] + replacement)


write(
    "src/domains/creator/studio-detachable-panels.ts",
    r'''import {
  STUDIO_FLOATING_SURFACE_LAYOUT_VERSION,
  type StudioFloatingSurfaceLayout,
} from "./studio-floating-surface";

export const STUDIO_DETACHABLE_PANEL_IDS = ["page-list", "inspector"] as const;
export type StudioDetachablePanelId = (typeof STUDIO_DETACHABLE_PANEL_IDS)[number];

const SESSION_PREFIX = "toonspectrum:studio:detached-panel:v1";

export const DEFAULT_STUDIO_PAGE_LIST_FLOATING_LAYOUT: StudioFloatingSurfaceLayout = Object.freeze({
  version: STUDIO_FLOATING_SURFACE_LAYOUT_VERSION,
  xRatio: 0.02,
  yRatio: 0.04,
  width: 360,
  height: 760,
  dock: "free",
  positionLocked: false,
  sizeLocked: false,
});

export const DEFAULT_STUDIO_INSPECTOR_FLOATING_LAYOUT: StudioFloatingSurfaceLayout = Object.freeze({
  version: STUDIO_FLOATING_SURFACE_LAYOUT_VERSION,
  xRatio: 0.98,
  yRatio: 0.04,
  width: 440,
  height: 800,
  dock: "free",
  positionLocked: false,
  sizeLocked: false,
});

export const DEFAULT_STUDIO_BRUSH_CATALOG_FLOATING_LAYOUT: StudioFloatingSurfaceLayout = Object.freeze({
  version: STUDIO_FLOATING_SURFACE_LAYOUT_VERSION,
  xRatio: 0.08,
  yRatio: 0.12,
  width: 440,
  height: 680,
  dock: "free",
  positionLocked: false,
  sizeLocked: false,
});

export function studioDetachablePanelSessionKey(id: StudioDetachablePanelId): string {
  return `${SESSION_PREFIX}:${id}`;
}

function browserSessionStorage(): Pick<Storage, "getItem" | "setItem"> | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function loadStudioDetachablePanelState(
  id: StudioDetachablePanelId,
  storage: Pick<Storage, "getItem"> | null = browserSessionStorage(),
): boolean {
  try {
    return storage?.getItem(studioDetachablePanelSessionKey(id)) === "detached";
  } catch {
    return false;
  }
}

export function saveStudioDetachablePanelState(
  id: StudioDetachablePanelId,
  detached: boolean,
  storage: Pick<Storage, "setItem"> | null = browserSessionStorage(),
): boolean {
  try {
    storage?.setItem(
      studioDetachablePanelSessionKey(id),
      detached ? "detached" : "attached",
    );
    return storage !== null;
  } catch {
    return false;
  }
}
''',
)

write(
    "src/domains/creator/StudioDetachablePanelSlot.tsx",
    r'''import { createPortal } from "react-dom";

import {
  type StudioFloatingSurfaceDock,
  type StudioFloatingSurfaceLayout,
} from "./studio-floating-surface";
import { StudioFloatingSurface } from "./StudioFloatingSurface";
import { useStudioFloatingSurfaceLayout } from "./use-studio-floating-surface-layout";

import type { ReactElement, ReactNode } from "react";

export interface StudioDetachablePanelSlotProps {
  readonly detached: boolean;
  readonly surfaceId: string;
  readonly label: string;
  readonly defaultLayout: StudioFloatingSurfaceLayout;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly minWidth?: number;
  readonly minHeight?: number;
  readonly maxWidth?: number;
  readonly maxHeight?: number;
  readonly insetTop?: number;
  readonly allowedDockEdges?: readonly StudioFloatingSurfaceDock[];
}

/**
 * Keeps an existing panel mounted in its authored dock, or portals the exact same panel body into
 * the shared movable-window chrome. This avoids duplicate panel state and preserves the mobile
 * sheet implementation while desktop artists gain free placement, docking, locks and resize.
 */
export function StudioDetachablePanelSlot({
  detached,
  surfaceId,
  label,
  defaultLayout,
  onClose,
  children,
  minWidth = 300,
  minHeight = 320,
  maxWidth = 900,
  maxHeight = 1_100,
  insetTop = 76,
  allowedDockEdges = ["left", "right"],
}: StudioDetachablePanelSlotProps): ReactElement {
  const { layout, setLayout, authority, failure } = useStudioFloatingSurfaceLayout({
    surfaceId,
    defaultLayout,
    enabled: detached,
  });

  if (!detached || typeof document === "undefined") {
    return <>{children}</>;
  }

  return createPortal(
    <StudioFloatingSurface
      surfaceId={surfaceId}
      label={label}
      layout={layout}
      defaultLayout={defaultLayout}
      minWidth={minWidth}
      minHeight={minHeight}
      maxWidth={maxWidth}
      maxHeight={maxHeight}
      insetTop={insetTop}
      insetRight={12}
      insetBottom={12}
      insetLeft={12}
      snapDistance={12}
      allowedDockEdges={allowedDockEdges}
      onLayoutChange={setLayout}
      onClose={onClose}
      rootDataAttributes={{
        "data-studio-detachable-surface": surfaceId,
        "data-studio-floating-layout-authority": authority,
        "data-studio-floating-layout-failure": failure ?? undefined,
      }}
      className="border-line-strong"
      contentClassName="flex min-h-0 flex-1"
    >
      {children}
    </StudioFloatingSurface>,
    document.body,
  );
}
''',
)

write(
    "src/domains/creator/studio-detachable-panels.test.ts",
    r'''import { describe, expect, it } from "vitest";

import {
  DEFAULT_STUDIO_BRUSH_CATALOG_FLOATING_LAYOUT,
  DEFAULT_STUDIO_INSPECTOR_FLOATING_LAYOUT,
  DEFAULT_STUDIO_PAGE_LIST_FLOATING_LAYOUT,
  loadStudioDetachablePanelState,
  saveStudioDetachablePanelState,
  studioDetachablePanelSessionKey,
} from "./studio-detachable-panels";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("studio detachable panels", () => {
  it("keeps same-tab attached mode explicit and failure safe", () => {
    const storage = memoryStorage();
    expect(loadStudioDetachablePanelState("page-list", storage)).toBe(false);
    expect(saveStudioDetachablePanelState("page-list", true, storage)).toBe(true);
    expect(loadStudioDetachablePanelState("page-list", storage)).toBe(true);
    expect(saveStudioDetachablePanelState("page-list", false, storage)).toBe(true);
    expect(loadStudioDetachablePanelState("page-list", storage)).toBe(false);
    expect(studioDetachablePanelSessionKey("inspector")).toContain("inspector");
  });

  it("ships reachable defaults for the expanded desktop surfaces", () => {
    for (const layout of [
      DEFAULT_STUDIO_PAGE_LIST_FLOATING_LAYOUT,
      DEFAULT_STUDIO_INSPECTOR_FLOATING_LAYOUT,
      DEFAULT_STUDIO_BRUSH_CATALOG_FLOATING_LAYOUT,
    ]) {
      expect(layout.version).toBe(2);
      expect(layout.dock).toBe("free");
      expect(layout.width).toBeGreaterThanOrEqual(320);
      expect(layout.height).toBeGreaterThanOrEqual(600);
      expect(layout.positionLocked).toBe(false);
      expect(layout.sizeLocked).toBe(false);
    }
  });
});
''',
)

write(
    "src/domains/creator/studio-detachable-panels-boundary.test.ts",
    r'''import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("expanded Studio detachable surfaces", () => {
  it("lets the page and inspector docks detach without replacing mobile sheets", () => {
    const pages = source("src/domains/creator/StudioPageListPane.tsx");
    const inspector = source("src/domains/creator/StudioInspectorAsideShell.tsx");

    expect(pages).toContain('surfaceId="page-list"');
    expect(pages).toContain("StudioDetachablePanelSlot");
    expect(pages).toContain("STUDIO_MOBILE_PAGES_SHEET_ID");
    expect(pages).toContain("StudioPageListResizeHandle");
    expect(inspector).toContain('surfaceId="inspector"');
    expect(inspector).toContain("StudioDetachablePanelSlot");
    expect(inspector).toContain("StudioMobileSheetHandle");
  });

  it("turns the desktop brush library into a persistent comparison window", () => {
    const brush = source("src/domains/creator/brush/StudioBrushLibrarySheet.tsx");
    expect(brush).toContain('surfaceId={`brush-catalog:${operation}`}');
    expect(brush).toContain("closeOnSelection={!desktop}");
    expect(brush).toContain("dismissOnOutsidePointer={!desktop}");
    expect(brush).toContain("StudioFloatingSurface");
    expect(brush).toContain("useStudioFloatingSurfaceLayout");
  });
});
''',
)

page_path = "src/domains/creator/StudioPageListPane.tsx"
replace_once(
    page_path,
    '''  Maximize2,\n  Minimize2,\n  Pencil,''',
    '''  Maximize2,\n  Minimize2,\n  Move,\n  PanelLeft,\n  Pencil,''',
)
replace_once(
    page_path,
    '''import { shotTagBadgeText, shotTagBadgeTitle } from "./studio-panel-shot-tags";\nimport { STUDIO_WORKSPACE_LEFT_PANEL_WIDTH } from "./studio-workspaces";''',
    '''import { shotTagBadgeText, shotTagBadgeTitle } from "./studio-panel-shot-tags";\nimport {\n  DEFAULT_STUDIO_PAGE_LIST_FLOATING_LAYOUT,\n  loadStudioDetachablePanelState,\n  saveStudioDetachablePanelState,\n} from "./studio-detachable-panels";\nimport { STUDIO_WORKSPACE_LEFT_PANEL_WIDTH } from "./studio-workspaces";\nimport { StudioDetachablePanelSlot } from "./StudioDetachablePanelSlot";''',
)
replace_once(
    page_path,
    '''  const safeMobileKeyboardInset = Number.isFinite(mobileKeyboardInset)\n    ? Math.max(0, Math.round(mobileKeyboardInset))\n    : 0;\n  return (''',
    '''  const safeMobileKeyboardInset = Number.isFinite(mobileKeyboardInset)\n    ? Math.max(0, Math.round(mobileKeyboardInset))\n    : 0;\n  const [detached, setDetached] = useState(() =>\n    loadStudioDetachablePanelState("page-list")\n  );\n  const desktopDetached = !isMobile && detached;\n  const setPageListDetached = (next: boolean): void => {\n    setDetached(next);\n    saveStudioDetachablePanelState("page-list", next);\n    if (next) setLeftPanelOpen(true);\n  };\n  return (''',
)
replace_once(
    page_path,
    '''        <div\n          id={STUDIO_MOBILE_PAGES_SHEET_ID}''',
    '''        <StudioDetachablePanelSlot\n          detached={desktopDetached && visibleLeftPanelOpen}\n          surfaceId="page-list"\n          label="페이지 목록"\n          defaultLayout={DEFAULT_STUDIO_PAGE_LIST_FLOATING_LAYOUT}\n          minWidth={320}\n          minHeight={420}\n          maxWidth={720}\n          maxHeight={1_100}\n          allowedDockEdges={["left", "right"]}\n          onClose={() => setLeftPanelOpen(false)}\n        >\n        <div\n          id={STUDIO_MOBILE_PAGES_SHEET_ID}''',
)
replace_once(
    page_path,
    '''          data-studio-sheet-id="pages"\n          data-studio-ui-preferences-authority={preferenceAuthority}''',
    '''          data-studio-sheet-id="pages"\n          data-studio-panel-detached={desktopDetached ? "true" : undefined}\n          data-studio-ui-preferences-authority={preferenceAuthority}''',
)
replace_once(
    page_path,
    '''            mobileSheet === "pages" ? "translate-y-0" : "translate-y-full",\n            !visibleLeftPanelOpen && "lg:hidden"''',
    '''            mobileSheet === "pages" ? "translate-y-0" : "translate-y-full",\n            desktopDetached && "lg:h-full lg:w-full lg:flex-1 lg:border-0 lg:bg-transparent lg:p-0",\n            !visibleLeftPanelOpen && "lg:hidden"''',
)
replace_once(
    page_path,
    ''': { width: leftResize.width, minWidth: STUDIO_WORKSPACE_LEFT_PANEL_WIDTH.minimum }''',
    ''': desktopDetached\n                ? { width: "100%", minWidth: 0 }\n                : { width: leftResize.width, minWidth: STUDIO_WORKSPACE_LEFT_PANEL_WIDTH.minimum }''',
)
replace_once(
    page_path,
    '''              <div className="flex shrink-0 items-center gap-1">\n                <button\n                  type="button"\n                  onClick={() => setMobileSheet(null)}''',
    '''              <div className="flex shrink-0 items-center gap-1">\n                {!isMobile ? (\n                  <button\n                    type="button"\n                    onClick={() => setPageListDetached(!detached)}\n                    aria-label={detached\n                      ? "페이지 목록을 왼쪽 패널에 붙이기"\n                      : "페이지 목록을 창으로 분리"}\n                    aria-pressed={desktopDetached}\n                    title={detached ? "왼쪽 패널에 붙이기" : "자유 배치 창으로 분리"}\n                    className="grid size-8 place-items-center rounded-lg text-fg-3 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"\n                  >\n                    {detached ? <PanelLeft size={14} aria-hidden /> : <Move size={14} aria-hidden />}\n                  </button>\n                ) : null}\n                <button\n                  type="button"\n                  onClick={() => setMobileSheet(null)}''',
)
replace_once(
    page_path,
    '''        </div>\n\n        {/* 페이지 목록 ↔ 캔버스 너비 스플리터(데스크톱) */}\n        {visibleLeftPanelOpen && (''',
    '''        </div>\n        </StudioDetachablePanelSlot>\n\n        {/* 페이지 목록 ↔ 캔버스 너비 스플리터(데스크톱) */}\n        {visibleLeftPanelOpen && !desktopDetached && (''',
)

inspector_path = "src/domains/creator/StudioInspectorAsideShell.tsx"
replace_once(
    inspector_path,
    '''import {\n  ChevronRight,\n  Loader2,\n} from "lucide-react";\nimport { Suspense } from "react";''',
    '''import {\n  ChevronRight,\n  Loader2,\n  Move,\n  PanelRight,\n} from "lucide-react";\nimport { Suspense, useState } from "react";''',
)
replace_once(
    inspector_path,
    '''import { resolveStudioTemplateGutterCapability } from "./studio-template-gutter-layout";\nimport { StudioLayerNavigator } from "./studio-page-lazy-ui";''',
    '''import { resolveStudioTemplateGutterCapability } from "./studio-template-gutter-layout";\nimport {\n  DEFAULT_STUDIO_INSPECTOR_FLOATING_LAYOUT,\n  loadStudioDetachablePanelState,\n  saveStudioDetachablePanelState,\n} from "./studio-detachable-panels";\nimport { StudioLayerNavigator } from "./studio-page-lazy-ui";''',
)
replace_once(
    inspector_path,
    '''import { StudioCommandSearchHost } from "./StudioCommandSearchHost";''',
    '''import { StudioCommandSearchHost } from "./StudioCommandSearchHost";\nimport { StudioDetachablePanelSlot } from "./StudioDetachablePanelSlot";''',
)
replace_once(
    inspector_path,
    '''  const layersPaneMounted = inspectorLayout.primary === "layers" || layersSplitWithProperties;\n  return (\n        <aside''',
    '''  const layersPaneMounted = inspectorLayout.primary === "layers" || layersSplitWithProperties;\n  const [detached, setDetached] = useState(() =>\n    loadStudioDetachablePanelState("inspector")\n  );\n  const desktopDetached = !isMobile && detached;\n  const setInspectorDetached = (next: boolean): void => {\n    setDetached(next);\n    saveStudioDetachablePanelState("inspector", next);\n    if (next) setRightPanelOpen(true);\n  };\n  return (\n    <StudioDetachablePanelSlot\n      detached={desktopDetached && visibleRightPanelOpen}\n      surfaceId="inspector"\n      label="작업 패널"\n      defaultLayout={DEFAULT_STUDIO_INSPECTOR_FLOATING_LAYOUT}\n      minWidth={360}\n      minHeight={480}\n      maxWidth={920}\n      maxHeight={1_100}\n      allowedDockEdges={["left", "right"]}\n      onClose={() => setRightPanelOpen(false)}\n    >\n        <aside''',
)
replace_once(
    inspector_path,
    '''          data-studio-sheet-id="props"\n          data-studio-mobile-sheet={isMobile && mobileSheet === "props" ? "true" : undefined}''',
    '''          data-studio-sheet-id="props"\n          data-studio-panel-detached={desktopDetached ? "true" : undefined}\n          data-studio-mobile-sheet={isMobile && mobileSheet === "props" ? "true" : undefined}''',
)
replace_once(
    inspector_path,
    '''            mobileSheet === "props" ? "translate-y-0" : "translate-y-full",\n            !visibleRightPanelOpen && "lg:hidden",''',
    '''            mobileSheet === "props" ? "translate-y-0" : "translate-y-full",\n            desktopDetached && "lg:h-full lg:w-full lg:flex-1 lg:self-auto lg:border-0 lg:bg-transparent lg:p-0",\n            !visibleRightPanelOpen && "lg:hidden",''',
)
replace_once(
    inspector_path,
    ''': { width: rightResize.width, minWidth: STUDIO_WORKSPACE_RIGHT_PANEL_WIDTH.minimum }''',
    ''': desktopDetached\n                ? { width: "100%", minWidth: 0 }\n                : { width: rightResize.width, minWidth: STUDIO_WORKSPACE_RIGHT_PANEL_WIDTH.minimum }''',
)
replace_once(
    inspector_path,
    '''            trailing={\n              isMobile ? null : (\n                <button\n                  type="button"\n                  onClick={() => setRightPanelOpen(false)}\n                  aria-label="작업 패널 접기"\n                  className="mr-1 hidden min-h-9 shrink-0 items-center gap-0.5 rounded px-1.5 text-[0.65rem] text-fg-3 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent lg:inline-flex"\n                  title="작업 패널 접기"\n                >\n                  접기 <ChevronRight size={12} aria-hidden />\n                </button>\n              )\n            }''',
    '''            trailing={\n              isMobile ? null : (\n                <div className="mr-1 hidden shrink-0 items-center gap-1 lg:flex">\n                  <button\n                    type="button"\n                    onClick={() => setInspectorDetached(!detached)}\n                    aria-label={detached\n                      ? "작업 패널을 오른쪽 패널에 붙이기"\n                      : "작업 패널을 창으로 분리"}\n                    aria-pressed={desktopDetached}\n                    className="inline-flex min-h-9 items-center gap-1 rounded px-2 text-[0.65rem] text-fg-3 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"\n                    title={detached ? "오른쪽 패널에 붙이기" : "자유 배치 창으로 분리"}\n                  >\n                    {detached ? <PanelRight size={12} aria-hidden /> : <Move size={12} aria-hidden />}\n                    {detached ? "붙이기" : "분리"}\n                  </button>\n                  <button\n                    type="button"\n                    onClick={() => setRightPanelOpen(false)}\n                    aria-label="작업 패널 접기"\n                    className="inline-flex min-h-9 items-center gap-0.5 rounded px-1.5 text-[0.65rem] text-fg-3 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"\n                    title="작업 패널 접기"\n                  >\n                    접기 <ChevronRight size={12} aria-hidden />\n                  </button>\n                </div>\n              )\n            }''',
)
replace_once(
    inspector_path,
    '''        </aside>\n  );\n}''',
    '''        </aside>\n    </StudioDetachablePanelSlot>\n  );\n}''',
)

brush_path = "src/domains/creator/brush/StudioBrushLibrarySheet.tsx"
replace_once(
    brush_path,
    '''import { planGlowBrushPasses, planNeonBrushPasses } from "../studio-fx-brush";\nimport { STUDIO_EASE, STUDIO_FOCUS_RING } from "../studio-panel-ui";''',
    '''import { planGlowBrushPasses, planNeonBrushPasses } from "../studio-fx-brush";\nimport { DEFAULT_STUDIO_BRUSH_CATALOG_FLOATING_LAYOUT } from "../studio-detachable-panels";\nimport { STUDIO_EASE, STUDIO_FOCUS_RING } from "../studio-panel-ui";\nimport { StudioFloatingSurface } from "../StudioFloatingSurface";\nimport { useStudioFloatingSurfaceLayout } from "../use-studio-floating-surface-layout";''',
)
replace_once(
    brush_path,
    '''  compact?: boolean;\n  triggerElement?: HTMLElement | null;''',
    '''  compact?: boolean;\n  embedded?: boolean;\n  closeOnSelection?: boolean;\n  dismissOnOutsidePointer?: boolean;\n  triggerElement?: HTMLElement | null;''',
)
replace_once(
    brush_path,
    '''  compact = false,\n  triggerElement = null,''',
    '''  compact = false,\n  embedded = false,\n  closeOnSelection = true,\n  dismissOnOutsidePointer = true,\n  triggerElement = null,''',
)
replace_once(
    brush_path,
    '''  useEffect(() => {\n    if (!open) return;\n    function onPointerDown(event: PointerEvent) {\n      if (!(event.target instanceof Node)) return;''',
    '''  useEffect(() => {\n    if (!open || !dismissOnOutsidePointer) return;\n    function onPointerDown(event: PointerEvent) {\n      if (!(event.target instanceof Node)) return;''',
)
replace_once(
    brush_path,
    '''  }, [open, onClose, triggerElement]);''',
    '''  }, [dismissOnOutsidePointer, open, onClose, triggerElement]);''',
)
replace_once(
    brush_path,
    '''      onClose("selection");''',
    '''      if (closeOnSelection) onClose("selection");''',
)
replace_once(
    brush_path,
    '''    <div\n      ref={rootRef}\n      role="dialog"\n      aria-labelledby={titleId}\n      aria-describedby={`${titleId}-description`}''',
    '''    <div\n      ref={rootRef}\n      role={embedded ? "region" : "dialog"}\n      aria-label={embedded\n        ? operation === "erase" ? "지우개 선택" : "브러시 전체 라이브러리"\n        : undefined}\n      aria-labelledby={embedded ? undefined : titleId}\n      aria-describedby={embedded ? undefined : `${titleId}-description`}''',
)
replace_once(
    brush_path,
    '''      className={cn(\n        "absolute left-2 top-[calc(100%+0.35rem)] z-[60] flex max-h-[min(32rem,calc(100dvh-1rem))] w-[min(22rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_16px_48px_oklch(0.12_0.02_70/0.55)]",\n        className\n      )}''',
    '''      className={cn(\n        embedded\n          ? "relative flex h-full max-h-none w-full flex-col overflow-hidden bg-panel"\n          : "absolute left-2 top-[calc(100%+0.35rem)] z-[60] flex max-h-[min(32rem,calc(100dvh-1rem))] w-[min(22rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_16px_48px_oklch(0.12_0.02_70/0.55)]",\n        className\n      )}''',
)
replace_once(
    brush_path,
    '''      <div\n        data-studio-brush-catalog-header="true"''',
    '''      {!embedded ? (\n      <div\n        data-studio-brush-catalog-header="true"''',
)
replace_once(
    brush_path,
    '''      </div>\n\n      <div\n        data-studio-brush-catalog-controls="true"''',
    '''      </div>\n      ) : null}\n\n      <div\n        data-studio-brush-catalog-controls="true"''',
)
replace_tail(
    brush_path,
    "export function StudioBrushCatalogPortal({",
    r'''export function StudioBrushCatalogPortal({
  open,
  placement,
  triggerElement,
  activeBrushId,
  operation = "paint",
  favoriteIds = [],
  recentIds = [],
  restoredView = null,
  onViewStateChange,
  mobileKeyboardInset = 0,
  onClose,
  onSelect,
  onToggleFavorite,
}: StudioBrushCatalogPortalProps): ReactElement | null {
  const desktop = placement === "desktop-dock";
  const { layout, setLayout, authority, failure } = useStudioFloatingSurfaceLayout({
    surfaceId: `brush-catalog:${operation}`,
    defaultLayout: DEFAULT_STUDIO_BRUSH_CATALOG_FLOATING_LAYOUT,
    enabled: open && desktop,
  });

  if (!open || !globalThis.document) return null;

  const safeMobileKeyboardInset = Number.isFinite(mobileKeyboardInset)
    ? Math.max(0, Math.round(mobileKeyboardInset))
    : 0;
  const mobileStyle: CSSProperties = {
    bottom: `calc(7.5rem + env(safe-area-inset-bottom) + ${safeMobileKeyboardInset}px)`,
  };
  const sheet = (
    <StudioBrushLibrarySheet
      open
      activeBrushId={activeBrushId}
      operation={operation}
      compact={!desktop && safeMobileKeyboardInset >= 80}
      embedded={desktop}
      closeOnSelection={!desktop}
      dismissOnOutsidePointer={!desktop}
      triggerElement={triggerElement}
      favoriteIds={favoriteIds}
      recentIds={recentIds}
      restoredView={restoredView}
      onViewStateChange={onViewStateChange}
      onClose={onClose}
      onSelect={onSelect}
      onToggleFavorite={onToggleFavorite}
      className={desktop
        ? "h-full w-full"
        : "fixed pointer-events-auto inset-x-2 top-3 w-auto max-h-[calc(100dvh-1.5rem)]"}
      style={desktop ? undefined : mobileStyle}
    />
  );

  return createPortal(
    desktop ? (
      <StudioFloatingSurface
        surfaceId={`brush-catalog:${operation}`}
        label={operation === "erase" ? "지우개 선택" : "브러시 전체 라이브러리"}
        layout={layout}
        defaultLayout={DEFAULT_STUDIO_BRUSH_CATALOG_FLOATING_LAYOUT}
        minWidth={360}
        minHeight={420}
        maxWidth={900}
        maxHeight={1_100}
        insetTop={76}
        insetRight={12}
        insetBottom={12}
        insetLeft={12}
        snapDistance={12}
        allowedDockEdges={["left", "right"]}
        onLayoutChange={setLayout}
        onClose={() => onClose("explicit")}
        rootDataAttributes={{
          "data-studio-brush-floating": operation,
          "data-studio-floating-layout-authority": authority,
          "data-studio-floating-layout-failure": failure ?? undefined,
        }}
        contentClassName="flex min-h-0 flex-1"
      >
        {sheet}
      </StudioFloatingSurface>
    ) : sheet,
    globalThis.document.body,
  );
}
''',
)

print("Applied Studio detachable panels wave 2")
