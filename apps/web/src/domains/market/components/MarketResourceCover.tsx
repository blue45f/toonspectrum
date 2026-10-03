import { marketKindMeta } from "../models/market-kind";
import {
  brushPreviewData,
  filterPreviewData,
  palettePreviewColors,
  recipePreviewData,
  templatePreviewData,
} from "../models/market-preview";

import { MarketVerifiedAssetPreview } from "./MarketVerifiedAssetPreview";

import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

function compactFilterCss(values: Record<string, number | string | boolean>): string {
  const filters: string[] = [];
  if (typeof values.brightness === "number") filters.push(`brightness(${values.brightness})`);
  if (typeof values.contrast === "number") filters.push(`contrast(${values.contrast})`);
  if (typeof values.saturate === "number") filters.push(`saturate(${values.saturate})`);
  else if (typeof values.saturation === "number") filters.push(`saturate(${1 + values.saturation / 100})`);
  if (typeof values.hue === "number") filters.push(`hue-rotate(${values.hue}deg)`);
  else if (typeof values.hueRotate === "number") filters.push(`hue-rotate(${values.hueRotate}deg)`);
  if (typeof values.sepia === "number") filters.push(`sepia(${values.sepia})`);
  if (typeof values.grayscale === "number") filters.push(`grayscale(${values.grayscale})`);
  return filters.length > 0 ? filters.join(" ") : "contrast(1.08) saturate(1.08)";
}

function sceneReferenceImage(recipeId: string): string | null {
  if (/classroom|school/u.test(recipeId)) return "/assets/3d/environments/refined-v6/thumbnails/classroom_art_studio.png";
  if (/cyber|neon|alley/u.test(recipeId)) return "/assets/3d/environments/refined-v6/thumbnails/urban_neon_alley.png";
  if (/hanok|joseon/u.test(recipeId)) return "/assets/3d/environments/refined-v6/thumbnails/hanok_market_courtyard.png";
  if (/rofan|tea|fantasy/u.test(recipeId)) return "/assets/3d/environments/refined-v6/thumbnails/fantasy_alchemist_workshop_library.png";
  return null;
}

function ProceduralAssetCardArtwork({ recipeId }: { readonly recipeId: string }) {
  const common = "fill-none stroke-current";
  if (/sword|blade/u.test(recipeId)) {
    return <svg aria-hidden="true" className="absolute inset-0 size-full p-8 text-fg/55" viewBox="0 0 240 120">
      <path d="M51 88 160 20l19-3-8 19L62 96Z" className={common} strokeWidth="5" strokeLinejoin="round" />
      <path d="m63 77 25 25M45 99l17-3 7 12-14 8Z" className={common} strokeWidth="5" strokeLinecap="round" />
      <path d="m78 87 18 17" className={common} strokeWidth="11" strokeLinecap="round" opacity=".45" />
    </svg>;
  }
  if (/phone|tablet|device/u.test(recipeId)) {
    return <svg aria-hidden="true" className="absolute inset-0 size-full p-7 text-fg/55" viewBox="0 0 240 120">
      <rect x="55" y="20" width="54" height="88" rx="10" className={common} strokeWidth="5"/><rect x="122" y="27" width="68" height="76" rx="8" className={common} strokeWidth="5"/>
      <path d="M66 32h32M133 38h46" className={common} strokeWidth="3" strokeLinecap="round" opacity=".55"/>
      <circle cx="82" cy="96" r="3" fill="currentColor"/><circle cx="156" cy="91" r="3" fill="currentColor"/>
    </svg>;
  }
  if (/tea|table/u.test(recipeId)) {
    return <svg aria-hidden="true" className="absolute inset-0 size-full p-6 text-fg/55" viewBox="0 0 240 120">
      <ellipse cx="120" cy="54" rx="59" ry="24" className={common} strokeWidth="5"/><path d="M86 64 74 108M154 64l12 44M120 78v29" className={common} strokeWidth="5" strokeLinecap="round"/>
      <path d="M45 52v45M45 61h28v36M195 52v45M167 61h28v36" className={common} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>;
  }
  return <svg aria-hidden="true" className="absolute inset-0 size-full p-6 text-fg/55" viewBox="0 0 240 120">
    <path d="M47 61 105 35l63 24-60 29Z" className={common} strokeWidth="5" strokeLinejoin="round"/><path d="M47 61v32l61 24V88M168 59v32l-60 26" className={common} strokeWidth="5" strokeLinejoin="round"/>
    <path d="M128 28v48M115 35l13-12 13 12" className={common} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" opacity=".65"/>
  </svg>;
}

function TemplateCardArtwork({ templateId }: { readonly templateId: string }) {
  const fourCut = /4cut|4-cut|yonkoma/u.test(templateId);
  const scroll = /scroll|vertical|webtoon/u.test(templateId);
  return <div aria-hidden="true" className="absolute inset-4 rounded-xl border border-line/70 bg-canvas/70 p-2 shadow-inner">
    {fourCut ? <div className="grid h-full grid-rows-4 gap-1.5">{[0,1,2,3].map(i => <span key={i} className="rounded-md border border-line-strong/60 bg-card/80" />)}</div>
      : scroll ? <div className="grid h-full grid-rows-[1.3fr_.8fr_.8fr_1.4fr] gap-1.5"><span className="rounded-md border border-line-strong/60 bg-card/80"/><span className="rounded-md border border-line-strong/60 bg-card/80"/><span className="rounded-md border border-line-strong/60 bg-card/80"/><span className="rounded-md border border-line-strong/60 bg-card/80"/></div>
        : <div className="grid h-full grid-cols-2 grid-rows-2 gap-1.5"><span className="col-span-2 rounded-md border border-line-strong/60 bg-card/80"/><span className="rounded-md border border-line-strong/60 bg-card/80"/><span className="rounded-md border border-line-strong/60 bg-card/80"/></div>}
  </div>;
}

