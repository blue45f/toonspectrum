import { sql } from "drizzle-orm";
import {
  bigint,
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

import type { ProductionProjectAggregate } from "@toonspectrum/core/production";

import { users } from "./auth.schema";
import { creatorWorks } from "./creator.schema";

export const productionProjects = pgTable(
  "production_project",
  {
    id: text("id").primaryKey(),
    workId: text("workId")
      .notNull()
      .references(() => creatorWorks.id, { onDelete: "cascade" }),
    organizationId: text("organizationId"),
    title: text("title").notNull(),
    collaborationModel: text("collaborationModel").notNull(),
    modelVersion: integer("modelVersion").notNull().default(1),
    revision: integer("revision").notNull().default(0),
    aggregate: jsonb("aggregate").$type<ProductionProjectAggregate>().notNull(),
    createdBy: text("createdBy").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("production_project_work_unique").on(table.workId),
    index("idx_production_project_updated").on(table.updatedAt.desc(), table.id),
    index("idx_production_project_organization_updated").on(
      table.organizationId,
      table.updatedAt.desc(),
    ),
    check("production_project_id_check", sql`length(${table.id}) between 1 and 160`),
    check("production_project_title_check", sql`length(btrim(${table.title})) between 1 and 240`),
    check(
      "production_project_collaboration_model_check",
      sql`${table.collaborationModel} in (
        'solo', 'co-creator', 'story-led-commission', 'art-led-commission',
        'adaptation', 'studio-production', 'anthology', 'replacement'
      )`,
    ),
    check("production_project_model_version_check", sql`${table.modelVersion} = 1`),
    check("production_project_revision_check", sql`${table.revision} between 0 and 2147483647`),
    check(
      "production_project_aggregate_check",
      sql`(
        jsonb_typeof(${table.aggregate}) = 'object'
        and ${table.aggregate}->>'modelVersion' = ${table.modelVersion}::text
        and ${table.aggregate}->>'projectId' = ${table.id}
        and ${table.aggregate}->>'workId' = ${table.workId}
        and ${table.aggregate}->>'revision' = ${table.revision}::text
        and jsonb_typeof(${table.aggregate}->'parties') = 'array'
        and jsonb_typeof(${table.aggregate}->'assignments') = 'array'
        and jsonb_typeof(${table.aggregate}->'auditEvents') = 'array'
      ) is true`,
    ),
  ],
);

export const productionProjectEvents = pgTable(
  "production_project_event",
  {
    id: text("id").notNull(),
    projectId: text("projectId")
      .notNull()
      .references(() => productionProjects.id, { onDelete: "cascade" }),
    aggregateRevision: integer("aggregateRevision").notNull(),
    actorUserId: text("actorUserId").references(() => users.id, { onDelete: "set null" }),
    actorPartyId: text("actorPartyId"),
    action: text("action").notNull(),
    targetType: text("targetType").notNull(),
    targetId: text("targetId").notNull(),
    beforeDigest: text("beforeDigest"),
    afterDigest: text("afterDigest"),
    reason: text("reason"),
    occurredAt: timestamp("occurredAt", { mode: "date", withTimezone: true }).notNull(),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "production_project_event_pkey",
      columns: [table.projectId, table.aggregateRevision],
    }),
    unique("production_project_event_id_unique").on(table.id),
    index("idx_production_project_event_actor_created").on(
      table.actorUserId,
      table.createdAt.desc(),
    ),
    check("production_project_event_revision_check", sql`${table.aggregateRevision} between 1 and 2147483647`),
    check("production_project_event_action_check", sql`length(btrim(${table.action})) between 1 and 120`),
    check("production_project_event_target_type_check", sql`length(btrim(${table.targetType})) between 1 and 120`),
    check("production_project_event_target_id_check", sql`length(btrim(${table.targetId})) between 1 and 160`),
    check(
      "production_project_event_digest_check",
      sql`(${table.beforeDigest} is null or ${table.beforeDigest} ~ '^(?:fnv1a64:[0-9a-f]{16}|sha256:[0-9a-f]{64})$')
        and (${table.afterDigest} is null or ${table.afterDigest} ~ '^(?:fnv1a64:[0-9a-f]{16}|sha256:[0-9a-f]{64})$')`,
    ),
  ],
);

