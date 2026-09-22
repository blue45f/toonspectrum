import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, primaryKey, text, timestamp, unique } from "drizzle-orm/pg-core";

import { users } from "./auth.schema";
import { creatorWorks } from "./creator.schema";
import { studioReviews } from "./studio-project-graph.schema";
import type { PinnedShareSnapshot } from "@toonspectrum/studio-project-model/pinned-review-share";

/** Separate from legacy live-document links: an older API can never resolve this bearer. */
export const studioPinnedReviewShares = pgTable("studio_pinned_review_share", {
  id: text("id").primaryKey(), workId: text("workId").notNull().references(() => creatorWorks.id, { onDelete: "cascade" }),
  reviewId: text("reviewId").notNull().references(() => studioReviews.id, { onDelete: "cascade" }),
  createdBy: text("createdBy").notNull().references(() => users.id, { onDelete: "cascade" }),
  operationId: text("operationId").notNull(), requestHash: text("requestHash").notNull(), tokenHash: text("tokenHash").notNull().unique(),
  snapshot: jsonb("snapshot").$type<PinnedShareSnapshot>().notNull(), snapshotHash: text("snapshotHash").notNull(),
  createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull(),
  expiresAt: timestamp("expiresAt", { mode: "date", withTimezone: true }).notNull(),
  revokedAt: timestamp("revokedAt", { mode: "date", withTimezone: true }),
}, (t) => [
  unique("studio_pinned_review_share_operation_unique").on(t.createdBy, t.operationId),
  index("idx_studio_pinned_review_share_work").on(t.workId, t.id),
  index("idx_studio_pinned_review_share_expiry").on(t.expiresAt, t.id),
  check("studio_pinned_review_share_hashes", sql`${t.tokenHash} ~ '^[0-9a-f]{64}$' and ${t.requestHash} ~ '^[0-9a-f]{64}$' and ${t.snapshotHash} ~ '^[0-9a-f]{64}$'`),
  check("studio_pinned_review_share_payload", sql`jsonb_typeof(${t.snapshot})='object' and octet_length(${t.snapshot}::text)<=128000`),
  check("studio_pinned_review_share_time", sql`${t.expiresAt}>${t.createdAt} and (${t.revokedAt} is null or ${t.revokedAt}>=${t.createdAt})`),
]);
export const studioPinnedReviewFeedback = pgTable("studio_pinned_review_feedback", {
  shareId: text("shareId").notNull().references(() => studioPinnedReviewShares.id, { onDelete: "cascade" }),
  id: text("id").notNull(), requestHash: text("requestHash").notNull(),
  content: jsonb("content").notNull(), createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull(),
}, (t) => [
  primaryKey({ name: "studio_pinned_review_feedback_pkey", columns: [t.shareId, t.id] }),
  index("idx_studio_pinned_review_feedback_time").on(t.shareId, t.createdAt),
  check("studio_pinned_review_feedback_hash", sql`${t.requestHash} ~ '^[0-9a-f]{64}$'`),
  check("studio_pinned_review_feedback_payload", sql`jsonb_typeof(${t.content})='object' and octet_length(${t.content}::text)<=24000`),
]);
