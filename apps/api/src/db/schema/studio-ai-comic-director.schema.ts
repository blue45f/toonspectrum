import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { users } from "./auth.schema";
import { creatorWorks } from "./creator.schema";

/**
 * Durable authority for an AI Comic Director production session.
 *
 * Large image bytes never live in these JSON documents. Candidate, mask and decomposed-layer
 * payloads contain only Studio asset ids, provider receipts and review metadata.
 */
export const studioAiComicDirectorSessions = pgTable(
  "studio_ai_comic_director_session",
  {
    id: text("id").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workId: text("workId").references(() => creatorWorks.id, { onDelete: "cascade" }),
    remixSourceWorkId: text("remixSourceWorkId"),
    title: text("title").notNull().default("AI 코믹 디렉터 세션"),
    stage: text("stage").notNull().default("brief"),
    status: text("status").notNull().default("draft"),
    revision: integer("revision").notNull().default(1),
    baseDocumentRevision: text("baseDocumentRevision"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("idx_studio_ai_comic_session_user_updated").on(
      table.userId,
      table.updatedAt,
    ),
    index("idx_studio_ai_comic_session_work_updated").on(
      table.workId,
      table.updatedAt,
    ),
    check(
      "studio_ai_comic_session_stage_check",
      sql`${table.stage} IN ('brief', 'direction', 'production', 'finish')`,
    ),
    check(
      "studio_ai_comic_session_status_check",
      sql`${table.status} IN ('draft', 'planning', 'ready', 'generating', 'review', 'applying', 'applied', 'cancelled', 'failed')`,
    ),
    check("studio_ai_comic_session_revision_check", sql`${table.revision} >= 1`),
    check(
      "studio_ai_comic_session_scope_check",
      sql`NOT (${table.workId} IS NOT NULL AND ${table.remixSourceWorkId} IS NOT NULL)`,
    ),
  ],
);

export const studioAiVisualBibleRevisions = pgTable(
  "studio_ai_visual_bible_revision",
  {
    id: text("id").primaryKey(),
    sessionId: text("sessionId")
      .notNull()
      .references(() => studioAiComicDirectorSessions.id, { onDelete: "cascade" }),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    status: text("status").notNull().default("draft"),
    sourceDigest: text("sourceDigest").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("uq_studio_ai_visual_bible_session_revision").on(
      table.sessionId,
      table.revision,
    ),
    index("idx_studio_ai_visual_bible_session_created").on(
      table.sessionId,
      table.createdAt,
    ),
    check(
      "studio_ai_visual_bible_status_check",
      sql`${table.status} IN ('draft', 'recommended', 'approved', 'deprecated')`,
    ),
    check("studio_ai_visual_bible_revision_check", sql`${table.revision} >= 1`),
  ],
);

export const studioAiComicDirectorJobs = pgTable(
  "studio_ai_comic_director_job",
  {
    id: text("id").primaryKey(),
    sessionId: text("sessionId")
      .notNull()
      .references(() => studioAiComicDirectorSessions.id, { onDelete: "cascade" }),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    operationId: text("operationId").notNull(),
    kind: text("kind").notNull(),
    status: text("status").notNull().default("queued"),
    progressDone: integer("progressDone").notNull().default(0),
    progressTotal: integer("progressTotal").notNull().default(0),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    result: jsonb("result").$type<Record<string, unknown> | null>(),
    error: text("error"),
    leaseExpiresAt: timestamp("leaseExpiresAt", { mode: "date", withTimezone: true }),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("uq_studio_ai_comic_job_operation").on(
      table.sessionId,
      table.operationId,
    ),
    index("idx_studio_ai_comic_job_session_updated").on(
      table.sessionId,
      table.updatedAt,
    ),
    check(
      "studio_ai_comic_job_kind_check",
      sql`${table.kind} IN ('generation', 'repair', 'quality', 'decomposition', 'apply')`,
    ),
    check(
      "studio_ai_comic_job_status_check",
      sql`${table.status} IN ('queued', 'running', 'succeeded', 'failed', 'cancelled', 'unknown')`,
    ),
    check(
      "studio_ai_comic_job_progress_check",
      sql`${table.progressDone} >= 0 AND ${table.progressTotal} >= 0 AND ${table.progressDone} <= ${table.progressTotal}`,
    ),
  ],
);

export const studioAiComicDirectorJobEvents = pgTable(
  "studio_ai_comic_director_job_event",
  {
    id: text("id").primaryKey(),
    jobId: text("jobId")
      .notNull()
      .references(() => studioAiComicDirectorJobs.id, { onDelete: "cascade" }),
    sessionId: text("sessionId")
      .notNull()
      .references(() => studioAiComicDirectorSessions.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("uq_studio_ai_comic_job_event_sequence").on(
      table.jobId,
      table.sequence,
    ),
    index("idx_studio_ai_comic_job_event_session_created").on(
      table.sessionId,
      table.createdAt,
    ),
    check("studio_ai_comic_job_event_sequence_check", sql`${table.sequence} >= 1`),
  ],
);

export const studioAiComicDirectorArtifacts = pgTable(
  "studio_ai_comic_director_artifact",
  {
    id: text("id").primaryKey(),
    sessionId: text("sessionId")
      .notNull()
      .references(() => studioAiComicDirectorSessions.id, { onDelete: "cascade" }),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    panelId: text("panelId"),
    parentArtifactId: text("parentArtifactId"),
    kind: text("kind").notNull(),
    assetId: text("assetId"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("idx_studio_ai_comic_artifact_session_panel").on(
      table.sessionId,
      table.panelId,
      table.createdAt,
    ),
    check(
      "studio_ai_comic_artifact_kind_check",
      sql`${table.kind} IN ('candidate', 'repair', 'mask', 'quality-report', 'layer-manifest', 'apply-receipt')`,
    ),
  ],
);

export const studioAiComicDirectorApprovals = pgTable(
  "studio_ai_comic_director_approval",
  {
    id: text("id").primaryKey(),
    sessionId: text("sessionId")
      .notNull()
      .references(() => studioAiComicDirectorSessions.id, { onDelete: "cascade" }),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionRevision: integer("sessionRevision").notNull(),
    candidateDigest: text("candidateDigest").notNull(),
    status: text("status").notNull().default("active"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    supersededAt: timestamp("supersededAt", { mode: "date", withTimezone: true }),
  },
  (table) => [
    uniqueIndex("uq_studio_ai_comic_approval_revision_digest").on(
      table.sessionId,
      table.sessionRevision,
      table.candidateDigest,
    ),
    index("idx_studio_ai_comic_approval_session_status").on(
      table.sessionId,
      table.status,
      table.createdAt,
    ),
    check(
      "studio_ai_comic_approval_status_check",
      sql`${table.status} IN ('active', 'superseded')`,
    ),
    check(
      "studio_ai_comic_approval_revision_check",
      sql`${table.sessionRevision} >= 1`,
    ),
  ],
);
