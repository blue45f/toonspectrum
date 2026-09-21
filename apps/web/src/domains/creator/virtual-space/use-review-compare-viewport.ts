import { useCallback, useLayoutEffect, useRef, type UIEvent } from "react";
import { readReviewScrollPosition, reviewScrollTarget, REVIEW_SCROLL_ORIGIN, type ReviewScrollPosition } from "./studio-review-viewport";

export type ReviewComparePane = "left" | "right" | "overlay";
const PANES: readonly ReviewComparePane[] = ["left", "right", "overlay"];
type PositionMap = Record<ReviewComparePane, ReviewScrollPosition>;
const origin = (): PositionMap => ({ left: REVIEW_SCROLL_ORIGIN, right: REVIEW_SCROLL_ORIGIN, overlay: REVIEW_SCROLL_ORIGIN });

/** Ephemeral viewport only. No pixels, source URLs, draft text or authorization are persisted. */
export function useReviewCompareViewport(layoutKey: string, linkMatchingPages: boolean) {
  const nodes = useRef<Record<ReviewComparePane, HTMLDivElement | null>>({ left: null, right: null, overlay: null });
  const positions = useRef<PositionMap>(origin());
  const dimensions = useRef<Record<string, string>>({});
  const applied = useRef<Record<string, { left: number; top: number } | undefined>>({});
  const lastSide = useRef<"left" | "right">("left");
  const sizeKey = (node: HTMLElement) => [node.clientWidth, node.clientHeight, node.scrollWidth, node.scrollHeight].join(":");
  const ready = (node: HTMLElement) => {
    const images = [...node.querySelectorAll("img")];
    return node.clientWidth > 0 && node.clientHeight > 0 && images.length > 0
      && images.every((image) => image.complete && image.naturalWidth > 0);
  };
  const restore = useCallback((side: ReviewComparePane) => {
    const node = nodes.current[side];
    if (!node || !ready(node)) return;
    dimensions.current[side] = sizeKey(node);
    const target = reviewScrollTarget(positions.current[side], node);
    applied.current[side] = target;
    node.scrollLeft = target.left; node.scrollTop = target.top;
  }, []);
  useLayoutEffect(() => {
    const restoreAll = () => { for (const side of PANES) restore(side); };
    restoreAll();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(restoreAll);
    for (const side of PANES) {
      const node = nodes.current[side];
      if (node) { observer?.observe(node); if (node.firstElementChild) observer?.observe(node.firstElementChild); }
    }
    globalThis.addEventListener("resize", restoreAll);
    return () => { observer?.disconnect(); globalThis.removeEventListener("resize", restoreAll); };
  }, [layoutKey, restore]);
  const onScroll = (side: ReviewComparePane, event: UIEvent<HTMLDivElement>) => {
    const node = event.currentTarget;
    if (!ready(node)) return;
    if (dimensions.current[side] !== sizeKey(node)) { restore(side); return; }
    const target = applied.current[side];
    applied.current[side] = undefined;
    if (target && Math.abs(node.scrollLeft - target.left) < 1 && Math.abs(node.scrollTop - target.top) < 1) return;
    const next = readReviewScrollPosition(node, positions.current[side]);
    positions.current[side] = next;
    if (side === "overlay") return;
    lastSide.current = side;
    if (linkMatchingPages) {
      const other = side === "left" ? "right" : "left";
      positions.current[other] = next;
      restore(other);
    }
  };
  const transition = (from: string, to: string) => {
    if (to === "overlay" && from !== "overlay") positions.current.overlay = positions.current[lastSide.current];
    if (from === "overlay" && to !== "overlay") {
      positions.current.left = positions.current.overlay; positions.current.right = positions.current.overlay;
    }
  };
  const reset = () => {
    positions.current = origin(); applied.current = {}; lastSide.current = "left";
    for (const side of PANES) restore(side);
  };
  const setNode = (side: ReviewComparePane, node: HTMLDivElement | null) => { nodes.current[side] = node; };
  return { setNode, restore, onScroll, transition, reset };
}
