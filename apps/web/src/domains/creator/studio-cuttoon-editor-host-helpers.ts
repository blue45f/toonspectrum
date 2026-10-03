/**
 * Pure helpers extracted from StudioCuttoonEditorHost without behavior
 * change. Each helper depends only on its arguments and module-scope
 * imports, so the host can shrink while its call sites keep the same
 * names and semantics.
 */
import { cn } from "@/shared/lib/utils";

import type { StudioToolOperation } from "./studio-brush";
import type { StudioCommentThread } from "./studio-comments";
import type { DrawMode } from "./studio-editor-tool-model";

/** Runs after the inspector route has committed, so late-mounted launchers exist. */
export function afterInspectorCommit(run: () => void): void {
  if (!globalThis.requestAnimationFrame) {
    run();
    return;
  }
  globalThis.requestAnimationFrame(() => {
    globalThis.requestAnimationFrame?.(run);
  });
}

export function compareStudioCommentThreadActivity(
  left: StudioCommentThread,
  right: StudioCommentThread
): number {
  return Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
    || right.id.localeCompare(left.id);
}

export function rememberedOperationForDrawMode(mode: DrawMode): StudioToolOperation | null {
  if (mode === "pen") return "paint";
  if (mode === "eraser") return "erase";
  return null;
}

// 모바일 하단 보조 막대 버튼(페이지/추가/속성/줌) — 아이콘 + 작은 라벨 세로 스택.
// 서브탭 칩·드로잉 도구 칩은 studioSegmentChipClass / studioToolButtonClass 로 이관됨.
export const mobileBarBtn = (active: boolean) =>
  cn(
    "flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-1 text-[0.6875rem] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
    active ? "bg-accent-soft/60 text-accent" : "text-fg-2 hover:bg-raised"
  );
