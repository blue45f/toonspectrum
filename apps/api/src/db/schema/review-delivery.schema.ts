import { sql } from "drizzle-orm";
import { bigint, check, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique } from "drizzle-orm/pg-core";
import type { ReviewDeliveryManifest, ReviewDeliveryProfile, ReviewDeliveryRights, ReviewDeliverySource } from "@toonspectrum/studio-project-model/review-delivery";

import { users } from "./auth.schema";
import { creatorWorks } from "./creator.schema";
import { studioReviews } from "./studio-project-graph.schema";

export const studioReviewDeliveries = pgTable("studio_review_delivery", {
  id: text("id").primaryKey(),
  workId: text("workId").notNull().references(() => creatorWorks.id, { onDelete: "cascade" }),
  reviewId: text("reviewId").notNull().references(() => studioReviews.id, { onDelete: "cascade" }),
  createdBy: text("createdBy").notNull().references(() => users.id, { onDelete: "cascade" }),
  recipientUserId: text("recipientUserId").notNull().references(() => users.id, { onDelete: "restrict" }),
  operationId: text("operationId").notNull(), requestHash: text("requestHash").notNull(),
  source: jsonb("source").$type<ReviewDeliverySource>().notNull(), sourceHash: text("sourceHash").notNull(),
  profile: jsonb("profile").$type<ReviewDeliveryProfile>().notNull(), profileHash: text("profileHash").notNull(),
  rights: jsonb("rights").$type<ReviewDeliveryRights>().notNull(),
  manifest: jsonb("manifest").$type<ReviewDeliveryManifest>().notNull(), manifestHash: text("manifestHash").notNull(),
  recipientBindingHash: text("recipientBindingHash").notNull(), state: text("state").notNull().default("prepared"),
  version: integer("version").notNull().default(0), archiveSha256: text("archiveSha256"), archiveByteLength: integer("archiveByteLength"),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull(), updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull(),
  issuedAt: timestamp("issuedAt", { withTimezone: true }), deliveredAt: timestamp("deliveredAt", { withTimezone: true }),
  acceptedAt: timestamp("acceptedAt", { withTimezone: true }), cancelledAt: timestamp("cancelledAt", { withTimezone: true }),
}, (t) => [
  unique("studio_review_delivery_operation_unique").on(t.createdBy, t.operationId),
  index("idx_studio_review_delivery_work").on(t.workId, t.createdAt, t.id),
  index("idx_studio_review_delivery_recipient").on(t.recipientUserId, t.createdAt, t.id),
  index("idx_studio_review_delivery_review").on(t.reviewId, t.id),
  check("studio_review_delivery_hashes", sql`${t.requestHash} ~ '^[0-9a-f]{64}$' and ${t.sourceHash} ~ '^[0-9a-f]{64}$' and ${t.profileHash} ~ '^[0-9a-f]{64}$' and ${t.manifestHash} ~ '^[0-9a-f]{64}$' and ${t.recipientBindingHash} ~ '^[0-9a-f]{64}$' and (${t.archiveSha256} is null or ${t.archiveSha256} ~ '^[0-9a-f]{64}$')`),
  check("studio_review_delivery_state", sql`${t.state} in ('prepared','issued','delivered','accepted','cancelled')`),
]);

export const studioReviewDeliveryEvents = pgTable("studio_review_delivery_event", {
  deliveryId: text("deliveryId").notNull().references(() => studioReviewDeliveries.id, { onDelete: "cascade" }),
  sequence: bigint("sequence", { mode: "bigint" }).generatedAlwaysAsIdentity(),
  actorUserId: text("actorUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
  operationId: text("operationId").notNull(), requestHash: text("requestHash").notNull(),
  action: text("action").notNull(), response: jsonb("response").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull(),
}, (t) => [
  primaryKey({ name: "studio_review_delivery_event_pkey", columns: [t.deliveryId, t.sequence] }),
  unique("studio_review_delivery_event_operation_unique").on(t.actorUserId, t.operationId),
  index("idx_studio_review_delivery_event_job").on(t.deliveryId, t.sequence),
  check("studio_review_delivery_event_action", sql`${t.action} in ('prepare','issue','download','accept','cancel')`),
]);
