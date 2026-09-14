import {
  AppWindow,
  ArrowUpRight,
  Copy,
  ExternalLink,
  Grid2X2,
  Link2,
  MonitorUp,
  PanelsTopLeft,
  Radio,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

import {
  STUDIO_DOCUMENT_WORKSPACES,
  studioDocumentHref,
  studioDocumentWorkspaceById,
  type StudioDocumentRouteResolution,
  type StudioDocumentWorkspaceId,
} from "../studio-document-workspace";
import {
  openStudioDocumentWorkspace,
  type StudioDocumentWindowLaunchMode,
} from "../studio-document-window-launcher";
import type { StudioDocumentWindowPresence } from "../studio-document-window-coordination";
import { useStudioDocumentWindows } from "../studio-router/useStudioDocumentWindows";
import {
  STUDIO_DOCUMENT_WINDOW_PRESETS,
  studioRecommendedCompanionWorkspaces,
} from "./studio-document-window-presets";

const WORKSPACE_FAMILIES = [
  { id: "visual", ko: "그리기·이미지", en: "Drawing & image" },
  { id: "layout", ko: "디자인·발표", en: "Design & presentation" },
  { id: "story", ko: "스토리·콘티", en: "Story & storyboard" },
  { id: "spatial", ko: "3D", en: "3D" },
  { id: "time", ko: "애니메이션·오디오", en: "Animation & audio" },
  { id: "delivery", ko: "현지화·검토", en: "Localization & review" },
] as const;

type StudioDocumentResolution = Extract<
  StudioDocumentRouteResolution,
  { readonly kind: "document" }
>;

interface StudioDocumentWindowHubProps {
  readonly locale: "ko" | "en";
  readonly resolution: StudioDocumentResolution;
  readonly search: string;
  readonly quickMode: boolean;
  readonly onChangeWorkspace: (workspace: StudioDocumentWorkspaceId) => void;
  readonly onToggleQuickMode: () => void;
}

function workspaceLabel(workspace: StudioDocumentWorkspaceId, locale: "ko" | "en"): string {
  const definition = studioDocumentWorkspaceById(workspace);
  return locale === "ko" ? definition.labelKo : definition.labelEn;
}

function absoluteStudioHref(href: string): string {
  if (typeof window === "undefined") return href;
  try {
    return new URL(href, window.location.origin).toString();
  } catch {
    return href;
  }
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    if (typeof document === "undefined") return false;
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      textarea.remove();
    }
  }
}

function peerStatus(peer: StudioDocumentWindowPresence, locale: "ko" | "en"): string {
  if (peer.focused) return locale === "ko" ? "활성" : "Active";
  if (peer.visible) return locale === "ko" ? "표시 중" : "Visible";
  return locale === "ko" ? "백그라운드" : "Background";
}

function transportLabel(
  transport: "broadcast" | "storage" | "isolated",
  locale: "ko" | "en",
): string {
  if (transport === "broadcast") {
    return locale === "ko" ? "탭 자동 감지" : "Automatic tab discovery";
  }
  if (transport === "storage") {
    return locale === "ko" ? "호환 감지 모드" : "Compatibility discovery";
  }
  return locale === "ko" ? "현재 탭만 표시" : "This tab only";
}

