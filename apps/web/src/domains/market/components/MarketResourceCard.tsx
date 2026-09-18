import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import { ArrowUpRight, Heart, Layers } from "lucide-react";

import { useMarketWishlist } from "../hooks/use-market-wishlist";
import { formatMarketDate, marketKindMeta, marketLicenseMeta } from "../models/market-kind";
import {
  brushPreviewData,
  filterPreviewData,
  palettePreviewColors,
  recipePreviewData,
  templatePreviewData,
} from "../models/market-preview";

import { MarketVerifiedAssetPreview } from "./MarketVerifiedAssetPreview";

import { MarketCompareToggle } from "./MarketCompareToggle";
import { MarketProductionFitBadge } from "./MarketProductionFitBadge";

import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

import { cn } from "@/shared/lib/utils";
import Link from "@/compat/router-link";


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

interface MarketResourceCardProps {
  readonly record: CreatorMarketplaceResourceRecord;
  className?: string;
}

export function MarketResourceCard({ record, className }: MarketResourceCardProps) {
  const kind = marketKindMeta(record.kind);
  const license = marketLicenseMeta(record.license);
  const KindIcon = kind.icon;
  const paletteColors = palettePreviewColors(record);
  const brushPreviews = brushPreviewData(record);
  const filterPreview = filterPreviewData(record)?.[0];
  const templatePreview = templatePreviewData(record)?.[0];
  const recipe = recipePreviewData(record)?.[0];
  const { isWishlisted, toggleWishlist } = useMarketWishlist();
  const wishlisted = isWishlisted(record.id);

  return (
    <article
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl border border-line bg-card shadow-sm",
        "transition-[border-color,transform,box-shadow] duration-200 ease-out-expo",
        "hover:-translate-y-1 hover:border-line-strong hover:shadow-md",
        className,
      )}
    >
      <div
        className={cn(
          "relative flex aspect-[16/9] items-end justify-between overflow-hidden p-3.5",
          !paletteColors
            && "bg-[linear-gradient(140deg,var(--color-card)_0%,var(--color-panel)_55%,var(--color-canvas)_100%)] text-fg",
        )}
      >
        <Link
          href={formatI18nTemplate(translateCurrentStaticSourceText("domains.market.components.MarketResourceCard", "en", "/market/resource/{v0}"), { v0: String(record.id) })}
          aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.market.components.MarketResourceCard", "ko", "{v0} 상세 보기"), { v0: String(record.name) })}
          className="absolute inset-0 z-[1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/70"
        >
          <span className="sr-only">{record.name} {translateCurrentStaticSourceText("domains.market.components.MarketResourceCard", "ko", "상세 보기")}</span>
        </Link>

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
                stroke={brush.color ?? formatI18nTemplate(translateCurrentStaticSourceText("domains.market.components.MarketResourceCard", "en", "oklch(0.82 0.12 {v0})"), { v0: String(kind.hue + index * 24) })}
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
              <span className="absolute bottom-2 right-2 rounded bg-canvas/85 px-2 py-1 text-[0.58rem] font-semibold text-fg-2 shadow-sm backdrop-blur-sm">{translateCurrentStaticSourceText("domains.market.components.MarketResourceCard", "ko", "씬 참고")}</span>
            </div>
          ) : null;
        })() : null}

        {record.kind === "3d-asset" && !paletteColors && recipe ? (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,var(--color-raised),var(--color-panel))]">
            <ProceduralAssetCardArtwork recipeId={recipe.recipeId} />
            <span className="absolute bottom-2 right-2 rounded bg-canvas/80 px-2 py-1 text-[0.58rem] font-semibold text-fg-3 shadow-sm backdrop-blur-sm">{translateCurrentStaticSourceText("domains.market.components.MarketResourceCard", "ko", "레시피")}</span>
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

        <div className="absolute left-2.5 top-2.5 z-10 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => toggleWishlist(record)}
            aria-label={wishlisted ? formatI18nTemplate(translateCurrentStaticSourceText("domains.market.components.MarketResourceCard", "ko", "{v0} 찜 해제"), { v0: String(record.name) }) : formatI18nTemplate(translateCurrentStaticSourceText("domains.market.components.MarketResourceCard", "ko", "{v0} 찜하기"), { v0: String(record.name) })}
            aria-pressed={wishlisted}
            className={cn(
              "flex size-7 items-center justify-center rounded-full bg-card/80 shadow-sm backdrop-blur-sm transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
              wishlisted ? "text-warn" : "text-fg-3 hover:text-warn",
            )}
          >
            <Heart
              className={cn("size-3.5", wishlisted && "fill-warn text-warn")}
              aria-hidden="true"
            />
          </button>
          <MarketCompareToggle record={record} compact />
        </div>

        <span className="relative z-[2] rounded-md bg-canvas px-1.5 py-1 font-display text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-fg shadow-sm">
          {kind.english}
        </span>

        {!paletteColors ? (
          <KindIcon
            strokeWidth={1.5}
            className="relative z-[2] h-9 w-9 text-fg/45 transition-colors duration-200 group-hover:text-fg/75"
            aria-hidden="true"
          />
        ) : null}

        {!paletteColors ? (
          <span
            className="absolute inset-x-0 bottom-0 h-[3px]"
            style={{
              background: `linear-gradient(90deg, oklch(0.72 0.15 ${kind.hue}), oklch(0.62 0.12 ${(kind.hue + 40) % 360}), oklch(0.52 0.09 ${(kind.hue + 90) % 360}))`,
            }}
          />
        ) : null}

        <span className="numeral tnum absolute right-3.5 top-3 z-[2] inline-flex min-h-6 items-center gap-1 rounded-md bg-canvas px-1.5 text-[0.65rem] font-semibold text-fg shadow-sm">
          <Layers className="h-3 w-3" aria-hidden="true" />
          {record.entries.length}{translateCurrentStaticSourceText("domains.market.components.MarketResourceCard", "ko", "개")}</span>
      </div>

      <div className="flex flex-1 flex-col gap-2 border-t border-line p-3.5">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={formatI18nTemplate(translateCurrentStaticSourceText("domains.market.components.MarketResourceCard", "en", "/market/resource/{v0}"), { v0: String(record.id) })}
            className="line-clamp-2 text-pretty text-sm font-semibold leading-snug text-fg transition-colors duration-150 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
          >
            {record.name}
          </Link>
          <span className="shrink-0 rounded bg-good/15 px-1.5 py-0.5 text-[0.62rem] font-bold text-good">
            {translateCurrentStaticSourceText("domains.market.components.MarketResourceCard", "ko", "무료")}</span>
        </div>
        <div className="flex items-center justify-between gap-2 text-xs text-fg-2">
          <span className="truncate">{record.publisher.name}</span>
          <span className="numeral tnum shrink-0 rounded bg-raised px-1.5 py-0.5 text-[0.65rem] font-semibold text-fg-2">
            v{record.resourceVersion}
          </span>
        </div>
        <MarketProductionFitBadge record={record} showCounts />
        <div className="mt-auto flex items-center gap-1.5 pt-1.5 text-[0.68rem] text-fg-3">
          <span className="inline-flex min-h-6 items-center rounded bg-accent px-2 font-semibold text-on-accent">
            {kind.label}
          </span>
          <span className="truncate">{license.label}</span>
          <ArrowUpRight className="ml-auto h-3.5 w-3.5 shrink-0 text-fg-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100" aria-hidden="true" />
        </div>
        {record.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {record.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="rounded bg-raised px-1.5 py-0.5 text-[0.65rem] text-fg-2">
                #{tag}
              </span>
            ))}
          </div>
        ) : null}
        <time dateTime={record.updatedAt} className="text-[0.65rem] text-fg-3">
          {formatMarketDate(record.updatedAt)} {translateCurrentStaticSourceText("domains.market.components.MarketResourceCard", "ko", "업데이트")}</time>
      </div>
    </article>
  );
}
