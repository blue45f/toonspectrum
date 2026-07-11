import { BadgeCheck, Loader2, Plus, Sparkles } from "lucide-react";

import type { StudioRasterAsset } from "./studio-raster-assets";

import { resolveAssetUrl } from "@/src/catalog-static";

const COLLECTION_LABEL: Record<StudioRasterAsset["collection"], string> = {
  daily: "일상",
  school: "학교",
  fantasy: "판타지",
  urban: "도시",
};

export function StudioRasterAssetGrid({
  assets,
  busyId,
  onAdd,
}: {
  assets: readonly StudioRasterAsset[];
  busyId: string | null;
  onAdd: (asset: StudioRasterAsset) => void;
}) {
  if (assets.length === 0) return null;

  return (
    <section aria-labelledby="studio-raster-assets-heading" className="mt-2 border-t border-line pt-2">
      <div className="mb-2 flex items-start gap-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
          <Sparkles size={15} aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 id="studio-raster-assets-heading" className="text-xs font-bold text-fg">
            고품질 장면 소품
          </h3>
          <p className="mt-0.5 text-[0.65rem] leading-relaxed text-fg-3">
            투명 배경·권리 메타데이터를 검수한 자체 제작 전경 세트입니다.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {assets.map((asset) => {
          const busy = busyId === asset.id;
          return (
            <button
              key={asset.id}
              type="button"
              disabled={busyId !== null}
              aria-label={`${asset.label} 캔버스에 추가`}
              aria-busy={busy || undefined}
              title={asset.description}
              onClick={() => onAdd(asset)}
              className="group min-h-36 overflow-hidden rounded-xl border border-line bg-card text-left transition-colors hover:border-accent/45 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-55"
            >
              <span className="relative flex aspect-[3/2] w-full items-center justify-center overflow-hidden bg-canvas/60 p-1.5">
                <img
                  src={resolveAssetUrl(asset.src)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="size-full object-contain transition-transform duration-200 group-hover:scale-[1.03]"
                />
                <span className="absolute left-1.5 top-1.5 inline-flex min-h-6 items-center gap-1 rounded-md border border-line/70 bg-panel/90 px-1.5 text-[0.58rem] font-semibold text-fg-2 shadow-sm">
                  <BadgeCheck size={11} className="text-good" aria-hidden /> 검수됨
                </span>
              </span>
              <span className="flex min-h-12 items-center gap-2 px-2 py-1.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.68rem] font-bold text-fg">{asset.label}</span>
                  <span className="mt-0.5 block text-[0.58rem] text-fg-3">
                    {COLLECTION_LABEL[asset.collection]} · AI 생성
                  </span>
                </span>
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent transition-colors group-hover:bg-accent group-hover:text-on-accent">
                  {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Plus size={14} aria-hidden />}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
