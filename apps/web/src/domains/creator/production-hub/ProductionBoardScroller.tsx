import { productionText, useProductionCopy } from "./production-workboard-copy";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

export function ProductionBoardScroller({ children }: { readonly children: ReactNode }) {
  useProductionCopy();
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () =>
      setEdges({
        start: element.scrollLeft < 2,
        end: element.scrollLeft + element.clientWidth >= element.scrollWidth - 2,
      });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(element);
    if (element.firstElementChild) observer?.observe(element.firstElementChild);
    element.addEventListener("scroll", measure, { passive: true });
    measure();
    return () => {
      observer?.disconnect();
      element.removeEventListener("scroll", measure);
    };
  }, [children]);
  const move = (direction: -1 | 1) => {
    const element = ref.current;
    if (!element) return;
    element.scrollBy({
      left: direction * Math.max(264, element.clientWidth * 0.75),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  };
  return (
    <div className="min-w-0">
      {!edges.start || !edges.end ? (
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-xs text-fg-3">{productionText("모든 단계를 보려면 좌우로 이동하세요")}</p>
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              disabled={edges.start}
              aria-label={productionText("보드 이전 공정 보기")}
              className={cn(buttonClass({ variant: "outline", size: "icon" }), "min-h-11 min-w-11")}
              onClick={() => move(-1)}
            >
              <ArrowLeft size={16} />
            </button>
            <button
              type="button"
              disabled={edges.end}
              aria-label={productionText("보드 다음 공정 보기")}
              className={cn(buttonClass({ variant: "outline", size: "icon" }), "min-h-11 min-w-11")}
              onClick={() => move(1)}
            >
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      ) : null}
      <div
        ref={ref}
        role="region"
        aria-label={productionText("제작 칸반 보드 · 좌우로 스크롤")}
        className="max-w-full overflow-x-auto overscroll-x-contain rounded-2xl pb-4"
        data-testid="production-board-scroll-region"
      >
        {children}
      </div>
    </div>
  );
}
