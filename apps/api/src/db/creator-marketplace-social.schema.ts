import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

import {
  CREATOR_MARKETPLACE_COMMENT_MAX_CHARACTERS,
  CREATOR_MARKETPLACE_REVIEW_MAX_CHARACTERS,
  CREATOR_MARKETPLACE_REVIEW_MAX_TAGS,
  CREATOR_MARKETPLACE_REVIEW_ROLE_MAX_CHARACTERS,
  CREATOR_MARKETPLACE_REVIEW_TAG_MAX_CHARACTERS,
  CREATOR_MARKETPLACE_REVIEW_TITLE_MAX_CHARACTERS,
} from "../../../../lib/creator-marketplace-social-contract";

import { creatorMarketplaceResources } from "./creator-marketplace-resource.schema";
import { users } from "./schema";

export const creatorMarketplaceComments = pgTable(
  "creator_marketplace_comment",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    resourceId: text("resourceId")
      .notNull()
      .references(() => creatorMarketplaceResources.id, { onDelete: "cascade" }),
    parentId: text("parentId"),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    deletedAt: timestamp("deletedAt", {
      mode: "date",
      precision: 3,
      withTimezone: true,
    }),
    createdAt: timestamp("createdAt", {
      mode: "date",
      precision: 3,
      withTimezone: true,
    }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", {
      mode: "date",
      precision: 3,
      withTimezone: true,
    }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.parentId],
      foreignColumns: [table.id],
      name: "creator_marketplace_comment_parent_fk",
    }).onDelete("cascade"),
    index("idx_creator_marketplace_comment_resource_created").on(
      table.resourceId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index("idx_creator_marketplace_comment_parent_created").on(
      table.parentId,
      table.createdAt.asc(),
      table.id.asc(),
    ),
    index("idx_creator_marketplace_comment_user_created").on(
      table.userId,
      table.createdAt.desc(),
    ),
    check(
      "creator_marketplace_comment_content_check",
      sql`char_length(${table.content}) between 1 and ${CREATOR_MARKETPLACE_COMMENT_MAX_CHARACTERS}
        and ${table.content} = btrim(${table.content})`,
    ),
    check(
      "creator_marketplace_comment_parent_check",
      sql`${table.parentId} is null or ${table.parentId} <> ${table.id}`,
    ),
    check(
      "creator_marketplace_comment_timestamp_check",
      sql`${table.updatedAt} >= ${table.createdAt}
        and (${table.deletedAt} is null or ${table.deletedAt} >= ${table.createdAt})`,
    ),
  ],
);

export const creatorMarketplaceCommentLikes = pgTable(
  "creator_marketplace_comment_like",
  {
    commentId: text("commentId")
      .notNull()
      .references(() => creatorMarketplaceComments.id, { onDelete: "cascade" }),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt", {
      mode: "date",
      precision: 3,
      withTimezone: true,
    }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.commentId, table.userId] }),
    index("idx_creator_marketplace_comment_like_user").on(
      table.userId,
      table.createdAt.desc(),
    ),
  ],
);

export const creatorMarketplaceReviews = pgTable(
  "creator_marketplace_review",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    resourceId: text("resourceId")
      .notNull()
      .references(() => creatorMarketplaceResources.id, { onDelete: "cascade" }),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    roleTag: text("roleTag"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    deletedAt: timestamp("deletedAt", {
      mode: "date",
      precision: 3,
      withTimezone: true,
    }),
    createdAt: timestamp("createdAt", {
      mode: "date",
      precision: 3,
      withTimezone: true,
    }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", {
      mode: "date",
      precision: 3,
      withTimezone: true,
    }).notNull().defaultNow(),
  },
  (table) => [
    unique("creator_marketplace_review_resource_user_unique").on(
      table.resourceId,
      table.userId,
    ),
    index("idx_creator_marketplace_review_resource_created").on(
      table.resourceId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index("idx_creator_marketplace_review_user_created").on(
      table.userId,
      table.createdAt.desc(),
    ),
    check(
      "creator_marketplace_review_rating_check",
      sql`${table.rating} between 1 and 5`,
    ),
    check(
      "creator_marketplace_review_title_check",
      sql`char_length(${table.title}) between 1 and ${CREATOR_MARKETPLACE_REVIEW_TITLE_MAX_CHARACTERS}
        and ${table.title} = btrim(${table.title})`,
    ),
    check(
      "creator_marketplace_review_content_check",
      sql`char_length(${table.content}) between 1 and ${CREATOR_MARKETPLACE_REVIEW_MAX_CHARACTERS}
        and ${table.content} = btrim(${table.content})`,
    ),
    check(
      "creator_marketplace_review_role_check",
      sql`${table.roleTag} is null or (
        char_length(${table.roleTag}) between 1 and ${CREATOR_MARKETPLACE_REVIEW_ROLE_MAX_CHARACTERS}
        and ${table.roleTag} = btrim(${table.roleTag})
      )`,
    ),
    check(
      "creator_marketplace_review_tags_check",
      sql`jsonb_typeof(${table.tags}) = 'array'
        and jsonb_array_length(${table.tags}) <= ${CREATOR_MARKETPLACE_REVIEW_MAX_TAGS}
        and not exists (
          select 1
          from jsonb_array_elements_text(${table.tags}) as tag(value)
          where char_length(tag.value) not between 1 and ${CREATOR_MARKETPLACE_REVIEW_TAG_MAX_CHARACTERS}
            or tag.value <> btrim(tag.value)
        )`,
    ),
    check(
      "creator_marketplace_review_timestamp_check",
      sql`${table.updatedAt} >= ${table.createdAt}
        and (${table.deletedAt} is null or ${table.deletedAt} >= ${table.createdAt})`,
    ),
  ],
);

export const creatorMarketplaceReviewHelpful = pgTable(
  "creator_marketplace_review_helpful",
  {
    reviewId: text("reviewId")
      .notNull()
      .references(() => creatorMarketplaceReviews.id, { onDelete: "cascade" }),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt", {
      mode: "date",
      precision: 3,
      withTimezone: true,
    }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.reviewId, table.userId] }),
    index("idx_creator_marketplace_review_helpful_user").on(
      table.userId,
      table.createdAt.desc(),
    ),
  ],
);
