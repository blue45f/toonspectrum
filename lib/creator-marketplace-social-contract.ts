import { z } from "zod";

export const CREATOR_MARKETPLACE_SOCIAL_COMMENT_MAX_CHARACTERS = 700;
export const CREATOR_MARKETPLACE_SOCIAL_REVIEW_TITLE_MAX_CHARACTERS = 80;
export const CREATOR_MARKETPLACE_SOCIAL_REVIEW_MAX_CHARACTERS = 1_000;
export const CREATOR_MARKETPLACE_SOCIAL_ROLE_MAX_CHARACTERS = 40;
export const CREATOR_MARKETPLACE_SOCIAL_TAG_MAX_CHARACTERS = 24;
export const CREATOR_MARKETPLACE_SOCIAL_MAX_TAGS = 5;
export const CREATOR_MARKETPLACE_SOCIAL_COMMENT_PAGE_SIZE = 200;
export const CREATOR_MARKETPLACE_SOCIAL_REVIEW_PAGE_SIZE = 100;

const CreatorMarketplaceSocialIdentifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(180);

export const CreatorMarketplaceSocialAuthorBadgeSchema = z.enum([
  "publisher",
  "studio-verified",
  "library-member",
  "member",
]);

export const CreatorMarketplaceSocialAuthorSchema = z
  .object({
    id: CreatorMarketplaceSocialIdentifierSchema,
    name: z.string().trim().min(1).max(80),
    avatar: z.string().trim().max(2_048).nullable(),
    badge: CreatorMarketplaceSocialAuthorBadgeSchema,
  })
  .strict();

