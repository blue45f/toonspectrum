import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import type { StudioReviewVoiceNoteSubject } from "@toonspectrum/studio-project-model/review-voice-note";

import type { LocatedPrivateObjectReference } from "../../infrastructure/private-object-storage/private-object-storage.contract";
import { users } from "./auth.schema";
import { creatorWorks } from "./creator.schema";

export const studioReviewVoiceNotes = pgTable("studio_review_voice_note", {
  id: text("id").primaryKey(),
  workId: text("workId").notNull().references(() => creatorWorks.id, { onDelete: "cascade" }),
  reviewId: text("reviewId").notNull(),
  revisionId: text("revisionId").notNull(),
  rootGraphHash: text("rootGraphHash").notNull(),
  subject: jsonb("subject").$type<StudioReviewVoiceNoteSubject>().notNull(),
  authorUserId: text("authorUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  transcript: text("transcript").notNull(),
  durationMs: integer("durationMs").notNull(),
  contentType: text("contentType").notNull(),
  byteLength: integer("byteLength").notNull(),
  sha256: text("sha256").notNull(),
  objectReference: jsonb("objectReference").$type<LocatedPrivateObjectReference>().notNull(),
  requestHash: text("requestHash").notNull(),
  operationId: text("operationId").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
  deletedAt: timestamp("deletedAt", { withTimezone: true }),
  deleteOperationId: text("deleteOperationId"),
}, (t) => [
  unique("studio_review_voice_note_operation_unique").on(t.authorUserId, t.operationId),
  index("studio_review_voice_note_subject_idx").on(t.workId, t.reviewId, t.revisionId, t.createdAt),
  index("studio_review_voice_note_expiry_idx").on(t.expiresAt),
  check("studio_review_voice_note_hashes", sql`${t.rootGraphHash} ~ '^[a-f0-9]{64}$' and ${t.sha256} ~ '^[a-f0-9]{64}$' and ${t.requestHash} ~ '^[a-f0-9]{64}$'`),
]);
