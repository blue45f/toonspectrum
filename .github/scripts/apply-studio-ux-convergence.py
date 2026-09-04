#!/usr/bin/env python3
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    content = read(path)
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one literal match, found {count}: {old[:90]!r}")
    write(path, content.replace(old, new, 1))


def regex_once(path: str, pattern: str, replacement: str) -> None:
    content = read(path)
    updated, count = re.subn(pattern, replacement, content, count=1, flags=re.DOTALL)
    if count != 1:
        raise RuntimeError(f"{path}: expected one regex match, found {count}: {pattern[:90]!r}")
    write(path, updated)


def replace_in_tree(root: str, old: str, new: str, suffixes: tuple[str, ...]) -> int:
    count = 0
    for path in (ROOT / root).rglob("*"):
        if not path.is_file() or not path.name.endswith(suffixes):
            continue
        content = path.read_text(encoding="utf-8")
        if old not in content:
            continue
        occurrences = content.count(old)
        path.write_text(content.replace(old, new), encoding="utf-8")
        count += occurrences
    return count


# ── Root shell preference contract + global keyboard navigation ───────────────
VIEW = "src/domains/creator/studio-cuttoon-editor/StudioCuttoonEditorView.tsx"
replace_once(
    VIEW,
    'import { StudioToolHintPreferencesProvider } from "../StudioToolHint";\n',
    'import { StudioToolHintPreferencesProvider } from "../StudioToolHint";\n'
    'import { StudioWorkspaceNavigator } from "../StudioWorkspaceNavigator";\n',
)
replace_once(
    VIEW,
    "    tool,\n    watermarkPreferenceSnapshot,\n",
    "    tool,\n    uiDensityMode,\n    watermarkPreferenceSnapshot,\n",
)
replace_once(
    VIEW,
    "    <div\n      ref={studioRootRef}\n      data-studio-mobile-immersive={mobileImmersive ? \"true\" : \"false\"}\n",
    "    <div\n      id=\"studio-app-shell\"\n      ref={studioRootRef}\n      data-studio-mobile-immersive={mobileImmersive ? \"true\" : \"false\"}\n"
    "      data-studio-ui-density={uiDensityMode}\n"
    "      data-studio-reduce-motion={appSettings.other.reduceMotion ? \"true\" : \"false\"}\n"
    "      data-studio-device-kind={isMobile ? \"mobile\" : \"desktop\"}\n",
)
replace_once(
    VIEW,
    "    >\n      <StudioCuttoonEditorHosts {...s} />\n",
    "    >\n      <StudioWorkspaceNavigator />\n      <StudioCuttoonEditorHosts {...s} />\n",
)

WORKSPACE = "src/domains/creator/studio-cuttoon-editor/StudioCuttoonEditorWorkspace.tsx"
replace_once(
    WORKSPACE,
    "  return (\n      <div\n        className={cn(\n",
    "  return (\n      <div\n        id=\"studio-workspace\"\n        role=\"group\"\n        aria-label=\"편집 작업공간\"\n        tabIndex={-1}\n        className={cn(\n",
)

CANVAS = "src/domains/creator/studio-cuttoon-editor/StudioCuttoonEditorCanvasColumn.tsx"
replace_once(
    CANVAS,
    "  return (\n      <div\n        className={cn(\n",
    "  return (\n      <div\n        id=\"studio-canvas-workspace\"\n        role=\"region\"\n        aria-label=\"캔버스 작업영역\"\n        tabIndex={-1}\n        className={cn(\n",
)

INSPECTOR = "src/domains/creator/StudioInspectorAsideShell.tsx"
replace_once(
    INSPECTOR,
    "        <aside\n          ref={propsSheetRef}\n          role={isMobile ? \"dialog\" : undefined}\n",
    "        <aside\n          id=\"studio-inspector\"\n          ref={propsSheetRef}\n          role={isMobile ? \"dialog\" : \"region\"}\n",
)
replace_once(
    INSPECTOR,
    "          aria-label={isMobile ? \"작업 패널\" : undefined}\n          tabIndex={isMobile ? -1 : undefined}\n",
    "          aria-label=\"작업 패널\"\n          tabIndex={-1}\n",
)

