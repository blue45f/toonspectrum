import {
  Check,
  LayoutGrid,
  Maximize2,
  Minimize2,
  RotateCcw,
  Save,
  Undo2,
} from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  arrangeStudioFloatingSurfaces,
  requestStudioFloatingSurfaceLayoutReset,
  setStudioFloatingSurfacesMinimized,
  studioFloatingSurfaceArrangementCount,
  studioFloatingSurfaceStackSnapshot,
  subscribeStudioFloatingSurfaceStack,
} from "./studio-floating-surface-stack";
import { handleStudioHorizontalWheel } from "./studio-horizontal-wheel";
import { STUDIO_FOCUS_RING } from "./studio-panel-ui";
import {
  applyStudioWorkspaceArrangement,
  arrangeStudioWorkspaceRegions,
  captureStudioWorkspaceArrangement,
  restoreStudioWorkspaceArrangement,
  saveStudioWorkspaceArrangement,
  setStudioWorkspaceArranging,
  studioWorkspaceArrangingSnapshot,
  subscribeStudioWorkspaceArranging,
} from "./studio-workspace-arrangement";

import { cn } from "@/shared/lib/utils";

export interface StudioWorkspaceArrangementControlsProps {
  readonly disabled?: boolean;
  readonly initialSnapshot?: string;
}

