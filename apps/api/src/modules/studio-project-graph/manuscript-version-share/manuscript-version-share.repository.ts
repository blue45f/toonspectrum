import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { PoolClient } from "pg";

import { dbPool } from "../../../platform/database";
import {
  assertAccess,
  loadArtifactAccess,
  StudioProjectForbiddenError,
} from "../studio-project-graph.repository";

/**
 * CT-1: 원고 버전 스냅샷과 버전 공유 링크의 서버 정본 저장소.
 *
 * 스냅샷은 원고 내용 복사본이 아니라 서버 정본 revision에 대한 참조이며,
 * revisionKind·rootGraphHash·message는 클라이언트가 보낸 값을 믿지 않고 서버가
 * studio_revision 행에서 직접 읽어 고정한다(참조 위조 방지).
 * 공유 링크의 원문 토큰은 저장하지 않고 sha256 해시와 표시용 접미사만 보관한다
 * (creator 리뷰 링크·pinned share와 같은 규약). 비밀번호는 scrypt 해시로 저장한다.
 */

export const MAX_MANUSCRIPT_SNAPSHOTS_PER_ARTIFACT = 60;

export type VersionSharePermission = "view" | "comment" | "edit";

export interface ManuscriptSnapshotRecord {
  readonly id: string;
  readonly artifactId: string;
  readonly name: string;
  readonly memo: string;
  readonly revisionId: string;
  readonly rootGraphHash: string;
  readonly revisionKind: string;
  readonly revisionMessage: string | null;
  readonly createdBy: string;
  readonly createdAt: string;
}

export interface ManuscriptVersionShareRecord {
  readonly id: string;
  readonly artifactId: string;
  readonly snapshotId: string;
  readonly snapshotName: string;
  readonly tokenSuffix: string;
  readonly permission: VersionSharePermission;
  readonly watermark: boolean;
  readonly hasPassword: boolean;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly expiresAt: string | null;
  readonly revokedAt: string | null;
}

export interface ResolvedVersionShareRevision {
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
}

export type VersionShareResolution =
  | { readonly kind: "missing" }
  | { readonly kind: "revoked" }
  | { readonly kind: "expired" }
  | { readonly kind: "password_required" }
  | { readonly kind: "password_invalid" }
  | {
      readonly kind: "ok";
      readonly permission: VersionSharePermission;
      readonly watermark: boolean;
      readonly workId: string;
      readonly projectId: string;
      readonly artifactId: string;
      readonly artifactTitle: string;
      readonly workTitle: string;
      readonly snapshot: ManuscriptSnapshotRecord;
      readonly revision: ResolvedVersionShareRevision;
    };

export function hashVersionShareToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function versionShareTokenSuffix(token: string): string {
  return token.slice(-4);
}

const PASSWORD_SCHEME = "scrypt";

export function hashVersionSharePassword(password: string): string {
  const salt = randomBytes(16);
  const digest = scryptSync(password, salt, 32);
  return `${PASSWORD_SCHEME}$${salt.toString("hex")}$${digest.toString("hex")}`;
}