# ── Canonical focusable landmarks on shared chrome primitives ────────────────
CHROME = "src/domains/creator/studio-chrome-ui.tsx"
replace_once(
    CHROME,
    '''export function StudioToolBelt({
  children,
  className,
  inert,
  "aria-hidden": ariaHidden,
  "aria-label": ariaLabel = "스튜디오 도구",
}: {
  children: ReactNode;
  className?: string;
  inert?: boolean;
  "aria-hidden"?: boolean;
  "aria-label"?: string;
}): ReactElement {''',
    '''export function StudioToolBelt({
  children,
  className,
  id = "studio-tool-belt",
  inert,
  "aria-hidden": ariaHidden,
  "aria-label": ariaLabel = "스튜디오 도구",
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  inert?: boolean;
  "aria-hidden"?: boolean;
  "aria-label"?: string;
}): ReactElement {''',
)
replace_once(
    CHROME,
    '''    <div
      role="toolbar"
      aria-label={localizeStudioRailShellText(ariaLabel, lang, t)}
      aria-hidden={ariaHidden}
      inert={inert ? true : undefined}
      data-studio-tool-belt="true"''',
    '''    <div
      id={id}
      role="toolbar"
      tabIndex={-1}
      aria-label={localizeStudioRailShellText(ariaLabel, lang, t)}
      aria-hidden={ariaHidden}
      inert={inert ? true : undefined}
      data-studio-tool-belt="true"''',
)
replace_once(
    CHROME,
    '''export function StudioAppMenubar({
  children,
  className,
  "aria-label": ariaLabel = "문서 메뉴",
}: {
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}): ReactElement {''',
    '''export function StudioAppMenubar({
  children,
  className,
  id = "studio-menubar",
  "aria-label": ariaLabel = "문서 메뉴",
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  "aria-label"?: string;
}): ReactElement {''',
)
replace_once(
    CHROME,
    '''    <div
      role="banner"
      aria-label={ariaLabel}
      data-testid="studio-menubar"''',
    '''    <div
      id={id}
      role="banner"
      tabIndex={-1}
      aria-label={ariaLabel}
      data-testid="studio-menubar"''',
)
replace_once(
    CHROME,
    '''export function StudioVerticalToolRail({
  children,
  className,
  footer,
  "aria-label": ariaLabel = "그리기 도구",
}: {
  children: ReactNode;
  className?: string;
  footer?: ReactNode;
  "aria-label"?: string;
}): ReactElement {''',
    '''export function StudioVerticalToolRail({
  children,
  className,
  footer,
  id = "studio-tool-rail",
  "aria-label": ariaLabel = "그리기 도구",
}: {
  children: ReactNode;
  className?: string;
  footer?: ReactNode;
  id?: string;
  "aria-label"?: string;
}): ReactElement {''',
)
replace_once(
    CHROME,
    '''    <div
      role="toolbar"
      aria-orientation="vertical"
      aria-label={localizeStudioRailShellText(ariaLabel, lang, t)}
      data-studio-tool-rail="true"''',
    '''    <div
      id={id}
      role="toolbar"
      tabIndex={-1}
      aria-orientation="vertical"
      aria-label={localizeStudioRailShellText(ariaLabel, lang, t)}
      data-studio-tool-rail="true"''',
)
replace_once(
    CHROME,
    '''export function StudioStatusBar({
  children,
  className,
  style,
  "aria-label": ariaLabel = "캔버스 상태 및 보기",
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
}): ReactElement {''',
    '''export function StudioStatusBar({
  children,
  className,
  id = "studio-status-bar",
  style,
  "aria-label": ariaLabel = "캔버스 상태 및 보기",
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  style?: CSSProperties;
  "aria-label"?: string;
}): ReactElement {''',
)
replace_once(
    CHROME,
    '''    <div
      role="group"
      aria-label={ariaLabel}
      data-studio-status-bar="true"''',
    '''    <div
      id={id}
      role="group"
      tabIndex={-1}
      aria-label={ariaLabel}
      data-studio-status-bar="true"''',
)

