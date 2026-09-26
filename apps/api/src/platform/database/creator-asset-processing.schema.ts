import { sql } from "drizzle-orm";
import {
  check,
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
  creatorAssetArtifactSets,
  creatorAssetProcessingRuns,
} from "./creator-asset-platform.schema";

export const creatorAssetProcessingSteps = pgTable(
  "creator_asset_processing_step",
  {
    runId: text("runId")
      .notNull()
      .references(() => creatorAssetProcessingRuns.id, { onDelete: "cascade" }),
    stepName: text("stepName").notNull(),
    attempt: integer("attempt").notNull(),
    state: text("state").notNull().default("queued"),
    inputDigest: text("inputDigest").notNull(),
    outputDescriptorHash: text("outputDescriptorHash"),
    workerType: text("workerType").notNull(),
    workerVersion: text("workerVersion").notNull(),
    leaseFence: integer("leaseFence").notNull().default(1),
    leaseExpiresAt: timestamp("leaseExpiresAt", {
      mode: "date",
      withTimezone: true,
    }),
    errorCode: text("errorCode"),
    errorDetails: jsonb("errorDetails").$type<Record<string, unknown>>(),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    startedAt: timestamp("startedAt", { mode: "date", withTimezone: true }),
    finishedAt: timestamp("finishedAt", { mode: "date", withTimezone: true }),
  },
  (table) => [
    primaryKey({
      name: "creator_asset_processing_step_pkey",
      columns: [table.runId, table.stepName, table.attempt],
    }),
    index("idx_creator_asset_processing_step_lease").on(
      table.state,
      table.leaseExpiresAt,
      table.runId,
    ),
    check(
      "creator_asset_processing_step_name_check",
      sql`${table.stepName} in (
        'security-scan', 'inventory', 'format-inspect', 'import', 'normalize',
        'master-build', 'spec-validate', 'optimize', 'derive', 'preview',
        'webtoon-render', 'metadata', 'auto-qa', 'review-bundle', 'seal'
      )`,
    ),
    check(
      "creator_asset_processing_step_attempt_check",
      sql`${table.attempt} between 1 and 100`,
    ),
    check(
      "creator_asset_processing_step_state_check",
      sql`${table.state} in ('queued', 'running', 'succeeded', 'failed', 'cancelled')`,
    ),
    check(
      "creator_asset_processing_step_hash_check",
      sql`${table.inputDigest} ~ '^sha256:[a-f0-9]{64}$'
        and (${table.outputDescriptorHash} is null
          or ${table.outputDescriptorHash} ~ '^sha256:[a-f0-9]{64}$')`,
    ),
    check(
      "creator_asset_processing_step_worker_check",
      sql`length(${table.workerType}) between 1 and 80
        and length(${table.workerVersion}) between 1 and 120
        and ${table.workerType} !~ '[[:cntrl:]]'
        and ${table.workerVersion} !~ '[[:cntrl:]]'`,
    ),
    check(
      "creator_asset_processing_step_lease_check",
      sql`${table.leaseFence} between 1 and 2147483647
        and (${table.state} <> 'running' or ${table.leaseExpiresAt} is not null)`,
    ),
    check(
      "creator_asset_processing_step_terminal_check",
      sql`${table.state} not in ('succeeded', 'failed', 'cancelled')
        or ${table.finishedAt} is not null`,
    ),
    check(
      "creator_asset_processing_step_error_check",
      sql`(${table.state} = 'failed' and ${table.errorCode} is not null)
        or (${table.state} <> 'failed')`,
    ),
  ],
);

export const creatorAssetQaReports = pgTable(
  "creator_asset_qa_report",
  {
    id: text("id").primaryKey(),
    artifactSetId: text("artifactSetId")
      .notNull()
      .references(() => creatorAssetArtifactSets.id, { onDelete: "restrict" }),
    profileId: text("profileId").notNull(),
    profileVersion: integer("profileVersion").notNull(),
    state: text("state").notNull(),
    blockerCount: integer("blockerCount").notNull(),
    warningCount: integer("warningCount").notNull(),
    report: jsonb("report").$type<Record<string, unknown>>().notNull(),
    reportHash: text("reportHash").notNull(),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("creator_asset_qa_report_profile_unique").on(
      table.artifactSetId,
      table.profileId,
      table.profileVersion,
    ),
    index("idx_creator_asset_qa_report_state").on(
      table.state,
      table.blockerCount,
      table.createdAt,
    ),
    check(
      "creator_asset_qa_report_profile_check",
      sql`length(${table.profileId}) between 1 and 160
        and ${table.profileId} !~ '[[:cntrl:]]'
        and ${table.profileVersion} between 1 and 2147483647`,
    ),
    check(
      "creator_asset_qa_report_state_check",
      sql`${table.state} in ('passed', 'warning', 'failed')`,
    ),
    check(
      "creator_asset_qa_report_counts_check",
      sql`${table.blockerCount} between 0 and 100000
        and ${table.warningCount} between 0 and 100000
        and (${table.state} <> 'passed' or ${table.blockerCount} = 0)`,
    ),
    check(
      "creator_asset_qa_report_shape_check",
      sql`jsonb_typeof(${table.report}) = 'object'`,
    ),
    check(
      "creator_asset_qa_report_hash_check",
      sql`${table.reportHash} ~ '^sha256:[a-f0-9]{64}$'`,
    ),
  ],
);
