import { sql } from "drizzle-orm";
import { bigint, check, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth.schema";
import { productionProjects } from "./production.schema";

const time = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
export const productionTeamWorkspaces = pgTable("production_team_workspace", {
  id: text("id").primaryKey(), name: text("name").notNull(),
  ownerUserId: text("owner_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  revision: integer("revision").notNull().default(0),
  createdAt: time("created_at").notNull().defaultNow(), updatedAt: time("updated_at").notNull().defaultNow(),
}, (table) => [index("production_team_workspace_owner").on(table.ownerUserId, table.id),
  check("production_team_workspace_name_check", sql`char_length(btrim(${table.name})) between 1 and 20`),
  check("production_team_workspace_revision_check", sql`${table.revision} >= 0`)]);
export const productionTeamMembers = pgTable("production_team_member", {
  workspaceId: text("workspace_id").notNull().references(() => productionTeamWorkspaces.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  role: text("role").notNull(), joinedAt: time("joined_at").notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.workspaceId, table.userId] }),
  uniqueIndex("production_team_one_owner").on(table.workspaceId).where(sql`${table.role}='owner'`),
  index("production_team_member_user").on(table.userId, table.workspaceId),
  check("production_team_member_role_check", sql`${table.role} in ('owner','admin','member','guest')`)]);
export const productionTeamInvites = pgTable("production_team_invite", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => productionTeamWorkspaces.id, { onDelete: "cascade" }),
  email: text("email").notNull(), role: text("role").notNull(), tokenHash: text("token_hash").notNull().unique(),
  createdBy: text("created_by").notNull().references(() => users.id),
  expiresAt: time("expires_at").notNull(), revokedAt: time("revoked_at"), acceptedAt: time("accepted_at"),
  createdAt: time("created_at").notNull().defaultNow(),
}, (table) => [uniqueIndex("production_team_pending_invite").on(table.workspaceId, table.email)
  .where(sql`${table.revokedAt} is null and ${table.acceptedAt} is null`),
  index("production_team_invite_workspace").on(table.workspaceId, table.expiresAt),
  check("production_team_invite_email_check", sql`${table.email}=lower(btrim(${table.email})) and char_length(${table.email}) between 3 and 320`),
  check("production_team_invite_role_check", sql`${table.role} in ('admin','member','guest')`),
  check("production_team_invite_token_hash_check", sql`${table.tokenHash} ~ '^[a-f0-9]{64}$'`)]);
export const productionTeamProjects = pgTable("production_team_project", {
  projectId: text("project_id").primaryKey().references(() => productionProjects.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id").notNull().references(() => productionTeamWorkspaces.id, { onDelete: "restrict" }),
  linkedBy: text("linked_by").notNull().references(() => users.id), linkedAt: time("linked_at").notNull().defaultNow(),
}, (table) => [index("production_team_project_workspace").on(table.workspaceId, table.projectId)]);
export const productionTeamReceipts = pgTable("production_team_receipt", {
  actorUserId: text("actor_user_id").notNull().references(() => users.id), mutationId: uuid("mutation_id").notNull(),
  workspaceId: text("workspace_id").notNull().references(() => productionTeamWorkspaces.id, { onDelete: "cascade" }),
  requestDigest: text("request_digest").notNull(), response: jsonb("response").notNull(), createdAt: time("created_at").notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.actorUserId, table.mutationId] }),
  check("production_team_receipt_request_digest_check", sql`${table.requestDigest} ~ '^[a-f0-9]{64}$'`),
  check("production_team_receipt_response_check", sql`jsonb_typeof(${table.response})='object'`)]);
export const productionTeamAudit = pgTable("production_team_audit", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  workspaceId: text("workspace_id").notNull().references(() => productionTeamWorkspaces.id, { onDelete: "cascade" }),
  actorUserId: text("actor_user_id").notNull().references(() => users.id), action: text("action").notNull(),
  targetId: text("target_id").notNull(), revision: integer("revision").notNull(), occurredAt: time("occurred_at").notNull().defaultNow(),
}, (table) => [index("production_team_audit_workspace").on(table.workspaceId, table.id.desc())]);
