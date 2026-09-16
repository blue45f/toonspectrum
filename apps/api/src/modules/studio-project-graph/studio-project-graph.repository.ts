import { createHash } from "node:crypto";

import { Injectable } from "@nestjs/common";

import { canonicalJson, reviewAnchorSchema } from "@toonspectrum/studio-project-model";
import {
  createCompatibilityReport,
  type CompatibilityReport,
} from "@toonspectrum/studio-format-gateway";
import type { PoolClient } from "pg";

import { dbPool } from "../../db";
import {
  resolveCreatorCollaborationAccess,
  type CreatorCollaborationAccess,
} from "../creator/creator-collaboration.policy";

import type {
  CommitStudioRevision,
  CreateCompatibilityReport,
  CreateStudioProjectGraph,
  CreateStudioReview,
  CreateStudioReviewComment,
  RegisterStudioBlob,
} from "./studio-project-graph.dto";

export interface StudioProjectAccess extends CreatorCollaborationAccess {
  readonly owner: boolean;
  readonly role: "owner" | "admin" | "editor" | "commenter" | "viewer" | null;
}

export interface StudioProjectRecord {
  readonly id: string;
  readonly workId: string;
  readonly schemaVersion: 3;
  readonly authorityVersion: "legacy-v2" | "project-graph-v3";
  readonly ownerUserId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly access: StudioProjectAccess;
  readonly artifacts: readonly StudioArtifactRecord[];
}

