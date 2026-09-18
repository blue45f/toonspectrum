import { ChevronLeft, ChevronRight, Image as ImageIcon } from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import type { StudioTemplateCatalogItem } from "../studio-template-catalog";
import type {
  StudioTemplateCompositionPage,
  StudioTemplateLayoutKind,
} from "../studio-template-system";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

type Locale = string;

export interface StudioTemplateVisualPreviewProps {
  readonly template: StudioTemplateCatalogItem;
  readonly locale?: string;
  readonly compact?: boolean;
  readonly showNavigation?: boolean;
  readonly pageIndex?: number;
  readonly onPageIndexChange?: (index: number) => void;
  readonly className?: string;
}

function clampCount(value: number, maximum = 12): number {
  return Math.max(1, Math.min(maximum, Math.floor(value)));
}
function templateAccent(template: StudioTemplateCatalogItem): string {
  const color = template.definition.slots
    .map((slot) => slot.defaultValue)
    .find((value) => value?.kind === "color");
  return color?.kind === "color" ? color.value : "#6366f1";
}

function tone(hex: string, alpha: string): string {
  return /^#[0-9a-f]{6}$/iu.test(hex) ? `${hex}${alpha}` : hex;
}

function PlaceholderImage({ accent }: { readonly accent: string }) {
  useBilingualI18nRevision();
  return (
    <div
      className="grid size-full place-items-center rounded-md border"
      style={{ borderColor: tone(accent, "55"), backgroundColor: tone(accent, "12") }}
    >
      <ImageIcon size={18} style={{ color: accent }} aria-hidden />
    </div>
  );
}

function TextLines({ count = 3 }: { readonly count?: number }) {
  useBilingualI18nRevision();
  return (
    <div className="space-y-1.5" aria-hidden>
      {Array.from({ length: count }, (_, index) => (
        <span
          key={index}
          className="block h-1.5 rounded-full bg-slate-300/85 dark:bg-neutral-600"
          style={{ width: `${Math.max(42, 100 - index * 17)}%` }}
        />
      ))}
    </div>
  );
}
function VerticalStrip({
  page,
  accent,
}: {
  readonly page: StudioTemplateCompositionPage;
  readonly accent: string;
}) {
  useBilingualI18nRevision();
  const count = clampCount(page.panelCount, 8);
  return (
    <div className="mx-auto flex h-full w-[58%] flex-col gap-1.5 rounded-md bg-white p-2 shadow-sm dark:bg-neutral-950">
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="relative min-h-0 flex-1 overflow-hidden rounded-sm border border-slate-300 bg-slate-100 dark:border-neutral-700 dark:bg-neutral-800"
          style={{ flexGrow: index % 3 === 0 ? 1.45 : 1 }}
        >
          <span
            className="absolute inset-x-2 bottom-1 h-1 rounded-full"
            style={{ backgroundColor: tone(accent, index % 2 === 0 ? "77" : "33") }}
          />
        </div>
      ))}
    </div>
  );
}

