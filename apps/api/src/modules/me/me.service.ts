import { BadRequestException, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { db, collections, collectionItems, ratings, reviews, reviewLikes, reads, subscriptions } from "../../../../../lib/db";
import { loadMe, updateProfile, type UpdateProfileInput } from "../../../../../lib/server/me";

type MergeMapValue = Record<string, unknown>;

interface ReviewPayload {
  titleId?: unknown;
  rating?: unknown;
  text?: unknown;
  tags?: unknown;
  spoiler?: unknown;
}

interface ReviewLikePayload {
  reviewId?: unknown;
}

interface RatingPayload {
  titleId?: unknown;
  value?: unknown;
}

interface ReadPayload {
  titleId?: unknown;
  state?: unknown;
}

interface SubscriptionPayload {
  titleId?: unknown;
}

interface ProfilePayload {
  name?: unknown;
  bio?: unknown;
  image?: unknown;
}

interface CollectionPayload {
  action?: unknown;
  id?: unknown;
  titleId?: unknown;
  name?: unknown;
  emoji?: unknown;
}

type MergePayload = {
  ratings?: MergeMapValue;
  reads?: MergeMapValue;
  subscriptions?: MergeMapValue;
  reviews?: MergeMapValue;
  likedReviews?: MergeMapValue;
  collections?: unknown[];
};

interface CollectionInput {
  name?: unknown;
  emoji?: unknown;
  id?: unknown;
  titleId?: unknown;
  titleIds?: unknown;
}

function toValidTitleId(value: unknown): string {
  const titleId = String(value ?? "").trim();
  if (!titleId) throw new BadRequestException("titleId 필요");
  return titleId;
}

function toCleanTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 5);
}

function parseSpoiler(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return ["1", "true", "on", "yes", "y"].includes(normalized);
  }
  return false;
}

function parseFiniteRating(value: unknown): number {
  const rating = Number(value);
  if (!Number.isFinite(rating) || rating < 0.5 || rating > 5) {
    throw new BadRequestException("rating은 0.5~5 사이여야 합니다.");
  }
  return rating;
}

const toDb = (v: number) => Math.round(v * 10);

export const MAX_MERGE_MAP_ITEMS = 500;
export const MAX_MERGE_COLLECTIONS = 50;
export const MAX_MERGE_COLLECTION_TITLE_IDS = 200;
export const MAX_MERGE_ID_LENGTH = 120;
export const MAX_MERGE_REVIEW_TEXT_LENGTH = 2000;
export const MAX_MERGE_TAGS = 5;
export const MAX_MERGE_TAG_LENGTH = 32;
export const MAX_COLLECTION_NAME_LENGTH = 80;
export const MAX_COLLECTION_EMOJI_LENGTH = 16;

const VALID_READ_STATES = new Set(["want", "reading", "done", "dropped"]);

interface NormalizedMergePayload {
  ratings: { titleId: string; value: number }[];
  reads: { titleId: string; state: string }[];
  subscriptions: { titleId: string }[];
  reviews: { titleId: string; rating: number; text: string; tags: string[]; spoiler: boolean }[];
  likedReviews: { reviewId: string }[];
  collections: { name: string; emoji: string; titleIds: string[] }[];
}

function clampText(value: unknown, max: number): string {
  return String(value ?? "").trim().slice(0, max);
}

function clampMultiline(value: unknown, max: number): string {
  return String(value ?? "").trim().slice(0, max);
}

function normalizeMergeId(value: unknown): string {
  return clampText(value, MAX_MERGE_ID_LENGTH);
}

function mergeEntries(value: unknown): [string, unknown][] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>).slice(0, MAX_MERGE_MAP_ITEMS);
}

function normalizeRatingValue(value: unknown): number | null {
  const rating = Number(value);
  if (!Number.isFinite(rating)) return null;
  return Math.min(5, Math.max(0.5, rating));
}

function normalizeReviewTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const tags: string[] = [];
  for (const raw of value) {
    const tag = clampText(raw, MAX_MERGE_TAG_LENGTH);
    if (tag) tags.push(tag);
    if (tags.length >= MAX_MERGE_TAGS) break;
  }
  return tags;
}

