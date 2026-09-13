import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { users } from "./auth.schema";

import type { CollaborationDetails } from "../../../../../packages/core/src/collaboration";

export const collaborationPosts = pgTable("creator_collab_post", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  role: text("role").notNull(),
  title: text("title").notNull(),
  payType: text("payType").notNull(),
  workMode: text("workMode").notNull(),
  status: text("status").notNull().default("open"),
  details: jsonb("details").$type<CollaborationDetails>().notNull(),
  deadlineAt: timestamp("deadlineAt", { withTimezone: true }),
  version: integer("version").notNull().default(1),
  hidden: boolean("hidden").notNull().default(false),
  deletedAt: timestamp("deletedAt", { withTimezone: true }),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_collab_post_recent").on(t.createdAt, t.id),
  index("idx_collab_post_filter").on(t.type, t.role, t.status, t.createdAt, t.id),
  index("idx_collab_post_owner").on(t.userId, t.createdAt, t.id),
]);
export const collaborationApplications = pgTable("creator_collab_application", {
  id: text("id").primaryKey(),
  postId: text("postId").notNull().references(() => collaborationPosts.id, { onDelete: "cascade" }),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  message: text("message").notNull(),
  contact: text("contact").notNull(),
  portfolioUrl: text("portfolioUrl").notNull().default(""),
  status: text("status").notNull().default("submitted"),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("idx_collab_application_unique").on(t.postId, t.userId),
  index("idx_collab_application_user").on(t.userId, t.createdAt),
]);
export const collaborationBookmarks = pgTable("creator_collab_bookmark", {
  postId: text("postId").notNull().references(() => collaborationPosts.id, { onDelete: "cascade" }),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.postId, t.userId] }), index("idx_collab_bookmark_user").on(t.userId)]);
export const collaborationReports = pgTable("creator_collab_report", {
  postId: text("postId").notNull().references(() => collaborationPosts.id, { onDelete: "cascade" }),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.postId, t.userId] }), index("idx_collab_report_created").on(t.createdAt)]);
