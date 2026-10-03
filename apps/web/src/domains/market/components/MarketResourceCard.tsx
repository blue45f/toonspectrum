import { ArrowUpRight, Heart, Layers } from "lucide-react";

import { useCommerceConfig } from "../hooks/use-commerce-config";
import { useMarketWishlist } from "../hooks/use-market-wishlist";
import { formatMarketDate, marketKindMeta, marketLicenseMeta } from "../models/market-kind";
import { palettePreviewColors } from "../models/market-preview";

import { MarketCompareToggle } from "./MarketCompareToggle";
import { MarketProductionFitBadge } from "./MarketProductionFitBadge";
import { MarketResourceCover } from "./MarketResourceCover";

import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";


interface MarketResourceCardProps {
  readonly record: CreatorMarketplaceResourceRecord;
  className?: string;
}

export function MarketResourceCard({ record, className }: MarketResourceCardProps) {
  const kind = marketKindMeta(record.kind);
  const license = marketLicenseMeta(record.license);
  const KindIcon = kind.icon;
  const paletteColors = palettePreviewColors(record);
  const { isWishlisted, toggleWishlist, storageError } = useMarketWishlist();
  const { isPaidMode } = useCommerceConfig();
  const wishlisted = isWishlisted(record.id);

  return (
    <article
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl border border-line bg-card shadow-sm",
        "transition-[border-color,transform,box-shadow] duration-200 ease-out-expo",
        "hover:-translate-y-1 hover:border-line-strong hover:shadow-md motion-reduce:transform-none motion-reduce:transition-none",
        className,
      )}
    >
      <div
        className={cn(
          "relative flex aspect-[16/9] items-end justify-between overflow-hidden p-3.5",
          !paletteColors && "text-fg",
        )}
      >
        <Link
          href={`/market/resource/${record.id}`}
          aria-label={`${record.name} 상세 보기`}
          className="absolute inset-0 z-[1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/70"
        >
          <span className="sr-only">{record.name} 상세 보기</span>
        </Link>

        <MarketResourceCover record={record} />

        <div className="absolute left-2.5 top-2.5 z-10 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => toggleWishlist(record)}
            aria-label={wishlisted ? `${record.name} 찜 해제` : `${record.name} 찜하기`}
            aria-pressed={wishlisted}
            className={cn(
              "flex size-11 items-center justify-center rounded-full bg-card/80 shadow-sm backdrop-blur-sm transition-transform hover:scale-110 motion-reduce:transform-none motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
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

        <span className="relative z-[2] rounded-md bg-canvas px-1.5 py-1 font-display text-xs font-semibold uppercase tracking-[0.06em] text-fg shadow-sm">
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

        <span className="numeral tnum absolute right-3.5 top-3 z-[2] inline-flex min-h-6 items-center gap-1 rounded-md bg-canvas px-1.5 text-xs font-semibold text-fg shadow-sm">
          <Layers className="h-3 w-3" aria-hidden="true" />
          {record.entries.length}개
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 border-t border-line p-3.5">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/market/resource/${record.id}`}
            className="line-clamp-2 text-pretty text-sm font-semibold leading-snug text-fg transition-colors duration-150 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
          >
            {record.name}
          </Link>
          <span className="shrink-0 rounded bg-good/15 px-1.5 py-0.5 text-xs font-bold text-good">
            {isPaidMode ? "유료 운영" : "무료"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 text-xs text-fg-2">
          <span className="truncate">{record.publisher.name}</span>
          <span className="numeral tnum shrink-0 rounded bg-raised px-1.5 py-0.5 text-xs font-semibold text-fg-2">
            v{record.resourceVersion}
          </span>
        </div>
        <MarketProductionFitBadge record={record} showCounts />
        {storageError ? <p role="alert" className="rounded-lg border border-bad/30 bg-bad/10 p-2 text-xs text-fg">{storageError}</p> : null}
        <div className="mt-auto flex items-center gap-1.5 pt-1.5 text-xs text-fg-2">
          <span className="inline-flex min-h-6 items-center rounded bg-accent px-2 font-semibold text-on-accent">
            {kind.label}
          </span>
          <span className="truncate">{license.label}</span>
          <ArrowUpRight className="ml-auto h-3.5 w-3.5 shrink-0 text-fg-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100" aria-hidden="true" />
        </div>
        {record.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {record.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="rounded bg-raised px-1.5 py-0.5 text-xs text-fg-2">
                #{tag}
              </span>
            ))}
          </div>
        ) : null}
        <time dateTime={record.updatedAt} className="text-xs text-fg-2">
          {formatMarketDate(record.updatedAt)} 업데이트
        </time>
      </div>
    </article>
  );
}
