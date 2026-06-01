import Link from "next/link";
import { useSearchParams } from "react-router-dom";
import { ReviewCard } from "@/components/review-card";
import { Container } from "@/components/section";
import { Stars } from "@/components/ui/stars";
import { allReviewsJoined } from "@/lib/data";
import { spectrumGradient } from "@/lib/genre-color";
import { ReviewControls, type ReviewSort } from "@/app/reviews/_components/review-controls";

function sortedReviews(sort: ReviewSort, rows: ReturnType<typeof allReviewsJoined>) {
  const next = [...rows];
  if (sort === "likes") return next.sort((a, b) => b.likes - a.likes || b.createdAt.localeCompare(a.createdAt));
  if (sort === "high") return next.sort((a, b) => b.rating - a.rating);
  if (sort === "low") return next.sort((a, b) => a.rating - b.rating);
  return next.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

export function ReviewsPage() {
  const [searchParams] = useSearchParams();
  const sort = ((searchParams.get("sort") as ReviewSort | null) ?? "recent") as ReviewSort;
  const spoiler = searchParams.get("spoiler");
  const rating = searchParams.get("rating");
  const feed = sortedReviews(
    sort,
    allReviewsJoined().filter((review) => {
      if (spoiler === "hide" && review.spoiler) return false;
      if (rating === "high" && review.rating < 4) return false;
      if (rating === "low" && review.rating > 3) return false;
      return true;
    })
  );
  const total = feed.length;
  const avg = total ? feed.reduce((sum, review) => sum + review.rating, 0) / total : 0;
  const spoilerPct = total ? Math.round((feed.filter((review) => review.spoiler).length / total) * 100) : 0;
  const byTitle = new Map<string, number>();
  for (const review of feed) byTitle.set(review.titleId, (byTitle.get(review.titleId) ?? 0) + 1);
  const topReviewed = [...byTitle.entries()]
    .map(([titleId, count]) => ({ title: feed.find((review) => review.titleId === titleId)?.title, count }))
    .filter((entry): entry is { title: NonNullable<(typeof entry)["title"]>; count: number } => Boolean(entry.title))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return (
    <div>
      <section className="border-b border-line bg-ledger">
        <Container size="wide" className="py-12 lg:py-16">
          <p className="eyebrow text-accent">READER REVIEWS</p>
          <h1 className="mt-3 text-pretty text-3xl font-bold leading-[1.1] sm:text-4xl lg:text-[2.9rem]">
            독자들이 남긴 한 줄
          </h1>
          <p className="mt-4 max-w-xl text-pretty font-serif text-lg italic leading-relaxed text-fg-2">
            정주행의 끝에서, 누군가는 별점 대신 문장을 남겼다.
          </p>

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
              <dd className="numeral tnum text-2xl text-fg">{byTitle.size.toLocaleString("ko-KR")}</dd>
            </div>
          </dl>
        </Container>
      </section>

      <Container size="wide" className="py-10 lg:py-12">
        <div className="grid gap-8 lg:grid-cols-[1fr_268px] lg:items-start">
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
              <div className="columns-1 gap-4 sm:columns-2 lg:columns-2 xl:columns-3 [&>*]:mb-4 [&>*]:break-inside-avoid">
                {feed.map((review) => (
                  <ReviewCard key={review.id} review={review} title={review.title} showTitle />
                ))}
              </div>
            )}
          </div>

          <aside className="lg:sticky lg:top-20 lg:order-2">
            <div className="rounded-2xl border border-line bg-card p-5 surface-hl">
              <p className="eyebrow text-accent">MOST REVIEWED</p>
              <h2 className="mt-1.5 text-base font-bold tracking-tight text-fg">가장 많이 리뷰된 작품</h2>
              <p className="mt-1 text-xs text-fg-3">독자들이 가장 많이 입을 연 다섯 작품</p>

              <ol className="mt-5 flex flex-col gap-1">
                {topReviewed.map((item, index) => (
                  <li key={item.title.id}>
                    <Link
                      href={`/title/${item.title.slug}`}
                      className="group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-raised/60"
                    >
                      <span className="numeral w-5 shrink-0 text-center text-lg text-fg-3 group-hover:text-accent">
                        {index + 1}
                      </span>
                      <span
                        className="size-9 shrink-0 rounded-lg ring-1 ring-line"
                        style={{ background: `linear-gradient(140deg, ${item.title.cover[0]}, ${item.title.cover[1]})` }}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-fg-2 transition-colors group-hover:text-fg">
                          {item.title.title}
                        </span>
                        <span className="block truncate text-xs text-fg-3">{item.title.genres.slice(0, 2).join(" · ")}</span>
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
                style={{ background: spectrumGradient(topReviewed.flatMap((item) => item.title.genres.slice(0, 1))) }}
                aria-hidden
              />
            </div>
          </aside>
        </div>
      </Container>
    </div>
  );
}