export function normalizeCollectionName(value: unknown): string {
  return clampText(value, MAX_COLLECTION_NAME_LENGTH);
}

export function normalizeCollectionEmoji(value: unknown): string {
  return clampText(value, MAX_COLLECTION_EMOJI_LENGTH) || "📚";
}

export function normalizeMergePayload(payload: MergePayload): NormalizedMergePayload {
  const ratings = mergeEntries(payload.ratings).flatMap(([rawTitleId, rawValue]) => {
    const titleId = normalizeMergeId(rawTitleId);
    const value = normalizeRatingValue(rawValue);
    return titleId && value !== null ? [{ titleId, value }] : [];
  });

  const reads = mergeEntries(payload.reads).flatMap(([rawTitleId, rawState]) => {
    const titleId = normalizeMergeId(rawTitleId);
    const state = typeof rawState === "string" ? rawState.trim() : "";
    return titleId && VALID_READ_STATES.has(state) ? [{ titleId, state }] : [];
  });

  const subscriptions = mergeEntries(payload.subscriptions).flatMap(([rawTitleId, enabled]) => {
    const titleId = normalizeMergeId(rawTitleId);
    return titleId && enabled ? [{ titleId }] : [];
  });

  const reviews = mergeEntries(payload.reviews).flatMap(([rawTitleId, rawReview]) => {
    const titleId = normalizeMergeId(rawTitleId);
    if (!titleId || !rawReview || typeof rawReview !== "object" || Array.isArray(rawReview)) return [];
    const review = rawReview as MergeMapValue;
    const rating = normalizeRatingValue(review.rating) ?? 0.5;
    return [
      {
        titleId,
        rating,
        text: clampMultiline(review.text, MAX_MERGE_REVIEW_TEXT_LENGTH),
        tags: normalizeReviewTags(review.tags),
        spoiler: !!review.spoiler,
      },
    ];
  });

  const likedReviews = mergeEntries(payload.likedReviews).flatMap(([rawReviewId, enabled]) => {
    const reviewId = normalizeMergeId(rawReviewId);
    return reviewId && enabled ? [{ reviewId }] : [];
  });

  const collections = (Array.isArray(payload.collections) ? payload.collections : [])
    .slice(0, MAX_MERGE_COLLECTIONS)
    .flatMap((rawCollection) => {
      if (!rawCollection || typeof rawCollection !== "object" || Array.isArray(rawCollection)) return [];
      const collection = rawCollection as CollectionInput;
      const name = normalizeCollectionName(collection.name);
      const titleIds = Array.isArray(collection.titleIds) ? collection.titleIds : [];
      const seen = new Set<string>();
      const normalizedTitleIds: string[] = [];
      for (const rawTitleId of titleIds) {
        const titleId = normalizeMergeId(rawTitleId);
        if (titleId && !seen.has(titleId)) {
          seen.add(titleId);
          normalizedTitleIds.push(titleId);
        }
        if (normalizedTitleIds.length >= MAX_MERGE_COLLECTION_TITLE_IDS) break;
      }
      return name && normalizedTitleIds.length
        ? [{ name, emoji: normalizeCollectionEmoji(collection.emoji), titleIds: normalizedTitleIds }]
        : [];
    });

  return { ratings, reads, subscriptions, reviews, likedReviews, collections };
}

@Injectable()
export class MeService {
  async getMe(uid: string) {
    return loadMe(uid);
  }

  async updateProfile(uid: string, payload: ProfilePayload) {
    const input: UpdateProfileInput = {};
    if (typeof payload.name === "string") input.name = payload.name;
    if (typeof payload.bio === "string") input.bio = payload.bio;
    if (payload.image !== undefined) {
      input.image = payload.image === null ? null : String(payload.image ?? "");
    }
    const result = await updateProfile(uid, input);
    if ("error" in result) throw new BadRequestException(result.error);
    return result;
  }

