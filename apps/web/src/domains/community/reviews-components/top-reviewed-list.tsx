import type { ReviewsResponse, Title } from "@/shared/lib/types";

import { CoverImage } from "@/shared/components/cover-image";
import { spectrumGradient } from "@/shared/lib/genre-color";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

type TopReviewedItem = ReviewsResponse["topReviewed"][number];

/** 표지가 없거나 불러오지 못했을 때 쓰는 작품 고유 그라디언트. */
function CoverSwatch({ title }: { readonly title: Title }) {
  return (
    <span
      aria-hidden="true"
      className="block h-full w-full"
      style={{ background: `linear-gradient(140deg, ${title.cover[0]}, ${title.cover[1]})` }}
    />
  );
}

/** 집계 목록 상태 — 불러오는 중·불러오지 못함·응답 받음(비어 있을 수 있음)을 구분한다. */
export type TopReviewedStatus = "loading" | "unavailable" | "ready";

const SKELETON_ROW_COUNT = 5;

/**
 * "가장 많이 리뷰된 작품" 사이드 목록. 불러오는 중에는 행 모양 스켈레톤을 보여 주고,
 * 집계가 비었을 때와 불러오지 못했을 때를 구분해 안내한다.
 */
export function TopReviewedList({
  items,
  status,
}: {
  readonly items: readonly TopReviewedItem[];
  readonly status: TopReviewedStatus;
}) {
  const bt = useBilingual("TopReviewedList");
  return (
    <div className="rounded-2xl border border-line bg-card p-5 surface-hl">
      <p className="eyebrow text-accent">MOST REVIEWED</p>
      <h2 className="mt-1.5 text-base font-bold tracking-tight text-fg">{bt("가장 많이 리뷰된 작품", "Most reviewed stories")}</h2>
      <p className="mt-1 text-xs text-fg-3">{bt("독자들이 가장 많이 입을 연 다섯 작품", "The five stories readers talk about most")}</p>

      {status === "loading" ? (
        <div role="status" aria-busy="true" className="mt-5 flex flex-col gap-1">
          <span className="sr-only">{bt("리뷰 집계를 불러오는 중", "Loading review totals")}</span>
          {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
            <span key={index} aria-hidden="true" className="flex min-h-11 items-center gap-3 px-2 py-2">
              <span className="skeleton size-5 shrink-0 rounded" />
              <span className="skeleton size-9 shrink-0 rounded-lg" />
              <span className="flex-1 space-y-1.5">
                <span className="skeleton block h-3 w-4/5" />
                <span className="skeleton block h-2.5 w-2/5" />
              </span>
            </span>
          ))}
        </div>
      ) : (
        <ol className="mt-5 flex flex-col gap-1">
          {items.length === 0 ? (
            <li className="rounded-xl border border-dashed border-line bg-raised/30 px-3 py-5 text-center text-xs text-fg-3">
              {status === "unavailable"
                ? bt("리뷰 집계를 지금은 불러올 수 없어요.", "Review totals aren't available right now.")
                : bt("아직 집계된 리뷰가 없습니다.", "No reviews have been counted yet.")}
            </li>
          ) : null}
          {items.map((item, index) => (
            <li key={item.title.id}>
              <Link
                href={`/title/${item.title.slug}`}
                className="group flex min-h-11 items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-raised/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
              >
                <span className="numeral w-5 shrink-0 text-center text-lg text-fg-3 group-hover:text-accent">{index + 1}</span>
                <span className="size-9 shrink-0 overflow-hidden rounded-lg ring-1 ring-line">
                  {item.title.coverImage ? (
                    <CoverImage
                      src={item.title.coverImage}
                      alt=""
                      className="h-full w-full object-cover"
                      fallback={<CoverSwatch title={item.title} />}
                    />
                  ) : (
                    <CoverSwatch title={item.title} />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-fg-2 transition-colors group-hover:text-fg">
                    {item.title.title}
                  </span>
                  <span className="block truncate text-xs text-fg-3">{item.title.genres.slice(0, 2).join(" · ")}</span>
                </span>
                <span className="flex shrink-0 items-baseline gap-1 text-fg-3">
                  <span className="numeral tnum text-sm text-fg-2">{item.count}</span>
                  <span className="text-xs">{bt("개", "reviews")}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}

      {items.length > 0 ? (
        <div
          className="mt-5 h-1 w-full rounded-full"
          style={{ background: spectrumGradient(items.flatMap((item) => item.title.genres.slice(0, 1))) }}
          aria-hidden="true"
        />
      ) : null}
    </div>
  );
}
