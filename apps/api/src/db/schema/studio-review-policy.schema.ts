import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { studioReviews, studioRevisions } from "./studio-project-graph.schema";

export const studioReviewPolicies = pgTable("studio_review_policy", {
  reviewId: text("reviewId").primaryKey().references(() => studioReviews.id, { onDelete: "cascade" }),
  revisionId: text("revisionId").notNull().references(() => studioRevisions.id, { onDelete: "restrict" }),
  rootGraphHash: text("rootGraphHash").notNull(),
  policyVersion: integer("policyVersion").notNull(), stateVersion: integer("stateVersion").notNull(),
  definition: jsonb("definition").notNull(), configuredBy: text("configuredBy").notNull(),
  configuredAt: timestamp("configuredAt", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("studio_review_policy_version_check", sql`${table.policyVersion} > 0 and ${table.stateVersion} >= ${table.policyVersion}`),
  check("studio_review_policy_hash_check", sql`${table.rootGraphHash} ~ '^[a-f0-9]{64}$'`),
  check("studio_review_policy_definition_check", sql`jsonb_typeof(${table.definition}) = 'object' and octet_length(${table.definition}::text) <= 262144`),
]);
export const studioReviewPolicyEvents = pgTable("studio_review_policy_event", {
  id: text("id").primaryKey(), reviewId: text("reviewId").notNull().references(() => studioReviewPolicies.reviewId, { onDelete: "cascade" }),
  policyVersion: integer("policyVersion").notNull(), stateVersion: integer("stateVersion").notNull(),
  kind: text("kind").notNull(), actorId: text("actorId").notNull(), accessEpoch: text("accessEpoch"), commandHash: text("commandHash").notNull(), payload: jsonb("payload").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("studio_review_policy_event_order_unique").on(table.reviewId, table.stateVersion),
  index("studio_review_policy_event_epoch_idx").on(table.reviewId, table.policyVersion, table.stateVersion),
  check("studio_review_policy_event_kind_check", sql`${table.kind} in ('configure', 'vote')`),
  check("studio_review_policy_event_version_check", sql`${table.policyVersion} > 0 and ${table.stateVersion} >= ${table.policyVersion}`),
  check("studio_review_policy_event_hash_check", sql`${table.commandHash} ~ '^[a-f0-9]{64}$'`),
  check("studio_review_policy_event_payload_check", sql`jsonb_typeof(${table.payload}) = 'object' and octet_length(${table.payload}::text) <= 262144`),
]);