function PanelGrid({
  page,
  accent,
}: {
  readonly page: StudioTemplateCompositionPage;
  readonly accent: string;
}) {
  useBilingualI18nRevision();
  const count = clampCount(page.panelCount, 6);
  return (
    <div className="grid size-full grid-cols-2 gap-2 rounded-md bg-white p-3 shadow-sm dark:bg-neutral-950">
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="relative min-h-0 overflow-hidden rounded-sm border border-slate-300 bg-slate-100 dark:border-neutral-700 dark:bg-neutral-800"
          style={index === 0 && count % 2 === 1 ? { gridColumn: "1 / -1" } : undefined}
        >
          <span className="absolute left-2 top-2 size-3 rounded-full" style={{ backgroundColor: tone(accent, "66") }} />
          <span className="absolute inset-x-2 bottom-2 h-1 rounded-full bg-slate-300 dark:bg-neutral-600" />
        </div>
      ))}
    </div>
  );
}
function CharacterSheet({ accent }: { readonly accent: string }) {
  useBilingualI18nRevision();
  return (
    <div className="grid size-full grid-cols-[1fr_1fr_1fr_.7fr] gap-2 rounded-md bg-white p-3 shadow-sm dark:bg-neutral-950">
      {[0, 1, 2].map((index) => (
        <div key={index} className="flex min-h-0 flex-col items-center justify-end rounded border border-slate-200 bg-slate-50 p-1 dark:border-neutral-700 dark:bg-neutral-900">
          <span className="mb-1 size-7 rounded-full" style={{ backgroundColor: tone(accent, "44") }} />
          <span className="h-[62%] w-8 rounded-t-full" style={{ backgroundColor: tone(accent, index === 1 ? "88" : "66") }} />
          <span className="mt-1 h-1 w-10 rounded-full bg-slate-300 dark:bg-neutral-600" />
        </div>
      ))}
      <div className="grid content-start gap-2">
        <PlaceholderImage accent={accent} />
        <div className="grid grid-cols-2 gap-1">
          {["ff", "bb", "88", "55"].map((alpha) => (
            <span key={alpha} className="aspect-square rounded-sm" style={{ backgroundColor: tone(accent, alpha) }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ExpressionGrid({
  page,
  accent,
}: {
  readonly page: StudioTemplateCompositionPage;
  readonly accent: string;
}) {
  useBilingualI18nRevision();
  const count = clampCount(page.panelCount, 12);
  return (
    <div className="grid size-full grid-cols-4 gap-2 rounded-md bg-white p-3 shadow-sm dark:bg-neutral-950">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="grid min-h-0 place-items-center rounded border border-slate-200 bg-slate-50 p-1 dark:border-neutral-700 dark:bg-neutral-900">
          <span className="relative block aspect-square w-[60%] rounded-full" style={{ backgroundColor: tone(accent, "33") }}>
            <span className="absolute left-[24%] top-[36%] size-1 rounded-full bg-slate-600" />
            <span className="absolute right-[24%] top-[36%] size-1 rounded-full bg-slate-600" />
            <span className="absolute bottom-[24%] left-1/2 h-1 w-4 -translate-x-1/2 rounded-full" style={{ backgroundColor: tone(accent, index % 2 ? "aa" : "66") }} />
          </span>
        </div>
      ))}
    </div>
  );
}
function EnvironmentBoard({ accent }: { readonly accent: string }) {
  useBilingualI18nRevision();
  return (
    <div className="grid size-full grid-cols-[1.6fr_.8fr] gap-2 rounded-md bg-white p-3 shadow-sm dark:bg-neutral-950">
      <div className="grid min-h-0 grid-rows-[1.4fr_.7fr] gap-2">
        <PlaceholderImage accent={accent} />
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((index) => (
            <div key={index} className="rounded border border-slate-200 bg-slate-100 dark:border-neutral-700 dark:bg-neutral-800" />
          ))}
        </div>
      </div>
      <div className="space-y-3 rounded border border-slate-200 bg-slate-50 p-2 dark:border-neutral-700 dark:bg-neutral-900">
        <TextLines count={4} />
        <div className="grid grid-cols-3 gap-1">
          {["ff", "cc", "99", "77", "55", "33"].map((alpha) => (
            <span key={alpha} className="aspect-square rounded-sm" style={{ backgroundColor: tone(accent, alpha) }} />
          ))}
        </div>
        <TextLines count={3} />
      </div>
    </div>
  );
}
function Poster({ accent }: { readonly accent: string }) {
  useBilingualI18nRevision();
  return (
    <div
      className="relative size-full overflow-hidden rounded-md border bg-white p-4 shadow-sm dark:bg-neutral-950"
      style={{ borderColor: tone(accent, "55") }}
    >
      <div className="absolute inset-0 opacity-20" style={{ backgroundColor: accent }} />
      <div className="relative grid size-full grid-rows-[1fr_auto] gap-3">
        <PlaceholderImage accent={accent} />
        <div>
          <span className="block h-3 w-3/4 rounded-full" style={{ backgroundColor: accent }} />
          <span className="mt-2 block h-1.5 w-1/2 rounded-full bg-slate-400" />
          <span
            className="mt-3 inline-block rounded-full px-3 py-1 text-[0.45rem] font-black text-white"
            style={{ backgroundColor: accent }}
          >
            CTA
          </span>
        </div>
      </div>
    </div>
  );
}

function SocialCarousel({ accent }: { readonly accent: string }) {
  useBilingualI18nRevision();
  return (
    <div className="grid size-full grid-cols-[1.05fr_.95fr] gap-3 rounded-md bg-white p-4 shadow-sm dark:bg-neutral-950">
      <PlaceholderImage accent={accent} />
      <div className="flex min-h-0 flex-col justify-between">
        <div>
          <span className="block h-3 w-full rounded-full" style={{ backgroundColor: accent }} />
          <div className="mt-3"><TextLines count={4} /></div>
        </div>
        <span className="block h-2 w-1/2 rounded-full" style={{ backgroundColor: tone(accent, "88") }} />
      </div>
    </div>
  );
}
function Slide({
  page,
  accent,
}: {
  readonly page: StudioTemplateCompositionPage;
  readonly accent: string;
}) {
  useBilingualI18nRevision();
  const columns = Math.max(1, Math.min(4, Math.ceil(page.panelCount / 2)));
  return (
    <div className="grid size-full grid-rows-[auto_1fr_auto] gap-3 rounded-md bg-white p-4 shadow-sm dark:bg-neutral-950">
      <div>
        <span className="block h-3 w-2/3 rounded-full" style={{ backgroundColor: accent }} />
        <span className="mt-2 block h-1.5 w-1/3 rounded-full bg-slate-300 dark:bg-neutral-600" />
      </div>
      <div className="grid min-h-0 gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {Array.from({ length: columns }, (_, index) => (
          <div key={index} className="rounded border border-slate-200 bg-slate-50 p-2 dark:border-neutral-700 dark:bg-neutral-900">
            {index === 0 ? <PlaceholderImage accent={accent} /> : <TextLines count={4} />}
          </div>
        ))}
      </div>
      <span className="block h-1 w-full rounded-full" style={{ backgroundColor: tone(accent, "55") }} />
    </div>
  );
}

