import type { Metadata } from "next";
import Link from "next/link";
import { SEED_REVIEWS, allReviewsJoined, getTitle } from "@/lib/data";
import { Container } from "@/components/section";
import { ReviewCard } from "@/components/review-card";
import { Stars } from "@/components/ui/stars";
import { spectrumGradient } from "@/lib/genre-color";
import { ReviewControls, type ReviewSort } from "./_components/review-controls";

export const metadata: Metadata = {
  title: "리뷰 피드 — 독자들이 남긴 한 줄",
  description:
    "정주행을 끝낸 독자들의 솔직한 한 줄. 최신·공감·별점순으로 읽는 WEBDEX 리뷰 피드.",
};

const SORTS: ReviewSort[] = ["recent", "likes", "high", "low"];

function sortReviews<T extends { createdAt: string; likes: number; rating: number }>(
  list: T[],
  sort: ReviewSort
): T[] {
  const copy = [...list];
  switch (sort) {
    case "likes":
      return copy.sort((a, b) => b.likes - a.likes);
    case "high":
      return copy.sort((a, b) => b.rating - a.rating);
    case "low":
      return copy.sort((a, b) => a.rating - b.rating);
    case "recent":
    default:
      return copy.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }
}

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const sort: ReviewSort = SORTS.includes(sp.sort as ReviewSort)
    ? (sp.sort as ReviewSort)
    : "recent";

  // ── 통계 ledger ──
  const total = SEED_REVIEWS.length;
  const avg = total ? SEED_REVIEWS.reduce((s, r) => s + r.rating, 0) / total : 0;
  const spoilerCount = SEED_REVIEWS.filter((r) => r.spoiler).length;
  const spoilerPct = total ? Math.round((spoilerCount / total) * 100) : 0;
  const distinctTitles = new Set(SEED_REVIEWS.map((r) => r.titleId)).size;

  // ── 가장 많이 리뷰된 작품 TOP 5 ──
  const byTitle = new Map<string, number>();
  for (const r of SEED_REVIEWS) byTitle.set(r.titleId, (byTitle.get(r.titleId) ?? 0) + 1);
  const topReviewed = Array.from(byTitle.entries())
    .map(([titleId, count]) => ({ title: getTitle(titleId), count }))
    .filter((x): x is { title: NonNullable<ReturnType<typeof getTitle>>; count: number } => !!x.title)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const spoilerHidden = sp.spoiler === "hide";
  const ratingFilter = sp.rating;
  let pool = allReviewsJoined();
  if (spoilerHidden) pool = pool.filter((r) => !r.spoiler);
  if (ratingFilter === "high") pool = pool.filter((r) => r.rating >= 4);
  else if (ratingFilter === "low") pool = pool.filter((r) => r.rating <= 3);
  const feed = sortReviews(pool, sort);

  return (
    <div>
      {/* ░░ EDITORIAL HEADER ░░ */}
      <section className="border-b border-line bg-ledger">
        <Container size="wide" className="py-12 lg:py-16">
          <div style={{ animation: "fade-up 0.5s var(--ease-out-expo) both" }}>
            <p className="eyebrow text-accent">READER REVIEWS</p>
            <h1 className="mt-3 text-pretty text-3xl font-bold leading-[1.1] tracking-[-0.02em] sm:text-4xl lg:text-[2.9rem]">
              독자들이 남긴 한 줄
            </h1>
            <p className="mt-4 max-w-xl text-pretty font-serif text-lg italic leading-relaxed text-fg-2">
              정주행의 끝에서, 누군가는 별점 대신 문장을 남겼다.
            </p>

            {/* 통계 ledger — 라벨 주도 */}
            <dl className="mt-9 flex flex-wrap items-end gap-x-9 gap-y-5 border-t border-line pt-6">
              <div className="flex flex-col gap-1">
                <dt className="text-xs text-fg-3">총 리뷰</dt>
                <dd className="numeral tnum text-2xl text-fg">{total.toLocaleString("ko-KR")}</dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="text-xs text-fg-3">평균 별점</dt>
                <dd className="flex items-center gap-2">
                  <Stars value={avg} size="sm" />
                  <span className="numeral tnum text-2xl text-fg">{avg.toFixed(2)}</span>
                </dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="text-xs text-fg-3">스포일러 포함</dt>
                <dd className="numeral tnum text-2xl text-fg">
                  {spoilerPct}
                  <span className="ml-0.5 text-base text-fg-3">%</span>
                </dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="text-xs text-fg-3">리뷰된 작품</dt>
                <dd className="numeral tnum text-2xl text-fg">{distinctTitles.toLocaleString("ko-KR")}</dd>
              </div>
            </dl>
          </div>
        </Container>
      </section>

      <Container size="wide" className="py-10 lg:py-12">
        <div className="grid gap-8 lg:grid-cols-[1fr_268px] lg:items-start">
          {/* ── 메인: 정렬 + 피드 ── */}
          <div className="min-w-0 lg:order-1">
            <div className="mb-6 rail -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <ReviewControls />
            </div>

            <p className="mb-4 text-sm text-fg-3">
              <span className="numeral text-fg-2">{feed.length}</span>개의 리뷰
            </p>

            {feed.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-line bg-card/40 p-12 text-center text-sm text-fg-3">
                조건에 맞는 리뷰가 없어요. 필터를 조정해 보세요.
              </div>
            ) : (
              /* 반응형 masonry (CSS columns) */
              <div className="columns-1 gap-4 sm:columns-2 lg:columns-2 xl:columns-3 [&>*]:mb-4 [&>*]:break-inside-avoid">
                {feed.map((r) => (
                  <ReviewCard key={r.id} review={r} title={r.title} showTitle />
                ))}
              </div>
            )}
          </div>

          {/* ── 우측 레일: 가장 많이 리뷰된 작품 ── */}
          <aside className="lg:sticky lg:top-20 lg:order-2">
            <div className="rounded-2xl border border-line bg-card p-5 surface-hl">
              <p className="eyebrow text-accent">MOST REVIEWED</p>
              <h2 className="mt-1.5 text-base font-bold tracking-tight text-fg">
                가장 많이 리뷰된 작품
              </h2>
              <p className="mt-1 text-xs text-fg-3">독자들이 가장 많이 입을 연 다섯 작품</p>

              <ol className="mt-5 flex flex-col gap-1">
                {topReviewed.map((item, i) => (
                  <li key={item.title.id}>
                    <Link
                      href={`/title/${item.title.slug}`}
                      className="group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-raised/60"
                    >
                      <span className="numeral w-5 shrink-0 text-center text-lg text-fg-3 group-hover:text-accent">
                        {i + 1}
                      </span>
                      <span
                        className="size-9 shrink-0 rounded-lg ring-1 ring-line"
                        style={{
                          background: `linear-gradient(140deg, ${item.title.cover[0]}, ${item.title.cover[1]})`,
                        }}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-fg-2 transition-colors group-hover:text-fg">
                          {item.title.title}
                        </span>
                        <span className="block truncate text-xs text-fg-3">
                          {item.title.genres.slice(0, 2).join(" · ")}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-baseline gap-0.5 text-fg-3">
                        <span className="numeral tnum text-sm text-fg-2">{item.count}</span>
                        <span className="text-[0.7rem]">개</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>

              <div
                className="mt-5 h-1 w-full rounded-full"
                style={{ background: spectrumGradient(topReviewed.flatMap((t) => t.title.genres.slice(0, 1))) }}
                aria-hidden
              />
            </div>
          </aside>
        </div>
      </Container>
    </div>
  );
}
