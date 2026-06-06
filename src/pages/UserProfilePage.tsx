import { useParams } from "react-router-dom";
import { ReviewCard } from "@/components/review-card";
import { Container } from "@/components/section";
import { buttonClass } from "@/components/ui/button";
import { Stars } from "@/components/ui/stars";
import { ErrorState } from "@/src/components/error-state";
import { useDocumentTitle } from "@/src/hooks/use-document-title";
import type { SeedReview, Title } from "@/lib/types";
import { RefreshCw } from "lucide-react";
import { useApiResource } from "./use-api-resource";

// 회원 공개 프로필 — 리뷰 카드의 작성자명을 누르면 오는 /u/:userId.
// 기존 /api/reviews 응답(피드+통계)을 userId로 필터해 그대로 재사용한다.
interface ReviewsResponse {
  feed: Array<SeedReview & { title: Title }>;
  stats: { total: number; avg: number; spoilerPct: number; distinctTitles: number };
}

export function UserProfilePage() {
  const { userId = "" } = useParams();
  const { data, loading, error, reload } = useApiResource<ReviewsResponse>(
    `/api/reviews?userId=${encodeURIComponent(userId)}`,
    "프로필을 불러오지 못했습니다."
  );
  const feed = data?.feed ?? [];
  const author = feed[0]?.author ?? "사용자";
  const avatar = feed[0]?.avatar ?? "#7c5cfc";
  const total = data?.stats.total ?? 0;
  const avg = data?.stats.avg ?? 0;
  const distinctTitles = data?.stats.distinctTitles ?? 0;
  useDocumentTitle(loading ? "프로필" : `${author} 님`);

  return (
    <div>
      <section className="border-b border-line bg-ledger">
        <Container size="wide" className="py-12 lg:py-16">
          <p className="eyebrow text-accent">READER PROFILE</p>
          <div className="mt-4 flex items-center gap-4">
            <span
              className="grid size-16 shrink-0 place-items-center rounded-full text-2xl font-bold text-[oklch(0.97_0.012_85)] ring-1 ring-[oklch(0.95_0.01_85/0.16)] shadow-[inset_0_1px_0_oklch(1_0_0/0.12)]"
              style={{ background: `linear-gradient(140deg, ${avatar}, oklch(0.3 0.05 60))` }}
              aria-hidden
            >
              {author.charAt(0)}
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-bold leading-tight sm:text-3xl">{author}</h1>
              <p className="mt-1 text-sm text-fg-3">독자가 남긴 리뷰 모음</p>
            </div>
          </div>

          <dl className="mt-8 flex flex-wrap items-end gap-x-9 gap-y-5 border-t border-line pt-6">
            <div className="flex flex-col gap-1">
              <dt className="text-xs text-fg-3">작성한 리뷰</dt>
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
              <dt className="text-xs text-fg-3">리뷰한 작품</dt>
              <dd className="numeral tnum text-2xl text-fg">{distinctTitles.toLocaleString("ko-KR")}</dd>
            </div>
          </dl>
        </Container>
      </section>

      <Container size="wide" className="py-10 lg:py-12">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-fg-3">
            <span className="numeral text-fg-2">{feed.length.toLocaleString("ko-KR")}</span>개의 리뷰
          </p>
          <button
            type="button"
            onClick={reload}
            className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1.5" })}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            갱신
          </button>
        </div>

        {loading ? (
          <div className="columns-1 gap-4 sm:columns-2 xl:columns-3 [&>*]:mb-4 [&>*]:break-inside-avoid">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="rounded-2xl border border-line bg-card p-5">
                <span className="skeleton mb-2 block h-4 w-full" />
                <span className="skeleton mb-2 block h-4 w-5/6" />
                <span className="skeleton block h-4 w-2/3" />
              </div>
            ))}
          </div>
        ) : error ? (
          <ErrorState title="프로필을 불러오지 못했습니다." message={error} onRetry={reload} />
        ) : feed.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-card/40 p-12 text-center text-sm text-fg-3">
            이 회원이 아직 작성한 리뷰가 없습니다.
          </div>
        ) : (
          <div className="columns-1 gap-4 sm:columns-2 lg:columns-2 xl:columns-3 [&>*]:mb-4 [&>*]:break-inside-avoid">
            {feed.map((review) => (
              <ReviewCard key={review.id} review={review} title={review.title} showTitle />
            ))}
          </div>
        )}
      </Container>
    </div>
  );
}
