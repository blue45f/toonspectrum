import {
  Bookmark,
  Check,
  ExternalLink,
  Maximize2,
  Scale,
  Search,
  Sparkles,
} from "lucide-react";

import { AssetImage } from "./reference-asset-ui";

import type { CreatorResource } from "@/shared/lib/creator-resources";
import type { ReferenceDensity } from "@/shared/lib/reference-assets";
import type { ReactNode } from "react";

import { formatReferenceDateRange } from "@/shared/lib/reference-assets";

export function ResultSkeleton({ density }: { density: ReferenceDensity }) {
  return (
    <div className={`grid gap-4 ${density === "compact" ? "sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5" : "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"}`} aria-hidden="true">
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="overflow-hidden rounded-2xl border border-line bg-panel">
          <div className={`${density === "compact" ? "aspect-square" : "aspect-[4/3]"} animate-pulse bg-raised`} />
          <div className="space-y-3 p-4">
            <div className="h-3 w-24 animate-pulse rounded bg-raised" />
            <div className="h-5 w-4/5 animate-pulse rounded bg-raised" />
            <div className="h-3 w-3/5 animate-pulse rounded bg-raised" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function AssetCard({
  item,
  density,
  saved,
  compared,
  savingDisabled,
  onOpen,
  onToggleSaved,
  onToggleCompare,
}: {
  item: CreatorResource;
  density: ReferenceDensity;
  saved: boolean;
  compared: boolean;
  savingDisabled: boolean;
  onOpen: (trigger: HTMLElement) => void;
  onToggleSaved: () => void;
  onToggleCompare: () => void;
}) {
  const asset = item.asset;
  const date = formatReferenceDateRange(item);
  return (
    <article className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-panel transition hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-lg">
      <button
        type="button"
        className="relative block overflow-hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
        onClick={(event) => onOpen(event.currentTarget)}
        aria-label={`${item.title} 상세 보기`}
      >
        <AssetImage item={item} className={`w-full p-3 transition duration-300 group-hover:scale-[1.02] ${density === "compact" ? "aspect-square" : "aspect-[4/3]"}`} />
        <span className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
          <span className="inline-flex min-h-7 items-center rounded-full border border-white/20 bg-black/70 px-2.5 text-[0.68rem] font-bold text-white backdrop-blur">
            CC0
          </span>
          {asset?.isHighlight ? (
            <span className="inline-flex min-h-7 items-center gap-1 rounded-full bg-accent px-2.5 text-[0.68rem] font-bold text-white">
              <Sparkles size={12} aria-hidden="true" /> 대표작
            </span>
          ) : null}
        </span>
        <span className="absolute bottom-3 right-3 grid size-9 place-items-center rounded-full bg-black/70 text-white opacity-0 backdrop-blur transition group-hover:opacity-100 group-focus-within:opacity-100">
          <Maximize2 size={16} aria-hidden="true" />
        </span>
      </button>
      <div className={`flex flex-1 flex-col ${density === "compact" ? "p-3.5" : "p-5"}`}>
        <div className="flex flex-wrap gap-1.5">
          {asset?.department ? <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[0.68rem] font-semibold text-accent">{asset.department}</span> : null}
          {asset?.classification ? <span className="rounded-full bg-raised px-2.5 py-1 text-[0.68rem] font-semibold text-fg-2">{asset.classification}</span> : null}
        </div>
        <h3 className={`mt-3 break-words font-bold leading-snug text-fg ${density === "compact" ? "text-sm" : "text-base"}`}>{item.title}</h3>
        <p className="mt-2 line-clamp-2 text-xs leading-5 text-fg-2">
          {item.creator || "제작자 미상"}
          {date ? ` · ${date}` : ""}
        </p>
        {density === "comfortable" && asset?.medium ? <p className="mt-3 line-clamp-2 text-sm leading-6 text-fg-2">{asset.medium}</p> : null}
        <div className="mt-auto grid grid-cols-3 gap-2 pt-4">
          <button
            type="button"
            className={`inline-flex min-h-10 items-center justify-center rounded-xl border text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${saved ? "border-accent bg-accent-soft text-accent" : "border-line text-fg-2 hover:bg-raised"}`}
            aria-pressed={saved}
            disabled={savingDisabled}
            onClick={onToggleSaved}
            title={saved ? "저장 해제" : "연구 보드에 저장"}
          >
            {saved ? <Check size={15} aria-hidden="true" /> : <Bookmark size={15} aria-hidden="true" />}
            <span className="sr-only">{saved ? "저장됨" : "저장"}</span>
          </button>
          <button
            type="button"
            className={`inline-flex min-h-10 items-center justify-center rounded-xl border text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${compared ? "border-accent bg-accent-soft text-accent" : "border-line text-fg-2 hover:bg-raised"}`}
            aria-pressed={compared}
            onClick={onToggleCompare}
            title={compared ? "비교에서 제거" : "비교에 추가"}
          >
            <Scale size={15} aria-hidden="true" />
            <span className="sr-only">{compared ? "비교에서 제거" : "비교"}</span>
          </button>
          <a
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-line text-fg-2 transition hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            href={item.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Met 원문 열기"
          >
            <ExternalLink size={15} aria-hidden="true" />
            <span className="sr-only">원문 열기</span>
          </a>
        </div>
      </div>
    </article>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid min-h-64 place-items-center rounded-3xl border border-dashed border-line bg-panel p-8 text-center">
      <div className="max-w-lg">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent"><Search size={24} aria-hidden="true" /></span>
        <h3 className="mt-5 text-xl font-bold text-fg">{title}</h3>
        <p className="mt-2 text-sm leading-7 text-fg-2">{description}</p>
        {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
      </div>
    </div>
  );
}