export interface StudioArtifactRecord {
  readonly id: string;
  readonly projectId: string;
  readonly kind: string;
  readonly title: string;
  readonly scope: Record<string, unknown>;
  readonly headRevisionId: string;
  readonly approvedRevisionId: string | null;
  readonly ownerWorkspaceId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface StudioRevisionRecord {
  readonly id: string;
  readonly artifactId: string;
  readonly kind: string;
  readonly parentIds: readonly string[];
  readonly rootGraphHash: string;
  readonly operationFirst: number | null;
  readonly operationLast: number | null;
  readonly createdBy: string | null;
  readonly deviceId: string;
  readonly createdAt: string;
  readonly message: string | null;
  readonly compatibilityReportId: string | null;
  readonly provenanceManifestId: string | null;
  readonly blobRefs: readonly {
    sha256: string;
    role: string;
    ordinal: number;
  }[];
}

export interface StudioExternalFileBindingRecord {
  readonly id: string;
  readonly artifactId: string;
  readonly provider: "local-file" | "filesystem-handle" | "google-drive" | "dropbox" | "onedrive";
  readonly providerAccountId: string | null;
  readonly remoteFileId: string;
  readonly displayPath: string;
  readonly syncMode: "import-only" | "export-only" | "bidirectional" | "backup-mirror";
  readonly remoteVersion: string | null;
  readonly remoteEtag: string | null;
  readonly contentHash: string | null;
  readonly lastSyncedRevisionId: string | null;
  readonly lastSyncedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface StudioRevisionCommitResponse {
  readonly artifactId: string;
  readonly revisionId: string;
  readonly headRevisionId: string;
  readonly approvedRevisionId: string | null;
  readonly sequence: number;
  readonly replayed: boolean;
}

export class StudioProjectNotFoundError extends Error {
  constructor(
    readonly target:
      | "work"
      | "project"
      | "artifact"
      | "revision"
      | "review"
      | "report"
      | "binding",
  ) {
    super(`studio_${target}_not_found`);
    this.name = "StudioProjectNotFoundError";
  }
}

export class StudioProjectForbiddenError extends Error {
  constructor(readonly operation: "view" | "comment" | "edit" | "manage") {
    super(`studio_${operation}_forbidden`);
    this.name = "StudioProjectForbiddenError";
  }
}

export class StudioProjectIdentityConflictError extends Error {
  constructor(
    readonly code:
      | "project_exists"
      | "work_already_linked"
      | "artifact_exists"
      | "revision_exists"
      | "binding_exists",
  ) {
    super(code);
    this.name = "StudioProjectIdentityConflictError";
  }
}

export class StudioRevisionConflictError extends Error {
  constructor(readonly currentRevisionId: string) {
    super("studio_revision_conflict");
    this.name = "StudioRevisionConflictError";
  }
}

export class StudioIdempotencyConflictError extends Error {
  constructor() {
    super("studio_idempotency_conflict");
    this.name = "StudioIdempotencyConflictError";
  }
}

export class StudioBlobNotReadyError extends Error {
  constructor(readonly hashes: readonly string[]) {
    super("studio_blob_not_ready");
    this.name = "StudioBlobNotReadyError";
  }
}

export class StudioCompatibilityApprovalRequiredError extends Error {
  constructor(readonly reportId: string) {
    super("studio_compatibility_approval_required");
    this.name = "StudioCompatibilityApprovalRequiredError";
  }
}

export class StudioRepositoryInvariantError extends Error {
  constructor(readonly causeCode: string, message: string) {
    super(message);
    this.name = "StudioRepositoryInvariantError";
  }
}

interface ProjectAccessRow {
  projectId: string;
  workId: string;
  ownerUserId: string;
  membershipRole: string | null;
  membershipStatus: string | null;
}

interface ArtifactAccessRow extends ProjectAccessRow {
  artifactId: string;
  headRevisionId: string;
  approvedRevisionId: string | null;
  projectScope: Record<string, unknown>;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function studioRequestHash(value: unknown): string {
  return sha256(canonicalJson(value));
}

export function studioIdempotencyKeyHash(value: string): string {
  return sha256(value);
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function projectAccess(
  actorUserId: string,
  row: ProjectAccessRow,
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
      ? {
          userId: actorUserId,
          role,
          status: row.membershipStatus,
        }
      : null,
  });
  return Object.freeze({ ...resolved, owner, role });
}

function assertAccess(
  access: StudioProjectAccess,
  operation: "view" | "comment" | "edit" | "manage",
): void {
  const allowed = operation === "view"
    ? access.view
    : operation === "comment"
      ? access.comment
      : operation === "edit"
        ? access.edit
        : access.manageMembers;
  if (!allowed) throw new StudioProjectForbiddenError(operation);
}

async function loadProjectAccess(
  client: PoolClient,
  actorUserId: string,
  projectId: string,
  lock = false,
): Promise<{ row: ProjectAccessRow; access: StudioProjectAccess } | null> {
  const suffix = lock ? " FOR UPDATE OF project" : "";
  const result = await client.query<ProjectAccessRow>(
    `SELECT
       project.id AS "projectId",
       project."workId" AS "workId",
       work."userId" AS "ownerUserId",
       membership.role AS "membershipRole",
       membership.status AS "membershipStatus"
     FROM studio_project_graph project
     JOIN creator_work work ON work.id = project."workId"
     LEFT JOIN creator_work_collaborator membership
       ON membership."workId" = work.id AND membership."userId" = $2
     WHERE project.id = $1${suffix}`,
    [projectId, actorUserId],
  );
  const row = result.rows[0];
  return row ? { row, access: projectAccess(actorUserId, row) } : null;
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
       artifact."headRevisionId" AS "headRevisionId",
       artifact."approvedRevisionId" AS "approvedRevisionId",
       artifact.scope AS "projectScope",
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

async function verifyBlobRefsReady(
  client: PoolClient,
  blobRefs: readonly { readonly sha256: string }[],
): Promise<void> {
  const hashes = [...new Set(blobRefs.map((blob) => blob.sha256))];
  if (hashes.length === 0) return;
  const result = await client.query<{
    hash: string;
    malwareStatus: string;
    formatStatus: string;
  }>(
    `SELECT hash, "malwareStatus", "formatStatus"
     FROM studio_blob
     WHERE hash = ANY($1::text[])`,
    [hashes],
  );
  const ready = new Set(
    result.rows
      .filter((row) => row.malwareStatus === "clean" && row.formatStatus === "valid")
      .map((row) => row.hash),
  );
  const missing = hashes.filter((hash) => !ready.has(hash));
  if (missing.length > 0) throw new StudioBlobNotReadyError(missing);
}

function mapPostgresError(error: unknown): never {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
  const constraint = typeof error === "object" && error !== null && "constraint" in error
    ? String((error as { constraint?: unknown }).constraint ?? "")
    : "";
  if (code === "23505") {
    if (constraint.includes("work_unique")) {
      throw new StudioProjectIdentityConflictError("work_already_linked");
    }
    if (constraint.includes("project_graph_pkey")) {
      throw new StudioProjectIdentityConflictError("project_exists");
    }
    if (constraint.includes("artifact_pkey")) {
      throw new StudioProjectIdentityConflictError("artifact_exists");
    }
    if (constraint.includes("revision_pkey")) {
      throw new StudioProjectIdentityConflictError("revision_exists");
    }
    if (
      constraint.includes("external_file_binding_pkey")
      || constraint.includes("external_file_binding_remote_unique")
    ) {
      throw new StudioProjectIdentityConflictError("binding_exists");
    }
  }
  if (code === "23514" || code === "23503" || code === "55000") {
    throw new StudioRepositoryInvariantError(
      code,
      error instanceof Error ? error.message : "Studio repository invariant failed",
    );
  }
  throw error;
}

export interface StudioProjectCreateResponse {
  readonly projectId: string;
  readonly artifactId: string;
  readonly revisionId: string;
  readonly replayed: boolean;
}

export class StudioBlobMetadataConflictError extends Error {
  constructor(readonly hash: string) {
    super("studio_blob_metadata_conflict");
    this.name = "StudioBlobMetadataConflictError";
  }
}

@Injectable()
export class StudioProjectGraphRepository {
  async createProject(
    actorUserId: string,
    input: CreateStudioProjectGraph,
    idempotencyKey: string,
  ): Promise<StudioProjectCreateResponse> {
    const client = await dbPool.connect();
    const keyHash = studioIdempotencyKeyHash(idempotencyKey);
    const requestHash = studioRequestHash(input);
    try {
      await client.query("BEGIN");
      const receipt = await client.query<{
        requestHash: string;
        response: StudioProjectCreateResponse;
      }>(
        `SELECT "requestHash", response
         FROM studio_mutation_receipt
         WHERE "artifactId" = $1 AND "actorUserId" = $2 AND "idempotencyKeyHash" = $3`,
        [input.artifact.id, actorUserId, keyHash],
      );
      if (receipt.rows[0]) {
        if (receipt.rows[0].requestHash !== requestHash) {
          throw new StudioIdempotencyConflictError();
        }
        await client.query("COMMIT");
        return { ...receipt.rows[0].response, replayed: true };
      }

      const workResult = await client.query<{
        projectId: string;
        workId: string;
        ownerUserId: string;
        membershipRole: string | null;
        membershipStatus: string | null;
      }>(
        `SELECT
           $2::text AS "projectId",
           work.id AS "workId",
           work."userId" AS "ownerUserId",
           membership.role AS "membershipRole",
           membership.status AS "membershipStatus"
         FROM creator_work work
         LEFT JOIN creator_work_collaborator membership
           ON membership."workId" = work.id AND membership."userId" = $3
         WHERE work.id = $1
         FOR UPDATE OF work`,
        [input.workId, input.projectId, actorUserId],
      );
      const work = workResult.rows[0];
      if (!work) throw new StudioProjectNotFoundError("work");
      assertAccess(projectAccess(actorUserId, work), "manage");
      await verifyBlobRefsReady(client, input.initialRevision.blobRefs);

      await client.query(
        `INSERT INTO studio_project_graph (
           id, "workId", "schemaVersion", "authorityVersion", "ownerUserId"
         ) VALUES ($1, $2, 3, 'project-graph-v3', $3)`,
        [input.projectId, input.workId, work.ownerUserId],
      );
      await client.query(
        `INSERT INTO studio_artifact (
           id, "projectId", kind, title, scope, "headRevisionId", "ownerWorkspaceId",
           "createdAt", "updatedAt"
         ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $8)`,
        [
          input.artifact.id,
          input.projectId,
          input.artifact.kind,
          input.artifact.title,
          JSON.stringify(input.artifact.scope),
          input.initialRevision.id,
          input.workspaceId,
          input.initialRevision.createdAt,
        ],
      );
      await client.query(
        `INSERT INTO studio_revision (
           id, "artifactId", kind, "rootGraphHash", "createdBy", "deviceId",
           "createdAt", message
         ) VALUES ($1, $2, 'checkpoint', $3, $4, $5, $6, $7)`,
        [
          input.initialRevision.id,
          input.artifact.id,
          input.initialRevision.rootGraphHash,
          actorUserId,
          input.initialRevision.deviceId,
          input.initialRevision.createdAt,
          input.initialRevision.message ?? null,
        ],
      );
      for (const blob of input.initialRevision.blobRefs) {
        await client.query(
          `INSERT INTO studio_revision_blob ("revisionId", "blobHash", role, ordinal)
           VALUES ($1, $2, $3, $4)`,
          [input.initialRevision.id, blob.sha256, blob.role, blob.ordinal],
        );
      }

      const response: StudioProjectCreateResponse = {
        projectId: input.projectId,
        artifactId: input.artifact.id,
        revisionId: input.initialRevision.id,
        replayed: false,
      };
      await client.query(
        `INSERT INTO studio_mutation_receipt (
           "artifactId", "actorUserId", "idempotencyKeyHash", "requestHash",
           "resultRevisionId", response
         ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [
          input.artifact.id,
          actorUserId,
          keyHash,
          requestHash,
          input.initialRevision.id,
          JSON.stringify(response),
        ],
      );
      await client.query("COMMIT");
      return response;
    } catch (error) {
      await client.query("ROLLBACK");
      if (
        error instanceof StudioProjectNotFoundError
        || error instanceof StudioProjectForbiddenError
        || error instanceof StudioIdempotencyConflictError
        || error instanceof StudioBlobNotReadyError
      ) {
        throw error;
      }
      mapPostgresError(error);
    } finally {
      client.release();
    }
  }

  async getProject(
    actorUserId: string,
    projectId: string,
  ): Promise<StudioProjectRecord> {
    const client = await dbPool.connect();
    try {
      const accessResult = await loadProjectAccess(client, actorUserId, projectId);
      if (!accessResult) throw new StudioProjectNotFoundError("project");
      assertAccess(accessResult.access, "view");
      const projectResult = await client.query<{
        id: string;
        workId: string;
        schemaVersion: number;
        authorityVersion: "legacy-v2" | "project-graph-v3";
        ownerUserId: string;
        createdAt: Date;
        updatedAt: Date;
      }>(
        `SELECT id, "workId", "schemaVersion", "authorityVersion", "ownerUserId",
                "createdAt", "updatedAt"
         FROM studio_project_graph WHERE id = $1`,
        [projectId],
      );
      const project = projectResult.rows[0];
      if (!project) throw new StudioProjectNotFoundError("project");
      const artifactResult = await client.query<{
        id: string;
        projectId: string;
        kind: string;
        title: string;
        scope: Record<string, unknown>;
        headRevisionId: string;
        approvedRevisionId: string | null;
        ownerWorkspaceId: string;
        createdAt: Date;
        updatedAt: Date;
      }>(
        `SELECT id, "projectId", kind, title, scope, "headRevisionId",
                "approvedRevisionId", "ownerWorkspaceId", "createdAt", "updatedAt"
         FROM studio_artifact
         WHERE "projectId" = $1
         ORDER BY "updatedAt" DESC, id`,
        [projectId],
      );
      return {
        ...project,
        schemaVersion: 3,
        createdAt: toIso(project.createdAt),
        updatedAt: toIso(project.updatedAt),
        access: accessResult.access,
        artifacts: artifactResult.rows.map((artifact) => ({
          ...artifact,
          createdAt: toIso(artifact.createdAt),
          updatedAt: toIso(artifact.updatedAt),
        })),
      };
    } finally {
      client.release();
    }
  }

  async getProjectByWork(
    actorUserId: string,
    workId: string,
  ): Promise<StudioProjectRecord> {
    const result = await dbPool.query<{ id: string }>(
      `SELECT id FROM studio_project_graph WHERE "workId" = $1`,
      [workId],
    );
    const project = result.rows[0];
    if (!project) throw new StudioProjectNotFoundError("project");
    return this.getProject(actorUserId, project.id);
  }

  async listRevisions(
    actorUserId: string,
    artifactId: string,
  ): Promise<readonly StudioRevisionRecord[]> {
    const client = await dbPool.connect();
    try {
      const accessResult = await loadArtifactAccess(client, actorUserId, artifactId);
      if (!accessResult) throw new StudioProjectNotFoundError("artifact");
      assertAccess(accessResult.access, "view");
      const result = await client.query<{
        id: string;
        artifactId: string;
        kind: string;
        parentIds: string[];
        rootGraphHash: string;
        operationFirst: string | number | null;
        operationLast: string | number | null;
        createdBy: string | null;
        deviceId: string;
        createdAt: Date;
        message: string | null;
        compatibilityReportId: string | null;
        provenanceManifestId: string | null;
        blobRefs: { sha256: string; role: string; ordinal: number }[];
      }>(
        `SELECT
           revision.id,
           revision."artifactId" AS "artifactId",
           revision.kind,
           COALESCE((
             SELECT jsonb_agg(parent."parentRevisionId" ORDER BY parent.ordinal)
             FROM studio_revision_parent parent
             WHERE parent."revisionId" = revision.id
           ), '[]'::jsonb) AS "parentIds",
           revision."rootGraphHash" AS "rootGraphHash",
           revision."operationFirst" AS "operationFirst",
           revision."operationLast" AS "operationLast",
           revision."createdBy" AS "createdBy",
           revision."deviceId" AS "deviceId",
           revision."createdAt" AS "createdAt",
           revision.message,
           revision."compatibilityReportId" AS "compatibilityReportId",
           revision."provenanceManifestId" AS "provenanceManifestId",
           COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
               'sha256', relation."blobHash",
               'role', relation.role,
               'ordinal', relation.ordinal
             ) ORDER BY relation.role, relation.ordinal)
             FROM studio_revision_blob relation
             WHERE relation."revisionId" = revision.id
           ), '[]'::jsonb) AS "blobRefs"
         FROM studio_revision revision
         WHERE revision."artifactId" = $1
         ORDER BY revision."createdAt" DESC, revision.id`,
        [artifactId],
      );
      return result.rows.map((revision) => ({
        ...revision,
        operationFirst: revision.operationFirst === null
          ? null
          : Number(revision.operationFirst),
        operationLast: revision.operationLast === null
          ? null
          : Number(revision.operationLast),
        createdAt: toIso(revision.createdAt),
      }));
    } finally {
      client.release();
    }
  }

  async registerBlob(
    actorUserId: string,
    projectId: string,
    input: RegisterStudioBlob,
  ): Promise<{
    readonly hash: string;
    readonly malwareStatus: string;
    readonly formatStatus: string;
    readonly existing: boolean;
  }> {
    const client = await dbPool.connect();
    try {
      const accessResult = await loadProjectAccess(client, actorUserId, projectId);
      if (!accessResult) throw new StudioProjectNotFoundError("project");
      assertAccess(accessResult.access, "edit");
      const existing = await client.query<{
        hash: string;
        size: string | number;
        mediaType: string;
        objectKey: string;
        malwareStatus: string;
        formatStatus: string;
      }>(
        `SELECT hash, size, "mediaType", "objectKey", "malwareStatus", "formatStatus"
         FROM studio_blob WHERE hash = $1`,
        [input.hash],
      );
      const row = existing.rows[0];
      if (row) {
        if (
          Number(row.size) !== input.size
          || row.mediaType !== input.mediaType
          || row.objectKey !== input.objectKey
        ) {
          throw new StudioBlobMetadataConflictError(input.hash);
        }
        return {
          hash: row.hash,
          malwareStatus: row.malwareStatus,
          formatStatus: row.formatStatus,
          existing: true,
        };
      }
      const inserted = await client.query<{
        hash: string;
        malwareStatus: string;
        formatStatus: string;
      }>(
        `INSERT INTO studio_blob (
           hash, size, "mediaType", "objectKey", "encryptionMetadata"
         ) VALUES ($1, $2, $3, $4, $5::jsonb)
         RETURNING hash, "malwareStatus", "formatStatus"`,
        [
          input.hash,
          input.size,
          input.mediaType,
          input.objectKey,
          JSON.stringify(input.encryptionMetadata ?? null),
        ],
      );
      return { ...inserted.rows[0]!, existing: false };
    } finally {
      client.release();
    }
  }

  async commitRevision(
    actorUserId: string,
    artifactId: string,
    expectedHeadRevisionId: string,
    idempotencyKey: string,
    input: CommitStudioRevision,
  ): Promise<StudioRevisionCommitResponse> {
    const client = await dbPool.connect();
    const keyHash = studioIdempotencyKeyHash(idempotencyKey);
    const requestHash = studioRequestHash({
      artifactId,
      expectedHeadRevisionId,
      input,
    });
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

      const receipt = await client.query<{
        requestHash: string;
        response: StudioRevisionCommitResponse;
      }>(
        `SELECT "requestHash", response
         FROM studio_mutation_receipt
         WHERE "artifactId" = $1 AND "actorUserId" = $2 AND "idempotencyKeyHash" = $3`,
        [artifactId, actorUserId, keyHash],
      );
      if (receipt.rows[0]) {
        if (receipt.rows[0].requestHash !== requestHash) {
          throw new StudioIdempotencyConflictError();
        }
        await client.query("COMMIT");
        return { ...receipt.rows[0].response, replayed: true };
      }

      if (accessResult.row.headRevisionId !== expectedHeadRevisionId) {
        throw new StudioRevisionConflictError(accessResult.row.headRevisionId);
      }
      if (input.command.scope.projectId !== accessResult.row.projectId) {
        throw new StudioRepositoryInvariantError(
          "scope_project_mismatch",
          "command scope does not belong to the artifact project",
        );
      }
      if (
        input.kind !== "approved"
        && !input.parentIds.includes(expectedHeadRevisionId)
      ) {
        throw new StudioRepositoryInvariantError(
          "head_parent_missing",
          "new revision must derive from the expected artifact head",
        );
      }
      if (input.kind === "approved") {
        const parentReview = await client.query<{ baseRevisionId: string | null }>(
          `SELECT parent."parentRevisionId" AS "baseRevisionId"
           FROM studio_revision_parent parent
           JOIN studio_revision review ON review.id = parent."revisionId"
           WHERE review.id = $1
             AND review."artifactId" = $2
             AND review.kind = 'review-snapshot'
           ORDER BY parent.ordinal
           LIMIT 1`,
          [input.parentIds[0] ?? "", artifactId],
        );
        if (parentReview.rows[0]?.baseRevisionId !== expectedHeadRevisionId) {
          throw new StudioRepositoryInvariantError(
            "approval_snapshot_stale",
            "approved revision must derive from a review snapshot of the current head",
          );
        }
      }

      await verifyBlobRefsReady(client, input.blobRefs);
      if (input.compatibilityReportId) {
        const report = await client.query<{
          projectId: string;
          artifactId: string | null;
          requiresApproval: boolean;
          approvedBy: string | null;
        }>(
          `SELECT "projectId", "artifactId", "requiresApproval", "approvedBy"
           FROM studio_compatibility_report WHERE id = $1`,
          [input.compatibilityReportId],
        );
        const row = report.rows[0];
        if (!row) throw new StudioProjectNotFoundError("report");
        if (
          row.projectId !== accessResult.row.projectId
          || (row.artifactId !== null && row.artifactId !== artifactId)
        ) {
          throw new StudioRepositoryInvariantError(
            "compatibility_report_scope_mismatch",
            "compatibility report does not belong to the artifact",
          );
        }
        if (row.requiresApproval && row.approvedBy === null) {
          throw new StudioCompatibilityApprovalRequiredError(
            input.compatibilityReportId,
          );
        }
      }
      const sequenceResult = await client.query<{ next: string | number }>(
        `SELECT COALESCE(MAX(sequence), 0) + 1 AS next
         FROM studio_operation WHERE "artifactId" = $1`,
        [artifactId],
      );
      const sequence = Number(sequenceResult.rows[0]?.next ?? 1);
      const operationFirst = input.operationRange?.first ?? sequence;
      const operationLast = input.operationRange?.last ?? sequence;

      await client.query(
        `INSERT INTO studio_revision (
           id, "artifactId", kind, "rootGraphHash", "operationFirst", "operationLast",
           "createdBy", "deviceId", "createdAt", message,
           "compatibilityReportId", "provenanceManifestId"
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          input.revisionId,
          artifactId,
          input.kind,
          input.rootGraphHash,
          operationFirst,
          operationLast,
          actorUserId,
          input.deviceId,
          input.createdAt,
          input.message ?? null,
          input.compatibilityReportId ?? null,
          input.provenanceManifestId ?? null,
        ],
      );
      for (const [ordinal, parentId] of input.parentIds.entries()) {
        await client.query(
          `INSERT INTO studio_revision_parent (
             "revisionId", "parentRevisionId", ordinal
           ) VALUES ($1, $2, $3)`,
          [input.revisionId, parentId, ordinal],
        );
      }
      for (const blob of input.blobRefs) {
        await client.query(
          `INSERT INTO studio_revision_blob (
             "revisionId", "blobHash", role, ordinal
           ) VALUES ($1, $2, $3, $4)`,
          [input.revisionId, blob.sha256, blob.role, blob.ordinal],
        );
      }

