import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

import { users } from "./auth.schema";

/**
 * Request-gated, one-to-one member messaging.
 *
 * A thread keeps the immutable member pair and request lifecycle. Per-user archive, mute and read
 * state lives in participants, while messages remain append-only for moderation evidence.
 */
export const memberMessageThreads = pgTable(
  "member_message_thread",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    dmKey: text("dmKey").notNull(),
    memberAId: text("memberAId").notNull().references(() => users.id, { onDelete: "cascade" }),
    memberBId: text("memberBId").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdBy: text("createdBy").notNull().references(() => users.id, { onDelete: "cascade" }),
    requestRecipientId: text("requestRecipientId").notNull().references(() => users.id, { onDelete: "cascade" }),
    state: text("state").notNull().default("pending"),
    requestCategory: text("requestCategory").notNull().default("general"),
    contextType: text("contextType").notNull().default("profile"),
    contextId: text("contextId"),
    contextLabel: text("contextLabel").notNull().default(""),
    lastMessageAt: timestamp("lastMessageAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    acceptedAt: timestamp("acceptedAt", { mode: "date", withTimezone: true }),
    declinedAt: timestamp("declinedAt", { mode: "date", withTimezone: true }),
    closedAt: timestamp("closedAt", { mode: "date", withTimezone: true }),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("member_message_thread_dm_key_unique").on(t.dmKey),
    unique("member_message_thread_pair_unique").on(t.memberAId, t.memberBId),
    index("idx_member_message_thread_recipient_state").on(t.requestRecipientId, t.state, t.updatedAt.desc()),
    index("idx_member_message_thread_created_by_created").on(t.createdBy, t.createdAt.desc()),
    index("idx_member_message_thread_last_message").on(t.lastMessageAt.desc(), t.id.desc()),
    check("member_message_thread_dm_key_check", sql`${t.dmKey} ~ '^[0-9a-f]{64}$'`),
    check("member_message_thread_pair_order_check", sql`${t.memberAId} < ${t.memberBId}`),
    check(
      "member_message_thread_actor_check",
      sql`${t.createdBy} in (${t.memberAId}, ${t.memberBId})
        and ${t.requestRecipientId} in (${t.memberAId}, ${t.memberBId})
        and ${t.createdBy} <> ${t.requestRecipientId}`
    ),
    check("member_message_thread_state_check", sql`${t.state} in ('pending', 'active', 'declined', 'closed')`),
    check(
      "member_message_thread_category_check",
      sql`${t.requestCategory} in ('feedback', 'collaboration', 'business', 'general')`
    ),
    check(
      "member_message_thread_context_type_check",
      sql`${t.contextType} in ('profile', 'work', 'project', 'general')`
    ),
    check(
      "member_message_thread_context_check",
      sql`(${t.contextType} in ('profile', 'general')) or (${t.contextId} is not null and length(${t.contextId}) between 1 and 160)`
    ),
    check("member_message_thread_context_label_check", sql`length(${t.contextLabel}) <= 160`),
    check("member_message_thread_timestamp_check", sql`${t.updatedAt} >= ${t.createdAt} and ${t.lastMessageAt} >= ${t.createdAt}`),
  ]
);

export const memberMessageParticipants = pgTable(
  "member_message_participant",
  {
    threadId: text("threadId").notNull().references(() => memberMessageThreads.id, { onDelete: "cascade" }),
    userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    lastReadMessageId: text("lastReadMessageId"),
    lastReadAt: timestamp("lastReadAt", { mode: "date", withTimezone: true }),
    archivedAt: timestamp("archivedAt", { mode: "date", withTimezone: true }),
    mutedUntil: timestamp("mutedUntil", { mode: "date", withTimezone: true }),
    joinedAt: timestamp("joinedAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.threadId, t.userId] }),
    index("idx_member_message_participant_user_archive").on(t.userId, t.archivedAt, t.threadId),
    index("idx_member_message_participant_user_read").on(t.userId, t.lastReadAt),
  ]
);

export const memberMessages = pgTable(
  "member_message",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    threadId: text("threadId").notNull().references(() => memberMessageThreads.id, { onDelete: "cascade" }),
    senderId: text("senderId").references(() => users.id, { onDelete: "set null" }),
    type: text("type").notNull().default("text"),
    body: text("body").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deletedAt", { mode: "date", withTimezone: true }),
  },
  (t) => [
    unique("member_message_thread_id_unique").on(t.threadId, t.id),
    index("idx_member_message_thread_created").on(t.threadId, t.createdAt.desc(), t.id.desc()),
    index("idx_member_message_sender_created").on(t.senderId, t.createdAt.desc()),
    check("member_message_type_check", sql`${t.type} in ('text', 'work_card', 'project_card', 'system')`),
    check("member_message_body_check", sql`length(${t.body}) between 1 and 2000 and ${t.body} = btrim(${t.body})`),
    check("member_message_metadata_check", sql`jsonb_typeof(${t.metadata}) = 'object'`),
  ]
);

export const memberMessageBlocks = pgTable(
  "member_message_block",
  {
    blockerId: text("blockerId").notNull().references(() => users.id, { onDelete: "cascade" }),
    blockedUserId: text("blockedUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.blockerId, t.blockedUserId] }),
    index("idx_member_message_block_target").on(t.blockedUserId, t.createdAt.desc()),
    check("member_message_block_self_check", sql`${t.blockerId} <> ${t.blockedUserId}`),
  ]
);

export const memberMessagePreferences = pgTable(
  "member_message_preference",
  {
    userId: text("userId").primaryKey().references(() => users.id, { onDelete: "cascade" }),
    receiveFrom: text("receiveFrom").notNull().default("everyone"),
    emailNotification: boolean("emailNotification").notNull().default(false),
    readReceipt: boolean("readReceipt").notNull().default(true),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "member_message_preference_receive_from_check",
      sql`${t.receiveFrom} in ('everyone', 'followers', 'mutuals', 'nobody')`
    ),
  ]
);

export const memberMessageReports = pgTable(
  "member_message_report",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    reporterId: text("reporterId").notNull().references(() => users.id, { onDelete: "cascade" }),
    reportedUserId: text("reportedUserId").references(() => users.id, { onDelete: "set null" }),
    messageId: text("messageId").notNull().references(() => memberMessages.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    details: text("details").notNull().default(""),
    resolutionNote: text("resolutionNote").notNull().default(""),
    evidenceSnapshot: jsonb("evidenceSnapshot").$type<Record<string, unknown>>().notNull(),
    status: text("status").notNull().default("open"),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp("reviewedAt", { mode: "date", withTimezone: true }),
    reviewedBy: text("reviewedBy").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [
    unique("member_message_report_reporter_message_unique").on(t.reporterId, t.messageId),
    index("idx_member_message_report_status_created").on(t.status, t.createdAt),
    index("idx_member_message_report_reported_user").on(t.reportedUserId, t.createdAt.desc()),
    check(
      "member_message_report_reason_check",
      sql`${t.reason} in ('harassment', 'spam', 'scam', 'sexual', 'threat', 'copyright', 'other')`
    ),
    check("member_message_report_details_check", sql`length(${t.details}) <= 1000`),
    check("member_message_report_resolution_note_check", sql`length(${t.resolutionNote}) <= 500`),
    check("member_message_report_evidence_check", sql`jsonb_typeof(${t.evidenceSnapshot}) = 'object'`),
    check(
      "member_message_report_status_check",
      sql`${t.status} in ('open', 'reviewing', 'resolved', 'dismissed')`
    ),
  ]
);
