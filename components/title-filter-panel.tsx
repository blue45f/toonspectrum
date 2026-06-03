// 전 페이지 공용 필터 패널 — 표시할 facet을 선택해 렌더(캘린더/탐색/추천/랭킹 공용).
import { GENRES, TAGS } from "@/lib/taxonomy";
import {
  AGE_OPTIONS,
  MIN_RATING_OPTIONS,
  PRICING_OPTIONS,
  STATUS_OPTIONS,
  TYPE_OPTIONS,
  YEAR_BUCKETS,
  countActiveTitleFilters,
  type TitleFilterState,
} from "@/lib/title-filters";
import { PLATFORMS } from "@/lib/platforms";
import type { PlatformId } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Bookmark, Check, SlidersHorizontal, X } from "lucide-react";
import type { ReactNode } from "react";

export type FilterFacet =
  | "saved"
  | "type"
  | "genre"
  | "status"
  | "platform"
  | "age"
  | "pricing"
  | "minRating"
  | "year"
  | "tag"
  | "adapted";

const ALL_FACETS: FilterFacet[] = [
  "saved", "type", "genre", "status", "platform", "age", "pricing", "minRating", "year", "tag", "adapted",
];

function toggle<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

function chip(active: boolean) {
  return cn(
    "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[0.72rem] transition-colors",
    active
      ? "border-accent/60 bg-accent-soft/60 text-fg"
      : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg"
  );
}

