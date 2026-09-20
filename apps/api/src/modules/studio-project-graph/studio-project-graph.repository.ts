import { createHash } from "node:crypto";

import { Injectable } from "@nestjs/common";

import { canonicalJson, reviewAnchorSchema, scopeContains, scopeRefSchema, validateStudioReviewSpatialAnchor } from "@toonspectrum/studio-project-model";
import { STUDIO_WORLD_ARTIFACT_PREFIX } from "@toonspectrum/studio-project-model/world-publication";
import { STUDIO_WORK_SESSION_ARTIFACT_PREFIX } from "@toonspectrum/studio-project-model/work-session";
import {
  compatibilityReportSchema,
  createCompatibilityReport,
  type CompatibilityReport,
} from "@toonspectrum/studio-format-gateway";
import type { PoolClient } from "pg";
import { STUDIO_REVIEW_PREVIEW_PAGE_SIZE, type StudioReviewPreviewBlobRow,
  type StudioReviewPreviewSource, type StudioReviewPreviewSubject } from "./studio-review-preview";
import { lockStudioReviewPreviewStorage } from "./studio-review-preview-storage";
import { studioReviewMappingFromOperation, studioReviewMappingsFromOperation } from "./studio-review-source-map";
import { loadStudioReviewResolutionCaptures } from "./studio-review-capture-attestation";

import { dbPool } from "../../db";
import {
  resolveCreatorCollaborationAccess,
  type CreatorCollaborationAccess,
} from "../creator/creator-collaboration.policy";