# ── Shared empty/loading/error/blocked/success surface grammar ────────────────
PANEL_UI = "src/domains/creator/studio-panel-ui.tsx"
replace_once(
    PANEL_UI,
    'import type { KeyboardEvent, ReactElement, ReactNode } from "react";\n\nimport { cn } from "@/lib/utils";\n',
    'import type { KeyboardEvent, ReactElement, ReactNode } from "react";\n\n'
    'import { StudioSurfaceState } from "./StudioSurfaceState";\n\n'
    'import { cn } from "@/lib/utils";\n\n'
    'export { StudioSurfaceState };\n',
)
regex_once(
    PANEL_UI,
    r'/\*\* 빈 상태를 가르치는 UI — 아이콘 \+ 제목 \+ 한 줄 안내 \+ 선택 액션\. \*/\n'
    r'export function StudioEmptyState\(\{.*?\n\}\n\n(?=/\*\* 인스펙터/시트 상단 컨텍스트 칩)',
    '''/** 빈 상태를 가르치는 UI — 공통 상태 프리미티브의 호환 래퍼. */
export function StudioEmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}): ReactElement {
  return (
    <StudioSurfaceState
      state="empty"
      icon={icon}
      title={title}
      description={description}
      action={action}
      className={className}
    />
  );
}

''',
)

# ── Project Center: searchable, grouped and status-aware ─────────────────────
MENUBAR = "src/domains/creator/StudioMenubarContent.tsx"
replace_once(
    MENUBAR,
    'import { StudioProjectReviewActions } from "./StudioProjectReviewActions";\n',
    'import { StudioProjectCenterSearch, StudioProjectCenterSection } from "./StudioProjectCenterSearch";\n'
    'import { StudioProjectReviewActions } from "./StudioProjectReviewActions";\n',
)
replace_once(
    MENUBAR,
    'description: "백업·복구, 기획, 검토, 연재 운영과 게시 패키지 도구를 엽니다.",',
    'description: "백업, 기획, 버전, 검수와 게시 도구를 한곳에서 검색해 엽니다.",',
)
replace_once(
    MENUBAR,
    'className="fixed inset-x-2 top-12 z-[100] grid max-h-[calc(100dvh-4rem)] grid-cols-2 gap-1.5 overflow-y-auto overscroll-contain rounded-xl border border-line bg-panel p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-2xl [scrollbar-gutter:stable] sm:grid-cols-3 sm:inset-x-auto sm:right-3 sm:w-[min(36rem,calc(100vw-1.5rem))] [&>button]:min-h-11 [&>button]:justify-start [&>label]:min-h-11 [&>label]:justify-start"',
    'className="fixed inset-x-2 top-12 z-[100] grid max-h-[calc(100dvh-4rem)] grid-cols-2 gap-2 overflow-y-auto overscroll-contain rounded-2xl border border-line bg-panel/95 p-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl backdrop-blur-xl [scrollbar-gutter:stable] sm:grid-cols-3 sm:inset-x-auto sm:right-3 sm:w-[min(44rem,calc(100vw-1.5rem))] [&>button]:min-h-11 [&>button]:justify-start [&>label]:min-h-11 [&>label]:justify-start"',
)
regex_once(
    MENUBAR,
    r'                <div className="col-span-2 flex items-center justify-between gap-3 border-b border-line/60 px-2 py-2 sm:col-span-3">.*?\n                </div>\n          \{pageCount > 1 && \(',
    '''                <div className="sticky top-0 z-20 col-span-full -mx-2.5 -mt-2.5 border-b border-line/70 bg-panel/95 px-3 pb-3 pt-2.5 backdrop-blur-xl">
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block text-sm font-bold tracking-tight text-fg">프로젝트 센터</span>
                      <span className="mt-0.5 block text-[0.67rem] leading-relaxed text-fg-3">백업 · 기획 · 제작 · 검수 · 게시</span>
                    </span>
                    <button
                      type="button"
                      data-project-center-control="true"
                      onClick={() => setProjectActionsOpen(false)}
                      aria-label="프로젝트 센터 닫기"
                      className="grid size-11 shrink-0 place-items-center rounded-xl text-fg-3 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      <X size={17} aria-hidden />
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label="프로젝트 요약">
                    <span className="rounded-full border border-line/70 bg-canvas/55 px-2 py-1 text-[0.62rem] font-semibold tabular-nums text-fg-2">
                      페이지 {pageCount}
                    </span>
                    <span className="rounded-full border border-line/70 bg-canvas/55 px-2 py-1 text-[0.62rem] font-semibold text-fg-2">
                      {workId ? "게시 연결됨" : "로컬 초안"}
                    </span>
                    <span className="rounded-full border border-line/70 bg-canvas/55 px-2 py-1 text-[0.62rem] font-semibold text-fg-2">
                      {sharedDocument
                        ? sharedDocument.role === "owner"
                          ? "공유 · 소유자"
                          : sharedDocument.role === "editor"
                            ? "공유 · 편집자"
                            : "공유 · 보기"
                        : "개인 작업"}
                    </span>
                  </div>
                  <StudioProjectCenterSearch />
                </div>
                <StudioProjectCenterSection
                  title="내보내기 · 백업"
                  description="현재 페이지부터 전체 프로젝트, 장기 보관용 아카이브까지 관리합니다."
                />
          {pageCount > 1 && (''',
)
replace_once(
    MENUBAR,
    '''          <button
            type="button"
            onClick={() => setWriterRoomOpen(true)}''',
    '''          <StudioProjectCenterSection
            title="기획 · 제작"
            description="스토리, 캐릭터, 장면, 자동화와 2D·3D 제작 도구를 엽니다."
          />
          <button
            type="button"
            onClick={() => setWriterRoomOpen(true)}''',
)
replace_once(
    MENUBAR,
    '''          <button
            type="button"
            onClick={() => setSceneSnapshotOpen(true)}''',
    '''          <StudioProjectCenterSection
            title="버전 · 가져오기"
            description="복구 지점을 만들고 외부 문서와 프로젝트 백업을 안전하게 가져옵니다."
          />
          <button
            type="button"
            onClick={() => setSceneSnapshotOpen(true)}''',
)
replace_once(
    MENUBAR,
    '''          {sharedDocument?.role === "owner" || loadedWork ? (''',
    '''          <StudioProjectCenterSection
            title="연출 · 게시 · 검수"
            description="연출, 운영, 게시 패키지와 품질 검사를 출고 흐름으로 이어갑니다."
          />
          {sharedDocument?.role === "owner" || loadedWork ? (''',
)
replace_once(
    MENUBAR,
    '<Folder size={14} aria-hidden /> <span className="max-xl:sr-only">프로젝트</span>',
    '<Folder size={14} aria-hidden /> <span className="max-xl:sr-only">프로젝트 센터</span>',
)