/**
 * 마켓 리소스 커버 아트 — 종류별 프리뷰 데이터(팔레트·브러시·템플릿·필터·3D 레시피)로
 * 만드는 표지 비주얼 레이어. 탐색 카드(MarketResourceCard) 전용이던 커버를
 * 비교·관리 목록처럼 카드가 아닌 표면과 공유하기 위해 분리했다.
 *
 * 부모가 `relative` 컨테이너여야 하며, 레이어는 전부 absolute로 컨테이너를 채운다.
 * 장식 전용이다 — 리소스 식별 정보는 각 표면의 텍스트가 담당한다.
 */
export function MarketResourceCover({ record }: { readonly record: CreatorMarketplaceResourceRecord }) {
  const kind = marketKindMeta(record.kind);
  const paletteColors = palettePreviewColors(record);
  const brushPreviews = brushPreviewData(record);
  const filterPreview = filterPreviewData(record)?.[0];
  const templatePreview = templatePreviewData(record)?.[0];
  const recipe = recipePreviewData(record)?.[0];

  return (
    <>
      {!paletteColors ? (
        <span
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(140deg,var(--color-card)_0%,var(--color-panel)_55%,var(--color-canvas)_100%)]"
        />
      ) : null}

      {paletteColors ? (
        <span className="absolute inset-0 flex" aria-hidden="true">
          {paletteColors.slice(0, 10).map((color, index) => (
            <span
              key={`${color}-${index}`}
              className="h-full flex-1 transition-[flex-grow] duration-200 ease-out-expo group-hover:grow-[1.35]"
              style={{ backgroundColor: color }}
            />
          ))}
        </span>
      ) : null}

      {record.kind === "brush" && !paletteColors ? (
        <svg
          aria-hidden="true"
          className="absolute inset-0 size-full opacity-55 transition-opacity duration-200 group-hover:opacity-80"
          viewBox="0 0 240 120"
          preserveAspectRatio="none"
        >
          {(brushPreviews ?? []).slice(0, 3).map((brush, index) => (
            <path
              key={`${brush.name}-${index}`}
              d={`M 12 ${34 + index * 27} C 58 ${8 + index * 18}, 103 ${72 + index * 8}, 148 ${35 + index * 16} S 207 ${28 + index * 22}, 230 ${42 + index * 23}`}
              fill="none"
              stroke={brush.color ?? `oklch(0.82 0.12 ${kind.hue + index * 24})`}
              strokeOpacity={brush.opacity ?? 0.82}
              strokeWidth={Math.max(3, Math.min(16, (brush.size ?? 8) * (0.7 + index * 0.14)))}
              strokeLinecap="round"
            />
          ))}
        </svg>
      ) : null}

      {record.kind === "template" && !paletteColors && templatePreview ? (
        <TemplateCardArtwork templateId={templatePreview.templateId} />
      ) : null}

      {record.kind === "filter" && filterPreview ? (
        <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
          <img src="/assets/studio/backgrounds/webtoon_creator_room.png" alt="" loading="lazy" decoding="async" className="size-full object-cover opacity-80" />
          <div className="absolute inset-y-0 left-0 w-1/2 overflow-hidden border-r-2 border-accent/70">
            <img src="/assets/studio/backgrounds/webtoon_creator_room.png" alt="" loading="lazy" decoding="async" className="h-full max-w-none object-cover opacity-95" style={{ width: "200%", filter: compactFilterCss(filterPreview.values) }} />
          </div>
        </div>
      ) : null}

      {record.kind === "3d-preset" && recipe ? (() => {
        const referenceImage = sceneReferenceImage(recipe.recipeId);
        return referenceImage ? (
          <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
            <img src={referenceImage} alt="" loading="lazy" decoding="async" className="size-full object-cover opacity-90 transition-transform duration-300 group-hover:scale-[1.035]" />
            <span className="absolute bottom-2 right-2 rounded bg-canvas/85 px-2 py-1 text-xs font-semibold text-fg-2 shadow-sm backdrop-blur-sm">씬 참고</span>
          </div>
        ) : null;
      })() : null}

      {record.kind === "3d-asset" && !paletteColors && recipe ? (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,var(--color-raised),var(--color-panel))]">
          <ProceduralAssetCardArtwork recipeId={recipe.recipeId} />
          <span className="absolute bottom-2 right-2 rounded bg-canvas/80 px-2 py-1 text-xs font-semibold text-fg-3 shadow-sm backdrop-blur-sm">레시피</span>
        </div>
      ) : null}

      {record.kind === "asset" && recipe && !paletteColors ? (
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_40%_40%,var(--color-card),var(--color-panel))]">
          <svg className="size-full p-7 text-fg/55" viewBox="0 0 240 120">
            <path d="M35 31c0-13 11-24 24-24h91c13 0 24 11 24 24v31c0 13-11 24-24 24H96l-30 23 7-23H59c-13 0-24-11-24-24V31Z" fill="var(--color-card)" stroke="currentColor" strokeWidth="4" strokeLinejoin="round"/>
            <path d="M118 58c0-10 8-18 18-18h49c10 0 18 8 18 18v19c0 10-8 18-18 18h-19l-18 14 4-14h-16c-10 0-18-8-18-18V58Z" fill="var(--color-raised)" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" opacity=".82"/>
            <path d="M60 37h76M60 55h54M141 62h40M141 77h29" stroke="currentColor" strokeWidth="6" strokeLinecap="round" opacity=".35"/>
          </svg>
        </div>
      ) : null}

      {recipe ? <MarketVerifiedAssetPreview reference={recipe.recipeId} compact /> : null}
    </>
  );
}
