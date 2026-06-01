import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq, desc, inArray, sql } from "drizzle-orm";
import { UserRound, MessageSquareText, Star, Heart } from "lucide-react";
import { db, users, reviews, ratings, reviewLikes } from "@/lib/db";
import { findTitle } from "@/lib/server/title";
import { fromDb } from "@/lib/api-helpers";
import type { SeedReview, Title } from "@/lib/types";
import { Container } from "@/components/section";
import { ReviewCard } from "@/components/review-card";
import { TitleCard } from "@/components/title-card";
import { Stars } from "@/components/ui/stars";
import { GenreChip } from "@/components/ui/chip";

// 사용자 프로필은 런타임 DB 조회 — 정적 생성 대상 아님
export const dynamic = "force-dynamic";

function joinedDate(d: Date | null | undefined): string {
  if (!d) return "";
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getFullYear()}.${String(dt.getMonth() + 1).padStart(2, "0")}`;
}

async function getProfile(id: string) {
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      avatar: users.avatar,
      bio: users.bio,
      image: users.image,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!user) return null;

  const reviewRows = await db
    .select()
    .from(reviews)
    .where(eq(reviews.userId, id))
    .orderBy(desc(reviews.createdAt));

  const ratingRows = await db
    .select({ titleId: ratings.titleId, value: ratings.value })
    .from(ratings)
    .where(eq(ratings.userId, id));

  // 받은 공감 수 (리뷰별)
  const reviewIds = reviewRows.map((r) => r.id);
  const likeRows = reviewIds.length
    ? await db
        .select({ reviewId: reviewLikes.reviewId, c: sql<number>`count(*)`.as("c") })
        .from(reviewLikes)
        .where(inArray(reviewLikes.reviewId, reviewIds))
        .groupBy(reviewLikes.reviewId)
    : [];
  const likeCounts: Record<string, number> = Object.fromEntries(
    likeRows.map((x) => [x.reviewId, Number(x.c)])
  );
  const totalLikes = Object.values(likeCounts).reduce((a, b) => a + b, 0);

  // 리뷰 → 표시형(SeedReview) + 작품 조인 (사라진 작품 제외)
  const joined = reviewRows
    .map((r) => {
      const title = findTitle(r.titleId);
      if (!title) return null;
      const review: SeedReview = {
        id: r.id,
        titleId: r.titleId,
        userId: r.userId,
        author: user.name ?? "익명",
        avatar: user.avatar ?? "#7c5cfc",
        rating: fromDb(r.rating),
        text: r.text,
        tags: r.tags ?? [],
        spoiler: r.spoiler,
        likes: likeCounts[r.id] ?? 0,
        createdAt: new Date(r.createdAt ?? Date.now()).toISOString(),
      };
      return { review, title };
    })
    .filter((x): x is { review: SeedReview; title: Title } => x !== null);

  // 별점 맵 (평가 테이블 + 리뷰 별점, 리뷰가 우선) — 작품 단위 중복 제거
  const ratingByTitle = new Map<string, number>();
  for (const r of ratingRows) ratingByTitle.set(r.titleId, fromDb(r.value));
  for (const { review } of joined) ratingByTitle.set(review.titleId, review.rating);

  const ratedValues = [...ratingByTitle.values()];
  const avgRating = ratedValues.length
    ? ratedValues.reduce((a, b) => a + b, 0) / ratedValues.length
    : 0;

  // 취향 장르 — 평가·리뷰한 작품의 장르 빈도 (별점 가중)
  const genreScore = new Map<string, number>();
  for (const [titleId, value] of ratingByTitle) {
    const t = findTitle(titleId);
    if (!t) continue;
    const w = value >= 4 ? 2 : 1;
    for (const g of t.genres) genreScore.set(g, (genreScore.get(g) ?? 0) + w);
  }
  const topGenres = [...genreScore.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([g]) => g);

  // 최애 — 가장 높게 평가한 작품 (동률이면 조회수 높은 쪽)
  const favorites: Title[] = [...ratingByTitle.entries()]
    .map(([titleId, value]) => ({ t: findTitle(titleId), value }))
    .filter((x): x is { t: Title; value: number } => Boolean(x.t))
    .sort((a, b) => b.value - a.value || b.t.stats.views - a.t.stats.views)
    .slice(0, 5)
    .map((x) => x.t);

  return {
    user,
    joined,
    stats: {
      reviewCount: joined.length,
      ratedCount: ratingByTitle.size,
      avgRating,
      totalLikes,
    },
    topGenres,
    favorites,
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const [user] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!user) return { title: "프로필을 찾을 수 없음" };
  return {
    title: `${user.name ?? "익명"} 님의 프로필`,
    description: `${user.name ?? "익명"} 님이 남긴 리뷰와 취향`,
    robots: { index: false }, // 사용자 프로필은 색인 제외
  };
}

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getProfile(id);
  if (!data) notFound();

  const { user, joined, stats, topGenres, favorites } = data;
  const name = user.name ?? "익명";

  return (
    <Container size="wide" className="py-10">
      <header className="flex flex-col gap-6 border-b border-line pb-8 sm:flex-row sm:items-center">
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.image}
            alt=""
            className="size-20 shrink-0 rounded-full object-cover ring-1 ring-white/10"
          />
        ) : (
          <span
            className="grid size-20 shrink-0 place-items-center rounded-full text-3xl font-bold text-white ring-1 ring-white/10"
            style={{ background: `linear-gradient(140deg, ${user.avatar ?? "#7c5cfc"}, oklch(0.3 0.05 60))` }}
          >
            {name.charAt(0)}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <p className="eyebrow flex items-center gap-1.5 text-accent">
            <UserRound size={13} /> READER
          </p>
          <h1 className="mt-1.5 text-3xl font-bold tracking-tight sm:text-4xl">{name}</h1>
          {user.bio ? (
            <p className="mt-2 max-w-prose text-pretty text-sm leading-relaxed text-fg-2">
              {user.bio}
            </p>
          ) : null}
          <p className="mt-2 text-xs text-fg-3">
            {joinedDate(user.createdAt)}부터 활동
          </p>
        </div>

        <dl className="grid grid-cols-3 gap-5 sm:flex sm:gap-7">
          <div>
            <dt className="flex items-center gap-1 text-xs text-fg-3">
              <MessageSquareText size={12} /> 리뷰
            </dt>
            <dd className="numeral mt-0.5 text-2xl text-fg">{stats.reviewCount}</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1 text-xs text-fg-3">
              <Star size={12} /> 평가
            </dt>
            <dd className="numeral mt-0.5 text-2xl text-fg">{stats.ratedCount}</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1 text-xs text-fg-3">
              <Heart size={12} /> 공감
            </dt>
            <dd className="numeral mt-0.5 text-2xl text-fg">{stats.totalLikes}</dd>
          </div>
        </dl>
      </header>

      {stats.ratedCount > 0 && (
        <section className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-8">
          <div className="flex items-center gap-3">
            <span className="text-xs text-fg-3">평균 별점</span>
            <span className="numeral text-xl text-fg">{stats.avgRating.toFixed(1)}</span>
            <Stars value={stats.avgRating} size="sm" />
          </div>
          {topGenres.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-fg-3">취향</span>
              {topGenres.map((g) => (
                <GenreChip key={g} genre={g} size="sm" />
              ))}
            </div>
          )}
        </section>
      )}

      {favorites.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 text-sm font-semibold text-fg-2">최애 작품</h2>
          <div className="grid grid-cols-3 gap-x-4 gap-y-6 sm:grid-cols-4 lg:grid-cols-5">
            {favorites.map((t) => (
              <TitleCard key={t.id} title={t} size="sm" />
            ))}
          </div>
        </section>
      )}

      <section className="mt-10">
        <h2 className="mb-4 text-sm font-semibold text-fg-2">
          남긴 리뷰 <span className="numeral text-fg-3">{joined.length}</span>
        </h2>
        {joined.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line bg-card/40 px-5 py-12 text-center text-sm text-fg-3">
            아직 남긴 리뷰가 없어요.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {joined.map(({ review, title }) => (
              <ReviewCard key={review.id} review={review} title={title} showTitle />
            ))}
          </div>
        )}
      </section>
    </Container>
  );
}