export const CreatorMarketplaceSocialCommentSchema = z
  .object({
    id: CreatorMarketplaceSocialIdentifierSchema,
    resourceId: z.string().uuid(),
    parentId: CreatorMarketplaceSocialIdentifierSchema.nullable(),
    depth: z.number().int().min(0).max(1),
    author: CreatorMarketplaceSocialAuthorSchema,
    content: z
      .string()
      .max(CREATOR_MARKETPLACE_SOCIAL_COMMENT_MAX_CHARACTERS),
    deleted: z.boolean(),
    likeCount: z.number().int().min(0),
    likedByViewer: z.boolean(),
    canDelete: z.boolean(),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const CreatorMarketplaceSocialReviewSchema = z
  .object({
    id: CreatorMarketplaceSocialIdentifierSchema,
    resourceId: z.string().uuid(),
    author: CreatorMarketplaceSocialAuthorSchema,
    rating: z.number().int().min(1).max(5),
    title: z
      .string()
      .trim()
      .min(1)
      .max(CREATOR_MARKETPLACE_SOCIAL_REVIEW_TITLE_MAX_CHARACTERS),
    content: z
      .string()
      .trim()
      .min(1)
      .max(CREATOR_MARKETPLACE_SOCIAL_REVIEW_MAX_CHARACTERS),
    roleTag: z
      .string()
      .trim()
      .min(1)
      .max(CREATOR_MARKETPLACE_SOCIAL_ROLE_MAX_CHARACTERS)
      .nullable(),
    tags: z.array(
      z.string().trim().min(1).max(
        CREATOR_MARKETPLACE_SOCIAL_TAG_MAX_CHARACTERS,
      ),
    ).max(CREATOR_MARKETPLACE_SOCIAL_MAX_TAGS),
    helpfulCount: z.number().int().min(0),
    helpfulByViewer: z.boolean(),
    isMine: z.boolean(),
    canDelete: z.boolean(),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const CreatorMarketplaceSocialReviewStatsSchema = z
  .object({
    average: z.number().min(0).max(5),
    totalCount: z.number().int().min(0),
    recommendPercentage: z.number().int().min(0).max(100),
    distribution: z
      .object({
        "1": z.number().int().min(0),
        "2": z.number().int().min(0),
        "3": z.number().int().min(0),
        "4": z.number().int().min(0),
        "5": z.number().int().min(0),
      })
      .strict(),
  })
  .strict();

export const CreatorMarketplaceSocialViewerSchema = z
  .object({
    authenticated: z.boolean(),
    libraryMembership: z.enum(["none", "active", "archived"]),
    studioInstallVerified: z.boolean(),
    canComment: z.boolean(),
    canReview: z.boolean(),
    reviewRequirement: z.enum([
      "none",
      "login",
      "publisher-cannot-review",
      "add-to-library",
      "open-in-studio",
    ]),
    myReviewId: CreatorMarketplaceSocialIdentifierSchema.nullable(),
  })
  .strict();

export const CreatorMarketplaceSocialPageSchema = z
  .object({
    resourceId: z.string().uuid(),
    comments: z.array(CreatorMarketplaceSocialCommentSchema),
    reviews: z.array(CreatorMarketplaceSocialReviewSchema),
    stats: CreatorMarketplaceSocialReviewStatsSchema,
    viewer: CreatorMarketplaceSocialViewerSchema,
    totalCommentCount: z.number().int().min(0),
    generatedAt: z.string().datetime({ offset: true }),
    truncated: z
      .object({
        comments: z.boolean(),
        reviews: z.boolean(),
      })
      .strict(),
  })
  .strict();

export const CreateCreatorMarketplaceSocialCommentSchema = z
  .object({
    parentId: CreatorMarketplaceSocialIdentifierSchema.nullable().optional(),
    content: z
      .string()
      .trim()
      .min(1)
      .max(CREATOR_MARKETPLACE_SOCIAL_COMMENT_MAX_CHARACTERS),
  })
  .strict();

export const UpsertCreatorMarketplaceSocialReviewSchema = z
  .object({
    rating: z.number().int().min(1).max(5),
    title: z
      .string()
      .trim()
      .min(1)
      .max(CREATOR_MARKETPLACE_SOCIAL_REVIEW_TITLE_MAX_CHARACTERS),
    content: z
      .string()
      .trim()
      .min(1)
      .max(CREATOR_MARKETPLACE_SOCIAL_REVIEW_MAX_CHARACTERS),
    roleTag: z
      .string()
      .trim()
      .max(CREATOR_MARKETPLACE_SOCIAL_ROLE_MAX_CHARACTERS)
      .optional()
      .default(""),
    tags: z
      .array(
        z.string().trim().min(1).max(
          CREATOR_MARKETPLACE_SOCIAL_TAG_MAX_CHARACTERS,
        ),
      )
      .max(CREATOR_MARKETPLACE_SOCIAL_MAX_TAGS)
      .default([]),
  })
  .strict();

export type CreatorMarketplaceSocialAuthorBadge = z.infer<
  typeof CreatorMarketplaceSocialAuthorBadgeSchema
>;
export type CreatorMarketplaceSocialAuthor = z.infer<
  typeof CreatorMarketplaceSocialAuthorSchema
>;
export type CreatorMarketplaceSocialComment = z.infer<
  typeof CreatorMarketplaceSocialCommentSchema
>;
export type CreatorMarketplaceSocialReview = z.infer<
  typeof CreatorMarketplaceSocialReviewSchema
>;
export type CreatorMarketplaceSocialReviewStats = z.infer<
  typeof CreatorMarketplaceSocialReviewStatsSchema
>;
export type CreatorMarketplaceSocialViewer = z.infer<
  typeof CreatorMarketplaceSocialViewerSchema
>;
export type CreatorMarketplaceSocialPage = z.infer<
  typeof CreatorMarketplaceSocialPageSchema
>;
export type CreateCreatorMarketplaceSocialComment = z.infer<
  typeof CreateCreatorMarketplaceSocialCommentSchema
>;
export type UpsertCreatorMarketplaceSocialReview = z.infer<
  typeof UpsertCreatorMarketplaceSocialReviewSchema
>;