function Storyboard({
  page,
  accent,
}: {
  readonly page: StudioTemplateCompositionPage;
  readonly accent: string;
}) {
  useBilingualI18nRevision();
  const count = clampCount(page.panelCount, 6);
  return (
    <div className="grid size-full grid-cols-2 gap-2 rounded-md bg-white p-3 shadow-sm dark:bg-neutral-950">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="grid min-h-0 grid-rows-[1fr_auto] overflow-hidden rounded border border-slate-300 dark:border-neutral-700">
          <div className="relative bg-slate-100 dark:bg-neutral-800">
            <span className="absolute left-2 top-2 grid size-4 place-items-center rounded-full text-[0.45rem] font-black text-white" style={{ backgroundColor: accent }}>{index + 1}</span>
          </div>
          <div className="space-y-1 bg-white p-1.5 dark:bg-neutral-950"><TextLines count={2} /></div>
        </div>
      ))}
    </div>
  );
}
function renderLayout(
  layout: StudioTemplateLayoutKind,
  page: StudioTemplateCompositionPage,
  accent: string,
): ReactNode {
  if (layout === "vertical-strip") return <VerticalStrip page={page} accent={accent} />;
  if (layout === "panel-grid") return <PanelGrid page={page} accent={accent} />;
  if (layout === "character-sheet") return <CharacterSheet accent={accent} />;
  if (layout === "expression-grid") return <ExpressionGrid page={page} accent={accent} />;
  if (layout === "environment-board") return <EnvironmentBoard accent={accent} />;
  if (layout === "poster") return <Poster accent={accent} />;
  if (layout === "social-carousel") return <SocialCarousel accent={accent} />;
  if (layout === "slide") return <Slide page={page} accent={accent} />;
  return <Storyboard page={page} accent={accent} />;
}

