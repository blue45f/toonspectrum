import { Check, LayoutGrid, RotateCcw, Save, Undo2 } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

import { requestStudioFloatingSurfaceLayoutReset } from "./studio-floating-surface-stack";
import { STUDIO_FOCUS_RING } from "./studio-panel-ui";
import { arrangeStudioWorkspaceRegions, restoreStudioWorkspaceArrangement, saveStudioWorkspaceArrangement, setStudioWorkspaceArranging, studioWorkspaceArrangingSnapshot, subscribeStudioWorkspaceArranging } from "./studio-workspace-arrangement";

import { cn } from "@/shared/lib/utils";

export function StudioWorkspaceArrangementToolbar({ disabled = false }: { readonly disabled?: boolean }) {
  const arranging = useSyncExternalStore(subscribeStudioWorkspaceArranging, studioWorkspaceArrangingSnapshot, () => false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (disabled) setStudioWorkspaceArranging(false);
  }, [disabled]);
  useEffect(() => () => setStudioWorkspaceArranging(false), []);
  useEffect(() => {
    if (!arranging) return;
    const exit = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) setStudioWorkspaceArranging(false);
    };
    window.addEventListener("keydown", exit);
    return () => window.removeEventListener("keydown", exit);
  }, [arranging]);
  if (disabled) return null;
  const actionClass = cn("inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md px-2.5 text-xs font-semibold text-fg-2 hover:bg-raised hover:text-fg", STUDIO_FOCUS_RING);
  return (
    <div data-studio-workspace-arrangement="true" className="pointer-events-auto fixed bottom-3 left-1/2 z-[69] hidden max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-col gap-1 rounded-xl border border-line-strong bg-panel/95 p-1.5 text-fg shadow-xl lg:flex">
      <div role="group" aria-label="작업 공간 배치" className="flex flex-wrap items-center justify-center gap-1">
        <button type="button" className={cn(actionClass, arranging && "bg-accent-soft text-accent")} aria-pressed={arranging}
          onClick={() => { setStudioWorkspaceArranging(!arranging); setNotice(""); }}>
          {arranging ? <Check size={15} aria-hidden /> : <LayoutGrid size={15} aria-hidden />}
          {arranging ? "배치 완료" : "배치 편집"}
        </button>
        {arranging && <>
          <button type="button" className={actionClass} onClick={() => arrangeStudioWorkspaceRegions("detach")}>영역 분리</button>
          <button type="button" className={actionClass} onClick={() => arrangeStudioWorkspaceRegions("attach")}>원래 자리</button>
          <button type="button" className={actionClass} onClick={() => setNotice(saveStudioWorkspaceArrangement() ? "현재 탭에 영역 배치를 저장했어요." : "저장 공간을 사용할 수 없어요. 현재 배치는 유지됩니다.")}><Save size={14} aria-hidden />배치 저장</button>
          <button type="button" className={actionClass} onClick={() => setNotice(restoreStudioWorkspaceArrangement() ? "저장한 영역 배치를 복원했어요." : "이 탭에 저장한 영역 배치가 없거나 읽을 수 없어요.")}><Undo2 size={14} aria-hidden />불러오기</button>
          <button type="button" className={actionClass} onClick={() => { requestStudioFloatingSurfaceLayoutReset(); setNotice("열린 창과 영역의 위치·크기·잠금을 초기화했어요. 원고는 변경하지 않습니다."); }}><RotateCcw size={14} aria-hidden />전체 복원</button>
        </>}
      </div>
      {arranging && <p className="px-2 text-center text-[0.65rem] text-fg-3">영역 손잡이를 끌어 이동 · 모서리 크기 조절 · Alt+방향키 이동 · Esc 완료</p>}
      <p role="status" aria-live="polite" className={cn("px-2 text-center text-[0.65rem] text-fg-2", !notice && "sr-only")}>{notice}</p>
    </div>
  );
}