  async upsertReview(uid: string, payload: ReviewPayload) {
    const titleId = toValidTitleId(payload.titleId);
    const rating = parseFiniteRating(payload.rating);
    const dbRating = toDb(rating);
    const text = String(payload.text ?? "");
    const tags = toCleanTags(payload.tags);
    const spoiler = parseSpoiler(payload.spoiler);

    await db
      .insert(reviews)
      .values({ userId: uid, titleId, rating: dbRating, text, tags, spoiler })
      .onConflictDoUpdate({
        target: [reviews.userId, reviews.titleId],
        set: { rating: dbRating, text, tags, spoiler },
      });

    await db
      .insert(ratings)
      .values({ userId: uid, titleId, value: dbRating })
      .onConflictDoUpdate({ target: [ratings.userId, ratings.titleId], set: { value: dbRating, updatedAt: new Date() } });

    return { ok: true };
  }

  async deleteReview(uid: string, payload: ReviewPayload) {
    const titleId = toValidTitleId(payload.titleId);
    await db.delete(reviews).where(and(eq(reviews.userId, uid), eq(reviews.titleId, titleId)));
    return { ok: true };
  }

  async toggleReviewLike(uid: string, payload: ReviewLikePayload) {
    const reviewId = String(payload.reviewId ?? "").trim();
    if (!reviewId) throw new BadRequestException("reviewId 필요");

    const [existing] = await db
      .select()
      .from(reviewLikes)
      .where(and(eq(reviewLikes.userId, uid), eq(reviewLikes.reviewId, reviewId)))
      .limit(1);

    if (existing) {
      await db.delete(reviewLikes).where(and(eq(reviewLikes.userId, uid), eq(reviewLikes.reviewId, reviewId)));
      return { ok: true, liked: false };
    }

    await db.insert(reviewLikes).values({ userId: uid, reviewId });
    return { ok: true, liked: true };
  }

  async upsertRating(uid: string, payload: RatingPayload) {
    const titleId = toValidTitleId(payload.titleId);
    if (payload.value == null) {
      await db.delete(ratings).where(and(eq(ratings.userId, uid), eq(ratings.titleId, titleId)));
      return { ok: true };
    }

    const value = parseFiniteRating(payload.value);
    await db
      .insert(ratings)
      .values({ userId: uid, titleId, value: toDb(value) })
      .onConflictDoUpdate({
        target: [ratings.userId, ratings.titleId],
        set: { value: toDb(value), updatedAt: new Date() },
      });

    return { ok: true };
  }

  async upsertRead(uid: string, payload: ReadPayload) {
    const titleId = toValidTitleId(payload.titleId);
    const state = String(payload.state ?? "").trim();
    const validStates = ["want", "reading", "done", "dropped", ""];

    if (!state) {
      await db.delete(reads).where(and(eq(reads.userId, uid), eq(reads.titleId, titleId)));
      return { ok: true };
    }

    if (!validStates.includes(state)) throw new BadRequestException("잘못된 state");
    await db
      .insert(reads)
      .values({ userId: uid, titleId, state })
      .onConflictDoUpdate({ target: [reads.userId, reads.titleId], set: { state } });
    return { ok: true };
  }