import type {
  CommitStudioRevision,
  CreateStudioArtifact,
  CreateCompatibilityReport,
  CreateStudioProjectGraph,
  CreateStudioReview,
  CreateStudioReviewComment,
  DecideStudioReview,
  ResolveStudioReviewComment,
  RestoreStudioRevision,
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
  constructor(readonly target: "work" | "project" | "artifact" | "revision" | "review" | "comment" | "report" | "binding") {
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
  constructor(readonly code: "project_exists" | "work_already_linked" | "artifact_exists" | "revision_exists" | "binding_exists") {
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

export function projectAccess(
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

export function assertAccess(
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

export async function loadArtifactAccess(
  client: PoolClient,
  actorUserId: string,
  artifactId: string,
  lock = false,
): Promise<{ row: ArtifactAccessRow; access: StudioProjectAccess } | null> {
  assertGenericWorkSessionArtifact(artifactId);
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

interface StudioBlobReadinessRow {
  readonly hash: string;
  readonly malwareStatus: string;
  readonly formatStatus: string;
}

export function studioUnreadyBlobHashes(
  blobRefs: readonly { readonly sha256: string; readonly role: string }[],
  rows: readonly StudioBlobReadinessRow[],
): readonly string[] {
  const rolesByHash = new Map<string, Set<string>>();
  for (const blob of blobRefs) {
    const roles = rolesByHash.get(blob.sha256) ?? new Set<string>();
    roles.add(blob.role);
    rolesByHash.set(blob.sha256, roles);
  }
  const rowByHash = new Map(rows.map((row) => [row.hash, row] as const));
  const missing: string[] = [];
  for (const [hash, roles] of rolesByHash) {
    const row = rowByHash.get(hash);
    const clean = row?.malwareStatus === "clean";
    const formatReady = row?.formatStatus === "valid"
      || (row?.formatStatus === "unsupported" && [...roles].every((role) => role === "source"));
    if (!clean || !formatReady) missing.push(hash);
  }
  return Object.freeze(missing);
}

async function verifyBlobRefsReady(
  client: PoolClient,
  blobRefs: readonly { readonly sha256: string; readonly role: string }[],
  workId: string,
): Promise<void> {
  for (const hash of [...new Set(blobRefs.filter((blob) => blob.role === "preview").map((blob) => blob.sha256))].sort()) {
    try { await lockStudioReviewPreviewStorage(client, workId, hash); }
    catch { throw new StudioBlobNotReadyError([hash]); }
  }
  const hashes = [...new Set(blobRefs.map((blob) => blob.sha256))];
  if (hashes.length === 0) return;
  const result = await client.query<StudioBlobReadinessRow>(
    `SELECT hash, "malwareStatus", "formatStatus"
     FROM studio_blob
     WHERE hash = ANY($1::text[])`,
    [hashes],
  );
  const missing = studioUnreadyBlobHashes(blobRefs, result.rows);
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

export interface StudioReviewSummaryRecord {
  readonly id: string;
  readonly artifactId: string;
  readonly revisionId: string;
  readonly requestedBy: string | null;
  readonly title: string;
  readonly status: "open" | "changes-requested" | "approved" | "rejected" | "cancelled";
  readonly decidedAt: string | null;
  readonly decidedBy: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly reviewerIds: readonly string[];
  readonly openRequiredCommentCount: number;
}

export interface StudioReviewCommentRecord {
  readonly id: string;
  readonly reviewId: string;
  readonly authorUserId: string | null;
  readonly anchor: Record<string, unknown>;
  readonly body: string;
  readonly severity: "required" | "recommended" | "note";
  readonly status: "open" | "resolved" | "reopened" | "dismissed";
  readonly dueAt: string | null;
  readonly resolutionRevisionId: string | null;
  readonly resolvedBy: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly assigneeIds: readonly string[];
}

export interface StudioReviewRecord extends StudioReviewSummaryRecord {
  readonly comments: readonly StudioReviewCommentRecord[];
}

export class StudioBlobMetadataConflictError extends Error {
  constructor(readonly hash: string) {
    super("studio_blob_metadata_conflict");
    this.name = "StudioBlobMetadataConflictError";
  }
}

interface StudioReviewSummaryRow {
  id: string;
  artifactId: string;
  revisionId: string;
  requestedBy: string | null;
  title: string;
  status: StudioReviewSummaryRecord["status"];
  decidedAt: Date | null;
  decidedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  reviewerIds: string[];
  openRequiredCommentCount: number | string;
}

function mapStudioReviewSummary(
  row: StudioReviewSummaryRow,
): StudioReviewSummaryRecord {
  return Object.freeze({
    id: row.id,
    artifactId: row.artifactId,
    revisionId: row.revisionId,
    requestedBy: row.requestedBy,
    title: row.title,
    status: row.status,
    decidedAt: row.decidedAt ? toIso(row.decidedAt) : null,
    decidedBy: row.decidedBy,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    reviewerIds: Object.freeze([...row.reviewerIds]),
    openRequiredCommentCount: Number(row.openRequiredCommentCount),
  });
}

interface StudioReviewCommentRow {
  id: string;
  reviewId: string;
  authorUserId: string | null;
  anchor: Record<string, unknown>;
  body: string;
  severity: StudioReviewCommentRecord["severity"];
  status: StudioReviewCommentRecord["status"];
  dueAt: Date | null;
  resolutionRevisionId: string | null;
  resolvedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  assigneeIds: string[];
}

function mapStudioReviewComment(
  row: StudioReviewCommentRow,
): StudioReviewCommentRecord {
  return Object.freeze({
    ...row,
    dueAt: row.dueAt ? toIso(row.dueAt) : null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    assigneeIds: Object.freeze([...row.assigneeIds]),
  });
}

/** Server-owned world assets must not be written through generic graph commands or restore. */
function assertGenericWorldArtifact(artifactId: string): void {
  if (artifactId.startsWith(STUDIO_WORLD_ARTIFACT_PREFIX)) {
    throw new StudioRepositoryInvariantError("world_publication_endpoint_required", "World publication requires its dedicated authority endpoint");
  }
}

function assertGenericWorkSessionArtifact(id: string): void {
  if (id.startsWith(STUDIO_WORK_SESSION_ARTIFACT_PREFIX)) throw new StudioRepositoryInvariantError("work_session_endpoint_required", "Work sessions require the dedicated authorized endpoint");
}

@Injectable()
export class StudioProjectGraphRepository {
  async createProject(
    actorUserId: string,
    input: CreateStudioProjectGraph,
    idempotencyKey: string,
  ): Promise<StudioProjectCreateResponse> {
    assertGenericWorldArtifact(input.artifact.id);
    assertGenericWorkSessionArtifact(input.artifact.id);
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
      await verifyBlobRefsReady(client, input.initialRevision.blobRefs, input.workId);

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

  async createArtifact(
    actorUserId: string,
    projectId: string,
    input: CreateStudioArtifact,
    idempotencyKey: string,
  ): Promise<StudioProjectCreateResponse> {
    assertGenericWorldArtifact(input.artifact.id);
    assertGenericWorkSessionArtifact(input.artifact.id);
    const client = await dbPool.connect();
    const keyHash = studioIdempotencyKeyHash(idempotencyKey);
    const requestHash = studioRequestHash({ projectId, input });
    try {
      await client.query("BEGIN");
      const accessResult = await loadProjectAccess(
        client,
        actorUserId,
        projectId,
        true,
      );
      if (!accessResult) throw new StudioProjectNotFoundError("project");
      assertAccess(accessResult.access, "edit");
      if (input.artifact.scope.projectId !== projectId) {
        throw new StudioRepositoryInvariantError(
          "scope_project_mismatch",
          "artifact scope does not belong to the target project",
        );
      }

      const receipt = await client.query<{
        requestHash: string;
        response: StudioProjectCreateResponse;
      }>(
        `SELECT "requestHash", response
         FROM studio_mutation_receipt
         WHERE "artifactId" = $1
           AND "actorUserId" = $2
           AND "idempotencyKeyHash" = $3`,
        [input.artifact.id, actorUserId, keyHash],
      );
      if (receipt.rows[0]) {
        if (receipt.rows[0].requestHash !== requestHash) {
          throw new StudioIdempotencyConflictError();
        }
        await client.query("COMMIT");
        return { ...receipt.rows[0].response, replayed: true };
      }

      await verifyBlobRefsReady(client, input.initialRevision.blobRefs, accessResult.row.workId);
      await client.query(
        `INSERT INTO studio_artifact (
           id, "projectId", kind, title, scope, "headRevisionId",
           "ownerWorkspaceId", "createdAt", "updatedAt"
         ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $8)`,
        [
          input.artifact.id,
          projectId,
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
           id, "artifactId", kind, "rootGraphHash", "createdBy",
           "deviceId", "createdAt", message
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
          `INSERT INTO studio_revision_blob (
             "revisionId", "blobHash", role, ordinal
           ) VALUES ($1, $2, $3, $4)`,
          [input.initialRevision.id, blob.sha256, blob.role, blob.ordinal],
        );
      }

      const response: StudioProjectCreateResponse = {
        projectId,
        artifactId: input.artifact.id,
        revisionId: input.initialRevision.id,
        replayed: false,
      };
      await client.query(
        `INSERT INTO studio_mutation_receipt (
           "artifactId", "actorUserId", "idempotencyKeyHash",
           "requestHash", "resultRevisionId", response
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
      await client.query(
        `UPDATE studio_project_graph
         SET "updatedAt" = GREATEST("createdAt", "updatedAt", clock_timestamp())
         WHERE id = $1`,
        [projectId],
      );
      await client.query("COMMIT");
      return response;
    } catch (error) {
      await client.query("ROLLBACK");
      if (
        error instanceof StudioProjectNotFoundError
        || error instanceof StudioProjectForbiddenError
        || error instanceof StudioProjectIdentityConflictError
        || error instanceof StudioIdempotencyConflictError
        || error instanceof StudioBlobNotReadyError
        || error instanceof StudioRepositoryInvariantError
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
        artifacts: artifactResult.rows.filter((artifact) => !artifact.id.startsWith(STUDIO_WORK_SESSION_ARTIFACT_PREFIX)).map((artifact) => ({
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
    assertGenericWorldArtifact(artifactId);
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
      const artifactScope = scopeRefSchema.safeParse(accessResult.row.projectScope);
      if (!artifactScope.success) {
        throw new StudioRepositoryInvariantError(
          "artifact_scope_invalid",
          "stored artifact scope is invalid",
        );
      }
      if (!scopeContains(artifactScope.data, input.command.scope)) {
        throw new StudioRepositoryInvariantError(
          "scope_outside_artifact",
          "command scope must stay inside the artifact scope",
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

      await verifyBlobRefsReady(client, input.blobRefs, accessResult.row.workId);
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
             "updatedAt" = GREATEST("createdAt", "updatedAt", clock_timestamp())
         WHERE id = $1`,
        [artifactId, nextHeadRevisionId, nextApprovedRevisionId],
      );
      await client.query(
        `UPDATE studio_project_graph SET "updatedAt" = GREATEST("createdAt", "updatedAt", clock_timestamp()) WHERE id = $1`,
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
  async restoreRevision(
    actorUserId: string,
    artifactId: string,
    targetRevisionId: string,
    expectedHeadRevisionId: string,
    idempotencyKey: string,
    input: RestoreStudioRevision,
  ): Promise<StudioRevisionCommitResponse> {
    assertGenericWorldArtifact(artifactId);
    const client = await dbPool.connect();
    const keyHash = studioIdempotencyKeyHash(idempotencyKey);
    const requestHash = studioRequestHash({
      artifactId,
      targetRevisionId,
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
         WHERE "artifactId" = $1
           AND "actorUserId" = $2
           AND "idempotencyKeyHash" = $3`,
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
      if (targetRevisionId === expectedHeadRevisionId) {
        throw new StudioRepositoryInvariantError(
          "restore_target_is_head",
          "the selected revision is already the artifact head",
        );
      }

      const targetResult = await client.query<{
        id: string;
        kind: string;
        rootGraphHash: string;
        compatibilityReportId: string | null;
        provenanceManifestId: string | null;
      }>(
        `SELECT id, kind, "rootGraphHash", "compatibilityReportId",
                "provenanceManifestId"
         FROM studio_revision
         WHERE id = $1 AND "artifactId" = $2`,
        [targetRevisionId, artifactId],
      );
      const target = targetResult.rows[0];
      if (!target) throw new StudioProjectNotFoundError("revision");
      if (target.kind === "release") {
        throw new StudioRepositoryInvariantError(
          "release_restore_requires_source_revision",
          "release revisions are immutable delivery records; restore their source revision instead",
        );
      }

      const sequenceResult = await client.query<{ next: string | number }>(
        `SELECT COALESCE(MAX(sequence), 0) + 1 AS next
         FROM studio_operation WHERE "artifactId" = $1`,
        [artifactId],
      );
      const sequence = Number(sequenceResult.rows[0]?.next ?? 1);
      await client.query(
        `INSERT INTO studio_revision (
           id, "artifactId", kind, "rootGraphHash", "operationFirst", "operationLast",
           "createdBy", "deviceId", "createdAt", message,
           "compatibilityReportId", "provenanceManifestId"
         ) VALUES ($1, $2, 'checkpoint', $3, $4, $4, $5, $6, $7, $8, $9, $10)`,
        [
          input.revisionId,
          artifactId,
          target.rootGraphHash,
          sequence,
          actorUserId,
          input.deviceId,
          input.createdAt,
          input.message ?? `Restore ${targetRevisionId}`,
          target.compatibilityReportId,
          target.provenanceManifestId,
        ],
      );
      await client.query(
        `INSERT INTO studio_revision_parent (
           "revisionId", "parentRevisionId", ordinal
         ) VALUES ($1, $2, 0)`,
        [input.revisionId, targetRevisionId],
      );
      await client.query(
        `INSERT INTO studio_revision_blob (
           "revisionId", "blobHash", role, ordinal
         )
         SELECT $1, "blobHash", role, ordinal
         FROM studio_revision_blob
         WHERE "revisionId" = $2`,
        [input.revisionId, targetRevisionId],
      );

      const payload = { targetRevisionId };
      const operationRecord = {
        commandId: input.commandId,
        type: "revision.restore",
        idempotencyKeyHash: keyHash,
        deterministicSeed: 0,
        payload,
        patches: [],
        inversePatches: [],
        invalidations: ["document", "viewport", "thumbnail", "export"],
      };
      await client.query(
        `INSERT INTO studio_operation (
           "artifactId", sequence, "commandId", "baseRevisionId", "resultRevisionId",
           "actorUserId", "deviceId", "commandType", scope, "payloadHash",
           operation, "issuedAt"
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'revision.restore', $8::jsonb,
                   $9, $10::jsonb, $11)`,
        [
          artifactId,
          sequence,
          input.commandId,
          expectedHeadRevisionId,
          input.revisionId,
          actorUserId,
          input.deviceId,
          JSON.stringify(accessResult.row.projectScope),
          sha256(canonicalJson(payload)),
          JSON.stringify(operationRecord),
          input.createdAt,
        ],
      );
      await client.query(
        `UPDATE studio_artifact
         SET "headRevisionId" = $2,
             "updatedAt" = GREATEST("createdAt", "updatedAt", clock_timestamp())
         WHERE id = $1`,
        [artifactId, input.revisionId],
      );
      await client.query(
        `UPDATE studio_project_graph SET "updatedAt" = GREATEST("createdAt", "updatedAt", clock_timestamp()) WHERE id = $1`,
        [accessResult.row.projectId],
      );

      const response: StudioRevisionCommitResponse = {
        artifactId,
        revisionId: input.revisionId,
        headRevisionId: input.revisionId,
        approvedRevisionId: accessResult.row.approvedRevisionId,
        sequence,
        replayed: false,
      };
      await client.query(
        `INSERT INTO studio_mutation_receipt (
           "artifactId", "actorUserId", "idempotencyKeyHash", "requestHash",
           "resultRevisionId", response
         ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [
          artifactId,
          actorUserId,
          keyHash,
          requestHash,
          input.revisionId,
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
        || error instanceof StudioRevisionConflictError
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

  async listReviews(
    actorUserId: string,
    artifactId: string,
  ): Promise<readonly StudioReviewSummaryRecord[]> {
    const client = await dbPool.connect();
    try {
      const accessResult = await loadArtifactAccess(
        client,
        actorUserId,
        artifactId,
      );
      if (!accessResult) throw new StudioProjectNotFoundError("artifact");
      assertAccess(accessResult.access, "view");
      const result = await client.query<StudioReviewSummaryRow>(
        `SELECT
           review.id,
           review."artifactId" AS "artifactId",
           review."revisionId" AS "revisionId",
           review."requestedBy" AS "requestedBy",
           review.title,
           review.status,
           review."decidedAt" AS "decidedAt",
           review."decidedBy" AS "decidedBy",
           review."createdAt" AS "createdAt",
           review."updatedAt" AS "updatedAt",
           COALESCE(
             array_agg(DISTINCT reviewer."reviewerUserId")
               FILTER (WHERE reviewer."reviewerUserId" IS NOT NULL),
             ARRAY[]::text[]
           ) AS "reviewerIds",
           COUNT(DISTINCT comment.id) FILTER (
             WHERE comment.severity = 'required'
               AND comment.status IN ('open', 'reopened')
           )::integer AS "openRequiredCommentCount"
         FROM studio_review review
         LEFT JOIN studio_review_reviewer reviewer
           ON reviewer."reviewId" = review.id
         LEFT JOIN studio_review_comment comment
           ON comment."reviewId" = review.id
         WHERE review."artifactId" = $1
         GROUP BY review.id
         ORDER BY review."createdAt" DESC, review.id`,
        [artifactId],
      );
      return Object.freeze(result.rows.map(mapStudioReviewSummary));
    } finally {
      client.release();
    }
  }

  async getReview(
    actorUserId: string,
    reviewId: string,
  ): Promise<StudioReviewRecord> {
    const client = await dbPool.connect();
    try {
      const summaryResult = await client.query<StudioReviewSummaryRow>(
        `SELECT
           review.id,
           review."artifactId" AS "artifactId",
           review."revisionId" AS "revisionId",
           review."requestedBy" AS "requestedBy",
           review.title,
           review.status,
           review."decidedAt" AS "decidedAt",
           review."decidedBy" AS "decidedBy",
           review."createdAt" AS "createdAt",
           review."updatedAt" AS "updatedAt",
           COALESCE(
             array_agg(DISTINCT reviewer."reviewerUserId")
               FILTER (WHERE reviewer."reviewerUserId" IS NOT NULL),
             ARRAY[]::text[]
           ) AS "reviewerIds",
           COUNT(DISTINCT comment.id) FILTER (
             WHERE comment.severity = 'required'
               AND comment.status IN ('open', 'reopened')
           )::integer AS "openRequiredCommentCount"
         FROM studio_review review
         LEFT JOIN studio_review_reviewer reviewer
           ON reviewer."reviewId" = review.id
         LEFT JOIN studio_review_comment comment
           ON comment."reviewId" = review.id
         WHERE review.id = $1
         GROUP BY review.id`,
        [reviewId],
      );
      const summaryRow = summaryResult.rows[0];
      if (!summaryRow) throw new StudioProjectNotFoundError("review");
      const accessResult = await loadArtifactAccess(
        client,
        actorUserId,
        summaryRow.artifactId,
      );
      if (!accessResult) throw new StudioProjectNotFoundError("artifact");
      assertAccess(accessResult.access, "view");
      const comments = await client.query<StudioReviewCommentRow>(
        `SELECT
           comment.id,
           comment."reviewId" AS "reviewId",
           comment."authorUserId" AS "authorUserId",
           comment.anchor,
           comment.body,
           comment.severity,
           comment.status,
           comment."dueAt" AS "dueAt",
           comment."resolutionRevisionId" AS "resolutionRevisionId",
           comment."resolvedBy" AS "resolvedBy",
           comment."createdAt" AS "createdAt",
           comment."updatedAt" AS "updatedAt",
           COALESCE(
             array_agg(DISTINCT assignee."assigneeUserId")
               FILTER (WHERE assignee."assigneeUserId" IS NOT NULL),
             ARRAY[]::text[]
           ) AS "assigneeIds"
         FROM studio_review_comment comment
         LEFT JOIN studio_review_comment_assignee assignee
           ON assignee."commentId" = comment.id
         WHERE comment."reviewId" = $1
         GROUP BY comment.id
         ORDER BY comment."createdAt", comment.id`,
        [reviewId],
      );
      return Object.freeze({
        ...mapStudioReviewSummary(summaryRow),
        comments: Object.freeze(comments.rows.map(mapStudioReviewComment)),
      });
    } finally {
      client.release();
    }
  }

  /** Reads only preview refs of the exact immutable review revision under current work access. */
  async getReviewPreviewSource(
    actorUserId: string,
    subject: StudioReviewPreviewSubject,
    cursor: string | null,
  ): Promise<StudioReviewPreviewSource> {
    const client = await dbPool.connect();
    try {
      const accessResult = await loadArtifactAccess(client, actorUserId, subject.artifactId);
      if (!accessResult) throw new StudioProjectNotFoundError("artifact");
      assertAccess(accessResult.access, "view");
      const binding = await client.query<{
        projectId: string; workId: string; artifactId: string; revisionId: string;
        rootGraphHash: string; kind: string; status: string; captureOperation?: unknown; captureReceipt?: unknown;
      }>(
        `SELECT artifact."projectId" AS "projectId", project."workId" AS "workId",
                review."artifactId" AS "artifactId", review."revisionId" AS "revisionId",
                revision."rootGraphHash" AS "rootGraphHash", revision.kind, review.status,
                capture.operation AS "captureOperation", captured.receipt AS "captureReceipt"
         FROM studio_review review
         JOIN studio_revision revision ON revision.id = review."revisionId"
           AND revision."artifactId" = review."artifactId"
         JOIN studio_artifact artifact ON artifact.id = review."artifactId"
         JOIN studio_project_graph project ON project.id = artifact."projectId"
         LEFT JOIN studio_operation capture ON capture."artifactId" = revision."artifactId"
           AND capture."resultRevisionId" = revision.id AND capture.sequence = revision."operationLast"
           AND revision."operationFirst" = revision."operationLast" AND capture."commandType" = 'review.snapshot-create'
         LEFT JOIN LATERAL (SELECT jsonb_build_object('actorUserId', receipt."actorUserId", 'idempotencyKeyHash', receipt."idempotencyKeyHash", 'response', receipt.response) AS receipt
           FROM studio_mutation_receipt receipt WHERE receipt."artifactId"=revision."artifactId" AND receipt."resultRevisionId"=revision.id
             AND receipt.response->>'status'='completed' AND receipt.response->'subject'->>'reviewId'=review.id LIMIT 1) captured ON true
         WHERE review.id = $1 AND review."artifactId" = $2`,
        [subject.reviewId, subject.artifactId],
      );
      const row = binding.rows[0];
      if (!row) throw new StudioProjectNotFoundError("review");
      if (row.projectId !== subject.projectId || row.workId !== subject.workId
        || row.artifactId !== subject.artifactId || row.revisionId !== subject.revisionId
        || row.rootGraphHash !== subject.rootGraphHash || row.kind !== "review-snapshot") {
        throw new StudioRepositoryInvariantError("review_preview_version_mismatch", "Pinned review identity changed");
      }
      // Decisions close invitation/approval actions, not access to this immutable historical
      // snapshot. Current work ACL above remains the visibility authority for every status.
      const [afterOrdinal, afterHash] = cursor?.split(".") ?? ["-1", ""];
      const blobs = await client.query<StudioReviewPreviewBlobRow>(
        `SELECT blob.hash, ref.ordinal, blob.size, blob."mediaType" AS "mediaType",
                blob."objectKey" AS "objectKey", blob."encryptionMetadata" AS "encryptionMetadata",
                blob."malwareStatus" AS "malwareStatus", blob."formatStatus" AS "formatStatus",
                owned.identity AS "workStorageObject"
         FROM studio_revision_blob ref
         JOIN studio_blob blob ON blob.hash = ref."blobHash"
         LEFT JOIN LATERAL (
           SELECT jsonb_build_object(
             'contractVersion', object."contractVersion", 'providerId', object."providerId",
             'purpose', object.purpose, 'digest', object.digest, 'objectPath', object."objectPath",
             'byteLength', object."byteLength", 'contentType', object."contentType"
           ) AS identity
           FROM creator_work_asset_storage_reference ownership
           JOIN creator_asset_storage_object object ON object.purpose = ownership.purpose
             AND object.digest = ownership."objectDigest"
           WHERE ownership."workId" = $5 AND ownership.purpose = 'derived'
             AND ownership."objectDigest" = 'sha256:' || blob.hash
             AND ownership.state = 'active' AND object.state = 'active'
           LIMIT 1
         ) owned ON true
         WHERE ref."revisionId" = $1 AND ref.role = 'preview'
           AND (ref.ordinal, blob.hash) > ($2::integer, $3::text)
         ORDER BY ref.ordinal, blob.hash LIMIT $4`,
        [subject.revisionId, Number(afterOrdinal), afterHash, STUDIO_REVIEW_PREVIEW_PAGE_SIZE + 1, subject.workId],
      );
      const page = blobs.rows.slice(0, STUDIO_REVIEW_PREVIEW_PAGE_SIZE);
      const last = page[page.length - 1];
      return { subject: { ...subject }, blobs: page,
        pageMappings: studioReviewMappingsFromOperation(row.captureOperation, subject, page, row.captureReceipt),
        nextCursor: blobs.rows.length > STUDIO_REVIEW_PREVIEW_PAGE_SIZE && last ? `${last.ordinal}.${last.hash}` : null };
    } finally { client.release(); }
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

      const reviewerAccess = await client.query<{ id: string }>(
        `SELECT candidate.id
         FROM unnest($1::text[]) AS candidate(id)
         WHERE candidate.id = $2
            OR EXISTS (
              SELECT 1
              FROM creator_work_collaborator membership
              WHERE membership."workId" = $3
                AND membership."userId" = candidate.id
                AND membership.status = 'active'
            )`,
        [
          input.reviewerIds,
          accessResult.row.ownerUserId,
          accessResult.row.workId,
        ],
      );
      if (reviewerAccess.rows.length !== input.reviewerIds.length) {
        throw new StudioRepositoryInvariantError(
          "reviewer_access_missing",
          "every reviewer must have active access to the project",
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
    const anchor = reviewAnchorSchema.parse(input.anchor);
    const client = await dbPool.connect();
    try {
      await client.query("BEGIN");
      const reviewResult = await client.query<{
        artifactId: string;
        revisionId: string;
        status: StudioReviewSummaryRecord["status"];
      }>(
        `SELECT "artifactId", "revisionId", status
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
      const artifactScope = scopeRefSchema.safeParse(accessResult.row.projectScope);
      if (!artifactScope.success || !scopeContains(artifactScope.data, anchor.scope)
        || (anchor.source && canonicalJson(artifactScope.data) !== canonicalJson(anchor.scope))) {
        throw new StudioRepositoryInvariantError(
          "review_anchor_scope_mismatch",
          "comment scope must stay inside the reviewed artifact scope; authoring coordinates do not create graph scope identities",
        );
      }
      const existing = await client.query<{
        reviewId: string;
        body: string;
        severity: CreateStudioReviewComment["severity"];
        dueAtMatches: boolean;
        assigneeIds: string[];
        anchor: Record<string, unknown>;
        createdAt: Date;
      }>(
        `SELECT comment."reviewId", comment.body, comment.severity, comment.anchor, comment."createdAt",
           (comment."dueAt" IS NOT DISTINCT FROM $2::timestamptz) AS "dueAtMatches",
           ARRAY(SELECT assignee."assigneeUserId" FROM studio_review_comment_assignee assignee
             WHERE assignee."commentId" = comment.id ORDER BY assignee."assigneeUserId") AS "assigneeIds"
         FROM studio_review_comment comment WHERE comment.id = $1`,
        [input.id, input.dueAt ?? null],
      );
      const current = existing.rows[0];
      if (current) {
        if (
          current.reviewId !== reviewId
          || current.body !== input.body
          || current.severity !== input.severity
          || !current.dueAtMatches
          || canonicalJson([...current.assigneeIds].sort()) !== canonicalJson([...input.assigneeIds].sort())
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
      if (!["open", "changes-requested"].includes(review.status)) {
        throw new StudioRepositoryInvariantError(
          "review_already_decided",
          "new comments cannot change a terminal review",
        );
      }
      if (anchor.source) {
        const source = await client.query<{ rootGraphHash: string; operation: unknown; hash: string; captureReceipt: unknown }>(
          `SELECT revision."rootGraphHash", capture.operation, ref."blobHash" AS hash,
             jsonb_build_object('actorUserId', receipt."actorUserId", 'idempotencyKeyHash', receipt."idempotencyKeyHash", 'response', receipt.response) AS "captureReceipt"
           FROM studio_revision revision
           JOIN studio_operation capture ON capture."artifactId" = revision."artifactId"
             AND capture."resultRevisionId" = revision.id AND capture.sequence = revision."operationLast"
             AND revision."operationFirst" = revision."operationLast" AND capture."commandType" = 'review.snapshot-create'
           JOIN studio_revision_blob ref ON ref."revisionId" = revision.id AND ref.role = 'preview' AND ref.ordinal = $3
           JOIN studio_mutation_receipt receipt ON receipt."artifactId"=revision."artifactId" AND receipt."resultRevisionId"=revision.id
             AND receipt.response->>'status'='completed' AND receipt.response->'subject'->>'reviewId'=$4
           WHERE revision.id = $1 AND revision."artifactId" = $2 AND revision.kind = 'review-snapshot'`,
          [review.revisionId, review.artifactId, anchor.source.pageOrdinal, reviewId]);
        const row = source.rows.length === 1 ? source.rows[0] : undefined;
        const mapping = row ? studioReviewMappingFromOperation(row.operation, {
          workId: accessResult.row.workId, projectId: accessResult.row.projectId,
          artifactId: review.artifactId, rootGraphHash: row.rootGraphHash,
          reviewId, revisionId: review.revisionId,
        }, anchor.source.pageOrdinal, row.hash, row.captureReceipt) : { status: "unmapped" as const, reason: "source-unavailable" as const };
        if (!validateStudioReviewSpatialAnchor(mapping, anchor)) throw new StudioRepositoryInvariantError(
          "review_source_anchor_mismatch", "comment source coordinates must match the immutable saved review page");
      }
      if (input.assigneeIds.length > 0) {
        const assigneeAccess = await client.query<{ id: string }>(
          `SELECT candidate.id
           FROM unnest($1::text[]) AS candidate(id)
           WHERE candidate.id = $2
              OR EXISTS (
                SELECT 1
                FROM creator_work_collaborator membership
                WHERE membership."workId" = $3
                  AND membership."userId" = candidate.id
                  AND membership.status = 'active'
                  AND membership.role IN ('admin', 'editor')
              )`,
          [
            input.assigneeIds,
            accessResult.row.ownerUserId,
            accessResult.row.workId,
          ],
        );
        if (assigneeAccess.rows.length !== input.assigneeIds.length) {
          throw new StudioRepositoryInvariantError(
            "assignee_edit_access_missing",
            "every assignee must have edit access to the project",
          );
        }
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

  async decideReview(
    actorUserId: string,
    reviewId: string,
    input: DecideStudioReview,
  ) {
    const client = await dbPool.connect();
    try {
      await client.query("BEGIN");
      const reviewResult = await client.query<{
        id: string;
        artifactId: string;
        requestedBy: string | null;
        status: StudioReviewSummaryRecord["status"];
        decidedAt: Date | null;
        decidedBy: string | null;
        updatedAt: Date;
      }>(
        `SELECT id, "artifactId", "requestedBy", status,
                "decidedAt", "decidedBy", "updatedAt"
         FROM studio_review
         WHERE id = $1
         FOR UPDATE`,
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
      assertAccess(accessResult.access, "view");
      const reviewer = await client.query<{ allowed: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM studio_review_reviewer
           WHERE "reviewId" = $1 AND "reviewerUserId" = $2
         ) AS allowed`,
        [reviewId, actorUserId],
      );
      const canManage = accessResult.access.manageMembers;
      const canCancel = canManage || review.requestedBy === actorUserId;
      const canDecide = canManage || reviewer.rows[0]?.allowed === true;
      if (input.status === "cancelled" ? !canCancel : !canDecide) {
        throw new StudioProjectForbiddenError("manage");
      }

      if (["approved", "rejected", "cancelled"].includes(review.status)) {
        if (review.status !== input.status) {
          throw new StudioRepositoryInvariantError(
            "review_already_decided",
            "a terminal review decision cannot be replaced",
          );
        }
        await client.query("COMMIT");
        return {
          id: review.id,
          status: review.status,
          decidedAt: review.decidedAt ? toIso(review.decidedAt) : null,
          decidedBy: review.decidedBy,
          updatedAt: toIso(review.updatedAt),
        };
      }
      if (input.status === "approved") {
        const blocking = await client.query<{ count: number | string }>(
          `SELECT COUNT(*)::integer AS count
           FROM studio_review_comment
           WHERE "reviewId" = $1
             AND severity = 'required'
             AND status IN ('open', 'reopened')`,
          [reviewId],
        );
        if (Number(blocking.rows[0]?.count ?? 0) > 0) {
          throw new StudioRepositoryInvariantError(
            "required_review_comments_open",
            "required review comments must be resolved before approval",
          );
        }
      }

      const terminal = input.status !== "changes-requested";
      const updated = await client.query<{
        status: StudioReviewSummaryRecord["status"];
        decidedAt: Date | null;
        decidedBy: string | null;
        updatedAt: Date;
      }>(
        `UPDATE studio_review
         SET status = $2,
             "decidedAt" = CASE WHEN $3 THEN GREATEST("createdAt", "updatedAt", clock_timestamp()) ELSE NULL END,
             "decidedBy" = CASE WHEN $3 THEN $4 ELSE NULL END,
             "updatedAt" = GREATEST("createdAt", "updatedAt", clock_timestamp())
         WHERE id = $1
         RETURNING status, "decidedAt", "decidedBy", "updatedAt"`,
        [reviewId, input.status, terminal, actorUserId],
      );
      const value = updated.rows[0]!;
      await client.query("COMMIT");
      return {
        id: reviewId,
        status: value.status,
        decidedAt: value.decidedAt ? toIso(value.decidedAt) : null,
        decidedBy: value.decidedBy,
        updatedAt: toIso(value.updatedAt),
      };
    } catch (error) {
      await client.query("ROLLBACK");
      if (
        error instanceof StudioProjectNotFoundError
        || error instanceof StudioProjectForbiddenError
        || error instanceof StudioRepositoryInvariantError
      ) {
        throw error;
      }
      mapPostgresError(error);
    } finally {
      client.release();
    }
  }

  async resolveReviewComment(
    actorUserId: string,
    commentId: string,
    input: ResolveStudioReviewComment,
  ) {
    const client = await dbPool.connect();
    try {
      await client.query("BEGIN");
      // Every comment mutation takes the review lock first, matching decisions and creation.
      // Otherwise reopening a required note can race approval and alter decided history.
      const reviewResult = await client.query<{ status: StudioReviewSummaryRecord["status"] }>(
        `SELECT review.status FROM studio_review review
         JOIN studio_review_comment comment ON comment."reviewId" = review.id
         WHERE comment.id = $1 FOR UPDATE OF review`,
        [commentId],
      );
      const review = reviewResult.rows[0];
      if (!review) throw new StudioProjectNotFoundError("comment");
      const commentResult = await client.query<{
        id: string;
        artifactId: string;
        reviewId: string;
        status: StudioReviewCommentRecord["status"];
        resolutionRevisionId: string | null;
        resolvedBy: string | null;
        updatedAt: Date;
      }>(
        `SELECT comment.id,
                review."artifactId" AS "artifactId",
                review.id AS "reviewId",
                comment.status,
                comment."resolutionRevisionId" AS "resolutionRevisionId",
                comment."resolvedBy" AS "resolvedBy",
                comment."updatedAt" AS "updatedAt"
         FROM studio_review_comment comment
         JOIN studio_review review ON review.id = comment."reviewId"
         WHERE comment.id = $1
         FOR UPDATE OF comment`,
        [commentId],
      );
      const comment = commentResult.rows[0];
      if (!comment) throw new StudioProjectNotFoundError("comment");
      const accessResult = await loadArtifactAccess(
        client,
        actorUserId,
        comment.artifactId,
      );
      if (!accessResult) throw new StudioProjectNotFoundError("artifact");
      assertAccess(accessResult.access, "edit");
      if (input.resolutionSourceRef) {
        const reference = input.resolutionSourceRef;
        const captures = await loadStudioReviewResolutionCaptures(client, comment.artifactId, [comment.reviewId, reference.reviewId]);
        const original = captures.find((capture) => capture?.subject.reviewId === comment.reviewId);
        const replacement = captures.find((capture) => capture?.subject.reviewId === reference.reviewId);
        // This proof is checked even for a no-op retry: a matching old resolution
        // cannot turn an invented capture pin into a successful verified response.
        if (captures.length !== 2 || !original || !replacement
          || canonicalJson(replacement.subject) !== canonicalJson(reference)
          || original.subject.workId !== accessResult.row.workId || original.subject.projectId !== accessResult.row.projectId
          || replacement.subject.workId !== original.subject.workId || replacement.subject.projectId !== original.subject.projectId
          || replacement.subject.revisionId === original.subject.revisionId
          || replacement.submissionId !== input.resolutionRevisionId
          || replacement.sourceServerRevision <= original.sourceServerRevision || replacement.sequence <= original.sequence) {
          throw new StudioRepositoryInvariantError("review_resolution_source_mismatch",
            "resolution source must be a server-attested subsequent saved capture and its exact submission parent");
        }
      }
      if (
        ["resolved", "dismissed"].includes(comment.status)
        && comment.status === input.status
        && comment.resolutionRevisionId === input.resolutionRevisionId
      ) {
        await client.query("COMMIT");
        return {
          id: comment.id,
          status: comment.status,
          resolutionRevisionId: comment.resolutionRevisionId,
          resolvedBy: comment.resolvedBy,
          updatedAt: toIso(comment.updatedAt),
        };
      }
      if (!["open", "changes-requested"].includes(review.status)) {
        throw new StudioRepositoryInvariantError(
          "review_already_decided",
          "comment resolutions cannot change a terminal review",
        );
      }
      if (["resolved", "dismissed"].includes(comment.status)) {
        throw new StudioRepositoryInvariantError(
          "review_comment_already_resolved",
          "reopen a resolved comment before changing its resolution",
        );
      }
      const resolution = await client.query<{ kind: string }>(
        `SELECT kind FROM studio_revision
         WHERE id = $1 AND "artifactId" = $2`,
        [input.resolutionRevisionId, comment.artifactId],
      );
      const resolutionKind = resolution.rows[0]?.kind;
      if (!resolutionKind) throw new StudioProjectNotFoundError("revision");
      if (!["autosave", "checkpoint", "submission", "approved"].includes(resolutionKind)) {
        throw new StudioRepositoryInvariantError(
          "review_resolution_revision_kind",
          "a comment resolution must point to an editable or approved revision",
        );
      }
      const updated = await client.query<{
        status: StudioReviewCommentRecord["status"];
        resolutionRevisionId: string;
        resolvedBy: string;
        updatedAt: Date;
      }>(
        `UPDATE studio_review_comment
         SET status = $2,
             "resolutionRevisionId" = $3,
             "resolvedBy" = $4,
             "updatedAt" = GREATEST("createdAt", "updatedAt", clock_timestamp())
         WHERE id = $1
         RETURNING status,
                   "resolutionRevisionId" AS "resolutionRevisionId",
                   "resolvedBy" AS "resolvedBy",
                   "updatedAt" AS "updatedAt"`,
        [commentId, input.status, input.resolutionRevisionId, actorUserId],
      );
      const value = updated.rows[0]!;
      await client.query("COMMIT");
      return {
        id: commentId,
        status: value.status,
        resolutionRevisionId: value.resolutionRevisionId,
        resolvedBy: value.resolvedBy,
        updatedAt: toIso(value.updatedAt),
      };
    } catch (error) {
      await client.query("ROLLBACK");
      if (
        error instanceof StudioProjectNotFoundError
        || error instanceof StudioProjectForbiddenError
        || error instanceof StudioRepositoryInvariantError
      ) {
        throw error;
      }
      mapPostgresError(error);
    } finally {
      client.release();
    }
  }

  async reopenReviewComment(
    actorUserId: string,
    commentId: string,
  ) {
    const client = await dbPool.connect();
    try {
      await client.query("BEGIN");
      const reviewResult = await client.query<{ status: StudioReviewSummaryRecord["status"] }>(
        `SELECT review.status FROM studio_review review
         JOIN studio_review_comment comment ON comment."reviewId" = review.id
         WHERE comment.id = $1 FOR UPDATE OF review`,
        [commentId],
      );
      const review = reviewResult.rows[0];
      if (!review) throw new StudioProjectNotFoundError("comment");
      const commentResult = await client.query<{
        id: string;
        artifactId: string;
        status: StudioReviewCommentRecord["status"];
        updatedAt: Date;
      }>(
        `SELECT comment.id,
                review."artifactId" AS "artifactId",
                comment.status,
                comment."updatedAt" AS "updatedAt"
         FROM studio_review_comment comment
         JOIN studio_review review ON review.id = comment."reviewId"
         WHERE comment.id = $1
         FOR UPDATE OF comment`,
        [commentId],
      );
      const comment = commentResult.rows[0];
      if (!comment) throw new StudioProjectNotFoundError("comment");
      const accessResult = await loadArtifactAccess(
        client,
        actorUserId,
        comment.artifactId,
      );
      if (!accessResult) throw new StudioProjectNotFoundError("artifact");
      assertAccess(accessResult.access, "edit");
      if (["open", "reopened"].includes(comment.status)) {
        await client.query("COMMIT");
        return {
          id: comment.id,
          status: comment.status,
          resolutionRevisionId: null,
          resolvedBy: null,
          updatedAt: toIso(comment.updatedAt),
        };
      }
      if (!["open", "changes-requested"].includes(review.status)) {
        throw new StudioRepositoryInvariantError(
          "review_already_decided",
          "reopening comments cannot change a terminal review",
        );
      }
      const updated = await client.query<{ updatedAt: Date }>(
        `UPDATE studio_review_comment
         SET status = 'reopened',
             "resolutionRevisionId" = NULL,
             "resolvedBy" = NULL,
             "updatedAt" = GREATEST("createdAt", "updatedAt", clock_timestamp())
         WHERE id = $1
         RETURNING "updatedAt"`,
        [commentId],
      );
      await client.query("COMMIT");
      return {
        id: commentId,
        status: "reopened" as const,
        resolutionRevisionId: null,
        resolvedBy: null,
        updatedAt: toIso(updated.rows[0]!.updatedAt),
      };
    } catch (error) {
      await client.query("ROLLBACK");
      if (
        error instanceof StudioProjectNotFoundError
        || error instanceof StudioProjectForbiddenError
        || error instanceof StudioRepositoryInvariantError
      ) {
        throw error;
      }
      mapPostgresError(error);
    } finally {
      client.release();
    }
  }

  async listCompatibilityReports(
    actorUserId: string,
    projectId: string,
  ): Promise<readonly CompatibilityReport[]> {
    const client = await dbPool.connect();
    try {
      const accessResult = await loadProjectAccess(client, actorUserId, projectId);
      if (!accessResult) throw new StudioProjectNotFoundError("project");
      assertAccess(accessResult.access, "view");
      const result = await client.query<{
        id: string;
        artifactId: string | null;
        sourceFormat: CompatibilityReport["source"]["sourceFormat"];
        sourceFileName: string;
        sourceHash: string;
        sourceSize: string | number;
        sourceMediaType: string;
        grade: CompatibilityReport["grade"];
        summary: CompatibilityReport["summary"];
        items: CompatibilityReport["items"];
        requiresApproval: boolean;
        approvedBy: string | null;
        approvedAt: Date | null;
        createdAt: Date;
      }>(
        `SELECT report.id,
                report."artifactId" AS "artifactId",
                report."sourceFormat" AS "sourceFormat",
                report."sourceFileName" AS "sourceFileName",
                report."sourceHash" AS "sourceHash",
                report."sourceSize" AS "sourceSize",
                blob."mediaType" AS "sourceMediaType",
                report.grade,
                report.summary,
                report.items,
                report."requiresApproval" AS "requiresApproval",
                report."approvedBy" AS "approvedBy",
                report."approvedAt" AS "approvedAt",
                report."createdAt" AS "createdAt"
         FROM studio_compatibility_report report
         JOIN studio_blob blob ON blob.hash = report."sourceHash"
         WHERE report."projectId" = $1
         ORDER BY report."createdAt" DESC, report.id`,
        [projectId],
      );
      return Object.freeze(result.rows.map((row) => compatibilityReportSchema.parse({
        id: row.id,
        ...(row.artifactId ? { artifactId: row.artifactId } : {}),
        source: {
          sourceFileName: row.sourceFileName,
          sourceFormat: row.sourceFormat,
          sourceHash: row.sourceHash,
          sourceSize: Number(row.sourceSize),
          sourceBlob: {
            id: `source-${row.sourceHash.slice(0, 32)}`,
            sha256: row.sourceHash,
            size: Number(row.sourceSize),
            mediaType: row.sourceMediaType,
            role: "source",
          },
          immutable: true,
          importedAt: toIso(row.createdAt),
        },
        grade: row.grade,
        summary: row.summary,
        items: row.items,
        requiresApproval: row.requiresApproval,
        ...(row.approvedBy && row.approvedAt
          ? { approvedBy: row.approvedBy, approvedAt: toIso(row.approvedAt) }
          : {}),
        createdAt: toIso(row.createdAt),
      })));
    } finally {
      client.release();
    }
  }

  async createCompatibilityReport(
    actorUserId: string,
    projectId: string,
    input: CreateCompatibilityReport,
  ): Promise<CompatibilityReport> {
    if (input.artifactId) assertGenericWorkSessionArtifact(input.artifactId);
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
