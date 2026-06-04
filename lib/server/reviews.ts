import { getTitle } from "./catalog-store";
import { db, reviewLikes, reviews, users } from "../db";
import { and, desc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import { fromDb } from "../api-helpers";

export type ReviewSort = "recent" | "likes" | "high" | "low";

export async function getReviewGlobalStats() {
  try {
    const rows = await db
      .select({
        total: sql<number>`count(*)`.as("total"),
        distinctUsers: sql<number>`count(distinct ${reviews.userId})`.as("distinctUsers"),
        distinctTitles: sql<number>`count(distinct ${reviews.titleId})`.as("distinctTitles"),
      })
      .from(reviews);

    const first = rows[0];
    return {
      total: Number(first?.total ?? 0),
      distinctUsers: Number(first?.distinctUsers ?? 0),
      distinctTitles: Number(first?.distinctTitles ?? 0),
    };
  } catch {
    return {
      total: 0,
      distinctUsers: 0,
      distinctTitles: 0,
    };
  }
}

const SORTS: ReviewSort[] = ["recent", "likes", "high", "low"];

type ReviewWithTitle = {
  id: string;
  titleId: string;
  userId: string;
  author: string;
  avatar: string;
  rating: number;
  text: string;
  tags: string[];
  spoiler: boolean;
  likes: number;
  createdAt: string;
  progress: "완독" | "정주행중" | "하차" | "정주행 예정";
  title: NonNullable<ReturnType<typeof getTitle>>;
};

export function normalizeReviewSort(sort?: string): ReviewSort {
  return SORTS.includes(sort as ReviewSort) ? (sort as ReviewSort) : "recent";
}

function sortReviews<T extends { createdAt: string; likes: number; rating: number }>(
  list: T[],
  sort: ReviewSort
): T[] {
  const copy = [...list];
  switch (sort) {
    case "likes":
      return copy.sort((a, b) => b.likes - a.likes || b.createdAt.localeCompare(a.createdAt));
    case "high":
      return copy.sort((a, b) => b.rating - a.rating);
    case "low":
      return copy.sort((a, b) => a.rating - b.rating);
    case "recent":
    default:
      return copy.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }
}

function buildReviewFeedFromRows(feedRows: ReviewWithTitle[]) {
  const total = feedRows.length;
  const avg = total ? feedRows.reduce((s, r) => s + r.rating, 0) / total : 0;
  const spoilerCount = feedRows.filter((r) => r.spoiler).length;
  const spoilerPct = total ? Math.round((spoilerCount / total) * 100) : 0;
  const distinctTitles = new Set(feedRows.map((r) => r.title.id)).size;

  const byTitle = new Map<string, number>();
  for (const r of feedRows) byTitle.set(r.titleId, (byTitle.get(r.titleId) ?? 0) + 1);
  const topReviewed = Array.from(byTitle.entries())
    .map(([titleId, count]) => ({ title: getTitle(titleId), count }))
    .filter((x): x is { title: NonNullable<ReturnType<typeof getTitle>>; count: number } => !!x.title)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return { total, avg, spoilerPct, distinctTitles, topReviewed };
}

export async function getReviewsData(opts: {
  sort?: string;
  spoiler?: string;
  rating?: string;
  includeHidden?: boolean;
}) {
  const sort = normalizeReviewSort(opts.sort);

  const conditions: SQL[] = [];
  if (opts.spoiler === "hide") conditions.push(eq(reviews.spoiler, false));
  if (opts.rating === "high") conditions.push(gte(reviews.rating, 40));
  else if (opts.rating === "low") conditions.push(lte(reviews.rating, 30));
  if (!opts.includeHidden) conditions.push(eq(reviews.hidden, false)); // 비노출 리뷰 제외(관리자 제외)

  try {
    let query = db
      .select({
        id: reviews.id,
        userId: reviews.userId,
        titleId: reviews.titleId,
        rating: reviews.rating,
        text: reviews.text,
        tags: reviews.tags,
        spoiler: reviews.spoiler,
        createdAt: reviews.createdAt,
        author: users.name,
        avatar: users.avatar,
      })
      .from(reviews)
      .innerJoin(users, eq(reviews.userId, users.id))
      .orderBy(desc(reviews.createdAt))
      .$dynamic();

    const whereClause = conditions.length ? and(...conditions) : undefined;
    if (whereClause) {
      query = query.where(whereClause);
    }

    const dbRows = await query;

    const reviewIds = dbRows.map((r) => r.id);
    const likeRows =
      reviewIds.length > 0
        ? await db
            .select({ reviewId: reviewLikes.reviewId, count: sql<number>`count(*)`.as("count") })
            .from(reviewLikes)
            .where(inArray(reviewLikes.reviewId, reviewIds))
            .groupBy(reviewLikes.reviewId)
        : [];
    const likeCount = new Map(likeRows.map((row) => [row.reviewId, Number(row.count)]));

    const feedRaw = dbRows
      .map((row) => {
        const title = getTitle(row.titleId);
        if (!title) return null;
        const item: ReviewWithTitle = {
          id: row.id,
          titleId: row.titleId,
          userId: row.userId,
          author: row.author ?? "익명",
          avatar: row.avatar ?? "#7c5cfc",
          rating: fromDb(row.rating),
          text: row.text,
          tags: row.tags ?? [],
          spoiler: !!row.spoiler,
          likes: likeCount.get(row.id) ?? 0,
          createdAt: new Date(row.createdAt ?? Date.now()).toISOString(),
          progress: "정주행중",
          title,
        };
        return item;
      })
      .filter((r): r is ReviewWithTitle => r !== null);

    const feed = sortReviews(feedRaw, sort);
    const { total, avg, spoilerPct, distinctTitles, topReviewed } = buildReviewFeedFromRows(feedRaw);

    return {
      sort,
      feed,
      topReviewed,
      stats: { total, avg, spoilerPct, distinctTitles },
      generatedAt: new Date().toISOString(),
      source: "database",
    };
  } catch {
    const feed: ReviewWithTitle[] = [];
    const { total, avg, spoilerPct, distinctTitles, topReviewed } = buildReviewFeedFromRows(feed);

    return {
      sort,
      feed,
      topReviewed,
      stats: { total, avg, spoilerPct, distinctTitles },
      generatedAt: new Date().toISOString(),
      source: "database",
    };
  }
}
