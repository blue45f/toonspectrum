import { Injectable } from "@nestjs/common";

import type { PoolClient } from "pg";

import { dbPool } from "../../platform/database";
import {
  resolveCreatorCollaborationAccess,
  type CreatorCollaborationAccess,
} from "../creator/creator-collaboration.policy";

import type {
  CreateStudioExternalFileBinding,
  UpdateStudioExternalFileBinding,
} from "./studio-project-graph.dto";
import {
  StudioProjectForbiddenError,
  StudioProjectIdentityConflictError,
  StudioProjectNotFoundError,
  StudioRepositoryInvariantError,
  type StudioExternalFileBindingRecord,
  type StudioProjectAccess,
} from "./studio-project-graph.repository";

type CloudProvider = "google-drive" | "dropbox" | "onedrive";
interface ArtifactAccessRow {
  artifactId: string;
  projectId: string;
  workId: string;
  ownerUserId: string;
  membershipRole: string | null;
  membershipStatus: string | null;
}

interface BindingAccessRow extends ArtifactAccessRow {
  bindingId: string;
}

interface BindingRow {
  id: string;
  artifactId: string;
  provider: StudioExternalFileBindingRecord["provider"];
  providerAccountId: string | null;
  remoteFileId: string;
  displayPath: string;
  syncMode: StudioExternalFileBindingRecord["syncMode"];
  remoteVersion: string | null;
  remoteEtag: string | null;
  contentHash: string | null;
  lastSyncedRevisionId: string | null;
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function projectAccess(
  actorUserId: string,
  row: ArtifactAccessRow,
): StudioProjectAccess {
  const owner = actorUserId === row.ownerUserId;
  const role = owner
    ? "owner" as const
    : row.membershipRole === "admin"
      || row.membershipRole === "editor"
      || row.membershipRole === "commenter"
      || row.membershipRole === "viewer"
      ? row.membershipRole
      : null;
  const resolved = resolveCreatorCollaborationAccess({
    actorUserId,
    ownerUserId: row.ownerUserId,
    membership: role && role !== "owner"
      ? { userId: actorUserId, role, status: row.membershipStatus }
      : null,
  });
  return Object.freeze({ ...resolved, owner, role });
}

function assertAccess(
  access: CreatorCollaborationAccess,
  operation: "view" | "edit",
): void {
  if (!(operation === "view" ? access.view : access.edit)) {
    throw new StudioProjectForbiddenError(operation);
  }
}
async function loadArtifactAccess(
  client: PoolClient,
  actorUserId: string,
  artifactId: string,
  lock = false,
): Promise<{ row: ArtifactAccessRow; access: StudioProjectAccess } | null> {
  const suffix = lock ? " FOR UPDATE OF artifact" : "";
  const result = await client.query<ArtifactAccessRow>(
    `SELECT
       artifact.id AS "artifactId",
       artifact."projectId" AS "projectId",
       project."workId" AS "workId",
       work."userId" AS "ownerUserId",
       membership.role AS "membershipRole",
       membership.status AS "membershipStatus"
     FROM studio_artifact artifact
     JOIN studio_project_graph project ON project.id = artifact."projectId"
     JOIN creator_work work ON work.id = project."workId"
     LEFT JOIN creator_work_collaborator membership
       ON membership."workId" = work.id AND membership."userId" = $2
     WHERE artifact.id = $1${suffix}`,
    [artifactId, actorUserId],
  );
  const row = result.rows[0];
  return row ? { row, access: projectAccess(actorUserId, row) } : null;
}
async function loadBindingAccess(
  client: PoolClient,
  actorUserId: string,
  bindingId: string,
  lock = false,
): Promise<{ row: BindingAccessRow; access: StudioProjectAccess } | null> {
  const suffix = lock ? " FOR UPDATE OF binding" : "";
  const result = await client.query<BindingAccessRow>(
    `SELECT
       binding.id AS "bindingId",
       artifact.id AS "artifactId",
       artifact."projectId" AS "projectId",
       project."workId" AS "workId",
       work."userId" AS "ownerUserId",
       membership.role AS "membershipRole",
       membership.status AS "membershipStatus"
     FROM studio_external_file_binding binding
     JOIN studio_artifact artifact ON artifact.id = binding."artifactId"
     JOIN studio_project_graph project ON project.id = artifact."projectId"
     JOIN creator_work work ON work.id = project."workId"
     LEFT JOIN creator_work_collaborator membership
       ON membership."workId" = work.id AND membership."userId" = $2
     WHERE binding.id = $1${suffix}`,
    [bindingId, actorUserId],
  );
  const row = result.rows[0];
  return row ? { row, access: projectAccess(actorUserId, row) } : null;
}
function bindingRecord(row: BindingRow): StudioExternalFileBindingRecord {
  return {
    ...row,
    lastSyncedAt: row.lastSyncedAt ? toIso(row.lastSyncedAt) : null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function isCloudProvider(
  provider: CreateStudioExternalFileBinding["provider"],
): provider is CloudProvider {
  return provider === "google-drive"
    || provider === "dropbox"
    || provider === "onedrive";
}

async function assertCloudConnection(
  client: PoolClient,
  actorUserId: string,
  input: CreateStudioExternalFileBinding,
): Promise<void> {
  if (!isCloudProvider(input.provider)) return;
  const result = await client.query<{ providerAccountId: string }>(
    `SELECT "providerAccountId"
     FROM personal_cloud_connection
     WHERE "userId" = $1 AND provider = $2`,
    [actorUserId, input.provider],
  );
  if (result.rows[0]?.providerAccountId !== input.providerAccountId) {
    throw new StudioRepositoryInvariantError(
      "personal_cloud_connection_required",
      "external file binding requires the actor's connected cloud account",
    );
  }
}
function mapBindingError(error: unknown): never {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
  const constraint = typeof error === "object" && error !== null && "constraint" in error
    ? String((error as { constraint?: unknown }).constraint ?? "")
    : "";
  if (
    code === "23505"
    && (
      constraint.includes("external_file_binding_pkey")
      || constraint.includes("external_file_binding_remote_unique")
    )
  ) {
    throw new StudioProjectIdentityConflictError("binding_exists");
  }
  if (code === "23503" || code === "23514" || code === "55000") {
    throw new StudioRepositoryInvariantError(
      code,
      error instanceof Error ? error.message : "external file binding invariant failed",
    );
  }
  throw error;
}

@Injectable()
export class StudioExternalFileBindingRepository {
  async list(
    actorUserId: string,
    artifactId: string,
  ): Promise<readonly StudioExternalFileBindingRecord[]> {
    const client = await dbPool.connect();
    try {
      const accessResult = await loadArtifactAccess(client, actorUserId, artifactId);
      if (!accessResult) throw new StudioProjectNotFoundError("artifact");
      assertAccess(accessResult.access, "view");
      const result = await client.query<BindingRow>(
        `SELECT
           id, "artifactId", provider, "providerAccountId", "remoteFileId",
           "displayPath", "syncMode", "remoteVersion", "remoteEtag",
           "contentHash", "lastSyncedRevisionId", "lastSyncedAt",
           "createdAt", "updatedAt"
         FROM studio_external_file_binding
         WHERE "artifactId" = $1
         ORDER BY "updatedAt" DESC, id`,
        [artifactId],
      );
      return result.rows.map(bindingRecord);
    } finally {
      client.release();
    }
  }

  async create(
    actorUserId: string,
    artifactId: string,
    input: CreateStudioExternalFileBinding,
  ): Promise<StudioExternalFileBindingRecord> {
    const client = await dbPool.connect();
    try {
      await client.query("BEGIN");
      const accessResult = await loadArtifactAccess(
        client,
        actorUserId,
        artifactId,
        true,
      );
      if (!accessResult) throw new StudioProjectNotFoundError("artifact");
      assertAccess(accessResult.access, "edit");
      await assertCloudConnection(client, actorUserId, input);

      const result = await client.query<BindingRow>(
        `INSERT INTO studio_external_file_binding (
           id, "artifactId", "ownerUserId", provider, "providerAccountId",
           "remoteFileId", "displayPath", "syncMode"
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING
           id, "artifactId", provider, "providerAccountId", "remoteFileId",
           "displayPath", "syncMode", "remoteVersion", "remoteEtag",
           "contentHash", "lastSyncedRevisionId", "lastSyncedAt",
           "createdAt", "updatedAt"`,
        [
          input.id,
          artifactId,
          actorUserId,
          input.provider,
          input.providerAccountId ?? null,
          input.remoteFileId,
          input.displayPath,
          input.syncMode,
        ],
      );
      await client.query("COMMIT");
      return bindingRecord(result.rows[0]!);
    } catch (error) {
      await client.query("ROLLBACK");
      if (
        error instanceof StudioProjectNotFoundError
        || error instanceof StudioProjectForbiddenError
        || error instanceof StudioProjectIdentityConflictError
        || error instanceof StudioRepositoryInvariantError
      ) {
        throw error;
      }
      mapBindingError(error);
    } finally {
      client.release();
    }
  }

  async update(
    actorUserId: string,
    bindingId: string,
    input: UpdateStudioExternalFileBinding,
  ): Promise<StudioExternalFileBindingRecord> {
    const client = await dbPool.connect();
    try {
      await client.query("BEGIN");
      const accessResult = await loadBindingAccess(
        client,
        actorUserId,
        bindingId,
        true,
      );
      if (!accessResult) throw new StudioProjectNotFoundError("binding");
      assertAccess(accessResult.access, "edit");

      if (input.lastSyncedRevisionId) {
        const revision = await client.query<{ artifactId: string }>(
          `SELECT "artifactId" FROM studio_revision WHERE id = $1`,
          [input.lastSyncedRevisionId],
        );
        if (revision.rows[0]?.artifactId !== accessResult.row.artifactId) {
          throw new StudioRepositoryInvariantError(
            "binding_revision_scope_mismatch",
            "binding sync revision must belong to the bound artifact",
          );
        }
      }

      const assignments: string[] = [];
      const values: unknown[] = [bindingId];
      const assign = (column: string, value: unknown): void => {
        values.push(value);
        assignments.push(`${column} = $${values.length}`);
      };
      if (input.displayPath !== undefined) assign('"displayPath"', input.displayPath);
      if (input.syncMode !== undefined) assign('"syncMode"', input.syncMode);
      if (input.remoteVersion !== undefined) assign('"remoteVersion"', input.remoteVersion);
      if (input.remoteEtag !== undefined) assign('"remoteEtag"', input.remoteEtag);
      if (input.contentHash !== undefined) assign('"contentHash"', input.contentHash);
      if (input.lastSyncedRevisionId !== undefined) {
        assign('"lastSyncedRevisionId"', input.lastSyncedRevisionId);
        assign('"lastSyncedAt"', input.lastSyncedAt);
      }
      assignments.push('"updatedAt" = now()');

      const result = await client.query<BindingRow>(
        `UPDATE studio_external_file_binding
         SET ${assignments.join(", ")}
         WHERE id = $1
         RETURNING
           id, "artifactId", provider, "providerAccountId", "remoteFileId",
           "displayPath", "syncMode", "remoteVersion", "remoteEtag",
           "contentHash", "lastSyncedRevisionId", "lastSyncedAt",
           "createdAt", "updatedAt"`,
        values,
      );
      await client.query("COMMIT");
      return bindingRecord(result.rows[0]!);
    } catch (error) {
      await client.query("ROLLBACK");
      if (
        error instanceof StudioProjectNotFoundError
        || error instanceof StudioProjectForbiddenError
        || error instanceof StudioRepositoryInvariantError
      ) {
        throw error;
      }
      mapBindingError(error);
    } finally {
      client.release();
    }
  }

  async remove(actorUserId: string, bindingId: string): Promise<void> {
    const client = await dbPool.connect();
    try {
      await client.query("BEGIN");
      const accessResult = await loadBindingAccess(
        client,
        actorUserId,
        bindingId,
        true,
      );
      if (!accessResult) throw new StudioProjectNotFoundError("binding");
      assertAccess(accessResult.access, "edit");
      await client.query(
        `DELETE FROM studio_external_file_binding WHERE id = $1`,
        [bindingId],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      if (
        error instanceof StudioProjectNotFoundError
        || error instanceof StudioProjectForbiddenError
      ) {
        throw error;
      }
      mapBindingError(error);
    } finally {
      client.release();
    }
  }
}