# Canonical Korean terminology across runtime verifiers and tests. The command catalogue keeps
# the old term discoverable through its existing product/vendor aliases while the visible label converges.
renamed = 0
renamed += replace_in_tree("src/domains/creator", "프로젝트 작업", "프로젝트 센터", (".ts", ".tsx"))
renamed += replace_in_tree("scripts", "프로젝트 작업", "프로젝트 센터", (".ts", ".tsx", ".mts", ".mjs"))
renamed += replace_in_tree("src/domains/creator", "프로젝트 도구…", "프로젝트 센터…", (".ts", ".tsx"))
renamed += replace_in_tree("scripts", "프로젝트 도구…", "프로젝트 센터…", (".ts", ".tsx", ".mts", ".mjs"))
if renamed < 8:
    raise RuntimeError(f"project terminology convergence touched too few occurrences: {renamed}")

CATALOG = "src/domains/creator/studio-command-catalog.ts"
content = read(CATALOG)
content = content.replace('en("Project tools…")', 'en("Project center…")')
write(CATALOG, content)

VERIFY_MENUS = "scripts/verify-studio-menus.mts"
replace_once(
    VERIFY_MENUS,
    'expectVisible: ["파일 · 프로젝트", "백업 · 복구 · 검토 · 내보내기"],',
    'expectVisible: ["프로젝트 센터", "백업 · 기획 · 제작 · 검수 · 게시"],',
)

# ── Root-scoped visual/accessibility convergence layer ───────────────────────
GLOBALS = "src/styles/globals.css"
css = read(GLOBALS)
marker = "/* STUDIO_UX_CONVERGENCE_2026_09_05 */"
if marker in css:
    raise RuntimeError("globals.css convergence marker already exists")