export function StudioWorkspaceArrangementControls({
  disabled = false,
  initialSnapshot,
}: StudioWorkspaceArrangementControlsProps) {
  const arranging = useSyncExternalStore(
    subscribeStudioWorkspaceArranging,
    studioWorkspaceArrangingSnapshot,
    () => false,
  );
  const floatingRevision = useSyncExternalStore(
    subscribeStudioFloatingSurfaceStack,
    studioFloatingSurfaceStackSnapshot,
    () => 0,
  );
  void floatingRevision;
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const beforeEditing = useRef<string | null>(initialSnapshot ?? null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  async function deviceSnapshot(action: "save" | "load") {
    if (busy) return;
    const before = captureStudioWorkspaceArrangement();
    setBusy(true);
    try {
      const { acquireStudioWorkspaceArrangementDevice } = await import(
        "./studio-workspace-arrangement-device"
      );
      const device = await acquireStudioWorkspaceArrangementDevice();
      if (action === "save") {
        const saved = await device.save(before);
        if (alive.current) {
          setNotice(saved
            ? "클릭 시점의 배치를 이 기기에 저장했어요."
            : "기기 저장을 확인하지 못했어요. 현재 배치는 유지됩니다.");
        }
      } else {
        const saved = await device.load();
        if (!alive.current) return;
        if (before !== captureStudioWorkspaceArrangement()) {
          setNotice("불러오는 동안 배치가 바뀌어 현재 배치를 유지했어요.");
        } else {
          setNotice(saved && applyStudioWorkspaceArrangement(saved)
            ? "이 기기에 저장한 배치를 복원했어요."
            : "기기에 저장한 배치가 없거나 읽을 수 없어요.");
        }
      }
    } catch {
      if (alive.current) {
        setNotice("기기 저장소를 사용할 수 없어요. 탭 저장을 사용해 주세요.");
      }
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  useEffect(() => {
    if (disabled) setStudioWorkspaceArranging(false);
  }, [disabled]);
  useEffect(() => () => setStudioWorkspaceArranging(false), []);
  useEffect(() => {
    if (!arranging) return;
    const exit = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        setStudioWorkspaceArranging(false);
      }
    };
    window.addEventListener("keydown", exit);
    return () => window.removeEventListener("keydown", exit);
  }, [arranging]);

  if (disabled) return null;
  const actionClass = cn(
    "inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-md px-2.5",
    "text-xs font-semibold text-fg-2 hover:bg-raised hover:text-fg",
    "disabled:cursor-wait disabled:opacity-40",
    STUDIO_FOCUS_RING,
  );
  const floatingCount = studioFloatingSurfaceArrangementCount();

  return (
    <div
      data-studio-workspace-arrangement="true"
      className={cn(
        "pointer-events-auto fixed bottom-3 right-3 z-[69] hidden",
        arranging
          ? "w-[min(42rem,calc(100vw-1.5rem))] flex-col items-stretch gap-1"
          : "w-auto max-w-[calc(100vw-1.5rem)] items-center",
        "rounded-xl border border-line-strong bg-panel/95 p-1 text-fg shadow-xl backdrop-blur",
        "lg:flex",
      )}
    >
      <div
        role="group"
        aria-label={`작업 공간 배치 · 열린 창 ${floatingCount}개`}
        onWheel={handleStudioHorizontalWheel}
        className="flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <button
          type="button"
          className={cn(actionClass, arranging && "bg-accent-soft text-accent")}
          aria-pressed={arranging}
          onClick={() => {
            if (!arranging) beforeEditing.current = captureStudioWorkspaceArrangement();
            setStudioWorkspaceArranging(!arranging);
            setNotice("");
          }}
        >
          {arranging
            ? <Check size={15} aria-hidden />
            : <LayoutGrid size={15} aria-hidden />}
          {arranging ? "배치 완료" : "배치 편집"}
        </button>
        {arranging ? (
          <>
            <button
              type="button"
              className={actionClass}
              disabled={busy}
              onClick={() => {
                if (beforeEditing.current) {
                  applyStudioWorkspaceArrangement(beforeEditing.current);
                }
                setStudioWorkspaceArranging(false);
                setNotice("배치 편집 전 상태로 되돌렸어요.");
              }}
            >
              배치 취소
            </button>
            <button
              type="button"
              className={actionClass}
              onClick={() => {
                arrangeStudioFloatingSurfaces("edges");
                setNotice("열린 창을 화면 양쪽 가장자리에 정렬했어요.");
              }}
            >
              가장자리 정렬
            </button>
            <button
              type="button"
              className={actionClass}
              onClick={() => {
                arrangeStudioFloatingSurfaces("cascade");
                setNotice("열린 창을 겹쳐 보기 쉬운 계단식으로 정렬했어요.");
              }}
            >
              계단식 정렬
            </button>
            <button
              type="button"
              className={actionClass}
              onClick={() => setStudioFloatingSurfacesMinimized(true)}
            >
              <Minimize2 size={14} aria-hidden />모두 접기
            </button>
            <button
              type="button"
              className={actionClass}
              onClick={() => setStudioFloatingSurfacesMinimized(false)}
            >
              <Maximize2 size={14} aria-hidden />모두 펼치기
            </button>
            <button
              type="button"
              className={actionClass}
              onClick={() => arrangeStudioWorkspaceRegions("detach")}
            >
              영역 분리
            </button>
            <button
              type="button"
              className={actionClass}
              onClick={() => arrangeStudioWorkspaceRegions("attach")}
            >
              원래 자리
            </button>
            <button
              type="button"
              className={actionClass}
              disabled={busy}
              onClick={() => void deviceSnapshot("save")}
            >
              <Save size={14} aria-hidden />기기에 저장
            </button>
            <button
              type="button"
              className={actionClass}
              disabled={busy}
              onClick={() => void deviceSnapshot("load")}
            >
              <Undo2 size={14} aria-hidden />기기 배치 불러오기
            </button>
            <button
              type="button"
              className={actionClass}
              onClick={() => {
                const saved = saveStudioWorkspaceArrangement();
                setNotice(saved
                  ? "현재 탭에 고정 영역 배치를 저장했어요."
                  : "탭 저장 공간을 사용할 수 없어요.");
              }}
            >
              <Save size={14} aria-hidden />탭에 저장
            </button>
            <button
              type="button"
              className={actionClass}
              onClick={() => {
                const restored = restoreStudioWorkspaceArrangement();
                setNotice(restored
                  ? "저장한 고정 영역 배치를 복원했어요."
                  : "이 탭에 저장한 배치가 없어요.");
              }}
            >
              <Undo2 size={14} aria-hidden />탭 배치 불러오기
            </button>
          </>
        ) : null}
        <button
          type="button"
          className={actionClass}
          onClick={() => {
            requestStudioFloatingSurfaceLayoutReset();
            setNotice("열린 창과 고정 영역의 위치·크기·잠금을 초기화했어요.");
          }}
        >
          <RotateCcw size={14} aria-hidden />전체 복원
        </button>
      </div>
      {arranging ? (
        <p className="px-2 text-[0.65rem] text-fg-3">
          제목줄을 끌어 이동 · 모서리로 크기 조절 · 가장자리 가까이 놓으면 도킹 · Esc 완료
        </p>
      ) : null}
      <p
        role="status"
        aria-live="polite"
        className={cn("px-2 text-[0.65rem] text-fg-2", !notice && "sr-only")}
      >
        {notice}
      </p>
    </div>
  );
}
