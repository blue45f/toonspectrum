import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { fromDb } from "../../../web/src/shared/lib/api-helpers";
import { similarTitles } from "../../../web/src/shared/lib/recommend";
import {
  TITLES,
  adaptationsOf,
  getTitle,
  originalOf,
} from "../../../../packages/core/src/server/catalog-store";
import { isDatabaseAvailabilityError } from "../common/database-availability";
import { db, reviewLikes, reviews, users } from "../db";

import type { SeedReview, Title } from "../../../web/src/shared/lib/types";

type TitleReviewLoad =
  | { readonly status: "available"; readonly items: SeedReview[] }
  | { readonly status: "unavailable"; readonly items: [] };

async function getTitleDbReviews(titleId: string): Promise<TitleReviewLoad> {
  try {
    const rows = await db
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
      .where(and(eq(reviews.titleId, titleId)))
      .orderBy(desc(reviews.createdAt));

    const ids = rows.map((row) => row.id);
    const counts = ids.length
      ? await db
          .select({
            reviewId: reviewLikes.reviewId,
            count: sql<number>`count(*)`.as("count"),
          })
          .from(reviewLikes)
          .where(inArray(reviewLikes.reviewId, ids))
          .groupBy(reviewLikes.reviewId)
      : [];
    const likeCounts = new Map(
      counts.map((row) => [row.reviewId, Number(row.count)]),
    );

    return {
      status: "available",
      items: rows.map((row) => ({
        id: row.id,
        titleId: row.titleId,
        userId: row.userId,
        author: row.author ?? "익명",
        avatar: row.avatar ?? "#7c5cfc",
        rating: fromDb(row.rating),
        text: row.text,
        tags: row.tags ?? [],
        spoiler: Boolean(row.spoiler),
        likes: likeCounts.get(row.id) ?? 0,
        createdAt: new Date(row.createdAt ?? Date.now()).toISOString(),
        progress: "정주행중",
      })),
    };
  } catch (error) {
    if (!isDatabaseAvailabilityError(error)) throw error;
    // Keep the static title detail available, but never claim that the review list is empty.
    return { status: "unavailable", items: [] };
  }
}

export function findTitle(identifier: string): Title | null {
  return getTitle(identifier) ?? null;
}

export function getTitleStaticParams() {
  return TITLES.map((title) => ({ slug: title.slug }));
}

export function getTitleSitemapEntries(baseUrl: string) {
  return TITLES.map((title) => ({
    url: `${baseUrl}/title/${title.slug}`,
    changeFrequency: "weekly" as const,
    priority: 0.5,
  }));
}

export async function getTitleDetail(identifier: string) {
  const title = findTitle(identifier);
  if (!title) return null;

  const reviewLoad = await getTitleDbReviews(title.id);
  const allReviews = [...reviewLoad.items].sort(
    (left, right) => +new Date(right.createdAt) - +new Date(left.createdAt),
  );
  const similar = similarTitles(TITLES, title, 8);
  const original = originalOf(title) ?? title;
  const adaptations = adaptationsOf(original);
  const reviewCount = allReviews.length;
  const reviewAvg = reviewCount > 0
    ? allReviews.reduce((sum, review) => sum + review.rating, 0) / reviewCount
    : 0;

  return {
    title,
    reviews: allReviews,
    reviewsStatus: reviewLoad.status,
    similar,
    original,
    adaptations,
    hasFamily: adaptations.length > 0,
    reviewAvg,
    reviewCount,
    generatedAt: new Date().toISOString(),
    source: "server-catalog",
  };
}