css += r'''

/* STUDIO_UX_CONVERGENCE_2026_09_05 */
[data-studio-skip-nav="true"] {
  position: fixed;
  inset-block-start: max(0.5rem, env(safe-area-inset-top));
  inset-inline-start: max(0.5rem, env(safe-area-inset-left));
  z-index: 1000;
  max-inline-size: calc(100vw - 1rem);
  opacity: 0;
  pointer-events: none;
  transform: translateY(calc(-100% - 1rem));
  transition: opacity 120ms ease, transform 160ms cubic-bezier(0.16, 1, 0.3, 1);
}
[data-studio-skip-nav="true"]:focus-within {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}
[data-studio-skip-nav="true"] > div {
  display: flex;
  max-inline-size: min(46rem, calc(100vw - 1rem));
  gap: 0.25rem;
  overflow-x: auto;
  padding: 0.375rem;
  border: 1px solid var(--color-line, CanvasText);
  border-radius: 0.875rem;
  background: var(--color-panel, Canvas);
  box-shadow: 0 12px 34px oklch(0.08 0.01 70 / 0.45);
}
[data-studio-skip-link="true"] {
  min-block-size: 2.75rem;
  flex: 0 0 auto;
  border-radius: 0.625rem;
  padding-inline: 0.75rem;
  color: var(--color-fg, CanvasText);
  font-size: 0.75rem;
  font-weight: 700;
  white-space: nowrap;
}
[data-studio-skip-link="true"]:hover,
[data-studio-skip-link="true"]:focus-visible {
  background: var(--color-raised, Highlight);
  outline: 2px solid var(--color-accent, Highlight);
  outline-offset: 2px;
}
[data-studio-editor="true"] :is(
  #studio-menubar,
  #studio-tool-belt,
  #studio-tool-rail,
  #studio-canvas-workspace,
  #studio-inspector,
  #studio-status-bar
) {
  scroll-margin: 4rem 1rem;
}
[data-studio-editor="true"][data-studio-input-modality="keyboard"] :is(
  #studio-menubar,
  #studio-tool-belt,
  #studio-tool-rail,
  #studio-canvas-workspace,
  #studio-inspector,
  #studio-status-bar
):focus {
  outline: 2px solid var(--color-accent, Highlight);
  outline-offset: -2px;
}
[data-studio-editor="true"] :is(button, [role="button"], input, select, textarea) {
  touch-action: manipulation;
}
[data-studio-project-actions-menu="true"] [data-project-center-section="true"] {
  grid-column: 1 / -1;
}
[data-studio-project-actions-menu="true"] button[hidden] {
  display: none !important;
}
[data-studio-project-actions-menu="true"] button:not([data-project-center-control="true"]) {
  border: 1px solid transparent;
  border-radius: 0.75rem;
  transition: border-color 140ms ease, background-color 140ms ease, transform 140ms ease;
}
[data-studio-project-actions-menu="true"] button:not([data-project-center-control="true"]):hover {
  border-color: var(--color-line, CanvasText);
  transform: translateY(-1px);
}
[data-studio-project-actions-menu="true"] button:not([data-project-center-control="true"]):focus-visible {
  outline: 2px solid var(--color-accent, Highlight);
  outline-offset: 2px;
}
[data-studio-editor="true"][data-studio-reduce-motion="true"],
[data-studio-editor="true"][data-studio-reduce-motion="true"] * {
  scroll-behavior: auto !important;
  transition-duration: 0.001ms !important;
  animation-duration: 0.001ms !important;
  animation-iteration-count: 1 !important;
}
@media (prefers-reduced-motion: reduce) {
  [data-studio-skip-nav="true"] {
    transition: none;
  }
  [data-studio-project-actions-menu="true"] button:not([data-project-center-control="true"]) {
    transform: none !important;
  }
}
@media (forced-colors: active) {
  [data-studio-skip-nav="true"] > div,
  [data-studio-surface-state] {
    border: 1px solid CanvasText;
    forced-color-adjust: auto;
  }
  [data-studio-editor="true"] :focus-visible {
    outline: 2px solid Highlight !important;
    outline-offset: 2px;
  }
}
'''
write(GLOBALS, css)

print("Studio UX convergence patch applied successfully.")
