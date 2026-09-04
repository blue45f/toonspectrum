import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  sql,
} from "drizzle-orm";

import {
  CREATOR_MARKETPLACE_SOCIAL_COMMENT_PAGE_SIZE,
  CREATOR_MARKETPLACE_SOCIAL_REVIEW_PAGE_SIZE,
  CreatorMarketplaceSocialPageSchema,
} from "../../../../../lib/creator-marketplace-social-contract";
import {
  db,
  reviewLikes,
  reviewReplies,
  reviews,
  users,
} from "../../db";
import { creatorMarketplaceLibraryItems } from "../../db/creator-marketplace-library.schema";
import { isAdminUser } from "../../server/app-config";

import { CreatorMarketplaceService } from "./creator-marketplace.service";

import type {
  CreateCreatorMarketplaceSocialComment,
  CreatorMarketplaceSocialAuthor,
  CreatorMarketplaceSocialAuthorBadge,
  CreatorMarketplaceSocialPage,
  UpsertCreatorMarketplaceSocialReview,
} from "../../../../../lib/creator-marketplace-social-contract";
import type { CreatorMarketplaceResourceRecord } from "../../../../../lib/creator-marketplace-resource-contract";

const MARKET_SOCIAL_KEY_PREFIX = "toonspectrum:market-resource:";
const MARKET_REVIEW_STORAGE_SCHEMA = "toonspectrum.market-review.v1";

interface SocialUserRow {
  readonly userId: string;
  readonly authorName: string | null;
  readonly avatarImage: string | null;
  readonly avatarColor: string | null;
}

interface StoredMarketReviewPayload {
  readonly schema: typeof MARKET_REVIEW_STORAGE_SCHEMA;
  readonly title: string;
  readonly content: string;
  readonly roleTag: string | null;
}

interface MembershipEvidence {
  readonly membership: "active" | "archived";
  readonly studioInstallVerified: boolean;
}

function socialKey(resourceId: string): string {
  return `${MARKET_SOCIAL_KEY_PREFIX}${resourceId}`;
}

function isoDate(value: Date | null | undefined): string {
  return (value ?? new Date()).toISOString();
}

function serializeReview(input: UpsertCreatorMarketplaceSocialReview): string {
  const payload: StoredMarketReviewPayload = {
    schema: MARKET_REVIEW_STORAGE_SCHEMA,
    title: input.title,
    content: input.content,
    roleTag: input.roleTag || null,
  };
  return JSON.stringify(payload);
}

function parseStoredReview(
  value: string,
): StoredMarketReviewPayload {
  try {
    const parsed = JSON.parse(value) as Partial<StoredMarketReviewPayload>;
    if (
      parsed.schema === MARKET_REVIEW_STORAGE_SCHEMA
      && typeof parsed.title === "string"
      && parsed.title.trim()
      && typeof parsed.content === "string"
      && parsed.content.trim()
      && (parsed.roleTag === null || typeof parsed.roleTag === "string")
    ) {
      return {
        schema: MARKET_REVIEW_STORAGE_SCHEMA,
        title: parsed.title.trim(),
        content: parsed.content.trim(),
        roleTag: parsed.roleTag?.trim() || null,
      };
    }
  } catch {
    // Older or malformed rows remain readable as a plain review body.
  }
  return {
    schema: MARKET_REVIEW_STORAGE_SCHEMA,
    title: "Studio 활용 리뷰",
    content: value.trim() || "작성된 리뷰 내용이 없습니다.",
    roleTag: null,
  };
}

function authorBadge(
  userId: string,
  resource: CreatorMarketplaceResourceRecord,
  evidence: ReadonlyMap<string, MembershipEvidence>,
): CreatorMarketplaceSocialAuthorBadge {
  if (userId === resource.publisher.id) return "publisher";
  const membership = evidence.get(userId);
  if (membership?.studioInstallVerified) return "studio-verified";
  if (membership) return "library-member";
  return "member";
}