function pageLabel(page: StudioTemplateCompositionPage, bt: (ko: string, en: string) => string): string {
  return bt(page.labelKo, page.labelEn);
}

function fallbackLabel(template: StudioTemplateCatalogItem, bt: (ko: string, en: string) => string): string {
  return bt(template.titleKo, template.titleEn);
}

function normalizedIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return ((Math.floor(index) % length) + length) % length;
}
export function StudioTemplateVisualPreview({
  template,
  locale: _locale,
  compact = false,
  showNavigation = false,
  pageIndex,
  onPageIndexChange,
  className,
}: StudioTemplateVisualPreviewProps) {
  const bt = useBilingual("StudioTemplateVisualPreview");
  const composition = template.definition.composition;
  const [internalIndex, setInternalIndex] = useState(0);

  useEffect(() => {
    setInternalIndex(0);
  }, [template.id]);

  const pages = composition?.pages ?? [];
  const requestedIndex = pageIndex ?? internalIndex;
  const activeIndex = normalizedIndex(requestedIndex, pages.length);
  const activePage = pages[activeIndex] ?? null;
  const accent = useMemo(() => templateAccent(template), [template]);

  const setPage = (nextIndex: number) => {
    const resolved = normalizedIndex(nextIndex, pages.length);
    if (pageIndex === undefined) setInternalIndex(resolved);
    onPageIndexChange?.(resolved);
  };

  if (!composition || !activePage) {
    return (
      <div className={cn("grid aspect-[4/3] place-items-center rounded-xl border border-line bg-panel", className)}>
        <div className="text-center text-xs text-fg-3">
          <ImageIcon size={22} className="mx-auto mb-2" aria-hidden />
          {fallbackLabel(template, bt)}
        </div>
      </div>
    );
  }

  const canvasStyle: CSSProperties = {
    aspectRatio: String(composition.aspectRatio),
  };
  return (
    <figure
      className={cn(
        "overflow-hidden rounded-xl border border-line bg-slate-200/70 dark:bg-neutral-900",
        className,
      )}
      data-studio-template-preview={template.id}
      data-template-page-id={activePage.id}
    >
      <div className={cn("grid place-items-center p-3", compact ? "h-44" : "h-72 sm:h-80")}>
        <div className="h-full max-w-full overflow-hidden rounded-lg" style={canvasStyle}>
          {renderLayout(activePage.layout, activePage, accent)}
        </div>
      </div>
      <figcaption className="flex min-h-11 items-center justify-between gap-2 border-t border-line bg-card px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-black text-fg">{pageLabel(activePage, bt)}</p>
          <p className="text-[0.65rem] text-fg-3">
            {activePage.panelCount > 0
              ? bt(`${activePage.panelCount}개 컷·영역`, `${activePage.panelCount} panels`)
              : bt("레이아웃", "Layout")}
          </p>
        </div>
        {showNavigation && pages.length > 1 ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage(activeIndex - 1)}
              aria-label={bt("이전 템플릿 페이지", "Previous template page")}
              className="grid size-9 place-items-center rounded-lg border border-line text-fg-3 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <ChevronLeft size={15} aria-hidden />
            </button>
            <span className="min-w-10 text-center text-[0.68rem] font-bold tabular-nums text-fg-3">
              {activeIndex + 1}/{pages.length}
            </span>
            <button
              type="button"
              onClick={() => setPage(activeIndex + 1)}
              aria-label={bt("다음 템플릿 페이지", "Next template page")}
              className="grid size-9 place-items-center rounded-lg border border-line text-fg-3 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <ChevronRight size={15} aria-hidden />
            </button>
          </div>
        ) : (
          <span className="text-[0.65rem] font-bold text-fg-3">{pages.length}P</span>
        )}
      </figcaption>
    </figure>
  );
}
