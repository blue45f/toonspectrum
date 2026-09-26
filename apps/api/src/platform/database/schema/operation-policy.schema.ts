import { sql } from "drizzle-orm";
import { check, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { OperationPolicyDraft } from "@toonspectrum/contracts/operation-policy";
import { users } from "./auth.schema";

const instant = (name: string) => timestamp(name, { mode: "date", withTimezone: true });
export const productionOperationPolicy=pgTable("production_operation_policy",{
  id:integer("id").primaryKey(),revision:integer("revision").notNull().default(0),
  payload:jsonb("payload").$type<OperationPolicyDraft>().notNull(),updatedAt:instant("updated_at").notNull().defaultNow(),
},(t)=>[check("production_operation_policy_id_check",sql`${t.id}=1`),check("production_operation_policy_revision_check",sql`${t.revision}>=0`),
  check("production_operation_policy_payload_check",sql`jsonb_typeof(${t.payload})='object' AND ${t.payload}->>'schemaVersion'='1' AND ${t.payload}->>'mode' IN ('free','paid')`)]);
export const productionOperationPolicyAudit=pgTable("production_operation_policy_audit",{
  revision:integer("revision").primaryKey(),actorUserId:text("actor_user_id").notNull().references(()=>users.id,{onDelete:"restrict"}),
  reason:text("reason").notNull(),beforeDigest:text("before_digest").notNull(),afterDigest:text("after_digest").notNull(),occurredAt:instant("occurred_at").notNull().defaultNow(),
},(t)=>[check("production_operation_policy_audit_reason_check",sql`char_length(btrim(${t.reason})) BETWEEN 5 AND 500`),
  check("production_operation_policy_audit_before_digest_check",sql`${t.beforeDigest} ~ '^[a-f0-9]{64}$'`),check("production_operation_policy_audit_after_digest_check",sql`${t.afterDigest} ~ '^[a-f0-9]{64}$'`)]);
export const productionOperationPolicyReceipts=pgTable("production_operation_policy_receipt",{
  actorUserId:text("actor_user_id").notNull().references(()=>users.id),mutationId:uuid("mutation_id").notNull(),
  requestDigest:text("request_digest").notNull(),acceptedRevision:integer("accepted_revision").notNull().references(()=>productionOperationPolicyAudit.revision),
},(t)=>[primaryKey({columns:[t.actorUserId,t.mutationId]}),check("production_operation_policy_receipt_request_digest_check",sql`${t.requestDigest} ~ '^[a-f0-9]{64}$'`)]);