function authorFromRow(
  row: SocialUserRow,
  resource: CreatorMarketplaceResourceRecord,
  evidence: ReadonlyMap<string, MembershipEvidence>,
  deleted = false,
): CreatorMarketplaceSocialAuthor {
  if (deleted) {
    return {
      id: row.userId,
      name: "삭제됨",
      avatar: null,
      badge: "member",
    };
  }
  return {
    id: row.userId,
    name: row.authorName?.trim() || "창작자",
    avatar: row.avatarImage?.trim() || row.avatarColor?.trim() || null,
    badge: authorBadge(row.userId, resource, evidence),
  };
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

@Injectable()
export class CreatorMarketplaceSocialService {
  constructor(
    @Inject(CreatorMarketplaceService)
    private readonly marketplaceService: CreatorMarketplaceService,
  ) {}

  private async visibleResource(
    resourceId: string,
  ): Promise<CreatorMarketplaceResourceRecord> {
    return this.marketplaceService.getById(resourceId);
  }

  private async membershipEvidence(
    resource: CreatorMarketplaceResourceRecord,
    userIds: readonly string[],
  ): Promise<Map<string, MembershipEvidence>> {
    const uniqueUserIds = uniqueStrings(userIds);
    if (uniqueUserIds.length === 0) return new Map();

    const rows = await db
      .select({
        userId: creatorMarketplaceLibraryItems.userId,
        archivedAt: creatorMarketplaceLibraryItems.archivedAt,
        lastConfirmedAt: creatorMarketplaceLibraryItems.lastConfirmedAt,
      })
      .from(creatorMarketplaceLibraryItems)
      .where(and(
        inArray(creatorMarketplaceLibraryItems.userId, uniqueUserIds),
        eq(creatorMarketplaceLibraryItems.publisherId, resource.publisher.id),
        eq(creatorMarketplaceLibraryItems.packageId, resource.packageId),
      ));

    return new Map(rows.map((row) => [
      row.userId,
      {
        membership: row.archivedAt ? "archived" : "active",
        studioInstallVerified: Boolean(row.lastConfirmedAt),
      } satisfies MembershipEvidence,
    ]));
  }

  private async assertReviewEligible(
    resource: CreatorMarketplaceResourceRecord,
    userId: string,
  ): Promise<void> {
    if (resource.publisher.id === userId) {
      throw new ForbiddenException("배급자는 자신의 리소스를 평가할 수 없습니다.");
    }
    const evidence = await this.membershipEvidence(resource, [userId]);
    const membership = evidence.get(userId);
    if (!membership) {
      throw new ForbiddenException(
        "계정 라이브러리에 리소스를 추가한 뒤 평가할 수 있습니다.",
      );
    }
    if (!membership.studioInstallVerified) {
      throw new ForbiddenException(
        "Studio에서 설치 또는 적용을 완료한 뒤 평가할 수 있습니다.",
      );
    }
  }

  async page(
    resourceId: string,
    viewerId: string | null,
  ): Promise<CreatorMarketplaceSocialPage> {
    const resource = await this.visibleResource(resourceId);
    const key = socialKey(resourceId);
    const rootLimit = CREATOR_MARKETPLACE_SOCIAL_COMMENT_PAGE_SIZE;
    const reviewLimit = CREATOR_MARKETPLACE_SOCIAL_REVIEW_PAGE_SIZE;

    const commentSelect = {
      id: reviewReplies.id,
      parentId: reviewReplies.parentId,
      text: reviewReplies.text,
      deletedAt: reviewReplies.deletedAt,
      createdAt: reviewReplies.createdAt,
      userId: users.id,
      authorName: users.name,
      avatarImage: users.image,
      avatarColor: users.avatar,
    };

    const [
      rootRows,
      reviewRowsWithSentinel,
      commentCountRows,
      statsRows,
    ] = await Promise.all([
      db
        .select(commentSelect)
        .from(reviewReplies)
        .innerJoin(users, eq(reviewReplies.userId, users.id))
        .where(and(
          eq(reviewReplies.reviewId, key),
          isNull(reviewReplies.parentId),
        ))
        .orderBy(desc(reviewReplies.createdAt), desc(reviewReplies.id))
        .limit(rootLimit + 1),
      db
        .select({
          id: reviews.id,
          rating: reviews.rating,
          text: reviews.text,
          tags: reviews.tags,
          createdAt: reviews.createdAt,
          userId: users.id,
          authorName: users.name,
          avatarImage: users.image,
          avatarColor: users.avatar,
        })
        .from(reviews)
        .innerJoin(users, eq(reviews.userId, users.id))
        .where(and(
          eq(reviews.titleId, key),
          eq(reviews.hidden, false),
        ))
        .orderBy(desc(reviews.createdAt), desc(reviews.id))
        .limit(reviewLimit + 1),
      db
        .select({ count: sql<number>`count(*)` })
        .from(reviewReplies)
        .where(eq(reviewReplies.reviewId, key)),
      db
        .select({
          total: sql<number>`count(*)`,
          average: sql<number>`coalesce(avg(${reviews.rating}) / 10.0, 0)`,
          recommend: sql<number>`count(*) filter (where ${reviews.rating} >= 40)`,
          one: sql<number>`count(*) filter (where ${reviews.rating} = 10)`,
          two: sql<number>`count(*) filter (where ${reviews.rating} = 20)`,
          three: sql<number>`count(*) filter (where ${reviews.rating} = 30)`,
          four: sql<number>`count(*) filter (where ${reviews.rating} = 40)`,
          five: sql<number>`count(*) filter (where ${reviews.rating} = 50)`,
        })
        .from(reviews)
        .where(and(
          eq(reviews.titleId, key),
          eq(reviews.hidden, false),
        )),
    ]);

    const rootPage = rootRows.slice(0, rootLimit);
    const rootIds = rootPage.map((row) => row.id);
    const replyRows = rootIds.length > 0
      ? await db
          .select(commentSelect)
          .from(reviewReplies)
          .innerJoin(users, eq(reviewReplies.userId, users.id))
          .where(and(
            eq(reviewReplies.reviewId, key),
            inArray(reviewReplies.parentId, rootIds),
          ))
          .orderBy(asc(reviewReplies.createdAt), asc(reviewReplies.id))
          .limit(rootLimit + 1)
      : [];
    const replyPage = replyRows.slice(0, rootLimit);
    const commentRows = [...rootPage, ...replyPage];
    const reviewRows = reviewRowsWithSentinel.slice(0, reviewLimit);

    const authorIds = uniqueStrings([
      ...commentRows.map((row) => row.userId),
      ...reviewRows.map((row) => row.userId),
      ...(viewerId ? [viewerId] : []),
    ]);
    const evidence = await this.membershipEvidence(resource, authorIds);
    const interactionIds = uniqueStrings([
      ...commentRows.map((row) => row.id),
      ...reviewRows.map((row) => row.id),
    ]);

    const [likeCountRows, viewerLikeRows, viewerIsAdmin] = await Promise.all([
      interactionIds.length > 0
        ? db
            .select({
              interactionId: reviewLikes.reviewId,
              count: sql<number>`count(*)`,
            })
            .from(reviewLikes)
            .where(inArray(reviewLikes.reviewId, interactionIds))
            .groupBy(reviewLikes.reviewId)
        : Promise.resolve([]),
      viewerId && interactionIds.length > 0
        ? db
            .select({ interactionId: reviewLikes.reviewId })
            .from(reviewLikes)
            .where(and(
              eq(reviewLikes.userId, viewerId),
              inArray(reviewLikes.reviewId, interactionIds),
            ))
        : Promise.resolve([]),
      isAdminUser(viewerId),
    ]);
    const likeCounts = new Map(likeCountRows.map((row) => [
      row.interactionId,
      Number(row.count),
    ]));
    const viewerLikes = new Set(
      viewerLikeRows.map((row) => row.interactionId),
    );

    const viewerEvidence = viewerId ? evidence.get(viewerId) : undefined;
    const viewerIsPublisher = viewerId === resource.publisher.id;
    const reviewRequirement = !viewerId
      ? "login"
      : viewerIsPublisher
        ? "publisher-cannot-review"
        : !viewerEvidence
          ? "add-to-library"
          : !viewerEvidence.studioInstallVerified
            ? "open-in-studio"
            : "none";
    const myReview = viewerId
      ? reviewRows.find((row) => row.userId === viewerId)
      : undefined;
    const totalReviews = Number(statsRows[0]?.total ?? 0);
    const recommended = Number(statsRows[0]?.recommend ?? 0);
    const totalCommentCount = Number(commentCountRows[0]?.count ?? 0);

    return CreatorMarketplaceSocialPageSchema.parse({
      resourceId,
      comments: commentRows.map((row) => {
        const deleted = Boolean(row.deletedAt);
        return {
          id: row.id,
          resourceId,
          parentId: row.parentId,
          depth: row.parentId ? 1 : 0,
          author: authorFromRow(row, resource, evidence, deleted),
          content: deleted ? "" : row.text,
          deleted,
          likeCount: deleted ? 0 : (likeCounts.get(row.id) ?? 0),
          likedByViewer: !deleted && viewerLikes.has(row.id),
          canDelete: !deleted && Boolean(
            viewerId && (viewerId === row.userId || viewerIsAdmin),
          ),
          createdAt: isoDate(row.createdAt),
        };
      }),
      reviews: reviewRows.map((row) => {
        const payload = parseStoredReview(row.text);
        return {
          id: row.id,
          resourceId,
          author: authorFromRow(row, resource, evidence),
          rating: Math.max(1, Math.min(5, Math.round(row.rating / 10))),
          title: payload.title,
          content: payload.content,
          roleTag: payload.roleTag,
          tags: Array.isArray(row.tags)
            ? row.tags.filter((tag): tag is string => typeof tag === "string")
            : [],
          helpfulCount: likeCounts.get(row.id) ?? 0,
          helpfulByViewer: viewerLikes.has(row.id),
          isMine: row.userId === viewerId,
          canDelete: Boolean(
            viewerId && (viewerId === row.userId || viewerIsAdmin),
          ),
          createdAt: isoDate(row.createdAt),
        };
      }),
      stats: {
        average: Number(statsRows[0]?.average ?? 0),
        totalCount: totalReviews,
        recommendPercentage: totalReviews > 0
          ? Math.round((recommended / totalReviews) * 100)
          : 0,
        distribution: {
          "1": Number(statsRows[0]?.one ?? 0),
          "2": Number(statsRows[0]?.two ?? 0),
          "3": Number(statsRows[0]?.three ?? 0),
          "4": Number(statsRows[0]?.four ?? 0),
          "5": Number(statsRows[0]?.five ?? 0),
        },
      },
      viewer: {
        authenticated: Boolean(viewerId),
        libraryMembership: viewerEvidence?.membership ?? "none",
        studioInstallVerified: viewerEvidence?.studioInstallVerified ?? false,
        canComment: Boolean(viewerId),
        canReview: reviewRequirement === "none",
        reviewRequirement,
        myReviewId: myReview?.id ?? null,
      },
      totalCommentCount,
      generatedAt: new Date().toISOString(),
      truncated: {
        comments: rootRows.length > rootLimit
          || replyRows.length > rootLimit
          || totalCommentCount > commentRows.length,
        reviews: reviewRowsWithSentinel.length > reviewLimit,
      },
    });
  }

  async createComment(
    resourceId: string,
    userId: string,
    input: CreateCreatorMarketplaceSocialComment,
  ): Promise<CreatorMarketplaceSocialPage> {
    await this.visibleResource(resourceId);
    const key = socialKey(resourceId);
    const parentId = input.parentId ?? null;

    if (parentId) {
      const [parent] = await db
        .select({
          id: reviewReplies.id,
          parentId: reviewReplies.parentId,
          deletedAt: reviewReplies.deletedAt,
        })
        .from(reviewReplies)
        .where(and(
          eq(reviewReplies.id, parentId),
          eq(reviewReplies.reviewId, key),
        ))
        .limit(1);
      if (!parent) throw new NotFoundException("답글 대상 댓글을 찾을 수 없습니다.");
      if (parent.parentId) {
        throw new BadRequestException("답글은 한 단계까지만 작성할 수 있습니다.");
      }
      if (parent.deletedAt) {
        throw new BadRequestException("삭제된 댓글에는 답글을 작성할 수 없습니다.");
      }
    }

    await db.insert(reviewReplies).values({
      id: crypto.randomUUID(),
      reviewId: key,
      parentId,
      userId,
      text: input.content,
      spoiler: false,
    });
    return this.page(resourceId, userId);
  }

  async deleteComment(
    resourceId: string,
    commentId: string,
    userId: string,
  ): Promise<CreatorMarketplaceSocialPage> {
    await this.visibleResource(resourceId);
    const key = socialKey(resourceId);
    const [comment] = await db
      .select({
        id: reviewReplies.id,
        ownerId: reviewReplies.userId,
        deletedAt: reviewReplies.deletedAt,
      })
      .from(reviewReplies)
      .where(and(
        eq(reviewReplies.id, commentId),
        eq(reviewReplies.reviewId, key),
      ))
      .limit(1);
    if (!comment) throw new NotFoundException("댓글을 찾을 수 없습니다.");
    if (comment.deletedAt) return this.page(resourceId, userId);
    if (comment.ownerId !== userId && !(await isAdminUser(userId))) {
      throw new ForbiddenException("작성자만 댓글을 삭제할 수 있습니다.");
    }

    await db.transaction(async (transaction) => {
      const [child] = await transaction
        .select({ id: reviewReplies.id })
        .from(reviewReplies)
        .where(and(
          eq(reviewReplies.reviewId, key),
          eq(reviewReplies.parentId, commentId),
        ))
        .limit(1);
      await transaction
        .delete(reviewLikes)
        .where(eq(reviewLikes.reviewId, commentId));
      if (child) {
        await transaction
          .update(reviewReplies)
          .set({ text: "", deletedAt: new Date() })
          .where(eq(reviewReplies.id, commentId));
      } else {
        await transaction
          .delete(reviewReplies)
          .where(eq(reviewReplies.id, commentId));
      }
    });
    return this.page(resourceId, userId);
  }

  async toggleCommentLike(
    resourceId: string,
    commentId: string,
    userId: string,
  ): Promise<CreatorMarketplaceSocialPage> {
    await this.visibleResource(resourceId);
    const key = socialKey(resourceId);
    const [comment] = await db
      .select({ id: reviewReplies.id, deletedAt: reviewReplies.deletedAt })
      .from(reviewReplies)
      .where(and(
        eq(reviewReplies.id, commentId),
        eq(reviewReplies.reviewId, key),
      ))
      .limit(1);
    if (!comment || comment.deletedAt) {
      throw new NotFoundException("댓글을 찾을 수 없습니다.");
    }

    await db.transaction(async (transaction) => {
      const [existing] = await transaction
        .select({ userId: reviewLikes.userId })
        .from(reviewLikes)
        .where(and(
          eq(reviewLikes.userId, userId),
          eq(reviewLikes.reviewId, commentId),
        ))
        .limit(1);
      if (existing) {
        await transaction.delete(reviewLikes).where(and(
          eq(reviewLikes.userId, userId),
          eq(reviewLikes.reviewId, commentId),
        ));
      } else {
        await transaction.insert(reviewLikes).values({
          userId,
          reviewId: commentId,
        }).onConflictDoNothing();
      }
    });
    return this.page(resourceId, userId);
  }

  async upsertReview(
    resourceId: string,
    userId: string,
    input: UpsertCreatorMarketplaceSocialReview,
  ): Promise<CreatorMarketplaceSocialPage> {
    const resource = await this.visibleResource(resourceId);
    await this.assertReviewEligible(resource, userId);
    const key = socialKey(resourceId);

    await db
      .insert(reviews)
      .values({
        id: crypto.randomUUID(),
        userId,
        titleId: key,
        rating: input.rating * 10,
        text: serializeReview(input),
        tags: input.tags,
        spoiler: false,
        hidden: false,
      })
      .onConflictDoUpdate({
        target: [reviews.userId, reviews.titleId],
        set: {
          rating: input.rating * 10,
          text: serializeReview(input),
          tags: input.tags,
          spoiler: false,
          hidden: false,
          createdAt: new Date(),
        },
      });
    return this.page(resourceId, userId);
  }

  async deleteReview(
    resourceId: string,
    userId: string,
  ): Promise<CreatorMarketplaceSocialPage> {
    await this.visibleResource(resourceId);
    const key = socialKey(resourceId);
    const [review] = await db
      .select({ id: reviews.id, ownerId: reviews.userId })
      .from(reviews)
      .where(and(
        eq(reviews.titleId, key),
        eq(reviews.userId, userId),
      ))
      .limit(1);
    if (!review) throw new NotFoundException("내 리뷰를 찾을 수 없습니다.");

    await db.transaction(async (transaction) => {
      await transaction
        .delete(reviewLikes)
        .where(eq(reviewLikes.reviewId, review.id));
      await transaction.delete(reviews).where(eq(reviews.id, review.id));
    });
    return this.page(resourceId, userId);
  }

  async toggleReviewHelpful(
    resourceId: string,
    reviewId: string,
    userId: string,
  ): Promise<CreatorMarketplaceSocialPage> {
    await this.visibleResource(resourceId);
    const key = socialKey(resourceId);
    const [review] = await db
      .select({ id: reviews.id })
      .from(reviews)
      .where(and(
        eq(reviews.id, reviewId),
        eq(reviews.titleId, key),
        eq(reviews.hidden, false),
      ))
      .limit(1);
    if (!review) throw new NotFoundException("리뷰를 찾을 수 없습니다.");

    await db.transaction(async (transaction) => {
      const [existing] = await transaction
        .select({ userId: reviewLikes.userId })
        .from(reviewLikes)
        .where(and(
          eq(reviewLikes.userId, userId),
          eq(reviewLikes.reviewId, reviewId),
        ))
        .limit(1);
      if (existing) {
        await transaction.delete(reviewLikes).where(and(
          eq(reviewLikes.userId, userId),
          eq(reviewLikes.reviewId, reviewId),
        ));
      } else {
        await transaction.insert(reviewLikes).values({
          userId,
          reviewId,
        }).onConflictDoNothing();
      }
    });
    return this.page(resourceId, userId);
  }
}
