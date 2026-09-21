import { useEffect, useId, useRef, useState, type UIEvent } from "react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { StudioReviewImage } from "./StudioPinnedReviewPreview";
import { linkedReviewScroll, reviewOverlayAllowed, sameReviewSourcePage } from "./studio-review-comparison-model";
import type { StudioVirtualSpaceReviewPreview } from "./studio-virtual-space-review-preview";

const control = "min-h-11 rounded-lg border border-line bg-card px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";
type Side = "left" | "right";

/** Immutable leased previews only; no write or editor-selection capability. */
export function StudioReviewCompareDisplay({ left, right, linked }: {
  readonly left: StudioVirtualSpaceReviewPreview;
  readonly right: StudioVirtualSpaceReviewPreview;
  readonly linked: boolean;
}) {
  const bt = useBilingual("StudioReviewCompareDisplay");
  const hint = useId();
  const [mode, setMode] = useState<"side-by-side" | "single" | "overlay">("side-by-side");
  const [active, setActive] = useState<Side>("left");
  const [opacity, setOpacity] = useState(50);
  const [zoom, setZoom] = useState(100);
  const leftPane = useRef<HTMLDivElement>(null), rightPane = useRef<HTMLDivElement>(null);
  const pending = useRef<{ side: Side; top: number } | null>(null);
  const allowed = reviewOverlayAllowed(left, right);
  const layout = mode === "overlay" && !allowed ? "side-by-side" : mode;
  const labels = { left: bt("기준 검수본 페이지", "Original snapshot page"), right: bt("비교 검수본 페이지", "Comparison snapshot page") };
  useEffect(() => {
    pending.current = null;
    for (const pane of [leftPane.current, rightPane.current]) if (pane) { pane.scrollTop = 0; pane.scrollLeft = 0; }
  }, [left.sha256, right.sha256, layout]);
  const sync = (side: Side, event: UIEvent<HTMLDivElement>) => {
    const source = event.currentTarget;
    if (pending.current?.side === side && Math.abs(source.scrollTop - pending.current.top) < 1) {
      pending.current = null; return;
    }
    pending.current = null;
    if (!linked || !sameReviewSourcePage(left, right)) return;
    const target = side === "left" ? rightPane.current : leftPane.current;
    if (!target) return;
    const top = linkedReviewScroll(source.scrollTop, source.scrollHeight - source.clientHeight,
      target.scrollHeight - target.clientHeight);
    if (top === null || Math.abs(target.scrollTop - top) < 1) return;
    pending.current = { side: side === "left" ? "right" : "left", top };
    target.scrollTop = top;
  };
  const image = (side: Side) => {
    const page = side === "left" ? left : right;
    return <StudioReviewImage key={`${side}:${page.sha256}`} preview={page} label={labels[side]}
      className="block h-auto w-full max-h-none rounded-lg" figureClassName="" />;
  };
  return <div className="space-y-3" data-review-compare-layout={layout}>
    <div className="flex flex-wrap items-center gap-2" aria-label={bt("비교 표시 방식", "Comparison layout")}>
      <button type="button" className={control} aria-pressed={layout === "side-by-side"} onClick={() => setMode("side-by-side")}>{bt("나란히 보기", "Side by side")}</button>
      <button type="button" className={control} aria-pressed={layout === "single"} onClick={() => setMode("single")}>{bt("A/B 전환", "A/B view")}</button>
      <button type="button" className={control} aria-pressed={layout === "overlay"} disabled={!allowed} onClick={() => setMode("overlay")}>{bt("겹쳐 보기", "Overlay")}</button>
      <label className="flex items-center gap-2 text-sm">{bt("확대", "Zoom")}
        <select className={control} value={zoom} onChange={(event) => setZoom(Number(event.target.value))}>
          {[75, 100, 125, 150, 200].map((value) => <option key={value} value={value}>{value}%</option>)}
        </select>
      </label>
    </div>
    <p id={hint} className="text-xs leading-relaxed text-fg-2">{allowed
      ? bt("의견은 처음 연 검수본에 남습니다. A/B 전환은 좁은 화면에서 한 장씩 비교합니다.", "Notes stay on the original review. Use A/B to compare one image at a time on narrow screens.")
      : bt("겹쳐 보기는 원본 페이지와 이미지 크기가 같을 때만 가능합니다. 나란히 보거나 A/B로 확인하세요.", "Overlay requires the same source page and image dimensions. Use side-by-side or A/B otherwise.")}</p>
    {layout === "single" ? <div className="flex flex-wrap gap-2" role="group" aria-label={bt("표시할 검수본", "Visible snapshot")}>
      <button type="button" className={control} aria-pressed={active === "left"} onClick={() => setActive("left")}>{bt("A · 기준본", "A · Original")}</button>
      <button type="button" className={control} aria-pressed={active === "right"} onClick={() => setActive("right")}>{bt("B · 비교본", "B · Comparison")}</button>
    </div> : null}
    {layout === "overlay" ? <>
      <label className="block text-sm">{bt("비교본 불투명도", "Comparison opacity")} · {opacity}%
        <input type="range" className="mt-2 block min-h-11 w-full" min={0} max={100} step={5} value={opacity}
          onChange={(event) => setOpacity(Number(event.target.value))} />
      </label>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Read-only image scroll regions require keyboard focus. */}
      <div className="max-h-[65vh] overflow-auto rounded-lg border border-line bg-panel" tabIndex={0} role="region" aria-label={bt("겹친 원고", "Overlay manuscripts")} aria-describedby={hint}>
        <div className="grid" style={{ width: `${zoom}%` }}>
          <div className="col-start-1 row-start-1">{image("left")}</div>
          <div className="col-start-1 row-start-1" style={{ opacity: opacity / 100 }}>{image("right")}</div>
        </div>
      </div>
    </> : <div className={layout === "side-by-side" ? "grid min-w-0 gap-3 sm:grid-cols-2" : "min-w-0"}>
      {(["left", "right"] as const).filter((side) => layout !== "single" || side === active).map((side) =>
        <div key={side} className="min-w-0">
          <p className="mb-2 text-xs font-semibold text-fg-2">{side === "left" ? bt("A · 기준본", "A · Original") : bt("B · 비교본", "B · Comparison")}</p>
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Read-only image scroll regions require keyboard focus. */}
          <div ref={side === "left" ? leftPane : rightPane} onScroll={(event) => sync(side, event)} tabIndex={0}
            role="region" aria-label={labels[side]} aria-describedby={hint}
            className="max-h-[65vh] min-w-0 overflow-auto overscroll-contain rounded-lg border border-line bg-panel focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
            <div style={{ width: `${zoom}%` }}>{image(side)}</div>
          </div>
        </div>)}
    </div>}
  </div>;
}
