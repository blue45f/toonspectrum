import {
  Check,
  Eye,
  EyeOff,
  LayoutGrid,
  MessageCircle,
  MonitorCog,
  Move,
  RotateCcw,
  Rows3,
  Save,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  arrangeStudioFloatingSurfaces,
  requestStudioFloatingSurfaceLayoutReset,
} from "../studio-floating-surface-stack";
import {
  STUDIO_STROKE_FOCUS_SETTLE_MS,
  studioStrokeFocusActivitySnapshot,
  subscribeStudioStrokeFocusActivity,
} from "../studio-stroke-focus-activity";
import { STUDIO_FOCUS_RING } from "../studio-panel-ui";
import {
  setStudioWorkspaceArranging,
  studioWorkspaceArrangingSnapshot,
  subscribeStudioWorkspaceArranging,
} from "../studio-workspace-arrangement";
import { useStudioShellFloatingLayout } from "./studio-shell-floating-layout-context";
import { StudioShellFloatingTarget } from "./StudioShellFloatingTarget";
import {
  STUDIO_SHELL_FLOATING_SURFACES,
  STUDIO_SHELL_FLOATING_VISIBILITY_IDS,
  type StudioShellFloatingPresetId,
  type StudioShellFloatingSurfaceId,
  type StudioShellFloatingVisibilityId,
} from "./studio-shell-floating-layout";

import { cn } from "@/shared/lib/utils";

const STUDIO_SHELL_FLOATING_LAYOUT_OPEN_EVENT =
  "toonspectrum:studio-shell-floating-layout-open";