      const operationRecord = {
        commandId: input.command.id,
        type: input.command.type,
        idempotencyKeyHash: keyHash,
        deterministicSeed: input.command.deterministicSeed,
        payload: input.command.payload,
        patches: input.command.patches,
        inversePatches: input.command.inversePatches,
        invalidations: input.command.invalidations,
      };
      await client.query(
        `INSERT INTO studio_operation (
           "artifactId", sequence, "commandId", "baseRevisionId", "resultRevisionId",
           "actorUserId", "deviceId", "commandType", scope, "payloadHash",
           operation, "issuedAt"
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11::jsonb, $12)`,
        [
          artifactId,
          sequence,
          input.command.id,
          expectedHeadRevisionId,
          input.revisionId,
          actorUserId,
          input.deviceId,
          input.command.type,
          JSON.stringify(input.command.scope),
          input.command.payloadHash,
          JSON.stringify(operationRecord),
          input.command.issuedAt,
        ],
      );
      const advancesHead = input.kind !== "review-snapshot" && input.kind !== "release";
      const nextHeadRevisionId = advancesHead
        ? input.revisionId
        : expectedHeadRevisionId;
      const nextApprovedRevisionId = input.kind === "approved"
        ? input.revisionId
        : accessResult.row.approvedRevisionId;