  async toggleSubscription(uid: string, payload: SubscriptionPayload) {
    const titleId = toValidTitleId(payload.titleId);

    const [existing] = await db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.userId, uid), eq(subscriptions.titleId, titleId)))
      .limit(1);

    if (existing) {
      await db.delete(subscriptions).where(and(eq(subscriptions.userId, uid), eq(subscriptions.titleId, titleId)));
      return { ok: true, subscribed: false };
    }

    await db.insert(subscriptions).values({ userId: uid, titleId });
    return { ok: true, subscribed: true };
  }

  async updateCollection(uid: string, payload: CollectionPayload) {
    const action = String(payload.action ?? "").trim();
    if (!action) throw new BadRequestException("알 수 없는 action");

    if (action === "create") {
      const name = normalizeCollectionName(payload.name);
      if (!name) throw new BadRequestException("이름 필요");
      const [row] = await db
        .insert(collections)
        .values({ userId: uid, name, emoji: normalizeCollectionEmoji(payload.emoji) })
        .returning({ id: collections.id });
      return { ok: true, id: row.id };
    }

    if (action === "rename") {
      const id = String(payload.id ?? "").trim();
      const name = normalizeCollectionName(payload.name);
      if (!id || !name) throw new BadRequestException("컬렉션 id와 이름 필요");
      await db.update(collections).set({ name }).where(and(eq(collections.id, id), eq(collections.userId, uid)));
      return { ok: true };
    }

    if (action === "delete") {
      const id = String(payload.id ?? "").trim();
      if (!id) throw new BadRequestException("컬렉션 id 필요");
      await db.delete(collections).where(and(eq(collections.id, id), eq(collections.userId, uid)));
      return { ok: true };
    }

    if (action === "toggle") {
      const id = String(payload.id ?? "").trim();
      const titleId = String(payload.titleId ?? "").trim();
      if (!id || !titleId) throw new BadRequestException("컬렉션 id와 titleId 필요");

      const [own] = await db
        .select({ id: collections.id })
        .from(collections)
        .where(and(eq(collections.id, id), eq(collections.userId, uid)))
        .limit(1);
      if (!own) throw new BadRequestException("권한 없음");

      const [exists] = await db
        .select()
        .from(collectionItems)
        .where(and(eq(collectionItems.collectionId, id), eq(collectionItems.titleId, titleId)))
        .limit(1);

      if (exists) {
        await db.delete(collectionItems).where(and(eq(collectionItems.collectionId, id), eq(collectionItems.titleId, titleId)));
      } else {
        await db.insert(collectionItems).values({ collectionId: id, titleId });
      }
      return { ok: true };
    }

    throw new BadRequestException("알 수 없는 action");
  }

  async merge(uid: string, payload: MergePayload) {
    const body = normalizeMergePayload((payload ?? {}) as MergePayload);
    const tryInsert = async (label: string, fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch (error) {
        console.error(`/api/me/merge ${label} 실패:`, error);
      }
    };

    const ratingRows = body.ratings.map(({ titleId, value }) => ({ userId: uid, titleId, value: toDb(value) }));
    if (ratingRows.length) {
      await tryInsert("ratings", () => db.insert(ratings).values(ratingRows).onConflictDoNothing());
    }

    const readRows = body.reads.map(({ titleId, state }) => ({ userId: uid, titleId, state }));
    if (readRows.length) {
      await tryInsert("reads", () => db.insert(reads).values(readRows).onConflictDoNothing());
    }

    const subscriptionRows = body.subscriptions.map(({ titleId }) => ({ userId: uid, titleId }));
    if (subscriptionRows.length) {
      await tryInsert("subscriptions", () =>
        db.insert(subscriptions).values(subscriptionRows).onConflictDoNothing()
      );
    }

    const reviewRows = body.reviews.map(({ titleId, rating, text, tags, spoiler }) => ({
      userId: uid,
      titleId,
      rating: toDb(rating),
      text,
      tags,
      spoiler,
    }));
    if (reviewRows.length) {
      await tryInsert("reviews", () => db.insert(reviews).values(reviewRows).onConflictDoNothing());
    }

    const likeRows = body.likedReviews.map(({ reviewId }) => ({ userId: uid, reviewId }));
    if (likeRows.length) {
      await tryInsert("reviewLikes", () => db.insert(reviewLikes).values(likeRows).onConflictDoNothing());
    }

    const cols = body.collections;
    if (cols.length) {
      try {
        const serverCols = await db.select().from(collections).where(eq(collections.userId, uid));
        const byName = new Map(serverCols.map((collection) => [collection.name, collection.id]));

        for (const rawCollection of cols) {
          const { name, emoji, titleIds } = rawCollection;

          let collectionId = byName.get(name);
          if (!collectionId) {
            const [row] = await db
              .insert(collections)
              .values({ userId: uid, name, emoji })
              .returning({ id: collections.id });
            collectionId = row.id;
            byName.set(name, collectionId);
          }

          await db
            .insert(collectionItems)
            .values(titleIds.map((titleId) => ({ collectionId, titleId })))
            .onConflictDoNothing();
        }
      } catch (error) {
        console.error("/api/me/merge collections 실패:", error);
      }
    }

    return this.getMe(uid);
  }
}
