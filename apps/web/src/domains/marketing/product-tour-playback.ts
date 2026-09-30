import type { SyntheticEvent } from "react";

import { PRODUCT_TOUR, type ProductTourChapter } from "./product-tour-content";

/** 챕터 목록·현재 장면·대본에서 특정 시각으로 이동할 때 쓰는 공통 콜백. */
export type ProductTourSeek = (seconds: number, event?: SyntheticEvent) => void;

/** 페이지에서 사용자 입력 안에 재생을 시작하도록 두 재생기가 공통으로 노출하는 제어기. */
export interface ProductTourPlaybackController {
  readonly playFrom: ProductTourSeek;
}

export type ProductTourShortcut = "previous" | "next" | "fullscreen" | "captions";

const CHAPTERS: readonly ProductTourChapter[] = PRODUCT_TOUR.chapters;

/** ←/→ 챕터 이동, F 전체화면, C 자막. 입력 요소(음량 슬라이더 등)에서는 가로채지 않는다. */
export function productTourShortcut(event: {
  readonly key: string;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly target: EventTarget | null;
}): ProductTourShortcut | null {
  if (event.altKey || event.ctrlKey || event.metaKey) return null;
  if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable='true']")) return null;
  switch (event.key) {
    case "ArrowLeft": return "previous";
    case "ArrowRight": return "next";
    case "f":
    case "F": return "fullscreen";
    case "c":
    case "C": return "captions";
    default: return null;
  }
}

export function clampProductTourChapter(index: number): number {
  return Math.min(CHAPTERS.length - 1, Math.max(0, index));
}

export function productTourChapterProgress(seconds: number, chapterIndex: number): number {
  const chapter = CHAPTERS[chapterIndex];
  if (!chapter || !Number.isFinite(seconds)) return 0;
  const span = chapter.end - chapter.start;
  if (span <= 0) return 0;
  return Math.min(1, Math.max(0, (seconds - chapter.start) / span));
}