      await client.query(
        `UPDATE studio_artifact
         SET "headRevisionId" = $2,
             "approvedRevisionId" = $3,
             "updatedAt" = now()
         WHERE id = $1`,
        [artifactId, nextHeadRevisionId, nextApprovedRevisionId],
      );
      await client.query(
        `UPDATE studio_project_graph SET "updatedAt" = now() WHERE id = $1`,
        [accessResult.row.projectId],
      );

      const response: StudioRevisionCommitResponse = {
        artifactId,
        revisionId: input.revisionId,
        headRevisionId: nextHeadRevisionId,
        approvedRevisionId: nextApprovedRevisionId,
        sequence,
        replayed: false,
      };
      await client.query(
        `INSERT INTO studio_mutation_receipt (
           "artifactId", "actorUserId", "idempotencyKeyHash", "requestHash",
           "resultRevisionId", response
         ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [artifactId, actorUserId, keyHash, requestHash, input.revisionId, JSON.stringify(response)],
      );
      await client.query("COMMIT");
      return response;
    } catch (error) {
      await client.query("ROLLBACK");
      if (
        error instanceof StudioProjectNotFoundError
        || error instanceof StudioProjectForbiddenError
        || error instanceof StudioRevisionConflictError
        || error instanceof StudioIdempotencyConflictError
        || error instanceof StudioBlobNotReadyError
        || error instanceof StudioCompatibilityApprovalRequiredError
        || error instanceof StudioRepositoryInvariantError
      ) {
        throw error;
      }
      mapPostgresError(error);
    } finally {
      client.release();
    }
  }
  async createReview(
    actorUserId: string,
    artifactId: string,
    input: CreateStudioReview,
  ): Promise<{
    readonly id: string;
    readonly artifactId: string;
    readonly revisionId: string;
    readonly title: string;
    readonly status: string;
    readonly reviewerIds: readonly string[];
    readonly createdAt: string;
  }> {
    const client = await dbPool.connect();
    try {
      await client.query("BEGIN");
      const accessResult = await loadArtifactAccess(client, actorUserId, artifactId, true);
      if (!accessResult) throw new StudioProjectNotFoundError("artifact");
      assertAccess(accessResult.access, "edit");

      const existing = await client.query<{
        id: string;
        artifactId: string;
        revisionId: string;
        title: string;
        status: string;
        reviewerIds: string[];
        createdAt: Date;
      }>(
        `SELECT review.id, review."artifactId", review."revisionId", review.title,
                review.status, review."createdAt",
                COALESCE(jsonb_agg(reviewer."reviewerUserId" ORDER BY reviewer."reviewerUserId")
                  FILTER (WHERE reviewer."reviewerUserId" IS NOT NULL), '[]'::jsonb) AS "reviewerIds"
         FROM studio_review review
         LEFT JOIN studio_review_reviewer reviewer ON reviewer."reviewId" = review.id
         WHERE review.id = $1
         GROUP BY review.id`,
        [input.id],
      );
      const current = existing.rows[0];
      if (current) {
        const same = current.artifactId === artifactId
          && current.revisionId === input.revisionId
          && current.title === input.title
          && canonicalJson([...current.reviewerIds].sort())
            === canonicalJson([...input.reviewerIds].sort());
        if (!same) throw new StudioIdempotencyConflictError();
        await client.query("COMMIT");
        return { ...current, createdAt: toIso(current.createdAt) };
      }
      const revision = await client.query<{ kind: string }>(
        `SELECT kind FROM studio_revision
         WHERE id = $1 AND "artifactId" = $2`,
        [input.revisionId, artifactId],
      );
      if (!revision.rows[0]) throw new StudioProjectNotFoundError("revision");
      if (revision.rows[0].kind !== "review-snapshot") {
        throw new StudioRepositoryInvariantError(
          "review_revision_kind",
          "review must reference a review-snapshot revision",
        );
      }

      const inserted = await client.query<{ createdAt: Date }>(
        `INSERT INTO studio_review (
           id, "artifactId", "revisionId", "requestedBy", title, status
         ) VALUES ($1, $2, $3, $4, $5, 'open')
         RETURNING "createdAt"`,
        [input.id, artifactId, input.revisionId, actorUserId, input.title],
      );
      for (const reviewerId of input.reviewerIds) {
        await client.query(
          `INSERT INTO studio_review_reviewer ("reviewId", "reviewerUserId")
           VALUES ($1, $2)`,
          [input.id, reviewerId],
        );
      }
      await client.query("COMMIT");
      return {
        id: input.id,
        artifactId,
        revisionId: input.revisionId,
        title: input.title,
        status: "open",
        reviewerIds: input.reviewerIds,
        createdAt: toIso(inserted.rows[0]!.createdAt),
      };
    } catch (error) {
      await client.query("ROLLBACK");
      if (
        error instanceof StudioProjectNotFoundError
        || error instanceof StudioProjectForbiddenError
        || error instanceof StudioIdempotencyConflictError
        || error instanceof StudioRepositoryInvariantError
      ) {
        throw error;
      }
      mapPostgresError(error);
    } finally {
      client.release();
    }
  }
  async createReviewComment(
    actorUserId: string,
    reviewId: string,
    input: CreateStudioReviewComment,
  ) {
    const anchor = reviewAnchorSchema.parse(input.anchor) as unknown as Record<string, unknown>;
    const client = await dbPool.connect();
    try {
      await client.query("BEGIN");
      const reviewResult = await client.query<{
        artifactId: string;
        revisionId: string;
      }>(
        `SELECT "artifactId", "revisionId"
         FROM studio_review WHERE id = $1 FOR UPDATE`,
        [reviewId],
      );
      const review = reviewResult.rows[0];
      if (!review) throw new StudioProjectNotFoundError("review");
      const accessResult = await loadArtifactAccess(
        client,
        actorUserId,
        review.artifactId,
      );
      if (!accessResult) throw new StudioProjectNotFoundError("artifact");
      assertAccess(accessResult.access, "comment");
      if (
        anchor.artifactId !== review.artifactId
        || anchor.revisionId !== review.revisionId
      ) {
        throw new StudioRepositoryInvariantError(
          "review_anchor_mismatch",
          "comment anchor must target the frozen review artifact and revision",
        );
      }
      const existing = await client.query<{
        reviewId: string;
        body: string;
        anchor: Record<string, unknown>;
        createdAt: Date;
      }>(
        `SELECT "reviewId", body, anchor, "createdAt"
         FROM studio_review_comment WHERE id = $1`,
        [input.id],
      );
      const current = existing.rows[0];
      if (current) {
        if (
          current.reviewId !== reviewId
          || current.body !== input.body
          || canonicalJson(current.anchor) !== canonicalJson(anchor)
        ) {
          throw new StudioIdempotencyConflictError();
        }
        await client.query("COMMIT");
        return {
          id: input.id,
          reviewId,
          status: "open" as const,
          anchor: current.anchor,
          createdAt: toIso(current.createdAt),
        };
      }
      const inserted = await client.query<{ createdAt: Date }>(
        `INSERT INTO studio_review_comment (
           id, "reviewId", "authorUserId", anchor, body, severity, status, "dueAt"
         ) VALUES ($1, $2, $3, $4::jsonb, $5, $6, 'open', $7)
         RETURNING "createdAt"`,
        [
          input.id,
          reviewId,
          actorUserId,
          JSON.stringify(anchor),
          input.body,
          input.severity,
          input.dueAt ?? null,
        ],
      );
      for (const assigneeId of input.assigneeIds) {
        await client.query(
          `INSERT INTO studio_review_comment_assignee (
             "commentId", "assigneeUserId"
           ) VALUES ($1, $2)`,
          [input.id, assigneeId],
        );
      }
      await client.query("COMMIT");
      return {
        id: input.id,
        reviewId,
        status: "open" as const,
        anchor,
        createdAt: toIso(inserted.rows[0]!.createdAt),
      };
    } catch (error) {
      await client.query("ROLLBACK");
      if (
        error instanceof StudioProjectNotFoundError
        || error instanceof StudioProjectForbiddenError
        || error instanceof StudioIdempotencyConflictError
        || error instanceof StudioRepositoryInvariantError
      ) {
        throw error;
      }
      mapPostgresError(error);
    } finally {
      client.release();
    }
  }

  async createCompatibilityReport(
    actorUserId: string,
    projectId: string,
    input: CreateCompatibilityReport,
  ): Promise<CompatibilityReport> {
    const client = await dbPool.connect();
    try {
      await client.query("BEGIN");
      const accessResult = await loadProjectAccess(client, actorUserId, projectId, true);
      if (!accessResult) throw new StudioProjectNotFoundError("project");
      assertAccess(accessResult.access, "edit");

      if (input.artifactId) {
        const artifact = await client.query<{ id: string }>(
          `SELECT id FROM studio_artifact
           WHERE id = $1 AND "projectId" = $2`,
          [input.artifactId, projectId],
        );
        if (!artifact.rows[0]) throw new StudioProjectNotFoundError("artifact");
      }
      const blob = await client.query<{
        size: string | number;
        mediaType: string;
        malwareStatus: string;
        formatStatus: string;
      }>(
        `SELECT size, "mediaType", "malwareStatus", "formatStatus"
         FROM studio_blob WHERE hash = $1`,
        [input.source.hash],
      );
      const sourceBlob = blob.rows[0];
      if (
        !sourceBlob
        || Number(sourceBlob.size) !== input.source.size
        || sourceBlob.malwareStatus !== "clean"
        || !["valid", "unsupported"].includes(sourceBlob.formatStatus)
      ) {
        throw new StudioBlobNotReadyError([input.source.hash]);
      }
      const report = createCompatibilityReport({
        id: input.id,
        artifactId: input.artifactId,
        source: {
          sourceFileName: input.source.fileName,
          sourceFormat: input.source.format,
          sourceHash: input.source.hash,
          sourceSize: input.source.size,
          sourceBlob: {
            id: `source-${input.source.hash.slice(0, 32)}`,
            sha256: input.source.hash,
            size: input.source.size,
            mediaType: sourceBlob.mediaType,
            role: "source",
          },
          immutable: true,
          importedAt: input.createdAt,
        },
        items: input.items,
        createdAt: input.createdAt,
      } as never);

      const existing = await client.query<{
        projectId: string;
        artifactId: string | null;
        sourceHash: string;
        grade: string;
        summary: CompatibilityReport["summary"];
        items: CompatibilityReport["items"];
        requiresApproval: boolean;
        approvedBy: string | null;
        approvedAt: Date | null;
        createdAt: Date;
      }>(
        `SELECT "projectId", "artifactId", "sourceHash", grade, summary, items,
                "requiresApproval", "approvedBy", "approvedAt", "createdAt"
         FROM studio_compatibility_report WHERE id = $1`,
        [input.id],
      );
      if (existing.rows[0]) {
        const row = existing.rows[0];
        if (
          row.projectId !== projectId
          || row.artifactId !== (input.artifactId ?? null)
          || row.sourceHash !== input.source.hash
          || canonicalJson(row.items) !== canonicalJson(input.items)
        ) {
          throw new StudioIdempotencyConflictError();
        }
        await client.query("COMMIT");
        return {
          ...report,
          grade: row.grade as CompatibilityReport["grade"],
          summary: row.summary,
          items: row.items,
          requiresApproval: row.requiresApproval,
          approvedBy: row.approvedBy ?? undefined,
          approvedAt: row.approvedAt ? toIso(row.approvedAt) : undefined,
          createdAt: toIso(row.createdAt),
        } as CompatibilityReport;
      }
      await client.query(
        `INSERT INTO studio_compatibility_report (
           id, "projectId", "artifactId", "sourceFormat", "sourceFileName",
           "sourceHash", "sourceSize", grade, summary, items,
           "requiresApproval", "createdAt"
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12)`,
        [
          report.id,
          projectId,
          report.artifactId ?? null,
          report.source.sourceFormat,
          report.source.sourceFileName,
          report.source.sourceHash,
          report.source.sourceSize,
          report.grade,
          JSON.stringify(report.summary),
          JSON.stringify(report.items),
          report.requiresApproval,
          report.createdAt,
        ],
      );
      await client.query("COMMIT");
      return report;
    } catch (error) {
      await client.query("ROLLBACK");
      if (
        error instanceof StudioProjectNotFoundError
        || error instanceof StudioProjectForbiddenError
        || error instanceof StudioBlobNotReadyError
        || error instanceof StudioIdempotencyConflictError
      ) {
        throw error;
      }
      mapPostgresError(error);
    } finally {
      client.release();
    }
  }

  async approveCompatibilityReport(
    actorUserId: string,
    reportId: string,
  ): Promise<{
    readonly id: string;
    readonly approvedBy: string | null;
    readonly approvedAt: string | null;
  }> {
    const client = await dbPool.connect();
    try {
      await client.query("BEGIN");
      const report = await client.query<{
        id: string;
        projectId: string;
        requiresApproval: boolean;
        approvedBy: string | null;
        approvedAt: Date | null;
      }>(
        `SELECT id, "projectId", "requiresApproval", "approvedBy", "approvedAt"
         FROM studio_compatibility_report
         WHERE id = $1
         FOR UPDATE`,
        [reportId],
      );
      const current = report.rows[0];
      if (!current) throw new StudioProjectNotFoundError("report");
      const accessResult = await loadProjectAccess(
        client,
        actorUserId,
        current.projectId,
      );
      if (!accessResult) throw new StudioProjectNotFoundError("project");
      assertAccess(accessResult.access, "edit");
      if (!current.requiresApproval || current.approvedBy !== null) {
        await client.query("COMMIT");
        return {
          id: current.id,
          approvedBy: current.approvedBy,
          approvedAt: current.approvedAt ? toIso(current.approvedAt) : null,
        };
      }
      const updated = await client.query<{
        approvedBy: string;
        approvedAt: Date;
      }>(
        `UPDATE studio_compatibility_report
         SET "approvedBy" = $2, "approvedAt" = now()
         WHERE id = $1
         RETURNING "approvedBy", "approvedAt"`,
        [reportId, actorUserId],
      );
      await client.query("COMMIT");
      return {
        id: reportId,
        approvedBy: updated.rows[0]!.approvedBy,
        approvedAt: toIso(updated.rows[0]!.approvedAt),
      };
    } catch (error) {
      await client.query("ROLLBACK");
      if (
        error instanceof StudioProjectNotFoundError
        || error instanceof StudioProjectForbiddenError
      ) {
        throw error;
      }
      mapPostgresError(error);
    } finally {
      client.release();
    }
  }
}