const iconButtonClass = buttonClass({
  variant: "quiet",
  size: "icon",
  className: "shrink-0 rounded-xl",
});
export function StudioDocumentWindowHub({
  locale,
  resolution,
  search,
  quickMode,
  onChangeWorkspace,
  onToggleQuickMode,
}: StudioDocumentWindowHubProps) {
  const { snapshot, requestFocus } = useStudioDocumentWindows({
    documentKey: resolution.documentKey,
    workspace: resolution.workspace,
  });
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const shellRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const currentWorkspace = studioDocumentWorkspaceById(resolution.workspace);
  const recommended = studioRecommendedCompanionWorkspaces(resolution.workspace);
  const openCount = snapshot.peers.length + 1;

  const workspaceHref = (workspace: StudioDocumentWorkspaceId): string =>
    studioDocumentHref({
      projectId: resolution.projectId,
      documentId: resolution.documentId,
      draftId: resolution.draftId,
      workspace,
      focus: resolution.focus,
      language: resolution.language,
      version: resolution.version,
      search,
    });

  const openWorkspace = (
    workspace: StudioDocumentWorkspaceId,
    mode: StudioDocumentWindowLaunchMode,
    index = 0,
    total = 1,
  ): boolean => {
    const status = openStudioDocumentWorkspace({
      href: workspaceHref(workspace),
      documentKey: resolution.documentKey,
      workspace,
      mode,
      index,
      total,
    });
    const label = workspaceLabel(workspace, locale);
    setNotice(status === "opened"
      ? locale === "ko"
        ? `${label} 작업공간을 ${mode === "tab" ? "새 탭" : "독립 창"}으로 열었습니다.`
        : `Opened ${label} in a new ${mode}.`
      : locale === "ko"
        ? "브라우저가 새 창을 차단했습니다. 이 사이트의 팝업을 허용해 주세요."
        : "The browser blocked the new view. Allow pop-ups for this site.");
    return status === "opened";
  };
  const openPreset = (
    workspaces: readonly StudioDocumentWorkspaceId[],
    mode: StudioDocumentWindowLaunchMode,
  ): void => {
    const targets = workspaces.filter((workspace) => workspace !== resolution.workspace);
    let opened = 0;
    targets.forEach((workspace, index) => {
      const status = openStudioDocumentWorkspace({
        href: workspaceHref(workspace),
        documentKey: resolution.documentKey,
        workspace,
        mode,
        index,
        total: targets.length,
      });
      if (status === "opened") opened += 1;
    });
    setNotice(locale === "ko"
      ? opened === targets.length
        ? `${opened}개 보조 작업공간을 ${mode === "tab" ? "탭" : "타일 창"}으로 열었습니다.`
        : `${opened}/${targets.length}개를 열었습니다. 차단된 창은 팝업 허용 후 다시 시도해 주세요.`
      : opened === targets.length
        ? `Opened ${opened} companion workspaces as ${mode === "tab" ? "tabs" : "tiled windows"}.`
        : `Opened ${opened} of ${targets.length}. Allow pop-ups and try again.`);
  };

  const copyCurrentLink = async (): Promise<void> => {
    const copied = await copyText(absoluteStudioHref(workspaceHref(resolution.workspace)));
    setNotice(copied
      ? resolution.scope === "draft"
        ? locale === "ko"
          ? "초안 링크를 복사했습니다. 다른 브라우저에서 계속하려면 먼저 프로젝트에 저장하거나 협업 방을 연결해 주세요."
          : "Copied the draft link. Save it to a project or connect a collaboration room before continuing in another browser."
        : locale === "ko"
          ? "다른 브라우저에서 열 수 있는 현재 작업공간 링크를 복사했습니다."
          : "Copied a link that can be opened in another browser."
      : locale === "ko"
        ? "링크를 복사하지 못했습니다. 브라우저 클립보드 권한을 확인해 주세요."
        : "The link could not be copied. Check browser clipboard permission.");
  };

  const focusPeer = (peer: StudioDocumentWindowPresence): void => {
    const requested = requestFocus(peer.instanceId);
    const label = workspaceLabel(peer.workspace, locale);
    setNotice(requested
      ? locale === "ko"
        ? `${label} 탭으로 전환을 요청했습니다. 자동 전환이 막히면 ● 표시 탭을 선택하세요.`
        : `Requested ${label}. Select the tab marked ● if automatic focus is blocked.`
      : locale === "ko"
        ? "해당 탭이 이미 닫혔습니다. 창 목록을 갱신합니다."
        : "That tab has already closed. Refreshing the window list.");
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() === "m"
        && event.shiftKey
        && (event.metaKey || event.ctrlKey)
        && !event.altKey
      ) {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === "Escape" && open) {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      if (shellRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [open]);

  const activeWorkspaceCounts = new Map<StudioDocumentWorkspaceId, number>();
  activeWorkspaceCounts.set(resolution.workspace, 1);
  for (const peer of snapshot.peers) {
    activeWorkspaceCounts.set(peer.workspace, (activeWorkspaceCounts.get(peer.workspace) ?? 0) + 1);
  }

  return (
    <div
      ref={shellRef}
      data-studio-document-window-hub="true"
      data-studio-quick-mode={quickMode}
    >
      <div className="pointer-events-none fixed left-1/2 top-2 z-[121] w-[min(94vw,42rem)] -translate-x-1/2 print:hidden">
        <div className="pointer-events-auto flex min-h-11 items-center gap-1 rounded-2xl border border-line bg-card/95 p-1.5 shadow-lg backdrop-blur-xl">
          <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <PanelsTopLeft size={16} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <label htmlFor="studio-document-workspace" className="sr-only">
              {locale === "ko" ? "문서 작업공간" : "Document workspace"}
            </label>
            <select
              id="studio-document-workspace"
              aria-label={locale === "ko" ? "문서 작업공간" : "Document workspace"}
              className="min-h-8 w-full cursor-pointer rounded-xl border-0 bg-transparent px-2 text-sm font-black text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
              value={resolution.workspace}
              title={locale === "ko" ? currentWorkspace.descriptionKo : currentWorkspace.descriptionEn}
              onChange={(event) => onChangeWorkspace(event.target.value as StudioDocumentWorkspaceId)}
            >
              {WORKSPACE_FAMILIES.map((family) => (
                <optgroup key={family.id} label={locale === "ko" ? family.ko : family.en}>
                  {STUDIO_DOCUMENT_WORKSPACES
                    .filter((workspace) => workspace.family === family.id)
                    .map((workspace) => (
                      <option key={workspace.id} value={workspace.id}>
                        {locale === "ko" ? workspace.labelKo : workspace.labelEn}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
            <p className="hidden truncate px-2 text-[0.62rem] font-medium text-fg-3 sm:block">
              {locale === "ko" ? currentWorkspace.descriptionKo : currentWorkspace.descriptionEn}
            </p>
          </div>
          {resolution.workspace === "draw" ? (
            <button
              type="button"
              aria-pressed={quickMode}
              aria-label={quickMode
                ? locale === "ko" ? "일반 모드" : "Full mode"
                : locale === "ko" ? "퀵모드" : "Quick mode"}
              title={locale === "ko"
                ? "그림은 유지하고 패널 배치와 기본 도구만 바꿉니다."
                : "Keep the artwork and change only panel layout and the primary tool."}
              className={buttonClass({
                variant: quickMode ? "solid" : "quiet",
                size: "sm",
                className: "shrink-0 gap-1 rounded-xl px-2",
              })}
              onClick={onToggleQuickMode}
            >
              <Zap size={15} aria-hidden="true" />
              <span className="hidden sm:inline">
                {quickMode
                  ? locale === "ko" ? "일반 모드" : "Full mode"
                  : locale === "ko" ? "퀵모드" : "Quick mode"}
              </span>
            </button>
          ) : null}
          <button
            type="button"
            className={iconButtonClass}
            aria-label={locale === "ko" ? "현재 작업공간을 새 탭으로 열기" : "Open current workspace in a new tab"}
            title={locale === "ko" ? "새 탭" : "New tab"}
            onClick={() => openWorkspace(resolution.workspace, "tab")}
          >
            <ExternalLink size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={iconButtonClass}
            aria-label={locale === "ko" ? "현재 작업공간을 독립 창으로 열기" : "Open current workspace in a separate window"}
            title={locale === "ko" ? "독립 창" : "Separate window"}
            onClick={() => openWorkspace(resolution.workspace, "window")}
          >
            <AppWindow size={16} aria-hidden="true" />
          </button>
          <button
            ref={triggerRef}
            type="button"
            aria-controls={panelId}
            aria-expanded={open}
            aria-haspopup="dialog"
            className={buttonClass({
              variant: open ? "solid" : "outline",
              size: "sm",
              className: "shrink-0 gap-1.5 rounded-xl px-2.5",
            })}
            title={locale === "ko" ? "여러 창 작업공간 · ⌘/Ctrl+Shift+M" : "Multi-window workspace · ⌘/Ctrl+Shift+M"}
            onClick={() => setOpen((value) => !value)}
          >
            <MonitorUp size={16} aria-hidden="true" />
            <span className="tabular-nums">{openCount}</span>
            <span className="hidden md:inline">{locale === "ko" ? "창" : "views"}</span>
          </button>
        </div>
      </div>

      {open ? (
        <section
          id={panelId}
          role="dialog"
          aria-modal="false"
          aria-label={locale === "ko" ? "여러 창 작업공간" : "Multi-window workspace"}
          className="fixed bottom-3 left-1/2 top-[4.25rem] z-[122] flex w-[min(96vw,64rem)] -translate-x-1/2 flex-col overflow-hidden rounded-3xl border border-line bg-card/95 shadow-2xl backdrop-blur-xl print:hidden"
          data-studio-document-window-count={openCount}
        >
          <header className="flex shrink-0 items-start gap-3 border-b border-line bg-panel/80 p-4 sm:p-5">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
              <MonitorUp size={20} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-black text-fg sm:text-lg">
                {locale === "ko" ? "여러 창 작업공간" : "Multi-window workspace"}
              </h2>
              <p className="mt-1 max-w-3xl text-xs leading-relaxed text-fg-3 sm:text-sm">
                {locale === "ko"
                  ? "같은 문서를 역할별 탭과 창으로 나눕니다. 문서 저장·실시간 협업 권위는 기존 편집기 한곳을 그대로 사용합니다."
                  : "Split one document into role-specific tabs and windows while preserving the editor's existing save and collaboration authority."}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[0.65rem] font-bold text-fg-3">
                <span className="inline-flex items-center gap-1 rounded-full border border-line bg-card px-2 py-1">
                  <Radio size={11} aria-hidden="true" />
                  {transportLabel(snapshot.transport, locale)}
                </span>
                <span className="rounded-full border border-line bg-card px-2 py-1 tabular-nums">
                  {locale === "ko" ? `${openCount}개 열림` : `${openCount} open`}
                </span>
                <kbd className="rounded border border-line bg-card px-1.5 py-0.5 font-mono">⌘/Ctrl ⇧ M</kbd>
              </div>
            </div>
            <button
              type="button"
              className={iconButtonClass}
              aria-label={locale === "ko" ? "여러 창 작업공간 닫기" : "Close multi-window workspace"}
              onClick={() => {
                setOpen(false);
                triggerRef.current?.focus();
              }}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
            <p
              role="status"
              aria-live="polite"
              aria-atomic="true"
              className={cn(
                "mb-4 rounded-xl border px-3 py-2 text-xs leading-relaxed",
                notice
                  ? "border-accent/35 bg-accent-soft text-fg"
                  : "sr-only",
              )}
            >
              {notice}
            </p>

            <section aria-labelledby={`${panelId}-quick`}>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3 id={`${panelId}-quick`} className="text-sm font-black text-fg">
                    {locale === "ko" ? "빠른 보조 작업공간" : "Quick companion workspaces"}
                  </h3>
                  <p className="mt-1 text-xs text-fg-3">
                    {locale === "ko"
                      ? `${currentWorkspace.labelKo}와 함께 쓰기 좋은 화면을 바로 분리합니다.`
                      : `Open views that pair well with ${currentWorkspace.labelEn}.`}
                  </p>
                </div>
                <button
                  type="button"
                  className={buttonClass({ variant: "outline", size: "sm" })}
                  onClick={() => void copyCurrentLink()}
                >
                  <Copy size={14} aria-hidden="true" />
                  {locale === "ko" ? "다른 브라우저 링크 복사" : "Copy cross-browser link"}
                </button>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {recommended.map((workspace) => {
                  const definition = studioDocumentWorkspaceById(workspace);
                  return (
                    <div key={workspace} className="flex min-w-0 items-center gap-1 rounded-2xl border border-line bg-panel/60 p-1.5">
                      <button
                        type="button"
                        className="min-h-10 min-w-0 flex-1 rounded-xl px-3 text-left hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                        onClick={() => openWorkspace(workspace, "tab")}
                      >
                        <span className="block truncate text-xs font-black text-fg">
                          {locale === "ko" ? definition.labelKo : definition.labelEn}
                        </span>
                        <span className="block truncate text-[0.62rem] text-fg-3">
                          {locale === "ko" ? "새 탭으로 열기" : "Open in new tab"}
                        </span>
                      </button>
                      <button
                        type="button"
                        className={iconButtonClass}
                        aria-label={locale === "ko"
                          ? `${definition.labelKo} 독립 창으로 열기`
                          : `Open ${definition.labelEn} in a separate window`}
                        onClick={() => openWorkspace(workspace, "window")}
                      >
                        <AppWindow size={15} aria-hidden="true" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="mt-6" aria-labelledby={`${panelId}-open`}>
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h3 id={`${panelId}-open`} className="text-sm font-black text-fg">
                    {locale === "ko" ? "열린 창" : "Open views"}
                  </h3>
                  <p className="mt-1 text-xs text-fg-3">
                    {locale === "ko"
                      ? "같은 브라우저의 탭은 자동 감지합니다. 다른 브라우저는 위 링크로 연결하세요."
                      : "Tabs in this browser are discovered automatically. Use the link above for another browser."}
                  </p>
                </div>
                <span className="rounded-full bg-good/10 px-2.5 py-1 text-[0.68rem] font-black text-good tabular-nums">
                  {locale === "ko" ? `${openCount}개 연결` : `${openCount} connected`}
                </span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <article className="rounded-2xl border border-accent/40 bg-accent-soft/60 p-3" data-current-studio-window="true">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-black text-fg">
                      {workspaceLabel(snapshot.local.workspace, locale)}
                    </span>
                    <span className="rounded-full bg-accent px-2 py-0.5 text-[0.6rem] font-black text-on-accent">
                      {locale === "ko" ? "현재 탭" : "Current"}
                    </span>
                  </div>
                  <p className="mt-2 flex items-center gap-1.5 text-[0.66rem] font-bold text-fg-2">
                    <span className={cn(
                      "size-2 rounded-full",
                      snapshot.local.focused ? "bg-good" : "bg-accent",
                    )} aria-hidden="true" />
                    {snapshot.local.focused
                      ? locale === "ko" ? "활성" : "Active"
                      : locale === "ko" ? "현재 창" : "Current window"}
                  </p>
                </article>
                {snapshot.peers.map((peer) => (
                  <article key={peer.instanceId} className="rounded-2xl border border-line bg-panel/60 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-black text-fg">
                        {workspaceLabel(peer.workspace, locale)}
                      </span>
                      <span className={cn(
                        "rounded-full px-2 py-0.5 text-[0.6rem] font-black",
                        peer.focused
                          ? "bg-good/10 text-good"
                          : "bg-raised text-fg-3",
                      )}>
                        {peerStatus(peer, locale)}
                      </span>
                    </div>
                    <button
                      type="button"
                      className={buttonClass({
                        variant: "outline",
                        size: "sm",
                        className: "mt-2 w-full",
                      })}
                      onClick={() => focusPeer(peer)}
                    >
                      <ArrowUpRight size={14} aria-hidden="true" />
                      {locale === "ko" ? "이 탭으로 전환" : "Focus this tab"}
                    </button>
                  </article>
                ))}
              </div>
            </section>

            <section className="mt-6" aria-labelledby={`${panelId}-presets`}>
              <div>
                <h3 id={`${panelId}-presets`} className="text-sm font-black text-fg">
                  {locale === "ko" ? "제작 배치 한 번에 열기" : "Open a production layout"}
                </h3>
                <p className="mt-1 text-xs text-fg-3">
                  {locale === "ko"
                    ? "현재 작업공간은 유지하고 나머지 역할만 새 탭 또는 타일 창으로 엽니다."
                    : "Keep the current workspace and open only the remaining roles as tabs or tiled windows."}
                </p>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {STUDIO_DOCUMENT_WINDOW_PRESETS.map((preset) => (
                  <article key={preset.id} className="rounded-2xl border border-line bg-panel/55 p-3.5">
                    <div className="flex items-start gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-raised text-fg-2">
                        <Grid2X2 size={16} aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs font-black text-fg">
                          {locale === "ko" ? preset.labelKo : preset.labelEn}
                        </h4>
                        <p className="mt-1 text-[0.67rem] leading-relaxed text-fg-3">
                          {locale === "ko" ? preset.descriptionKo : preset.descriptionEn}
                        </p>
                        <p className="mt-2 truncate text-[0.62rem] font-bold text-fg-2">
                          {preset.workspaces.map((workspace) => workspaceLabel(workspace, locale)).join(" · ")}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        className={buttonClass({ variant: "outline", size: "sm" })}
                        onClick={() => openPreset(preset.workspaces, "tab")}
                      >
                        <ExternalLink size={14} aria-hidden="true" />
                        {locale === "ko" ? "탭 배치" : "Tabs"}
                      </button>
                      <button
                        type="button"
                        className={buttonClass({ variant: "outline", size: "sm" })}
                        onClick={() => openPreset(preset.workspaces, "window")}
                      >
                        <Grid2X2 size={14} aria-hidden="true" />
                        {locale === "ko" ? "타일 창" : "Tile windows"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="mt-6" aria-labelledby={`${panelId}-all`}>
              <h3 id={`${panelId}-all`} className="text-sm font-black text-fg">
                {locale === "ko" ? "모든 작업공간" : "All workspaces"}
              </h3>
              <p className="mt-1 text-xs text-fg-3">
                {locale === "ko"
                  ? "여기서 전환하거나 새 탭·독립 창으로 추가합니다. 이미 열린 탭은 바로 불러옵니다."
                  : "Switch here, add a tab or window, or focus an existing tab."}
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {STUDIO_DOCUMENT_WORKSPACES.map((workspace) => {
                  const count = activeWorkspaceCounts.get(workspace.id) ?? 0;
                  const openPeer = snapshot.peers.find((peer) => peer.workspace === workspace.id);
                  const current = workspace.id === resolution.workspace;
                  return (
                    <article
                      key={workspace.id}
                      className={cn(
                        "flex min-w-0 flex-col rounded-2xl border p-3",
                        current
                          ? "border-accent/45 bg-accent-soft/50"
                          : "border-line bg-panel/50",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="truncate text-xs font-black text-fg">
                          {locale === "ko" ? workspace.labelKo : workspace.labelEn}
                        </h4>
                        {count > 0 ? (
                          <span className="shrink-0 rounded-full bg-raised px-2 py-0.5 text-[0.58rem] font-black text-fg-2 tabular-nums">
                            {current
                              ? locale === "ko" ? "현재" : "Current"
                              : locale === "ko" ? `${count}개 열림` : `${count} open`}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 min-h-10 text-[0.65rem] leading-relaxed text-fg-3">
                        {locale === "ko" ? workspace.descriptionKo : workspace.descriptionEn}
                      </p>
                      <div className="mt-auto flex items-center gap-1 pt-3">
                        {openPeer ? (
                          <button
                            type="button"
                            className={buttonClass({
                              variant: "outline",
                              size: "sm",
                              className: "min-w-0 flex-1 px-2",
                            })}
                            onClick={() => focusPeer(openPeer)}
                          >
                            <ArrowUpRight size={13} aria-hidden="true" />
                            <span className="truncate">
                              {locale === "ko" ? "열린 탭" : "Open tab"}
                            </span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={current}
                            className={buttonClass({
                              variant: current ? "quiet" : "outline",
                              size: "sm",
                              className: "min-w-0 flex-1 px-2",
                            })}
                            onClick={() => {
                              onChangeWorkspace(workspace.id);
                              setOpen(false);
                            }}
                          >
                            <PanelsTopLeft size={13} aria-hidden="true" />
                            <span className="truncate">
                              {current
                                ? locale === "ko" ? "현재 화면" : "Current view"
                                : locale === "ko" ? "여기서 열기" : "Open here"}
                            </span>
                          </button>
                        )}
                        <button
                          type="button"
                          className={iconButtonClass}
                          aria-label={locale === "ko"
                            ? `${workspace.labelKo} 새 탭으로 열기`
                            : `Open ${workspace.labelEn} in a new tab`}
                          onClick={() => openWorkspace(workspace.id, "tab")}
                        >
                          <ExternalLink size={14} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className={iconButtonClass}
                          aria-label={locale === "ko"
                            ? `${workspace.labelKo} 독립 창으로 열기`
                            : `Open ${workspace.labelEn} in a separate window`}
                          onClick={() => openWorkspace(workspace.id, "window")}
                        >
                          <AppWindow size={14} aria-hidden="true" />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            <aside className="mt-6 flex items-start gap-2 rounded-2xl border border-line bg-panel/50 p-3 text-[0.68rem] leading-relaxed text-fg-3">
              <Link2 size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
              <p>
                {locale === "ko"
                  ? "창 목록 자동 감지는 같은 브라우저 프로필에서만 동작합니다. 다른 브라우저나 다른 기기에서는 링크를 사용하며, 문서 접근 권한과 실시간 협업 연결은 기존 보안 규칙을 그대로 적용합니다."
                  : "Automatic discovery works inside one browser profile. Use the link for another browser or device; existing document access and live collaboration rules still apply."}
              </p>
            </aside>
          </div>
        </section>
      ) : null}
    </div>
  );
}
