import { randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";

import type {
  CreateCreatorMarketplaceCommentInput,
  CreatorMarketplaceComment,
  CreatorMarketplaceCommentReply,
  CreatorMarketplaceReactionReceipt,
  CreatorMarketplaceReview,
  CreatorMarketplaceReviewStats,
  CreatorMarketplaceSocialAuthor,
  CreatorMarketplaceSocialSnapshot,
  UpsertCreatorMarketplaceReviewInput,
} from "../../../../../lib/creator-marketplace-social-contract";
import {
  CREATOR_MARKETPLACE_SOCIAL_MAX_REVIEWS,
  CREATOR_MARKETPLACE_SOCIAL_MAX_ROOT_COMMENTS,
} from "../../../../../lib/creator-marketplace-social-contract";
import { dbPool } from "../../db";

export class CreatorMarketplaceSocialResourceNotFoundError extends Error {
  constructor() {
    super("creator_marketplace_social_resource_not_found");
    this.name = "CreatorMarketplaceSocialResourceNotFoundError";
  }
}

export class CreatorMarketplaceSocialTargetNotFoundError extends Error {
  constructor(target: "comment" | "review") {
    super(`creator_marketplace_social_${target}_not_found`);
    this.name = "CreatorMarketplaceSocialTargetNotFoundError";
  }
}

export class CreatorMarketplaceSocialPermissionError extends Error {
  constructor() {
    super("creator_marketplace_social_permission_denied");
    this.name = "CreatorMarketplaceSocialPermissionError";
  }
}

export class CreatorMarketplaceSocialReviewEligibilityError extends Error {
  constructor(reason: "publisher" | "library_required") {
    super(`creator_marketplace_social_review_${reason}`);
    this.name = "CreatorMarketplaceSocialReviewEligibilityError";
  }
}

export class CreatorMarketplaceSocialReplyRejectedError extends Error {
  constructor() {
    super("creator_marketplace_social_reply_rejected");
    this.name = "CreatorMarketplaceSocialReplyRejectedError";
  }
}

interface MarketplaceResourceIdentityRow {
  id: string;
  publisherId: string;
  packageId: string;
}

interface MarketplaceSocialRow {
  id: string;
  resourceId: string;
  parentId: string | null;
  userId: string;
  content: string;
  deletedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  authorName: string | null;
  authorImage: string | null;
  isPublisher: boolean;
  isLibraryMember: boolean;
  isStudioVerified: boolean;
  reactionCount: number;
  reactedByViewer: boolean;
}

interface MarketplaceReviewRow {
  id: string;
  resourceId: string;
  userId: string;
  rating: number;
  title: string;
  content: string;
  roleTag: string | null;
  tags: unknown;
  createdAt: Date | string;
  updatedAt: Date | string;
  authorName: string | null;
  authorImage: string | null;
  isPublisher: boolean;
  isLibraryMember: boolean;
  isStudioVerified: boolean;
  reactionCount: number;
  reactedByViewer: boolean;
}

interface MarketplaceReviewStatsRow {
  average: number;
  totalCount: number;
  recommendCount: number;
  oneStar: number;
  twoStar: number;
  threeStar: number;
  fourStar: number;
  fiveStar: number;
}

interface MarketplaceViewerRow {
  authenticated: boolean;
  isPublisher: boolean;
  isLibraryMember: boolean;
  isStudioVerified: boolean;
  reviewId: string | null;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function authorFromRow(row: {
  userId: string;
  authorName: string | null;
  authorImage: string | null;
  isPublisher: boolean;
  isLibraryMember: boolean;
  isStudioVerified: boolean;
}): CreatorMarketplaceSocialAuthor {
  return {
    id: row.userId,
    name: row.authorName?.trim() || "툰스펙트럼 창작자",
    image: row.authorImage,
    isPublisher: row.isPublisher,
    isLibraryMember: row.isLibraryMember,
    isStudioVerified: row.isStudioVerified,
  };
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((tag): tag is string => typeof tag === "string");
}

function commentCanDelete(
  row: MarketplaceSocialRow,
  publisherId: string,
  viewerId: string | null,
  viewerIsAdmin: boolean,
): boolean {
  return row.deletedAt === null && Boolean(
    viewerIsAdmin
      || (viewerId && (viewerId === row.userId || viewerId === publisherId)),
  );
}

function reviewCanDelete(
  row: MarketplaceReviewRow,
  viewerId: string | null,
  viewerIsAdmin: boolean,
): boolean {
  return viewerIsAdmin || Boolean(viewerId && viewerId === row.userId);
}

function reviewLockKey(
  resource: MarketplaceResourceIdentityRow,
  userId: string,
): string {
  return "toonspectrum:creator-marketplace-social-review:v1:"
    + `${resource.publisherId.length}:${resource.publisherId}`
    + `${resource.packageId.length}:${resource.packageId}`
    + `${userId.length}:${userId}`;
}

@Injectable()
export class CreatorMarketplaceSocialRepository {
  private async requireResource(
    resourceId: string,
  ): Promise<MarketplaceResourceIdentityRow> {
    const result = await dbPool.query<MarketplaceResourceIdentityRow>(
      `
        SELECT
          resource."id",
          resource."publisherId",
          resource."packageId"
        FROM public."creator_marketplace_resource" AS resource
        JOIN public."user" AS publisher
          ON publisher."id" = resource."publisherId"
          AND publisher."status" = 'active'
        JOIN public."creator_marketplace_package_moderation" AS package_state
          ON package_state."publisherId" = resource."publisherId"
          AND package_state."packageId" = resource."packageId"
          AND package_state."state" = 'active'
        WHERE resource."id" = $1
          AND resource."delistedAt" IS NULL
        LIMIT 1
      `,
      [resourceId],
    );
    const row = result.rows[0];
    if (!row) throw new CreatorMarketplaceSocialResourceNotFoundError();
    return row;
  }

  async getSnapshot(
    resourceId: string,
    viewerId: string | null,
    viewerIsAdmin: boolean,
  ): Promise<CreatorMarketplaceSocialSnapshot> {
    const resource = await this.requireResource(resourceId);
    const rootLimit = CREATOR_MARKETPLACE_SOCIAL_MAX_ROOT_COMMENTS + 1;
    const reviewLimit = CREATOR_MARKETPLACE_SOCIAL_MAX_REVIEWS + 1;

    const [commentsResult, reviewsResult, statsResult, viewerResult] = await Promise.all([
      dbPool.query<MarketplaceSocialRow>(
        `
          WITH roots AS (
            SELECT comment."id"
            FROM public."creator_marketplace_comment" AS comment
            JOIN public."creator_marketplace_resource" AS comment_resource
              ON comment_resource."id" = comment."resourceId"
            WHERE comment_resource."publisherId" = $1
              AND comment_resource."packageId" = $2
              AND comment."parentId" IS NULL
            ORDER BY comment."createdAt" DESC, comment."id" DESC
            LIMIT $4
          ), selected_comments AS (
            SELECT comment.*
            FROM public."creator_marketplace_comment" AS comment
            WHERE comment."id" IN (SELECT root."id" FROM roots AS root)
               OR comment."parentId" IN (SELECT root."id" FROM roots AS root)
          )
          SELECT
            comment."id",
            comment."resourceId",
            comment."parentId",
            comment."userId",
            comment."content",
            comment."deletedAt",
            comment."createdAt",
            comment."updatedAt",
            account."name" AS "authorName",
            COALESCE(account."image", account."avatar") AS "authorImage",
            (comment."userId" = comment_resource."publisherId") AS "isPublisher",
            EXISTS (
              SELECT 1
              FROM public."creator_marketplace_library_item" AS library
              WHERE library."userId" = comment."userId"
                AND library."publisherId" = comment_resource."publisherId"
                AND library."packageId" = comment_resource."packageId"
            ) AS "isLibraryMember",
            EXISTS (
              SELECT 1
              FROM public."creator_marketplace_library_item" AS library
              WHERE library."userId" = comment."userId"
                AND library."publisherId" = comment_resource."publisherId"
                AND library."packageId" = comment_resource."packageId"
                AND library."lastConfirmedAt" IS NOT NULL
            ) AS "isStudioVerified",
            (
              SELECT count(*)::integer
              FROM public."creator_marketplace_comment_like" AS reaction
              WHERE reaction."commentId" = comment."id"
            ) AS "reactionCount",
            CASE WHEN $3::text IS NULL THEN false ELSE EXISTS (
              SELECT 1
              FROM public."creator_marketplace_comment_like" AS reaction
              WHERE reaction."commentId" = comment."id"
                AND reaction."userId" = $3::text
            ) END AS "reactedByViewer"
          FROM selected_comments AS comment
          JOIN public."creator_marketplace_resource" AS comment_resource
            ON comment_resource."id" = comment."resourceId"
          JOIN public."user" AS account
            ON account."id" = comment."userId"
          ORDER BY
            CASE WHEN comment."parentId" IS NULL THEN comment."createdAt" ELSE (
              SELECT parent."createdAt"
              FROM public."creator_marketplace_comment" AS parent
              WHERE parent."id" = comment."parentId"
            ) END DESC,
            comment."parentId" NULLS FIRST,
            comment."createdAt" ASC,
            comment."id" ASC
        `,
        [resource.publisherId, resource.packageId, viewerId, rootLimit],
      ),
      dbPool.query<MarketplaceReviewRow>(
        `
          SELECT
            review."id",
            review."resourceId",
            review."userId",
            review."rating",
            review."title",
            review."content",
            review."roleTag",
            review."tags",
            review."createdAt",
            review."updatedAt",
            account."name" AS "authorName",
            COALESCE(account."image", account."avatar") AS "authorImage",
            (review."userId" = review_resource."publisherId") AS "isPublisher",
            EXISTS (
              SELECT 1
              FROM public."creator_marketplace_library_item" AS library
              WHERE library."userId" = review."userId"
                AND library."publisherId" = review_resource."publisherId"
                AND library."packageId" = review_resource."packageId"
            ) AS "isLibraryMember",
            EXISTS (
              SELECT 1
              FROM public."creator_marketplace_library_item" AS library
              WHERE library."userId" = review."userId"
                AND library."publisherId" = review_resource."publisherId"
                AND library."packageId" = review_resource."packageId"
                AND library."lastConfirmedAt" IS NOT NULL
            ) AS "isStudioVerified",
            (
              SELECT count(*)::integer
              FROM public."creator_marketplace_review_helpful" AS reaction
              WHERE reaction."reviewId" = review."id"
            ) AS "reactionCount",
            CASE WHEN $3::text IS NULL THEN false ELSE EXISTS (
              SELECT 1
              FROM public."creator_marketplace_review_helpful" AS reaction
              WHERE reaction."reviewId" = review."id"
                AND reaction."userId" = $3::text
            ) END AS "reactedByViewer"
          FROM public."creator_marketplace_review" AS review
          JOIN public."creator_marketplace_resource" AS review_resource
            ON review_resource."id" = review."resourceId"
          JOIN public."user" AS account
            ON account."id" = review."userId"
          WHERE review_resource."publisherId" = $1
            AND review_resource."packageId" = $2
            AND review."deletedAt" IS NULL
          ORDER BY "reactionCount" DESC, review."createdAt" DESC, review."id" DESC
          LIMIT $4
        `,
        [resource.publisherId, resource.packageId, viewerId, reviewLimit],
      ),
      dbPool.query<MarketplaceReviewStatsRow>(
        `
          SELECT
            COALESCE(avg(review."rating"), 0)::double precision AS "average",
            count(*)::integer AS "totalCount",
            count(*) FILTER (WHERE review."rating" >= 4)::integer AS "recommendCount",
            count(*) FILTER (WHERE review."rating" = 1)::integer AS "oneStar",
            count(*) FILTER (WHERE review."rating" = 2)::integer AS "twoStar",
            count(*) FILTER (WHERE review."rating" = 3)::integer AS "threeStar",
            count(*) FILTER (WHERE review."rating" = 4)::integer AS "fourStar",
            count(*) FILTER (WHERE review."rating" = 5)::integer AS "fiveStar"
          FROM public."creator_marketplace_review" AS review
          JOIN public."creator_marketplace_resource" AS review_resource
            ON review_resource."id" = review."resourceId"
          WHERE review_resource."publisherId" = $1
            AND review_resource."packageId" = $2
            AND review."deletedAt" IS NULL
        `,
        [resource.publisherId, resource.packageId],
      ),
      dbPool.query<MarketplaceViewerRow>(
        `
          SELECT
            ($3::text IS NOT NULL) AS "authenticated",
            COALESCE($3::text = $1::text, false) AS "isPublisher",
            CASE WHEN $3::text IS NULL THEN false ELSE EXISTS (
              SELECT 1
              FROM public."creator_marketplace_library_item" AS library
              WHERE library."userId" = $3::text
                AND library."publisherId" = $1
                AND library."packageId" = $2
            ) END AS "isLibraryMember",
            CASE WHEN $3::text IS NULL THEN false ELSE EXISTS (
              SELECT 1
              FROM public."creator_marketplace_library_item" AS library
              WHERE library."userId" = $3::text
                AND library."publisherId" = $1
                AND library."packageId" = $2
                AND library."lastConfirmedAt" IS NOT NULL
            ) END AS "isStudioVerified",
            (
              SELECT review."id"
              FROM public."creator_marketplace_review" AS review
              JOIN public."creator_marketplace_resource" AS review_resource
                ON review_resource."id" = review."resourceId"
              WHERE review_resource."publisherId" = $1
                AND review_resource."packageId" = $2
                AND review."userId" = $3::text
                AND review."deletedAt" IS NULL
              ORDER BY review."updatedAt" DESC, review."id" DESC
              LIMIT 1
            ) AS "reviewId"
        `,
        [resource.publisherId, resource.packageId, viewerId],
      ),
    ]);

    const selectedRootIds = commentsResult.rows
      .filter((row) => row.parentId === null)
      .slice(0, CREATOR_MARKETPLACE_SOCIAL_MAX_ROOT_COMMENTS)
      .map((row) => row.id);
    const selectedRootSet = new Set(selectedRootIds);
    const rootRows = commentsResult.rows.filter(
      (row) => row.parentId === null && selectedRootSet.has(row.id),
    );
    const repliesByParent = new Map<string, CreatorMarketplaceCommentReply[]>();

    for (const row of commentsResult.rows) {
      if (!row.parentId || !selectedRootSet.has(row.parentId)) continue;
      const replies = repliesByParent.get(row.parentId) ?? [];
      replies.push({
        id: row.id,
        parentId: row.parentId,
        author: authorFromRow(row),
        content: row.deletedAt ? null : row.content,
        deleted: row.deletedAt !== null,
        likeCount: row.reactionCount,
        likedByViewer: row.reactedByViewer,
        canDelete: commentCanDelete(
          row,
          resource.publisherId,
          viewerId,
          viewerIsAdmin,
        ),
        createdAt: toIsoString(row.createdAt),
        updatedAt: toIsoString(row.updatedAt),
      });
      repliesByParent.set(row.parentId, replies);
    }

    const comments: CreatorMarketplaceComment[] = rootRows.map((row) => ({
      id: row.id,
      resourceId: row.resourceId,
      author: authorFromRow(row),
      content: row.deletedAt ? null : row.content,
      deleted: row.deletedAt !== null,
      likeCount: row.reactionCount,
      likedByViewer: row.reactedByViewer,
      canDelete: commentCanDelete(
        row,
        resource.publisherId,
        viewerId,
        viewerIsAdmin,
      ),
      createdAt: toIsoString(row.createdAt),
      updatedAt: toIsoString(row.updatedAt),
      replies: repliesByParent.get(row.id) ?? [],
    }));

    const reviewRows = reviewsResult.rows.slice(
      0,
      CREATOR_MARKETPLACE_SOCIAL_MAX_REVIEWS,
    );
    const reviews: CreatorMarketplaceReview[] = reviewRows.map((row) => ({
      id: row.id,
      resourceId: row.resourceId,
      author: authorFromRow(row),
      rating: row.rating,
      title: row.title,
      content: row.content,
      roleTag: row.roleTag,
      tags: normalizeTags(row.tags),
      helpfulCount: row.reactionCount,
      helpfulByViewer: row.reactedByViewer,
      canDelete: reviewCanDelete(row, viewerId, viewerIsAdmin),
      createdAt: toIsoString(row.createdAt),
      updatedAt: toIsoString(row.updatedAt),
    }));

    const rawStats = statsResult.rows[0] ?? {
      average: 0,
      totalCount: 0,
      recommendCount: 0,
      oneStar: 0,
      twoStar: 0,
      threeStar: 0,
      fourStar: 0,
      fiveStar: 0,
    };
    const reviewStats: CreatorMarketplaceReviewStats = {
      average: rawStats.average,
      totalCount: rawStats.totalCount,
      recommendPercentage: rawStats.totalCount > 0
        ? Math.round((rawStats.recommendCount / rawStats.totalCount) * 100)
        : 0,
      distribution: {
        1: rawStats.oneStar,
        2: rawStats.twoStar,
        3: rawStats.threeStar,
        4: rawStats.fourStar,
        5: rawStats.fiveStar,
      },
    };
    const viewer = viewerResult.rows[0] ?? {
      authenticated: false,
      isPublisher: false,
      isLibraryMember: false,
      isStudioVerified: false,
      reviewId: null,
    };

    return {
      resourceId,
      comments,
      commentCount: comments.reduce(
        (total, comment) => total + 1 + comment.replies.length,
        0,
      ),
      commentsTruncated:
        commentsResult.rows.filter((row) => row.parentId === null).length >
        CREATOR_MARKETPLACE_SOCIAL_MAX_ROOT_COMMENTS,
      reviews,
      reviewStats,
      reviewsTruncated:
        reviewsResult.rows.length > CREATOR_MARKETPLACE_SOCIAL_MAX_REVIEWS,
      viewer: {
        authenticated: viewer.authenticated,
        isPublisher: viewer.isPublisher,
        isLibraryMember: viewer.isLibraryMember,
        isStudioVerified: viewer.isStudioVerified,
        canReview:
          viewer.authenticated && viewer.isLibraryMember && !viewer.isPublisher,
        reviewId: viewer.reviewId,
      },
    };
  }

  async createComment(
    resourceId: string,
    userId: string,
    input: CreateCreatorMarketplaceCommentInput,
    parentId: string | null,
  ): Promise<string> {
    const resource = await this.requireResource(resourceId);
    let targetResourceId = resourceId;

    if (parentId) {
      const parent = await dbPool.query<{
        resourceId: string;
        parentId: string | null;
        deletedAt: Date | null;
      }>(
        `
          SELECT
            comment."resourceId",
            comment."parentId",
            comment."deletedAt"
          FROM public."creator_marketplace_comment" AS comment
          JOIN public."creator_marketplace_resource" AS parent_resource
            ON parent_resource."id" = comment."resourceId"
          WHERE comment."id" = $1
            AND parent_resource."publisherId" = $2
            AND parent_resource."packageId" = $3
          LIMIT 1
        `,
        [parentId, resource.publisherId, resource.packageId],
      );
      const row = parent.rows[0];
      if (!row || row.parentId !== null || row.deletedAt !== null) {
        throw new CreatorMarketplaceSocialReplyRejectedError();
      }
      targetResourceId = row.resourceId;
    }

    const id = randomUUID();
    await dbPool.query(
      `
        INSERT INTO public."creator_marketplace_comment" (
          "id", "resourceId", "parentId", "userId", "content"
        ) VALUES ($1, $2, $3, $4, $5)
      `,
      [id, targetResourceId, parentId, userId, input.content],
    );
    return id;
  }

  async deleteComment(
    resourceId: string,
    commentId: string,
    actorId: string,
    actorIsAdmin: boolean,
  ): Promise<void> {
    const resource = await this.requireResource(resourceId);
    const target = await dbPool.query<{
      userId: string;
      deletedAt: Date | null;
    }>(
      `
        SELECT comment."userId", comment."deletedAt"
        FROM public."creator_marketplace_comment" AS comment
        JOIN public."creator_marketplace_resource" AS comment_resource
          ON comment_resource."id" = comment."resourceId"
        WHERE comment."id" = $1
          AND comment_resource."publisherId" = $2
          AND comment_resource."packageId" = $3
        LIMIT 1
      `,
      [commentId, resource.publisherId, resource.packageId],
    );
    const row = target.rows[0];
    if (!row) throw new CreatorMarketplaceSocialTargetNotFoundError("comment");
    if (
      !actorIsAdmin
      && actorId !== row.userId
      && actorId !== resource.publisherId
    ) {
      throw new CreatorMarketplaceSocialPermissionError();
    }
    if (row.deletedAt) return;
    await dbPool.query(
      `
        UPDATE public."creator_marketplace_comment"
        SET "deletedAt" = statement_timestamp(),
            "updatedAt" = statement_timestamp()
        WHERE "id" = $1 AND "deletedAt" IS NULL
      `,
      [commentId],
    );
  }

  async setCommentLike(
    resourceId: string,
    commentId: string,
    userId: string,
    active: boolean,
  ): Promise<CreatorMarketplaceReactionReceipt> {
    const resource = await this.requireResource(resourceId);
    const target = await dbPool.query<{ id: string }>(
      `
        SELECT comment."id"
        FROM public."creator_marketplace_comment" AS comment
        JOIN public."creator_marketplace_resource" AS comment_resource
          ON comment_resource."id" = comment."resourceId"
        WHERE comment."id" = $1
          AND comment_resource."publisherId" = $2
          AND comment_resource."packageId" = $3
          AND comment."deletedAt" IS NULL
        LIMIT 1
      `,
      [commentId, resource.publisherId, resource.packageId],
    );
    if (!target.rows[0]) {
      throw new CreatorMarketplaceSocialTargetNotFoundError("comment");
    }

    if (active) {
      await dbPool.query(
        `
          INSERT INTO public."creator_marketplace_comment_like" (
            "commentId", "userId"
          ) VALUES ($1, $2)
          ON CONFLICT ("commentId", "userId") DO NOTHING
        `,
        [commentId, userId],
      );
    } else {
      await dbPool.query(
        `
          DELETE FROM public."creator_marketplace_comment_like"
          WHERE "commentId" = $1 AND "userId" = $2
        `,
        [commentId, userId],
      );
    }

    const count = await dbPool.query<{ count: number }>(
      `
        SELECT count(*)::integer AS "count"
        FROM public."creator_marketplace_comment_like"
        WHERE "commentId" = $1
      `,
      [commentId],
    );
    return { active, count: count.rows[0]?.count ?? 0 };
  }

  async upsertReview(
    resourceId: string,
    userId: string,
    input: UpsertCreatorMarketplaceReviewInput,
  ): Promise<string> {
    const resource = await this.requireResource(resourceId);
    if (resource.publisherId === userId) {
      throw new CreatorMarketplaceSocialReviewEligibilityError("publisher");
    }
    const eligible = await dbPool.query<{ eligible: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM public."creator_marketplace_library_item" AS library
          WHERE library."userId" = $1
            AND library."publisherId" = $2
            AND library."packageId" = $3
        ) AS "eligible"
      `,
      [userId, resource.publisherId, resource.packageId],
    );
    if (!eligible.rows[0]?.eligible) {
      throw new CreatorMarketplaceSocialReviewEligibilityError("library_required");
    }

    const client = await dbPool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended($1, 0))",
        [reviewLockKey(resource, userId)],
      );
      const existing = await client.query<{ id: string }>(
        `
          SELECT review."id"
          FROM public."creator_marketplace_review" AS review
          JOIN public."creator_marketplace_resource" AS review_resource
            ON review_resource."id" = review."resourceId"
          WHERE review_resource."publisherId" = $1
            AND review_resource."packageId" = $2
            AND review."userId" = $3
          ORDER BY review."updatedAt" DESC, review."id" DESC
          LIMIT 1
          FOR UPDATE OF review
        `,
        [resource.publisherId, resource.packageId, userId],
      );
      const existingId = existing.rows[0]?.id;
      const id = existingId ?? randomUUID();
      if (existingId) {
        await client.query(
          `
            UPDATE public."creator_marketplace_review"
            SET "resourceId" = $2,
                "rating" = $3,
                "title" = $4,
                "content" = $5,
                "roleTag" = $6,
                "tags" = $7::jsonb,
                "deletedAt" = NULL,
                "updatedAt" = statement_timestamp()
            WHERE "id" = $1
          `,
          [
            existingId,
            resourceId,
            input.rating,
            input.title,
            input.content,
            input.roleTag,
            JSON.stringify(input.tags),
          ],
        );
      } else {
        await client.query(
          `
            INSERT INTO public."creator_marketplace_review" (
              "id", "resourceId", "userId", "rating", "title", "content", "roleTag", "tags"
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
          `,
          [
            id,
            resourceId,
            userId,
            input.rating,
            input.title,
            input.content,
            input.roleTag,
            JSON.stringify(input.tags),
          ],
        );
      }
      await client.query("COMMIT");
      return id;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteReview(
    resourceId: string,
    reviewId: string,
    actorId: string,
    actorIsAdmin: boolean,
  ): Promise<void> {
    const resource = await this.requireResource(resourceId);
    const target = await dbPool.query<{ userId: string; deletedAt: Date | null }>(
      `
        SELECT review."userId", review."deletedAt"
        FROM public."creator_marketplace_review" AS review
        JOIN public."creator_marketplace_resource" AS review_resource
          ON review_resource."id" = review."resourceId"
        WHERE review."id" = $1
          AND review_resource."publisherId" = $2
          AND review_resource."packageId" = $3
        LIMIT 1
      `,
      [reviewId, resource.publisherId, resource.packageId],
    );
    const row = target.rows[0];
    if (!row) throw new CreatorMarketplaceSocialTargetNotFoundError("review");
    if (!actorIsAdmin && actorId !== row.userId) {
      throw new CreatorMarketplaceSocialPermissionError();
    }
    if (row.deletedAt) return;
    await dbPool.query(
      `
        UPDATE public."creator_marketplace_review"
        SET "deletedAt" = statement_timestamp(),
            "updatedAt" = statement_timestamp()
        WHERE "id" = $1 AND "deletedAt" IS NULL
      `,
      [reviewId],
    );
  }

  async setReviewHelpful(
    resourceId: string,
    reviewId: string,
    userId: string,
    active: boolean,
  ): Promise<CreatorMarketplaceReactionReceipt> {
    const resource = await this.requireResource(resourceId);
    const target = await dbPool.query<{ userId: string }>(
      `
        SELECT review."userId"
        FROM public."creator_marketplace_review" AS review
        JOIN public."creator_marketplace_resource" AS review_resource
          ON review_resource."id" = review."resourceId"
        WHERE review."id" = $1
          AND review_resource."publisherId" = $2
          AND review_resource."packageId" = $3
          AND review."deletedAt" IS NULL
        LIMIT 1
      `,
      [reviewId, resource.publisherId, resource.packageId],
    );
    const row = target.rows[0];
    if (!row) throw new CreatorMarketplaceSocialTargetNotFoundError("review");
    if (row.userId === userId) throw new CreatorMarketplaceSocialPermissionError();

    if (active) {
      await dbPool.query(
        `
          INSERT INTO public."creator_marketplace_review_helpful" (
            "reviewId", "userId"
          ) VALUES ($1, $2)
          ON CONFLICT ("reviewId", "userId") DO NOTHING
        `,
        [reviewId, userId],
      );
    } else {
      await dbPool.query(
        `
          DELETE FROM public."creator_marketplace_review_helpful"
          WHERE "reviewId" = $1 AND "userId" = $2
        `,
        [reviewId, userId],
      );
    }

    const count = await dbPool.query<{ count: number }>(
      `
        SELECT count(*)::integer AS "count"
        FROM public."creator_marketplace_review_helpful"
        WHERE "reviewId" = $1
      `,
      [reviewId],
    );
    return { active, count: count.rows[0]?.count ?? 0 };
  }
}
