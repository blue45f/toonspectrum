import {
  Check,
  Eye,
  EyeOff,
  Focus,
  LayoutGrid,
  MessageCircle,
  MonitorCog,
  Move,
  PenTool,
  RotateCcw,
  Rows3,
  Save,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { STUDIO_FLOATING_MENU_LAYOUTS } from "../studio-floating-menu-layouts";
import {
  arrangeStudioFloatingSurfaces,
  requestStudioFloatingSurfaceLayoutReset,
} from "../studio-floating-surface-stack";
import {
  STUDIO_DESKTOP_FLOATING_QUERY,
  StudioDesktopFloatingSurface,
} from "../StudioDesktopFloatingSurface";
import { STUDIO_FOCUS_RING } from "../studio-panel-ui";
import {
  setStudioWorkspaceArranging,
  studioWorkspaceArrangingSnapshot,
  subscribeStudioWorkspaceArranging,
} from "../studio-workspace-arrangement";
import { useStudioShellFloatingLayout } from "./studio-shell-floating-layout-context";
import { StudioShellFloatingTarget } from "./StudioShellFloatingTarget";
import { STUDIO_SHELL_FLOATING_LAYOUT_OPEN_EVENT } from "./studio-shell-floating-layout-events";
import {
  STUDIO_SHELL_FLOATING_SURFACES,
  STUDIO_SHELL_FLOATING_VISIBILITY_IDS,
  type StudioShellFloatingPresetId,
  type StudioShellFloatingSurfaceId,
  type StudioShellFloatingVisibilityId,
} from "./studio-shell-floating-layout";

import { useMediaQuery } from "@/hooks/use-media-query";
import { Switch } from "@/shared/components/ui/switch";
import { cn } from "@/shared/lib/utils";

const PRESETS: readonly {
  readonly id: StudioShellFloatingPresetId;
  readonly label: string;
  readonly description: string;
}[] = [
  { id: "all", label: "전체", description: "모든 상시 플로팅 UI 표시" },
  { id: "canvas-focus", label: "캔버스 집중", description: "현재 설정을 보존한 임시 집중 보기" },
  { id: "production", label: "제작", description: "문서·오프라인 도구 중심" },
  { id: "collaboration", label: "협업", description: "채팅·통화 중심" },
];

const TOGGLE_DEFINITIONS = STUDIO_SHELL_FLOATING_VISIBILITY_IDS.map((id) => {
  const definition = STUDIO_SHELL_FLOATING_SURFACES.find(
    (surface) => surface.visibilityId === id && surface.id !== "document-tools-panel",
  );
  if (!definition) throw new Error(`Missing shell floating definition: ${id}`);
  return definition;
});

function surfaceIdsForVisibility(
  id: StudioShellFloatingVisibilityId,
): readonly StudioShellFloatingSurfaceId[] {
  return STUDIO_SHELL_FLOATING_SURFACES
    .filter((surface) => surface.visibilityId === id)
    .map((surface) => surface.id);
}

export function StudioShellFloatingLayoutManager() {
  const shell = useStudioShellFloatingLayout();
  const desktop = useMediaQuery(STUDIO_DESKTOP_FLOATING_QUERY);
  const arranging = useSyncExternalStore(
    subscribeStudioWorkspaceArranging,
    studioWorkspaceArrangingSnapshot,
    () => false,
  );
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const configuredVisibleCount = STUDIO_SHELL_FLOATING_VISIBILITY_IDS
    .filter(shell.isConfiguredVisible).length;
  const visibleCount = STUDIO_SHELL_FLOATING_VISIBILITY_IDS
    .filter(shell.isVisible).length;
  const mountedVisibilityCount = STUDIO_SHELL_FLOATING_VISIBILITY_IDS
    .filter((id) => surfaceIdsForVisibility(id).some(shell.isSurfaceMounted)).length;
  const drawingAutoHideRunning = shell.autoHideWhileDrawing
    && shell.drawingAutoHideActive;

  useEffect(() => {
    const openManager = (): void => setOpen(true);
    window.addEventListener(STUDIO_SHELL_FLOATING_LAYOUT_OPEN_EVENT, openManager);
    return () => window.removeEventListener(STUDIO_SHELL_FLOATING_LAYOUT_OPEN_EVENT, openManager);
  }, []);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent): void => {
      if (
        event.defaultPrevented
        || event.key.toLowerCase() !== "l"
        || !event.shiftKey
        || !(event.metaKey || event.ctrlKey)
      ) return;
      event.preventDefault();
      setOpen((value) => !value);
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLButtonElement>("button")?.focus({
      preventScroll: true,
    });
  }, [open]);

  useEffect(() => {
    if (!drawingAutoHideRunning || !open) return;
    setOpen(false);
  }, [drawingAutoHideRunning, open]);

  useEffect(() => {
    if (!shell.focusModeActive || !arranging) return;
    setStudioWorkspaceArranging(false);
  }, [arranging, shell.focusModeActive]);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      if (arranging) {
        setStudioWorkspaceArranging(false);
        setNotice("배치 편집을 완료했어요.");
        return;
      }
      setOpen(false);
      launcherRef.current?.focus({ preventScroll: true });
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [arranging, open]);

  const actionClass = cn(
    "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-line px-3",
    "pointer-coarse:min-h-11",
    "text-xs font-bold text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg",
    STUDIO_FOCUS_RING,
  );

  const resetAll = (): void => {
    shell.resetAllSurfaces();
    requestStudioFloatingSurfaceLayoutReset();
    setNotice("상시 플로팅 UI와 열린 작업 패널의 위치·크기·잠금을 기본값으로 복원했어요.");
  };

  const closeManager = (): void => {
    setOpen(false);
    launcherRef.current?.focus({ preventScroll: true });
  };

  const panel = (
    <div
      ref={panelRef}
      role={desktop ? undefined : "dialog"}
      aria-modal={desktop ? undefined : "false"}
      aria-label={desktop ? undefined : "보기 및 플로팅 UI 설정"}
      data-studio-shell-view-options-content="true"
      className={cn(
        "flex min-h-0 flex-col overflow-hidden",
        desktop
          ? "h-full"
          : "mb-2 max-h-[min(68dvh,40rem)] w-[min(28rem,calc(100vw-1.5rem))] rounded-2xl border border-line-strong bg-panel/98 shadow-2xl backdrop-blur-xl sm:max-h-[min(78dvh,46rem)]",
      )}
    >
            <header className="flex items-start gap-3 border-b border-line p-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                <MonitorCog size={18} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-black">{desktop ? "플로팅 UI 작업공간" : "보기 · 플로팅 UI"}</h2>
                <p className="mt-1 text-xs leading-5 text-fg-3">
                  표시 여부를 고르고, 배치 편집에서 화면을 보며 직접 이동·도킹·크기 조절할 수 있어요.
                </p>
              </div>
              {!desktop ? (
                <button
                  type="button"
                  aria-label="보기 설정 닫기"
                  className={cn(actionClass, "size-10 shrink-0 px-0 pointer-coarse:size-11")}
                  onClick={() => {
                    setOpen(false);
                    launcherRef.current?.focus({ preventScroll: true });
                  }}
                >
                  <X size={16} aria-hidden />
                </button>
              ) : null}
            </header>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-4">
              {shell.focusModeActive ? (
                <section
                  role="status"
                  data-studio-shell-focus-mode="true"
                  className="rounded-xl border border-accent/60 bg-accent-soft/35 p-3"
                >
                  <div className="flex items-start gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-raised text-accent">
                      <Focus size={16} aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-black text-fg">임시 캔버스 집중 보기</p>
                      <p className="mt-1 text-[0.68rem] leading-5 text-fg-3">
                        기존 표시 설정은 그대로 보관했습니다. 복원하면 집중 보기 전 구성으로 즉시 돌아갑니다.
                      </p>
                    </div>
                    <button
                      type="button"
                      className={cn(actionClass, "min-h-8 shrink-0 px-2")}
                      onClick={() => {
                        shell.exitFocusMode();
                        setNotice("집중 보기 전 플로팅 UI 구성을 복원했어요.");
                      }}
                    >
                      원래 보기
                    </button>
                  </div>
                </section>
              ) : null}

              <section aria-labelledby="studio-shell-floating-visibility-heading">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 id="studio-shell-floating-visibility-heading" className="text-xs font-black">
                      화면에 보이는 요소
                    </h3>
                    <p className="mt-1 text-[0.68rem] text-fg-3">
                      설정 {configuredVisibleCount}/{STUDIO_SHELL_FLOATING_VISIBILITY_IDS.length} · 현재 보기 {visibleCount} · 이 화면에서 사용 가능 {mountedVisibilityCount}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1 sm:justify-end">
                    <button
                      type="button"
                      className={cn(actionClass, "min-h-8 px-2")}
                      onClick={() => {
                        shell.showAll();
                        setNotice("모든 상시 플로팅 UI를 표시했어요.");
                      }}
                    >
                      <Eye size={13} aria-hidden />모두 표시
                    </button>
                    <button
                      type="button"
                      className={cn(actionClass, "min-h-8 px-2")}
                      onClick={() => {
                        shell.hideAll();
                        setNotice("상시 플로팅 UI를 숨겼어요. 이 보기 버튼은 항상 남아 복구할 수 있어요.");
                      }}
                    >
                      <EyeOff size={13} aria-hidden />모두 숨김
                    </button>
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  {TOGGLE_DEFINITIONS.map((definition) => {
                    const checked = shell.isConfiguredVisible(definition.visibilityId);
                    const surfaceIds = surfaceIdsForVisibility(definition.visibilityId);
                    const mountedCount = surfaceIds.filter(shell.isSurfaceMounted).length;
                    const availabilityLabel = mountedCount === 0
                      ? "현재 화면에 없음"
                      : mountedCount === surfaceIds.length
                        ? surfaceIds.length === 1 ? "현재 사용 가능" : "모두 사용 가능"
                        : `${mountedCount}/${surfaceIds.length} 현재 사용 가능`;
                    return (
                      <div
                        key={definition.id}
                        className="rounded-xl border border-line bg-card p-3 transition-colors hover:border-line-strong"
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-black text-fg">{definition.label}</p>
                            <p className="mt-1 text-[0.68rem] leading-5 text-fg-3">
                              {definition.description}
                            </p>
                            {definition.safetyBehavior ? (
                              <p className="mt-1 text-[0.65rem] leading-5 text-accent">
                                {definition.safetyBehavior}
                              </p>
                            ) : null}
                          </div>
                          <Switch
                            checked={checked}
                            aria-label={checked
                              ? `${definition.label} 숨기기`
                              : `${definition.label} 표시하기`}
                            onCheckedChange={() => {
                              shell.toggleVisible(definition.visibilityId);
                              setNotice(checked
                                ? `${definition.label}을 숨겼어요.`
                                : `${definition.label}을 표시하도록 설정했어요.`);
                            }}
                          />
                        </div>
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-line/70 pt-2">
                          <span
                            data-studio-shell-mounted-state={mountedCount > 0 ? "available" : "unavailable"}
                            className={cn(
                              "inline-flex min-h-6 items-center rounded-full border px-2 text-[0.62rem] font-bold",
                              mountedCount > 0
                                ? "border-success/30 bg-success-soft/20 text-success"
                                : "border-line bg-raised text-fg-3",
                            )}
                          >
                            {availabilityLabel}
                          </span>
                          <button
                            type="button"
                            aria-label={`${definition.label} 위치를 기본값으로 복원`}
                            className={cn(actionClass, "min-h-8 shrink-0 px-2")}
                            onClick={() => {
                              for (const id of surfaceIds) {
                                shell.resetSurface(id);
                              }
                              setNotice(`${definition.label} 위치를 기본값으로 복원했어요.`);
                            }}
                          >
                            <RotateCcw size={13} aria-hidden />위치 초기화
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section aria-labelledby="studio-shell-floating-presets-heading">
                <h3 id="studio-shell-floating-presets-heading" className="text-xs font-black">
                  빠른 보기 프리셋
                </h3>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      aria-pressed={preset.id === "canvas-focus"
                        ? shell.focusModeActive
                        : undefined}
                      className={cn(
                        actionClass,
                        "h-auto min-h-12 flex-col items-start px-3 py-2 text-left",
                        preset.id === "canvas-focus"
                          && shell.focusModeActive
                          && "border-accent bg-accent-soft text-accent",
                      )}
                      onClick={() => {
                        if (preset.id === "canvas-focus") {
                          if (shell.focusModeActive) {
                            shell.exitFocusMode();
                            setNotice("집중 보기 전 플로팅 UI 구성을 복원했어요.");
                          } else {
                            setStudioWorkspaceArranging(false);
                            shell.enterFocusMode();
                            setNotice("기존 설정을 보존하고 임시 캔버스 집중 보기를 시작했어요.");
                          }
                          return;
                        }
                        shell.applyPreset(preset.id);
                        setNotice(`${preset.label} 보기로 전환했어요.`);
                      }}
                    >
                      <span className="text-xs text-fg">
                        {preset.id === "canvas-focus" && shell.focusModeActive
                          ? "집중 보기 해제"
                          : preset.label}
                      </span>
                      <span className="text-[0.62rem] font-medium text-fg-3">
                        {preset.id === "canvas-focus" && shell.focusModeActive
                          ? "집중 보기 전 설정으로 복원"
                          : preset.description}
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              <section aria-labelledby="studio-shell-floating-auto-hide-heading">
                <h3 id="studio-shell-floating-auto-hide-heading" className="text-xs font-black">
                  드로잉 방해 최소화
                </h3>
                <button
                  type="button"
                  role="switch"
                  aria-checked={shell.autoHideWhileDrawing}
                  className={cn(
                    "mt-2 flex w-full items-start gap-3 rounded-xl border p-3 text-left",
                    shell.autoHideWhileDrawing
                      ? "border-accent/60 bg-accent-soft/35"
                      : "border-line bg-card",
                    STUDIO_FOCUS_RING,
                  )}
                  onClick={() => {
                    shell.setAutoHideWhileDrawing(!shell.autoHideWhileDrawing);
                    setNotice(shell.autoHideWhileDrawing
                      ? "펜 드로잉 자동 숨김을 껐어요."
                      : "펜으로 그리는 동안 플로팅 UI를 자동으로 숨깁니다.");
                  }}
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-raised text-accent">
                    <PenTool size={16} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-black text-fg">
                      펜으로 그리는 동안 자동 숨김
                    </span>
                    <span className="mt-1 block text-[0.68rem] leading-5 text-fg-3">
                      캔버스에서 펜 스트로크가 시작되면 상시 플로팅 UI와 보기 버튼을 잠시 숨기고, 마지막 스트로크가 끝난 뒤 자동으로 복원합니다.
                    </span>
                    <span className="mt-1 block text-[0.65rem] leading-5 text-accent">
                      저장 오류·오프라인 경고·참여 중인 통화처럼 안전상 필요한 제어는 계속 표시됩니다.
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-raised px-2 py-1 text-[0.65rem] font-black text-fg-2">
                    {shell.autoHideWhileDrawing ? "켜짐" : "꺼짐"}
                  </span>
                </button>
              </section>

              <section aria-labelledby="studio-shell-floating-arrangement-heading">
                <h3 id="studio-shell-floating-arrangement-heading" className="text-xs font-black">
                  위지윅 배치 편집
                </h3>
                <p className="mt-1 text-[0.68rem] leading-5 text-fg-3">
                  웹툰 원고 도구 패널은 열어 둔 상태에서 이동·크기 조절할 수 있습니다. 플랫폼 규격은 기존 작업 패널과 함께 분리·도킹할 수 있습니다.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    aria-pressed={arranging}
                    className={cn(
                      actionClass,
                      arranging && "border-accent bg-accent-soft text-accent",
                    )}
                    onClick={() => {
                      if (!arranging) shell.exitFocusMode();
                      setStudioWorkspaceArranging(!arranging);
                      setNotice(arranging
                        ? "배치 편집을 완료했어요."
                        : "집중 보기를 해제하고 이동 손잡이를 표시했어요. 요소를 직접 끌어 배치하세요.");
                    }}
                  >
                    {arranging
                      ? <Check size={15} aria-hidden />
                      : <Move size={15} aria-hidden />}
                    {arranging ? "배치 완료" : "배치 편집"}
                  </button>
                  <button
                    type="button"
                    className={actionClass}
                    onClick={() => {
                      arrangeStudioFloatingSurfaces("edges");
                      setNotice("열린 플로팅 UI를 화면 가장자리에 정렬했어요.");
                    }}
                  >
                    <Rows3 size={15} aria-hidden />가장자리 정렬
                  </button>
                  <button
                    type="button"
                    className={actionClass}
                    onClick={() => {
                      arrangeStudioFloatingSurfaces("cascade");
                      setNotice("열린 플로팅 UI를 계단식으로 정렬했어요.");
                    }}
                  >
                    <LayoutGrid size={15} aria-hidden />계단식 정렬
                  </button>
                  <button type="button" className={actionClass} onClick={resetAll}>
                    <RotateCcw size={15} aria-hidden />전체 위치 복원
                  </button>
                </div>
              </section>

              <section className="rounded-xl border border-line bg-raised/50 p-3 text-[0.68rem] leading-5 text-fg-3">
                <p className="font-bold text-fg-2">전수 조사 적용 범위</p>
                <p className="mt-1">
                  새 통합 대상: 작업공간 바, 문서 도구/웹툰 원고 도구, 저장 상태, 그리기 옵션, 펜 입력 센터, 오프라인 상태, 채팅·통화, 배치 편집 도구.
                </p>
                <p className="mt-1">
                  기존 배치 대상 유지: 페이지, 그리기 도구, 작업 패널/플랫폼 규격, 레이어, Navigator, 레퍼런스, 드로잉 팔레트와 기타 분리 창.
                </p>
                <p className="mt-1">
                  제외: 확인 모달, 오류 복구, 토스트, 로딩, 권한·보안 안내처럼 숨기면 작업을 막거나 안전성이 떨어지는 일시 UI.
                </p>
              </section>
            </div>

            <footer className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-[0.65rem] text-fg-3">
              <span>
                {shell.authority === "sqlite-opfs"
                  ? "이 기기에 배치·표시 설정 저장됨"
                  : shell.authority === "checking"
                    ? "설정 저장소 확인 중"
                    : "현재 탭에 설정 유지"}
              </span>
              <span className="inline-flex items-center gap-1">
                <Save size={12} aria-hidden />⌘/Ctrl + Shift + L
              </span>
            </footer>
            <p
              role="status"
              aria-live="polite"
              className={cn("border-t border-line px-4 py-2 text-[0.68rem] text-accent", !notice && "sr-only")}
            >
              {notice}
            </p>
          </div>
  );

  return (
    <>
      <style>{`
        [data-studio-shell-layout-hidden="true"]{display:none!important}
        [data-studio-shell-drawing-auto-hidden="true"]{opacity:0!important;pointer-events:none!important;visibility:hidden!important}
      `}</style>
      {STUDIO_SHELL_FLOATING_SURFACES.map((definition) => (
        <StudioShellFloatingTarget
          key={definition.id}
          surfaceId={definition.id}
        />
      ))}

      {open && desktop ? (
        <StudioDesktopFloatingSurface
          surfaceId="shell-floating-layout-manager"
          label="보기 · 플로팅 UI"
          defaultLayout={STUDIO_FLOATING_MENU_LAYOUTS.viewOptions}
          onClose={closeManager}
          minWidth={440}
          minHeight={480}
          maxWidth={760}
          maxHeight={900}
          insetTop={64}
          zIndexFloor={70}
          contentClassName="overflow-hidden"
          participatesInWorkspaceArrangement={false}
          rootDataAttributes={{
            "data-studio-shell-view-options-panel": "true",
            "data-studio-shortcut-boundary": "true",
          }}
        >
          {panel}
        </StudioDesktopFloatingSurface>
      ) : null}

      <div
        data-studio-shell-view-options="true"
        data-studio-shell-drawing-auto-hide-active={drawingAutoHideRunning ? "true" : "false"}
        aria-hidden={drawingAutoHideRunning ? true : undefined}
        inert={drawingAutoHideRunning ? true : undefined}
        className={cn(
          "pointer-events-auto fixed bottom-[calc(var(--studio-canvas-bottom-inset,0px)+0.75rem)] left-3 z-[70] max-w-[calc(100vw-1.5rem)] text-fg print:hidden lg:bottom-3",
          "transition-[opacity,transform] duration-150 motion-reduce:transition-none",
          drawingAutoHideRunning && "pointer-events-none translate-y-2 opacity-0",
        )}
      >
        {open && !desktop ? panel : null}

        <button
          ref={launcherRef}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-keyshortcuts="Control+Shift+L Meta+Shift+L"
          className={cn(
            "flex min-h-11 items-center gap-2 rounded-full border border-line-strong bg-panel/95 px-4",
            "text-xs font-black text-fg shadow-xl backdrop-blur hover:bg-raised",
            (arranging || shell.focusModeActive) && "border-accent bg-accent-soft text-accent",
            STUDIO_FOCUS_RING,
          )}
          onClick={() => setOpen((value) => !value)}
        >
          {arranging
            ? <Move size={16} aria-hidden />
            : shell.focusModeActive
              ? <Focus size={16} aria-hidden />
              : <SlidersHorizontal size={16} aria-hidden />}
          {arranging ? "배치 편집 중" : shell.focusModeActive ? "집중 보기" : "보기 설정"}
          <span
            className="rounded-full bg-raised px-1.5 py-0.5 text-[0.62rem] text-fg-3"
            aria-label={`현재 플로팅 UI ${visibleCount}개 표시`}
          >
            {visibleCount}개
          </span>
          {shell.failure ? (
            <MessageCircle size={13} aria-label="설정 저장 제한" />
          ) : null}
        </button>
      </div>
    </>
  );
}
