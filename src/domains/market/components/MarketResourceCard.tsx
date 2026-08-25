import { ArrowUpRight, Layers } from "lucide-react";

import { formatMarketDate, marketKindMeta, marketLicenseMeta } from "../models/market-kind";
import {
  brushPreviewData,
  palettePreviewColors,
} from "../models/market-preview";

import type { CreatorMarketplaceResourceRecord } from "@/lib/creator-marketplace-resource-contract";

import { cn } from "@/lib/utils";
import Link from "@/src/compat/router-link";

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

  return (
    <Link
      href={`/market/resource/${record.id}`}
      className={cn(
        "group flex flex-col overflow-hidden rounded-xl border border-line bg-card shadow-sm",
        "transition-[border-color,transform,box-shadow] duration-200 ease-out-expo",
        "hover:-translate-y-1 hover:border-line-strong hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
        className
      )}
    >
      <div
        aria-hidden="true"
        className="relative flex aspect-[16/9] items-end justify-between overflow-hidden p-3.5"
        style={
          paletteColors
            ? undefined
            : {
                background: `linear-gradient(140deg, oklch(0.34 0.075 ${kind.hue}) 0%, oklch(0.24 0.045 ${kind.hue}) 55%, oklch(0.20 0.025 ${kind.hue}) 100%)`,
              }
        }
      >
        {paletteColors ? (
          <span className="absolute inset-0 flex">
            {paletteColors.slice(0, 10).map((color, index) => (
              <span
                key={`${color}-${index}`}
                className="h-full flex-1 transition-[flex-grow] duration-200 ease-out-expo group-hover:grow-[1.35]"
                style={{ backgroundColor: color }}
              />
            ))}
          </span>
        ) : null}

        {/* Brush Stroke Pattern simulation for brush cards */}
        {record.kind === "brush" && !paletteColors ? (
          <svg className="absolute inset-0 size-full opacity-35 transition-opacity duration-200 group-hover:opacity-55" viewBox="0 0 200 100" preserveAspectRatio="none">
            <path
              d="M 10 70 Q 50 15 100 55 T 190 35"
              fill="none"
              stroke={`oklch(0.85 0.12 ${kind.hue})`}
              strokeWidth={Math.max(3, Math.min(14, brushPreviews?.[0]?.size ?? 8))}
              strokeLinecap="round"
              strokeDasharray="1 0"
            />
          </svg>
        ) : null}

        {/* Template Cut preview simulation for template cards */}
        {record.kind === "template" && !paletteColors ? (
          <div className="absolute inset-4 grid grid-cols-2 gap-1.5 opacity-25 transition-opacity duration-200 group-hover:opacity-45">
            <div className="rounded border border-dashed border-white" />
            <div className="rounded border border-dashed border-white" />
            <div className="col-span-2 rounded border border-dashed border-white" />
          </div>
        ) : null}

        <span
          className={cn(
            "font-display text-[0.6rem] font-medium uppercase tracking-[0.14em]",
            paletteColors
              ? "rounded-md bg-canvas/65 px-1.5 py-0.5 text-fg backdrop-blur-sm shadow-sm"
              : "text-fg/90"
          )}
        >
          {kind.english}
        </span>

        {!paletteColors ? (
          <KindIcon strokeWidth={1.5} className="h-9 w-9 text-fg/35 transition-colors duration-200 group-hover:text-fg/70" />
        ) : null}

        {!paletteColors ? (
          <span
            className="absolute inset-x-0 bottom-0 h-[3px]"
            style={{
              background: `linear-gradient(90deg, oklch(0.72 0.15 ${kind.hue}), oklch(0.62 0.12 ${(kind.hue + 40) % 360}), oklch(0.52 0.09 ${(kind.hue + 90) % 360}))`,
            }}
          />
        ) : null}

        <span className="numeral tnum absolute right-3.5 top-3 inline-flex items-center gap-1 rounded-md bg-canvas/55 px-1.5 py-0.5 text-[0.65rem] font-semibold text-fg/90 backdrop-blur-sm shadow-sm">
          <Layers className="h-3 w-3" aria-hidden="true" />
          {record.entries.length}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 border-t border-line p-3.5">
        <h3 className="line-clamp-2 text-pretty text-sm font-semibold leading-snug text-fg group-hover:text-accent transition-colors duration-150">
          {record.name}
        </h3>
        <p className="truncate text-xs text-fg-2">{record.publisher.name}</p>
        <div className="mt-auto flex items-center gap-1.5 pt-1.5 text-[0.68rem] text-fg-3">
          <span
            className="rounded px-1.5 py-0.5 font-medium"
            style={{
              backgroundColor: `oklch(0.72 0.10 ${kind.hue} / 0.15)`,
              color: `oklch(0.85 0.10 ${kind.hue})`,
            }}
          >
            {kind.label}
          </span>
          <span className="truncate">{license.label}</span>
          <ArrowUpRight className="ml-auto h-3.5 w-3.5 shrink-0 text-fg-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
        </div>
        {record.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {record.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="rounded bg-raised px-1.5 py-0.5 text-[0.65rem] text-fg-2">#{tag}</span>
            ))}
          </div>
        ) : null}
        <time dateTime={record.updatedAt} className="text-[0.65rem] text-fg-3">
          {formatMarketDate(record.updatedAt)} 업데이트
        </time>
      </div>
    </Link>
  );
}
