import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Flame } from "lucide-react";

import type { MaterialAsset } from "../material-atlas/model";
import { MATERIAL_KINDS, MATERIAL_PROVIDERS } from "../material-atlas/model";
import { prefersReducedMotion } from "./material-search-ux";
import "./material-discovery.css";

/** 트렌딩 소재 캐러셀. 히어로 영역에 배치하는 시각적 하이라이트. */
export function MaterialTrendingCarousel({ assets, onSelect }: { assets: readonly MaterialAsset[]; onSelect: (asset: MaterialAsset) => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const scrollBy = useCallback((direction: 1 | -1) => {
    const track = trackRef.current;
    if (!track || typeof track.scrollBy !== "function") return;
    track.scrollBy({ left: direction * Math.min(560, track.clientWidth * 0.8), behavior: "smooth" });
  }, []);
  useEffect(() => {
    if (paused || prefersReducedMotion()) return;
    const id = window.setInterval(() => scrollBy(1), 4500);
    return () => window.clearInterval(id);
  }, [paused, scrollBy]);
  if (!assets.length) return null;
  return <section className="md-trending" aria-labelledby="md-trending-title"
    onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="md-trending-title" className="flex items-center gap-2 text-lg font-bold"><Flame size={18} className="text-accent" aria-hidden="true" />지금 뜨는 소재</h2>
      <div className="md-trending-nav">
        <button type="button" aria-label="이전 트렌딩 소재" onClick={() => scrollBy(-1)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-line bg-panel hover:bg-raised"><ChevronLeft size={18} aria-hidden="true" /></button>
        <button type="button" aria-label="다음 트렌딩 소재" onClick={() => scrollBy(1)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-line bg-panel hover:bg-raised"><ChevronRight size={18} aria-hidden="true" /></button>
      </div>
    </div>
    <div ref={trackRef} className="md-trending-track mt-3" role="list" aria-label="트렌딩 소재 목록">
      {assets.map((assetItem, index) => <div role="listitem" key={assetItem.id} className="md-trending-item"><button type="button" className="md-trending-card" onClick={() => onSelect(assetItem)} aria-label={`${assetItem.title} 소재 보기`}>
        <span className="md-trending-rank" aria-hidden="true">{index + 1}</span>
        {assetItem.thumbnailUrl
          ? <img src={assetItem.thumbnailUrl} alt="" aria-hidden="true" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
          : <span className="grid aspect-[4/3] place-items-center text-3xl" aria-hidden="true">▧</span>}
        <span className="md-trending-label">{assetItem.title}<br /><small className="font-normal opacity-80">{MATERIAL_PROVIDERS[assetItem.provider].name} · {MATERIAL_KINDS[assetItem.kind]}</small></span>
      </button></div>)}
    </div>
  </section>;
}
