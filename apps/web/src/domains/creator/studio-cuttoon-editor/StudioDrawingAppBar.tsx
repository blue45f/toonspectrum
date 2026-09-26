import {
  Brush,
  Command,
  Layers3,
  Maximize2,
  PanelLeft,
  PanelRight,
  Palette,
  Redo2,
  Undo2,
} from "lucide-react";

import Link from "@/shared/navigation/router-link";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";
import { translateCurrentStaticSourceText } from "@/shared/lib/i18n-bilingual-copy";

import type { StudioCuttoonEditorViewSession } from "./StudioCuttoonEditorViewSession";

function percent(value: unknown): string {
  const number = typeof value === "number" && Number.isFinite(value) ? value : 1;
  return `${Math.round(number * 100)}%`;
}

/**
 * Compact application chrome for the drawing-focused presentation.
 *
 * This intentionally calls the exact same Studio session handlers used by the embedded editor.
 * It is a projection of the shared runtime, not a second drawing implementation.
 */
export function StudioDrawingAppBar({ session }: { readonly session: StudioCuttoonEditorViewSession }) {
  const s = session;
  const brushName = s.activeCatalogBrush?.name ?? s.brush ?? "Brush";
  const stabilizer = typeof s.stabilizer === "number" ? s.stabilizer : 0;
  const tx = (source: string) => translateCurrentStaticSourceText("StudioDrawingAppBar", "ko", source);

  return (
    <header
      data-studio-drawing-app-bar="true"
      className="flex min-h-12 shrink-0 items-center gap-2 border-b border-line bg-panel/95 px-2.5 shadow-sm backdrop-blur-xl sm:px-3"
    >
      <div className="flex min-w-0 items-center gap-2 pr-1">
        <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-accent text-on-accent shadow-sm">
          <Brush size={17} aria-hidden="true" />
        </span>
        <div className="hidden min-w-0 sm:block">
          <strong className="block truncate text-xs font-black tracking-[-0.02em] text-fg">ToonStudio Draw</strong>
          <span className="block max-w-48 truncate text-[0.65rem] text-fg-3">{s.name || "Untitled"}</span>
        </div>
      </div>

      <div className="hidden min-w-0 flex-1 items-center gap-1.5 md:flex" aria-label={tx("현재 드로잉 설정")}>
        <button
          type="button"
          className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-1 text-[0.68rem] font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          aria-label={`${tx("브러시 라이브러리 열기, 현재")} ${brushName}`}
          title={tx("브러시 라이브러리")}
          onClick={(event) => {
            if (s.isMobile) {
              s.setMobileSheet?.("draw");
              return;
            }
            s.studioBrushCatalogHandlers?.toggle?.("desktop-dock", event.currentTarget);
          }}
        >
          <Brush size={13} aria-hidden="true" />
          <span className="max-w-32 truncate">{brushName}</span>
        </button>
        <span className="rounded-full border border-line bg-card px-2.5 py-1 text-[0.68rem] font-semibold tabular-nums text-fg-2">
          {Math.round(Number(s.strokeWidth) || 0)} px
        </span>
        <span className="rounded-full border border-line bg-card px-2.5 py-1 text-[0.68rem] font-semibold tabular-nums text-fg-2">
          {percent(s.brushOpacity)}
        </span>
        <span className="rounded-full border border-line bg-card px-2.5 py-1 text-[0.68rem] font-semibold tabular-nums text-fg-2">
          Stabilizer {stabilizer}
        </span>
        <span
          className="size-6 rounded-full border-2 border-card shadow ring-1 ring-line"
          style={{ backgroundColor: typeof s.color === "string" ? s.color : "#000000" }}
          aria-label={`${tx("현재 색상")} ${String(s.color ?? "")}`}
        />
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1" aria-label={tx("드로잉 빠른 도구")}>
        <button
          type="button"
          className={buttonClass({ variant: "quiet", size: "icon" })}
          disabled={Boolean(s.menuEditUndoDisabled)}
          aria-label={tx("실행 취소")}
          title={`${tx("실행 취소")} · Ctrl/⌘ Z`}
          onClick={() => s.undo?.()}
        >
          <Undo2 size={17} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={buttonClass({ variant: "quiet", size: "icon" })}
          disabled={Boolean(s.menuEditRedoDisabled)}
          aria-label={tx("다시 실행")}
          title={`${tx("다시 실행")} · Ctrl/⌘ Shift Z`}
          onClick={() => s.redo?.()}
        >
          <Redo2 size={17} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={cn(buttonClass({ variant: s.colorWheelOpen ? "solid" : "quiet", size: "icon" }))}
          aria-pressed={Boolean(s.colorWheelOpen)}
          aria-label={tx("컬러 휠")}
          title={tx("컬러 휠")}
          onClick={() => s.setColorWheelOpen?.((value: boolean) => !value)}
        >
          <Palette size={17} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={cn(buttonClass({ variant: s.quickAccessPaletteOpen ? "solid" : "quiet", size: "icon" }))}
          aria-pressed={Boolean(s.quickAccessPaletteOpen)}
          aria-label={tx("퀵 액세스")}
          title={`${tx("퀵 액세스")} · ${tx("자주 쓰는 명령")}`}
          onClick={() => s.setQuickAccessPaletteOpen?.((value: boolean) => !value)}
        >
          <Command size={17} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={cn(buttonClass({ variant: s.visibleLeftPanelOpen ? "solid" : "quiet", size: "icon" }), "hidden sm:inline-flex")}
          aria-pressed={Boolean(s.visibleLeftPanelOpen)}
          aria-label={tx("페이지 패널")}
          title={tx("페이지 패널")}
          onClick={() => s.setLeftPanelOpenWithOverride?.(!s.visibleLeftPanelOpen)}
        >
          <PanelLeft size={17} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={cn(buttonClass({ variant: s.visibleRightPanelOpen ? "solid" : "quiet", size: "icon" }), "hidden sm:inline-flex")}
          aria-pressed={Boolean(s.visibleRightPanelOpen)}
          aria-label={tx("레이어·속성 패널")}
          title={tx("레이어·속성 패널")}
          onClick={() => s.setRightPanelOpenWithOverride?.(!s.visibleRightPanelOpen)}
        >
          <Layers3 size={17} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={buttonClass({ variant: s.canvasOnlyMode ? "solid" : "quiet", size: "icon" })}
          aria-pressed={Boolean(s.canvasOnlyMode)}
          aria-label={tx("캔버스만 보기")}
          title={`${tx("캔버스만 보기")} · ${tx("4손가락 탭")}`}
          onClick={() => s.setCanvasOnlyMode?.((value: boolean) => !value)}
        >
          <Maximize2 size={17} aria-hidden="true" />
        </button>
        <Link
          href="/studio?drawingShell=integrated"
          className={cn(buttonClass({ variant: "outline", size: "sm" }), "ml-1 hidden min-h-9 gap-1.5 px-2.5 text-[0.7rem] font-bold lg:inline-flex")}
        >
          <PanelRight size={15} aria-hidden="true" />
          {tx("전체 스튜디오")}
        </Link>
      </div>
    </header>
  );
}