export const productionProjectMutationReceipts = pgTable(
  "production_project_mutation_receipt",
  {
    projectId: text("projectId")
      .notNull()
      .references(() => productionProjects.id, { onDelete: "cascade" }),
    actorUserId: text("actorUserId").notNull(),
    mutationId: text("mutationId").notNull(),
    requestDigest: text("requestDigest").notNull(),
    resultRevision: integer("resultRevision").notNull(),
    response: jsonb("response").$type<{ aggregate: ProductionProjectAggregate; derived?: unknown }>().notNull(),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "production_project_mutation_receipt_pkey",
      columns: [table.projectId, table.actorUserId, table.mutationId],
    }),
    index("idx_production_project_mutation_receipt_created").on(table.createdAt),
    check(
      "production_project_mutation_receipt_id_check",
      sql`${table.mutationId} ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
    ),
    check(
      "production_project_mutation_receipt_digest_check",
      sql`${table.requestDigest} ~ '^fnv1a64:[0-9a-f]{16}$'`,
    ),
    check(
      "production_project_mutation_receipt_revision_check",
      sql`${table.resultRevision} between 1 and 2147483647`,
    ),
    check(
      "production_project_mutation_receipt_response_check",
      sql`jsonb_typeof(${table.response}) = 'object'
        and jsonb_typeof(${table.response}->'aggregate') = 'object'`,
    ),
  ],
);

export const productionIntegrationReceipts = pgTable(
  "production_integration_receipt",
  {
    projectId: text("projectId")
      .notNull()
      .references(() => productionProjects.id, { onDelete: "cascade" }),
    actorUserId: text("actorUserId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mutationId: text("mutationId").notNull(),
    provider: text("provider").notNull(),
    operation: text("operation").notNull(),
    requestDigest: text("requestDigest").notNull(),
    state: text("state").notNull().default("pending"),
    externalId: text("externalId"),
    response: jsonb("response").$type<Record<string, unknown> | null>(),
    errorCode: text("errorCode"),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "production_integration_receipt_pkey",
      columns: [table.projectId, table.actorUserId, table.mutationId],
    }),
    index("idx_production_integration_receipt_state").on(
      table.provider,
      table.state,
      table.updatedAt,
    ),
    check(
      "production_integration_receipt_mutation_check",
      sql`${table.mutationId} ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
    ),
    check("production_integration_receipt_provider_check", sql`length(btrim(${table.provider})) between 1 and 80`),
    check("production_integration_receipt_operation_check", sql`length(btrim(${table.operation})) between 1 and 120`),
    check("production_integration_receipt_digest_check", sql`${table.requestDigest} ~ '^sha256:[0-9a-f]{64}$'`),
    check("production_integration_receipt_state_check", sql`${table.state} in ('pending', 'succeeded', 'failed', 'uncertain')`),
    check("production_integration_receipt_response_check", sql`${table.response} is null or jsonb_typeof(${table.response}) = 'object'`),
    check(
      "production_integration_receipt_result_check",
      sql`(${table.state} = 'pending' and ${table.response} is null and ${table.errorCode} is null)
        or (${table.state} = 'succeeded' and ${table.response} is not null and ${table.errorCode} is null)
        or (${table.state} in ('failed', 'uncertain') and ${table.errorCode} is not null)`,
    ),
  ],
);

export const productionIntegrationConnections = pgTable(
  "production_integration_connection",
  {
    projectId: text("projectId")
      .notNull()
      .references(() => productionProjects.id, { onDelete: "cascade" }),
    actorUserId: text("actorUserId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    ciphertext: text("ciphertext").notNull(),
    externalAccountId: text("externalAccountId"),
    scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
    expiresAt: timestamp("expiresAt", { mode: "date", withTimezone: true }),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "production_integration_connection_pkey",
      columns: [table.projectId, table.actorUserId, table.provider],
    }),
    index("idx_production_integration_connection_actor").on(
      table.actorUserId,
      table.updatedAt.desc(),
    ),
    check("production_integration_connection_provider_check", sql`${table.provider} in ('google-workspace')`),
    check("production_integration_connection_ciphertext_check", sql`length(${table.ciphertext}) between 32 and 16384`),
    check("production_integration_connection_scopes_check", sql`jsonb_typeof(${table.scopes}) = 'array'`),
  ],
);

export const productionIntegrationOauthStates = pgTable(
  "production_integration_oauth_state",
  {
    stateHash: text("stateHash").primaryKey(),
    projectId: text("projectId")
      .notNull()
      .references(() => productionProjects.id, { onDelete: "cascade" }),
    actorUserId: text("actorUserId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    redirectPath: text("redirectPath").notNull(),
    expiresAt: timestamp("expiresAt", { mode: "date", withTimezone: true }).notNull(),
    consumedAt: timestamp("consumedAt", { mode: "date", withTimezone: true }),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_production_integration_oauth_expiry")
      .on(table.expiresAt)
      .where(sql`${table.consumedAt} is null`),
    check("production_integration_oauth_state_hash_check", sql`${table.stateHash} ~ '^sha256:[0-9a-f]{64}$'`),
    check("production_integration_oauth_state_provider_check", sql`${table.provider} in ('google-workspace')`),
    check(
      "production_integration_oauth_state_redirect_check",
      sql`${table.redirectPath} ~ '^/production(?:/|$)' and length(${table.redirectPath}) <= 512`,
    ),
    check("production_integration_oauth_state_expiry_check", sql`${table.expiresAt} > ${table.createdAt}`),
  ],
);

export const productionPushSubscriptions = pgTable(
  "production_push_subscription",
  {
    projectId: text("projectId")
      .notNull()
      .references(() => productionProjects.id, { onDelete: "cascade" }),
    actorUserId: text("actorUserId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpointHash: text("endpointHash").notNull(),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    expirationTime: bigint("expirationTime", { mode: "number" }),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "production_push_subscription_pkey",
      columns: [table.projectId, table.actorUserId, table.endpointHash],
    }),
    index("idx_production_push_subscription_project").on(
      table.projectId,
      table.updatedAt.desc(),
    ),
    check("production_push_subscription_endpoint_hash_check", sql`${table.endpointHash} ~ '^sha256:[0-9a-f]{64}$'`),
    check("production_push_subscription_endpoint_check", sql`${table.endpoint} ~ '^https://' and length(${table.endpoint}) <= 4096`),
    check(
      "production_push_subscription_key_check",
      sql`length(${table.p256dh}) between 32 and 512 and length(${table.auth}) between 8 and 256`,
    ),
    check(
      "production_push_subscription_expiry_check",
      sql`${table.expirationTime} is null or ${table.expirationTime} >= 0`,
    ),
  ],
);