export function verifyVersionSharePassword(password: string, stored: string): boolean {
  const [scheme, saltHex, digestHex] = stored.split("$");
  if (scheme !== PASSWORD_SCHEME || !saltHex || !digestHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(digestHex, "hex");
  if (salt.length !== 16 || expected.length !== 32) return false;
  const actual = scryptSync(password, salt, 32);
  return timingSafeEqual(actual, expected);
}

/** expiresInDays 0·null이면 무만료(null), 양수면 createdAt + 일수. 로컬 모델과 같은 의미. */
export function versionShareExpiresAt(
  createdAt: Date,
  expiresInDays: number | null,
): Date | null {
  if (expiresInDays === null || expiresInDays <= 0) return null;
  return new Date(createdAt.getTime() + expiresInDays * 24 * 60 * 60 * 1000);
}

/** 기존 이름들에서 가장 큰 v{n} 다음 번호를 만든다. 로컬 nextProductionManuscriptSnapshotName과 같은 규칙. */
export function nextManuscriptSnapshotName(
  existingNames: readonly string[],
): string {
  let max = 0;
  for (const name of existingNames) {
    const match = /^v(\d+)$/u.exec(name.trim());
    if (match) max = Math.max(max, Number.parseInt(match[1] ?? "0", 10));
  }
  return `v${max + 1}`;
}

export function isVersionShareExpired(
  share: { readonly expiresAt: string | null },
  now: Date = new Date(),
): boolean {
  return share.expiresAt !== null && new Date(share.expiresAt).getTime() <= now.getTime();
}

interface SnapshotRow {
  id: string;
  artifactId: string;
  name: string;
  memo: string;
  revisionId: string;
  rootGraphHash: string;
  revisionKind: string;
  revisionMessage: string | null;
  createdBy: string;
  createdAt: Date;
}

interface ShareRow {
  id: string;
  artifactId: string;
  snapshotId: string;
  snapshotName: string;
  tokenSuffix: string;
  permission: VersionSharePermission;
  watermark: boolean;
  passwordHash: string | null;
  createdBy: string;
  createdAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
}

const SNAPSHOT_COLUMNS = `id, "artifactId", name, memo, "revisionId", "rootGraphHash",
  "revisionKind", "revisionMessage", "createdBy", "createdAt"`;

function toSnapshotRecord(row: SnapshotRow): ManuscriptSnapshotRecord {
  return {
    id: row.id,
    artifactId: row.artifactId,
    name: row.name,
    memo: row.memo,
    revisionId: row.revisionId,
    rootGraphHash: row.rootGraphHash,
    revisionKind: row.revisionKind,
    revisionMessage: row.revisionMessage,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

function toShareRecord(row: ShareRow): ManuscriptVersionShareRecord {
  return {
    id: row.id,
    artifactId: row.artifactId,
    snapshotId: row.snapshotId,
    snapshotName: row.snapshotName,
    tokenSuffix: row.tokenSuffix,
    permission: row.permission,
    watermark: row.watermark,
    hasPassword: row.passwordHash !== null,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
  };
}

async function transact<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await dbPool.connect();
  try {
    await client.query("BEGIN");
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function requireArtifactAccess(
  client: PoolClient,
  actorUserId: string,
  artifactId: string,
  operation: "view" | "edit",
): Promise<void> {
  const loaded = await loadArtifactAccess(client, actorUserId, artifactId);
  if (!loaded) throw new NotFoundException("아티팩트를 찾을 수 없어요.");
  try {
    assertAccess(loaded.access, operation);
  } catch (error) {
    if (error instanceof StudioProjectForbiddenError) {
      throw new ForbiddenException("이 아티팩트에 대한 권한이 없어요.");
    }
    throw error;
  }
}

export interface CreateManuscriptSnapshotInput {
  readonly id?: string;
  readonly name?: string;
  readonly memo?: string;
  readonly revisionId: string;
  readonly createdAt?: string;
}

export interface CreateManuscriptVersionShareInput {
  readonly id?: string;
  readonly snapshotId: string;
  readonly token: string;
  readonly permission: VersionSharePermission;
  readonly expiresInDays: number | null;
  readonly watermark: boolean;
  readonly password?: string;
}

@Injectable()
export class ManuscriptVersionShareRepository {
  async listSnapshots(
    actorUserId: string,
    artifactId: string,
  ): Promise<readonly ManuscriptSnapshotRecord[]> {
    const client = await dbPool.connect();
    try {
      await requireArtifactAccess(client, actorUserId, artifactId, "view");
      const result = await client.query<SnapshotRow>(
        `SELECT ${SNAPSHOT_COLUMNS} FROM studio_manuscript_snapshot
         WHERE "artifactId" = $1 ORDER BY "createdAt" ASC, id ASC`,
        [artifactId],
      );
      return result.rows.map(toSnapshotRecord);
    } finally {
      client.release();
    }
  }

  async createSnapshot(
    actorUserId: string,
    artifactId: string,
    input: CreateManuscriptSnapshotInput,
  ): Promise<ManuscriptSnapshotRecord> {
    return transact(async (client) => {
      await requireArtifactAccess(client, actorUserId, artifactId, "edit");

      if (input.id) {
        const existing = await client.query<SnapshotRow>(
          `SELECT ${SNAPSHOT_COLUMNS} FROM studio_manuscript_snapshot WHERE id = $1`,
          [input.id],
        );
        const row = existing.rows[0];
        if (row) {
          if (row.artifactId !== artifactId || row.revisionId !== input.revisionId) {
            throw new ConflictException("같은 id의 스냅샷이 다른 내용으로 이미 있어요.");
          }
          return toSnapshotRecord(row);
        }
      }

      const revision = await client.query<{
        id: string;
        kind: string;
        rootGraphHash: string;
        message: string | null;
      }>(
        `SELECT id, kind, "rootGraphHash", message FROM studio_revision
         WHERE id = $1 AND "artifactId" = $2`,
        [input.revisionId, artifactId],
      );
      const revisionRow = revision.rows[0];
      if (!revisionRow) {
        throw new NotFoundException("스냅샷으로 만들 revision을 찾을 수 없어요.");
      }

      const existing = await client.query<{ name: string; total: string }>(
        `SELECT name, count(*) OVER () AS total FROM studio_manuscript_snapshot
         WHERE "artifactId" = $1`,
        [artifactId],
      );
      const total = existing.rows[0] ? Number(existing.rows[0].total) : 0;
      if (total >= MAX_MANUSCRIPT_SNAPSHOTS_PER_ARTIFACT) {
        throw new ConflictException(
          `스냅샷은 아티팩트당 최대 ${MAX_MANUSCRIPT_SNAPSHOTS_PER_ARTIFACT}개까지 만들 수 있어요.`,
        );
      }

      const createdAt = input.createdAt ? new Date(input.createdAt) : new Date();
      const name = input.name?.trim()
        || nextManuscriptSnapshotName(existing.rows.map((row) => row.name));
      const inserted = await client.query<SnapshotRow>(
        `INSERT INTO studio_manuscript_snapshot
           (id, "artifactId", name, memo, "revisionId", "rootGraphHash",
            "revisionKind", "revisionMessage", "createdBy", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING ${SNAPSHOT_COLUMNS}`,
        [
          input.id ?? randomUUID(),
          artifactId,
          name,
          input.memo ?? "",
          revisionRow.id,
          revisionRow.rootGraphHash,
          revisionRow.kind,
          revisionRow.message,
          actorUserId,
          createdAt,
        ],
      );
      const row = inserted.rows[0];
      if (!row) throw new Error("manuscript_snapshot_insert_missing_row");
      return toSnapshotRecord(row);
    });
  }

  async updateSnapshotMemo(
    actorUserId: string,
    artifactId: string,
    snapshotId: string,
    memo: string,
  ): Promise<ManuscriptSnapshotRecord> {
    return transact(async (client) => {
      await requireArtifactAccess(client, actorUserId, artifactId, "edit");
      const updated = await client.query<SnapshotRow>(
        `UPDATE studio_manuscript_snapshot SET memo = $3
         WHERE id = $1 AND "artifactId" = $2
         RETURNING ${SNAPSHOT_COLUMNS}`,
        [snapshotId, artifactId, memo],
      );
      const row = updated.rows[0];
      if (!row) throw new NotFoundException("스냅샷을 찾을 수 없어요.");
      return toSnapshotRecord(row);
    });
  }

  async listShares(
    actorUserId: string,
    artifactId: string,
  ): Promise<readonly ManuscriptVersionShareRecord[]> {
    const client = await dbPool.connect();
    try {
      await requireArtifactAccess(client, actorUserId, artifactId, "view");
      const result = await client.query<ShareRow>(
        `SELECT share.id, share."artifactId", share."snapshotId",
           snapshot.name AS "snapshotName", share."tokenSuffix", share.permission,
           share.watermark, share."passwordHash", share."createdBy",
           share."createdAt", share."expiresAt", share."revokedAt"
         FROM studio_manuscript_version_share share
         JOIN studio_manuscript_snapshot snapshot ON snapshot.id = share."snapshotId"
         WHERE share."artifactId" = $1
         ORDER BY share."createdAt" DESC, share.id DESC`,
        [artifactId],
      );
      return result.rows.map(toShareRecord);
    } finally {
      client.release();
    }
  }

  async createShare(
    actorUserId: string,
    artifactId: string,
    input: CreateManuscriptVersionShareInput,
  ): Promise<ManuscriptVersionShareRecord> {
    return transact(async (client) => {
      await requireArtifactAccess(client, actorUserId, artifactId, "edit");

      const snapshot = await client.query<{ id: string; name: string }>(
        `SELECT id, name FROM studio_manuscript_snapshot
         WHERE id = $1 AND "artifactId" = $2`,
        [input.snapshotId, artifactId],
      );
      const snapshotRow = snapshot.rows[0];
      if (!snapshotRow) throw new NotFoundException("공유할 스냅샷을 찾을 수 없어요.");

      const tokenHash = hashVersionShareToken(input.token);
      const byToken = await client.query<ShareRow>(
        `SELECT share.id, share."artifactId", share."snapshotId",
           snapshot.name AS "snapshotName", share."tokenSuffix", share.permission,
           share.watermark, share."passwordHash", share."createdBy",
           share."createdAt", share."expiresAt", share."revokedAt"
         FROM studio_manuscript_version_share share
         JOIN studio_manuscript_snapshot snapshot ON snapshot.id = share."snapshotId"
         WHERE share."tokenHash" = $1`,
        [tokenHash],
      );
      const tokenRow = byToken.rows[0];
      if (tokenRow) {
        if (tokenRow.artifactId !== artifactId || tokenRow.snapshotId !== input.snapshotId) {
          throw new ConflictException("이 공유 토큰은 이미 다른 버전에 쓰이고 있어요.");
        }
        return toShareRecord(tokenRow);
      }
      if (input.id) {
        const byId = await client.query<{ id: string }>(
          `SELECT id FROM studio_manuscript_version_share WHERE id = $1`,
          [input.id],
        );
        if (byId.rows[0]) {
          throw new ConflictException("같은 id의 공유 링크가 이미 있어요.");
        }
      }

      const createdAt = new Date();
      const inserted = await client.query<ShareRow>(
        `INSERT INTO studio_manuscript_version_share
           (id, "snapshotId", "artifactId", "tokenHash", "tokenSuffix", permission,
            watermark, "passwordHash", "createdBy", "createdAt", "expiresAt", "revokedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NULL)
         RETURNING id, "artifactId", "snapshotId", "tokenSuffix", permission,
           watermark, "passwordHash", "createdBy", "createdAt", "expiresAt", "revokedAt"`,
        [
          input.id ?? randomUUID(),
          input.snapshotId,
          artifactId,
          tokenHash,
          versionShareTokenSuffix(input.token),
          input.permission,
          input.watermark,
          input.password ? hashVersionSharePassword(input.password) : null,
          actorUserId,
          createdAt,
          versionShareExpiresAt(createdAt, input.expiresInDays),
        ],
      );
      const row = inserted.rows[0];
      if (!row) throw new Error("manuscript_version_share_insert_missing_row");
      return { ...toShareRecord(row), snapshotName: snapshotRow.name };
    });
  }

  async revokeShare(
    actorUserId: string,
    artifactId: string,
    linkId: string,
  ): Promise<ManuscriptVersionShareRecord> {
    return transact(async (client) => {
      await requireArtifactAccess(client, actorUserId, artifactId, "edit");
      const updated = await client.query<ShareRow>(
        `UPDATE studio_manuscript_version_share share
         SET "revokedAt" = COALESCE(share."revokedAt", now())
         FROM studio_manuscript_snapshot snapshot
         WHERE snapshot.id = share."snapshotId"
           AND share.id = $1 AND share."artifactId" = $2
         RETURNING share.id, share."artifactId", share."snapshotId",
           snapshot.name AS "snapshotName", share."tokenSuffix", share.permission,
           share.watermark, share."passwordHash", share."createdBy",
           share."createdAt", share."expiresAt", share."revokedAt"`,
        [linkId, artifactId],
      );
      const row = updated.rows[0];
      if (!row) throw new NotFoundException("공유 링크를 찾을 수 없어요.");
      return toShareRecord(row);
    });
  }

  /**
   * 토큰 해석. 아티팩트 멤버십을 요구하지 않는다 — 토큰 자체가 열람 자격이고,
   * 호출 전에 컨트롤러가 로그인을 강제해 신원을 부착한다.
   * 회수·만료·비밀번호는 여기서 서버가 판정한다.
   */
  async resolveShare(
    token: string,
    password?: string,
  ): Promise<VersionShareResolution> {
    const client = await dbPool.connect();
    try {
      const found = await client.query<ShareRow & { snapshotArtifactId: string }>(
        `SELECT share.id, share."artifactId", share."snapshotId",
           snapshot.name AS "snapshotName", share."tokenSuffix", share.permission,
           share.watermark, share."passwordHash", share."createdBy",
           share."createdAt", share."expiresAt", share."revokedAt",
           snapshot."artifactId" AS "snapshotArtifactId"
         FROM studio_manuscript_version_share share
         JOIN studio_manuscript_snapshot snapshot ON snapshot.id = share."snapshotId"
         WHERE share."tokenHash" = $1`,
        [hashVersionShareToken(token)],
      );
      const share = found.rows[0];
      if (!share) return { kind: "missing" };
      if (share.revokedAt) return { kind: "revoked" };
      if (share.expiresAt && share.expiresAt.getTime() <= Date.now()) {
        return { kind: "expired" };
      }
      if (share.passwordHash) {
        if (!password) return { kind: "password_required" };
        if (!verifyVersionSharePassword(password, share.passwordHash)) {
          return { kind: "password_invalid" };
        }
      }

      const scope = await client.query<{
        projectId: string;
        workId: string;
        artifactTitle: string;
        workTitle: string;
      }>(
        `SELECT project.id AS "projectId", project."workId" AS "workId",
           artifact.title AS "artifactTitle", work.title AS "workTitle"
         FROM studio_artifact artifact
         JOIN studio_project_graph project ON project.id = artifact."projectId"
         JOIN creator_work work ON work.id = project."workId"
         WHERE artifact.id = $1`,
        [share.artifactId],
      );
      const snapshotResult = await client.query<SnapshotRow>(
        `SELECT ${SNAPSHOT_COLUMNS} FROM studio_manuscript_snapshot WHERE id = $1`,
        [share.snapshotId],
      );
      const revisionResult = await client.query<{
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
           revision.message
         FROM studio_revision revision
         WHERE revision.id = $1`,
        [snapshotResult.rows[0]?.revisionId ?? ""],
      );
      const scopeRow = scope.rows[0];
      const snapshotRow = snapshotResult.rows[0];
      const revisionRow = revisionResult.rows[0];
      if (!scopeRow || !snapshotRow || !revisionRow) return { kind: "missing" };
      return {
        kind: "ok",
        permission: share.permission,
        watermark: share.watermark,
        workId: scopeRow.workId,
        projectId: scopeRow.projectId,
        artifactId: share.artifactId,
        artifactTitle: scopeRow.artifactTitle,
        workTitle: scopeRow.workTitle,
        snapshot: toSnapshotRecord(snapshotRow),
        revision: {
          id: revisionRow.id,
          artifactId: revisionRow.artifactId,
          kind: revisionRow.kind,
          parentIds: revisionRow.parentIds,
          rootGraphHash: revisionRow.rootGraphHash,
          operationFirst: revisionRow.operationFirst === null
            ? null
            : Number(revisionRow.operationFirst),
          operationLast: revisionRow.operationLast === null
            ? null
            : Number(revisionRow.operationLast),
          createdBy: revisionRow.createdBy,
          deviceId: revisionRow.deviceId,
          createdAt: revisionRow.createdAt.toISOString(),
          message: revisionRow.message,
        },
      };
    } finally {
      client.release();
    }
  }
}