// wide facet(장르·태그 등 칩이 많은 그룹)은 중간폭부터 그리드 전체 폭을 차지해
// 좁은 칸에 칩이 과하게 줄바꿈되는 것을 막는다.
function FacetRow({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-1.5", wide && "sm:col-span-2 md:col-span-3")}>
      <span className="text-[0.68rem] font-medium uppercase tracking-wide text-fg-3">{label}</span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

export function TitleFilterPanel({
  value,
  onChange,
  facets = ALL_FACETS,
  platformOptions,
  savedCount,
  remember,
  onToggleRemember,
  className,
}: {
  value: TitleFilterState;
  onChange: (next: TitleFilterState) => void;
  facets?: FilterFacet[];
  platformOptions?: PlatformId[]; // 데이터 기반 노출(빈 플랫폼 숨김). 미지정 시 전체.
  savedCount?: number;
  remember?: boolean; // "필터 기억" 상태(undefined면 토글 숨김)
  onToggleRemember?: () => void;
  className?: string;
}) {
  const show = (f: FilterFacet) => facets.includes(f);
  const patch = (p: Partial<TitleFilterState>) => onChange({ ...value, ...p });
  const active = countActiveTitleFilters(value);
  const platforms = (platformOptions ?? (Object.keys(PLATFORMS) as PlatformId[]))
    .map((id) => PLATFORMS[id])
    .filter(Boolean);

  return (
    <div className={cn("rounded-2xl border border-line bg-panel/40 p-4", className)}>
      <div className="mb-3 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-fg">
          <SlidersHorizontal size={15} className="text-accent" /> 필터
          {active > 0 && (
            <span className="rounded-full bg-accent/15 px-1.5 text-[0.68rem] text-accent">{active}</span>
          )}
        </span>
        <div className="flex items-center gap-3">
          {onToggleRemember && (
            <button
              type="button"
              onClick={onToggleRemember}
              role="checkbox"
              aria-checked={!!remember}
              className="inline-flex items-center gap-1.5 text-[0.72rem] text-fg-3 hover:text-fg"
              title="필터를 이 브라우저에 저장해 다음 방문 때 복원합니다"
            >
              <span
                className={cn(
                  "grid size-3.5 place-items-center rounded border transition-colors",
                  remember ? "border-accent bg-accent text-on-accent" : "border-line-strong"
                )}
              >
                {remember && <Check size={10} strokeWidth={3} />}
              </span>
              필터 기억
            </button>
          )}
          {active > 0 && (
            <button
              type="button"
              onClick={() => onChange({ ...value, ...emptyExceptSort(value) })}
              className="inline-flex items-center gap-1 text-[0.72rem] text-fg-3 hover:text-fg"
            >
              <X size={12} /> 초기화
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-3.5 sm:grid-cols-2 md:grid-cols-3">
        {show("saved") && (
          <FacetRow label="보관함">
            <button
              type="button"
              onClick={() => patch({ savedOnly: !value.savedOnly })}
              aria-pressed={value.savedOnly}
              className={chip(value.savedOnly)}
            >
              <Bookmark size={12} className={value.savedOnly ? "fill-accent text-accent" : ""} />
              내 서재만{typeof savedCount === "number" ? ` (${savedCount})` : ""}
            </button>
          </FacetRow>
        )}

        {show("type") && (
          <FacetRow label="유형">
            {TYPE_OPTIONS.map((o) => (
              <button key={o.value} type="button" onClick={() => patch({ types: toggle(value.types, o.value) })} aria-pressed={value.types.includes(o.value)} className={chip(value.types.includes(o.value))}>
                {o.label}
              </button>
            ))}
          </FacetRow>
        )}

        {show("status") && (
          <FacetRow label="연재 상태">
            {STATUS_OPTIONS.map((o) => (
              <button key={o.value} type="button" onClick={() => patch({ status: toggle(value.status, o.value) })} aria-pressed={value.status.includes(o.value)} className={chip(value.status.includes(o.value))}>
                {o.label}
              </button>
            ))}
          </FacetRow>
        )}

        {show("pricing") && (
          <FacetRow label="가격">
            {PRICING_OPTIONS.map((o) => (
              <button key={o.value} type="button" onClick={() => patch({ pricing: toggle(value.pricing, o.value) })} aria-pressed={value.pricing.includes(o.value)} className={chip(value.pricing.includes(o.value))}>
                {o.label}
              </button>
            ))}
          </FacetRow>
        )}

        {show("age") && (
          <FacetRow label="이용가">
            {AGE_OPTIONS.map((o) => (
              <button key={o.value} type="button" onClick={() => patch({ ages: toggle(value.ages, o.value) })} aria-pressed={value.ages.includes(o.value)} className={chip(value.ages.includes(o.value))}>
                {o.label}
              </button>
            ))}
          </FacetRow>
        )}

        {show("minRating") && (
          <FacetRow label="최소 평점">
            {MIN_RATING_OPTIONS.map((o) => (
              <button key={o.value} type="button" onClick={() => patch({ minRating: o.value })} aria-pressed={value.minRating === o.value} className={chip(value.minRating === o.value)}>
                {o.label}
              </button>
            ))}
          </FacetRow>
        )}

        {show("year") && (
          <FacetRow label="연재 시작">
            {YEAR_BUCKETS.map((o) => {
              const on = !!value.yearRange && value.yearRange[0] === o.range[0] && value.yearRange[1] === o.range[1];
              return (
                <button key={o.label} type="button" onClick={() => patch({ yearRange: on ? null : o.range })} aria-pressed={on} className={chip(on)}>
                  {o.label}
                </button>
              );
            })}
          </FacetRow>
        )}

        {show("adapted") && (
          <FacetRow label="원작 연결">
            <button type="button" onClick={() => patch({ adaptedOnly: !value.adaptedOnly })} aria-pressed={value.adaptedOnly} className={chip(value.adaptedOnly)}>
              원작·2차창작
            </button>
          </FacetRow>
        )}

        {show("platform") && (
          <FacetRow label="플랫폼">
            {platforms.map((p) => (
              <button key={p.id} type="button" onClick={() => patch({ platforms: toggle(value.platforms, p.id) })} aria-pressed={value.platforms.includes(p.id)} className={chip(value.platforms.includes(p.id))}>
                <span className="size-1.5 rounded-full" style={{ backgroundColor: p.color }} />
                {p.short}
              </button>
            ))}
          </FacetRow>
        )}

        {show("genre") && (
          <FacetRow label="장르" wide>
            {GENRES.map((g) => (
              <button key={g} type="button" onClick={() => patch({ genres: toggle(value.genres, g) })} aria-pressed={value.genres.includes(g)} className={chip(value.genres.includes(g))}>
                {g}
              </button>
            ))}
          </FacetRow>
        )}

        {show("tag") && (
          <FacetRow label="태그" wide>
            {TAGS.slice(0, 18).map((t) => (
              <button key={t} type="button" onClick={() => patch({ tags: toggle(value.tags, t) })} aria-pressed={value.tags.includes(t)} className={chip(value.tags.includes(t))}>
                #{t}
              </button>
            ))}
          </FacetRow>
        )}
      </div>
    </div>
  );
}

// sort 등 패널이 관리하지 않는 필드는 보존하면서 필터만 초기화.
function emptyExceptSort(prev: TitleFilterState): TitleFilterState {
  return {
    ...prev,
    types: [],
    genres: [],
    status: [],
    platforms: [],
    ages: [],
    pricing: [],
    minRating: 0,
    yearRange: null,
    tags: [],
    savedOnly: false,
    adaptedOnly: false,
  };
}