const PRESETS: readonly {
  readonly id: StudioShellFloatingPresetId;
  readonly label: string;
  readonly description: string;
}[] = [
  { id: "all", label: "전체", description: "모든 상시 플로팅 UI 표시" },
  { id: "canvas-focus", label: "캔버스 집중", description: "작업공간 바만 남김" },
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

function resetIdsForVisibility(
  id: StudioShellFloatingVisibilityId,
): readonly StudioShellFloatingSurfaceId[] {
  switch (id) {
    case "document-tools":
      return ["document-tools", "document-tools-panel"];
    case "drawing-input":
      return ["drawing-input", "drawing-input-panel"];
    default:
      return [id];
  }
}

export function StudioShellFloatingLayoutManager() {
  const shell = useStudioShellFloatingLayout();
  const arranging = useSyncExternalStore(
    subscribeStudioWorkspaceArranging,
    studioWorkspaceArrangingSnapshot,
    () => false,
  );
  const strokeFocusPhase = useSyncExternalStore(
    subscribeStudioStrokeFocusActivity,
    studioStrokeFocusActivitySnapshot,
    () => "idle",
  );
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const visibleCount = useMemo(
    () => STUDIO_SHELL_FLOATING_VISIBILITY_IDS.filter(shell.isVisible).length,
    [shell],
  );

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
    if (strokeFocusPhase !== "drawing") return;
    setOpen(false);
    if (typeof document === "undefined") return;
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && focused.closest('[data-studio-shell-layout-managed="true"], [data-studio-shell-view-options="true"]')) {
      focused.blur();
    }
  }, [strokeFocusPhase]);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLButtonElement>("button")?.focus({
      preventScroll: true,
    });
  }, [open]);

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
    "text-xs font-bold text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg",
    STUDIO_FOCUS_RING,
  );

  const resetAll = (): void => {
    shell.resetAllSurfaces();
    requestStudioFloatingSurfaceLayoutReset();
    setNotice("상시 플로팅 UI와 열린 작업 패널의 위치·크기·잠금을 기본값으로 복원했어요.");
  };

  return (
    <>
      <style>{`
[data-studio-shell-layout-hidden="true"]{display:none!important}
html[data-studio-shell-stroke-auto-hide="true"]:is([data-studio-stroke-focus-phase="drawing"],[data-studio-stroke-focus-phase="settling"]) [data-studio-shell-layout-managed="true"]:not([data-studio-shell-force-visible="true"]),
html[data-studio-shell-stroke-auto-hide="true"]:is([data-studio-stroke-focus-phase="drawing"],[data-studio-stroke-focus-phase="settling"]) [data-studio-shell-view-options="true"]:not([data-studio-shell-force-visible="true"]){opacity:0!important;visibility:hidden!important;pointer-events:none!important}
      `}</style>
      {STUDIO_SHELL_FLOATING_SURFACES.map((definition) => (
        <StudioShellFloatingTarget
          key={definition.id}
          surfaceId={definition.id}
        />
      ))}

      <div
        data-studio-shell-view-options="true"
        data-studio-shell-force-visible={arranging ? "true" : undefined}
        className="pointer-events-auto fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-3 z-[70] max-w-[calc(100vw-1.5rem)] text-fg print:hidden"
      >
        {open ? (
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="false"
            aria-label="보기 및 플로팅 UI 설정"
            className="mb-2 flex max-h-[min(78dvh,46rem)] w-[min(28rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-line-strong bg-panel/98 shadow-2xl backdrop-blur-xl"
          >
            <header className="flex items-start gap-3 border-b border-line p-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                <MonitorCog size={18} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-black">보기 · 플로팅 UI</h2>
                <p className="mt-1 text-xs leading-5 text-fg-3">
                  표시 여부를 고르고, 배치 편집에서 화면을 보며 직접 이동·도킹·크기 조절할 수 있어요.
                </p>
              </div>
              <button
                type="button"
                aria-label="보기 설정 닫기"
                className={cn(actionClass, "size-10 shrink-0 px-0")}
                onClick={() => {
                  setOpen(false);
                  launcherRef.current?.focus({ preventScroll: true });
                }}
              >
                <X size={16} aria-hidden />
              </button>
            </header>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-4">
              <section aria-labelledby="studio-shell-floating-visibility-heading">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 id="studio-shell-floating-visibility-heading" className="text-xs font-black">
                      화면에 보이는 요소
                    </h3>
                    <p className="mt-1 text-[0.68rem] text-fg-3">
                      설정상 {visibleCount}/{STUDIO_SHELL_FLOATING_VISIBILITY_IDS.length}개 표시
                    </p>
                  </div>
                  <div className="flex gap-1">
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
                    const checked = shell.isVisible(definition.visibilityId);
                    return (
                      <div
                        key={definition.id}
                        className="rounded-xl border border-line bg-card p-3"
                      >
                        <div className="flex items-start gap-3">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={checked}
                            className={cn(
                              "relative mt-0.5 h-7 w-12 shrink-0 rounded-full border transition-colors",
                              checked
                                ? "border-accent bg-accent"
                                : "border-line-strong bg-raised",
                              STUDIO_FOCUS_RING,
                            )}
                            onClick={() => shell.toggleVisible(definition.visibilityId)}
                          >
                            <span
                              aria-hidden="true"
                              className={cn(
                                "absolute top-1 size-5 rounded-full bg-white shadow transition-transform",
                                checked ? "translate-x-6" : "translate-x-1",
                              )}
                            />
                            <span className="sr-only">
                              {checked ? `${definition.label} 숨기기` : `${definition.label} 표시하기`}
                            </span>
                          </button>
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
                          <button
                            type="button"
                            className={cn(actionClass, "min-h-8 shrink-0 px-2")}
                            onClick={() => {
                              for (const id of resetIdsForVisibility(definition.visibilityId)) {
                                shell.resetSurface(id);
                              }
                              setNotice(`${definition.label} 위치를 기본값으로 복원했어요.`);
                            }}
                          >
                            <RotateCcw size={13} aria-hidden />위치
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
                      className={cn(actionClass, "h-auto min-h-12 flex-col items-start px-3 py-2 text-left")}
                      onClick={() => {
                        shell.applyPreset(preset.id);
                        setNotice(`${preset.label} 보기로 전환했어요.`);
                      }}
                    >
                      <span className="text-xs text-fg">{preset.label}</span>
                      <span className="text-[0.62rem] font-medium text-fg-3">
                        {preset.description}
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              <section
                aria-labelledby="studio-shell-stroke-focus-heading"
                className="rounded-xl border border-line bg-card p-3"
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 id="studio-shell-stroke-focus-heading" className="text-xs font-black">
                      획을 그리는 동안 화면 비우기
                    </h3>
                    <p className="mt-1 text-[0.68rem] leading-5 text-fg-3">
                      실제 획이 시작되면 비필수 플로팅 UI를 즉시 숨기고, 마지막 획이 끝난 뒤 {STUDIO_STROKE_FOCUS_SETTLE_MS}ms 후 복원합니다. 저장 경고·오프라인 위험·참여 중인 통화·배치 편집은 계속 표시됩니다.
                    </p>
                    <p className="mt-1 text-[0.65rem] font-bold text-accent" aria-live="polite">
                      {!shell.visibility.autoHideDuringStroke
                        ? "자동 집중 꺼짐"
                        : strokeFocusPhase === "drawing"
                          ? "현재 획 입력 중 · 비필수 UI 숨김"
                          : strokeFocusPhase === "settling"
                            ? "연속 획 대기 · UI 복원 보류"
                            : "자동 집중 대기 중"}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={shell.visibility.autoHideDuringStroke}
                    className={cn(
                      "relative mt-0.5 h-7 w-12 shrink-0 rounded-full border transition-colors",
                      shell.visibility.autoHideDuringStroke
                        ? "border-accent bg-accent"
                        : "border-line-strong bg-raised",
                      STUDIO_FOCUS_RING,
                    )}
                    onClick={() => {
                      const enabled = !shell.visibility.autoHideDuringStroke;
                      shell.setAutoHideDuringStroke(enabled);
                      setNotice(enabled
                        ? "드로잉 중 자동 집중을 켰어요."
                        : "드로잉 중 자동 집중을 껐어요.");
                    }}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute top-1 size-5 rounded-full bg-white shadow transition-transform",
                        shell.visibility.autoHideDuringStroke ? "translate-x-6" : "translate-x-1",
                      )}
                    />
                    <span className="sr-only">
                      {shell.visibility.autoHideDuringStroke
                        ? "드로잉 중 자동 집중 끄기"
                        : "드로잉 중 자동 집중 켜기"}
                    </span>
                  </button>
                </div>
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
                      setStudioWorkspaceArranging(!arranging);
                      setNotice(arranging
                        ? "배치 편집을 완료했어요."
                        : "이동 손잡이가 표시됐어요. 요소를 직접 끌어 배치하세요.");
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
        ) : null}

        <button
          ref={launcherRef}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-keyshortcuts="Control+Shift+L Meta+Shift+L"
          className={cn(
            "flex min-h-11 items-center gap-2 rounded-full border border-line-strong bg-panel/95 px-4",
            "text-xs font-black text-fg shadow-xl backdrop-blur hover:bg-raised",
            arranging && "border-accent bg-accent-soft text-accent",
            STUDIO_FOCUS_RING,
          )}
          onClick={() => setOpen((value) => !value)}
        >
          {arranging
            ? <Move size={16} aria-hidden />
            : <SlidersHorizontal size={16} aria-hidden />}
          {arranging ? "배치 편집 중" : "보기"}
          <span className="rounded-full bg-raised px-1.5 py-0.5 text-[0.62rem] text-fg-3">
            {visibleCount}
          </span>
          {shell.failure ? (
            <MessageCircle size={13} aria-label="설정 저장 제한" />
          ) : null}
        </button>
      </div>
    </>
  );
}
