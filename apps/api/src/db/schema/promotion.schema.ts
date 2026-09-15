import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique } from "drizzle-orm/pg-core";
import { users } from "./auth.schema";
import type { PromotionInput } from "../../../../../packages/core/src/promotion";

export const promotionPosts = pgTable("creator_promotion_post", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(), kind: text("kind").notNull(), stage: text("stage").notNull(), genre: text("genre").notNull(),
  payload: jsonb("payload").$type<PromotionInput>().notNull(),
  version: integer("version").notNull().default(1),
  hidden: boolean("hidden").notNull().default(false), archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("idx_promotion_recent").on(t.createdAt, t.id), index("idx_promotion_discover").on(t.kind, t.stage, t.genre, t.createdAt, t.id), index("idx_promotion_author").on(t.userId, t.createdAt, t.id)]);
export const promotionComments = pgTable("creator_promotion_comment", {
  id: text("id").primaryKey(), postId: text("postId").notNull().references(() => promotionPosts.id, { onDelete: "cascade" }),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  parentId: text("parentId"), text: text("text").notNull(),
  deletedAt: timestamp("deletedAt", { withTimezone: true }),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("creator_promotion_comment_post_id_unique").on(t.postId, t.id),
  foreignKey({
    columns: [t.postId, t.parentId],
    foreignColumns: [t.postId, t.id],
    name: "creator_promotion_comment_parent_fkey",
  }).onDelete("cascade"),
  index("idx_promotion_comment_post").on(t.postId, t.createdAt),
  index("idx_promotion_comment_parent").on(t.parentId, t.createdAt),
  check("creator_promotion_comment_parent_not_self_check", sql`${t.parentId} is null or ${t.parentId} <> ${t.id}`),
]);
export const promotionCommentLikes = pgTable("creator_promotion_comment_like", {
  commentId: text("commentId").notNull().references(() => promotionComments.id, { onDelete: "cascade" }),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.commentId, t.userId] }),
  index("idx_promotion_comment_like_user").on(t.userId, t.createdAt),
]);
export const promotionBookmarks = pgTable("creator_promotion_bookmark", {
  postId: text("postId").notNull().references(() => promotionPosts.id, { onDelete: "cascade" }), userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.postId, t.userId] }), index("idx_promotion_bookmark_user").on(t.userId)]);
export const promotionReports = pgTable("creator_promotion_report", {
  postId: text("postId").notNull().references(() => promotionPosts.id, { onDelete: "cascade" }), userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(), createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.postId, t.userId] }), index("idx_promotion_report_recent").on(t.createdAt)]);
