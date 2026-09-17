import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { PoolClient } from "pg";

import { dbPool } from "../db";

export const ACCOUNT_MERGE_TOKEN_TTL_MS = 10 * 60_000;
const ACCOUNT_MERGE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const MERGEABLE_ROLE = "user";

const AUDIT_REFERENCE_COLUMNS = new Set([
  "actorId",
  "approvedBy",
  "bannedBy",
  "deletedBy",
  "moderatedBy",
  "reporterId",
  "resolvedBy",
  "reviewedBy",
  "senderId",
  "submittedBy",
  "targetUserId",
  "updatedBy",
  "verifiedBy",
]);

const AUTH_RELATIONS = new Set(["account", "account_merge", "session"]);
const AUDIT_RELATION_PATTERN =
  /(?:^|_)(?:audit|event|log|moderation|report|receipt|evidence)(?:_|$)/u;

type AccountMergeUserRow = {
  id: string;
  name: string | null;
  email: string | null;
  passwordHash: string | null;
  role: string;
  status: string;
  sessionVersion: number;
  mergedIntoUserId: string | null;
};

export type UserReference = {
  schemaName: string;
  tableName: string;
  columnName: string;
};

export type AccountMergePreview = {
  source: {
    id: string;
    name: string | null;
    email: string | null;
    providers: string[];
  };
  target: {
    id: string;
    name: string | null;
    email: string | null;
    providers: string[];
  };
  affectedRecordCount: number;
  expiresAt: string;
  warnings: string[];
};

export class AccountMergeError extends Error {
  constructor(
    readonly code: string,
    readonly publicMessage: string,
    readonly status: 400 | 409 = 409,
  ) {
    super(publicMessage);
    this.name = "AccountMergeError";
  }
}

export class AccountMergeDataConflictError extends AccountMergeError {
  constructor() {
    super(
      "ACCOUNT_MERGE_DATA_CONFLICT",
      "두 계정에 같은 종류의 중복 데이터가 있어 자동 통합할 수 없어요. 어떤 데이터도 변경되지 않았습니다.",
      409,
    );
    this.name = "AccountMergeDataConflictError";
  }
}

function tokenHash(token: string): string {
  return `sha256:${createHash("sha256").update(token, "utf8").digest("hex")}`;
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export function isAccountMergeToken(value: unknown): value is string {
  return typeof value === "string" && ACCOUNT_MERGE_TOKEN_PATTERN.test(value);
}

export function maskAccountMergeEmail(email: string | null): string | null {
  if (!email) return null;
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(3, Math.min(8, local.length - visible.length)))}@${domain}`;
}

export function shouldTransferUserReference(reference: UserReference): boolean {
  if (reference.schemaName !== "public") return false;
  if (AUTH_RELATIONS.has(reference.tableName)) return false;
  if (AUDIT_RELATION_PATTERN.test(reference.tableName)) return false;
  return !AUDIT_REFERENCE_COLUMNS.has(reference.columnName);
}

export function findProviderOverlap(
  sourceProviders: readonly string[],
  targetProviders: readonly string[],
): string[] {
  const target = new Set(targetProviders);
  return [...new Set(sourceProviders.filter((provider) => target.has(provider)))].sort();
}

async function loadUser(
  client: PoolClient,
  userId: string,
  options: { lock?: boolean } = {},
): Promise<AccountMergeUserRow | null> {
  const lock = options.lock ? " FOR UPDATE" : "";
  const result = await client.query<AccountMergeUserRow>(
    `SELECT
      id,
      name,
      email,
      "passwordHash",
      role,
      status,
      "sessionVersion",
      "mergedIntoUserId"
    FROM public."user"
    WHERE id = $1${lock}`,
    [userId],
  );
  return result.rows[0] ?? null;
}

function assertMergeParticipant(
  row: AccountMergeUserRow | null,
  kind: "source" | "target",
): asserts row is AccountMergeUserRow {
  if (!row || row.status !== "active") {
    throw new AccountMergeError(
      "ACCOUNT_MERGE_ACCOUNT_UNAVAILABLE",
      kind === "source"
        ? "통합할 보조 계정이 더 이상 활성 상태가 아니에요."
        : "현재 주 계정을 통합 대상으로 사용할 수 없어요.",
      409,
    );
  }
  if (row.role !== MERGEABLE_ROLE) {
    throw new AccountMergeError(
      "ACCOUNT_MERGE_PRIVILEGED_ACCOUNT",
      "관리 권한이 있는 계정은 자동 통합할 수 없어요.",
      409,
    );
  }
}

function assertSourceCanBeMerged(source: AccountMergeUserRow): void {
  if (source.passwordHash) {
    throw new AccountMergeError(
      "SOURCE_CREDENTIAL_ACCOUNT",
      "비밀번호 로그인 계정은 주 계정으로 사용해 주세요. 다른 소셜 계정에서 통합 코드를 만든 뒤 이 계정으로 가져오세요.",
      409,
    );
  }
}

async function loadProviders(client: PoolClient, userId: string): Promise<string[]> {
  const result = await client.query<{ provider: string }>(
    `SELECT provider
     FROM public.account
     WHERE "userId" = $1
     ORDER BY provider`,
    [userId],
  );
  return [...new Set(result.rows.map((row) => row.provider))];
}

function assertNoProviderOverlap(
  sourceProviders: readonly string[],
  targetProviders: readonly string[],
): void {
  const overlap = findProviderOverlap(sourceProviders, targetProviders);
  if (overlap.length > 0) {
    throw new AccountMergeError(
      "ACCOUNT_MERGE_PROVIDER_CONFLICT",
      `두 계정에 같은 로그인 제공자(${overlap.join(", ")})가 연결되어 있어요. 유지할 로그인을 정한 뒤 한쪽 연결을 먼저 해제해 주세요.`,
      409,
    );
  }
}

async function loadMergeGrant(
  client: PoolClient,
  token: string,
  options: { lock?: boolean } = {},
): Promise<{ id: string; sourceUserId: string; expiresAt: Date } | null> {
  if (!isAccountMergeToken(token)) return null;
  const lock = options.lock ? " FOR UPDATE" : "";
  const result = await client.query<{
    id: string;
    sourceUserId: string;
    expiresAt: Date;
  }>(
    `SELECT id, "sourceUserId", "expiresAt"
     FROM public.account_merge
     WHERE "tokenHash" = $1
       AND status = 'issued'
       AND "expiresAt" > now()${lock}`,
    [tokenHash(token)],
  );
  return result.rows[0] ?? null;
}

async function discoverUserReferences(client: PoolClient): Promise<UserReference[]> {
  const result = await client.query<UserReference>(`
    SELECT
      child_namespace.nspname AS "schemaName",
      child_table.relname AS "tableName",
      child_attribute.attname AS "columnName"
    FROM pg_catalog.pg_constraint AS constraint_record
    JOIN pg_catalog.pg_class AS parent_table
      ON parent_table.oid = constraint_record.confrelid
    JOIN pg_catalog.pg_namespace AS parent_namespace
      ON parent_namespace.oid = parent_table.relnamespace
    JOIN pg_catalog.pg_class AS child_table
      ON child_table.oid = constraint_record.conrelid
    JOIN pg_catalog.pg_namespace AS child_namespace
      ON child_namespace.oid = child_table.relnamespace
    JOIN LATERAL unnest(constraint_record.conkey) WITH ORDINALITY
      AS child_key(attnum, ordinal_position) ON true
    JOIN LATERAL unnest(constraint_record.confkey) WITH ORDINALITY
      AS parent_key(attnum, ordinal_position)
      ON parent_key.ordinal_position = child_key.ordinal_position
    JOIN pg_catalog.pg_attribute AS child_attribute
      ON child_attribute.attrelid = child_table.oid
      AND child_attribute.attnum = child_key.attnum
    JOIN pg_catalog.pg_attribute AS parent_attribute
      ON parent_attribute.attrelid = parent_table.oid
      AND parent_attribute.attnum = parent_key.attnum
    WHERE constraint_record.contype = 'f'
      AND parent_namespace.nspname = 'public'
      AND parent_table.relname = 'user'
      AND parent_attribute.attname = 'id'
  `);
  return result.rows.filter(shouldTransferUserReference);
}

async function countTransferableRecords(
  client: PoolClient,
  sourceUserId: string,
  references: readonly UserReference[],
): Promise<number> {
  let total = 0;
  for (const reference of references) {
    const result = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM ${quoteIdentifier(reference.schemaName)}.${quoteIdentifier(reference.tableName)}
       WHERE ${quoteIdentifier(reference.columnName)} = $1`,
      [sourceUserId],
    );
    total += Number(result.rows[0]?.count ?? 0);
  }
  return total;
}

async function transferReferences(
  client: PoolClient,
  sourceUserId: string,
  targetUserId: string,
  references: readonly UserReference[],
): Promise<number> {
  let transferred = 0;
  for (const reference of references) {
    const countResult = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM ${quoteIdentifier(reference.schemaName)}.${quoteIdentifier(reference.tableName)}
       WHERE ${quoteIdentifier(reference.columnName)} = $1`,
      [sourceUserId],
    );
    if (Number(countResult.rows[0]?.count ?? 0) === 0) continue;
    const result = await client.query(
      `UPDATE ${quoteIdentifier(reference.schemaName)}.${quoteIdentifier(reference.tableName)}
       SET ${quoteIdentifier(reference.columnName)} = $1
       WHERE ${quoteIdentifier(reference.columnName)} = $2`,
      [targetUserId, sourceUserId],
    );
    transferred += result.rowCount ?? 0;
  }
  return transferred;
}

async function prepareMerge(
  client: PoolClient,
  targetUserId: string,
  token: string,
  options: { lock?: boolean } = {},
) {
  const grant = await loadMergeGrant(client, token, options);
  if (!grant) {
    throw new AccountMergeError(
      "ACCOUNT_MERGE_TOKEN_INVALID",
      "통합 코드가 만료되었거나 이미 사용되었어요. 보조 계정에서 새 코드를 만들어 주세요.",
      400,
    );
  }
  if (grant.sourceUserId === targetUserId) {
    throw new AccountMergeError(
      "ACCOUNT_MERGE_SAME_ACCOUNT",
      "같은 계정끼리는 통합할 수 없어요.",
      400,
    );
  }

  const orderedIds = [grant.sourceUserId, targetUserId].sort();
  if (options.lock) {
    await client.query(
      `SELECT id FROM public."user" WHERE id = ANY($1::text[]) ORDER BY id FOR UPDATE`,
      [orderedIds],
    );
  }

  const [source, target] = await Promise.all([
    loadUser(client, grant.sourceUserId),
    loadUser(client, targetUserId),
  ]);
  assertMergeParticipant(source, "source");
  assertMergeParticipant(target, "target");
  assertSourceCanBeMerged(source);

  const [sourceProviders, targetProviders] = await Promise.all([
    loadProviders(client, source.id),
    loadProviders(client, target.id),
  ]);
  if (sourceProviders.length === 0) {
    throw new AccountMergeError(
      "ACCOUNT_MERGE_SOURCE_NO_LOGIN",
      "보조 계정에 이전할 소셜 로그인 수단이 없어요.",
      409,
    );
  }
  assertNoProviderOverlap(sourceProviders, targetProviders);

  return { grant, source, target, sourceProviders, targetProviders };
}

export async function issueAccountMergeToken(
  sourceUserId: string,
): Promise<{ token: string; expiresAt: string }> {
  const client = await dbPool.connect();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ACCOUNT_MERGE_TOKEN_TTL_MS);
  try {
    await client.query("BEGIN");
    const source = await loadUser(client, sourceUserId, { lock: true });
    assertMergeParticipant(source, "source");
    assertSourceCanBeMerged(source);
    const providers = await loadProviders(client, source.id);
    if (providers.length === 0) {
      throw new AccountMergeError(
        "ACCOUNT_MERGE_SOURCE_NO_LOGIN",
        "이 계정에는 다른 계정으로 이전할 소셜 로그인 수단이 없어요.",
        409,
      );
    }

    await client.query(
      `UPDATE public.account_merge
       SET status = 'cancelled'
       WHERE "sourceUserId" = $1 AND status = 'issued'`,
      [source.id],
    );
    await client.query(
      `INSERT INTO public.account_merge (
        id, "sourceUserId", "targetUserId", "tokenHash", status, "expiresAt", summary
      ) VALUES ($1, $2, NULL, $3, 'issued', $4, $5::jsonb)`,
      [
        randomUUID(),
        source.id,
        tokenHash(token),
        expiresAt,
        JSON.stringify({ sourceProviders: providers }),
      ],
    );
    await client.query("COMMIT");
    return { token, expiresAt: expiresAt.toISOString() };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function previewAccountMerge(
  targetUserId: string,
  token: string,
): Promise<AccountMergePreview> {
  const client = await dbPool.connect();
  try {
    const prepared = await prepareMerge(client, targetUserId, token);
    const references = await discoverUserReferences(client);
    const affectedRecordCount = await countTransferableRecords(
      client,
      prepared.source.id,
      references,
    );
    return {
      source: {
        id: prepared.source.id,
        name: prepared.source.name,
        email: maskAccountMergeEmail(prepared.source.email),
        providers: prepared.sourceProviders,
      },
      target: {
        id: prepared.target.id,
        name: prepared.target.name,
        email: maskAccountMergeEmail(prepared.target.email),
        providers: prepared.targetProviders,
      },
      affectedRecordCount,
      expiresAt: prepared.grant.expiresAt.toISOString(),
      warnings: [
        "통합 후 보조 계정의 프로젝트·에셋·활동 소유권과 로그인 수단은 현재 계정으로 이전돼요.",
        "운영·신고·감사 기록의 작성자 식별자는 보조 계정에 그대로 남아 이력을 보존해요.",
        "중복 고유 데이터가 발견되면 전체 작업을 취소하고 어떤 데이터도 변경하지 않아요.",
      ],
    };
  } finally {
    client.release();
  }
}

export async function confirmAccountMerge(
  targetUserId: string,
  token: string,
): Promise<{
  sourceUserId: string;
  targetUserId: string;
  sourceSessionVersion: number;
  targetSessionVersion: number;
  transferredRecordCount: number;
  providers: string[];
}> {
  const client = await dbPool.connect();
  try {
    await client.query("BEGIN");
    const prepared = await prepareMerge(client, targetUserId, token, { lock: true });
    const references = await discoverUserReferences(client);

    let transferredRecordCount: number;
    try {
      transferredRecordCount = await transferReferences(
        client,
        prepared.source.id,
        prepared.target.id,
        references,
      );
      const accountTransfer = await client.query(
        `UPDATE public.account SET "userId" = $1 WHERE "userId" = $2`,
        [prepared.target.id, prepared.source.id],
      );
      transferredRecordCount += accountTransfer.rowCount ?? 0;
    } catch (error: unknown) {
      if (
        typeof error === "object"
        && error !== null
        && "code" in error
        && (error as { code?: unknown }).code === "23505"
      ) {
        throw new AccountMergeDataConflictError();
      }
      throw error;
    }

    await client.query(
      `DELETE FROM public.session WHERE "userId" = ANY($1::text[])`,
      [[prepared.source.id, prepared.target.id]],
    );
    await client.query(
      `DELETE FROM public."verificationToken"
       WHERE identifier = ANY($1::text[])`,
      [[
        `verify-email:${prepared.source.id}`,
        `reset-password:${prepared.source.id}`,
        `verify-email:${prepared.target.id}`,
        `reset-password:${prepared.target.id}`,
      ]],
    );

    const targetUpdate = await client.query<{ sessionVersion: number }>(
      `UPDATE public."user"
       SET "sessionVersion" = "sessionVersion" + 1
       WHERE id = $1
       RETURNING "sessionVersion"`,
      [prepared.target.id],
    );
    const mergedEmail = `merged+${prepared.source.id}.${Date.now()}@merged.local`.slice(0, 240);
    const sourceUpdate = await client.query<{ sessionVersion: number }>(
      `UPDATE public."user"
       SET
         status = 'merged',
         "mergedIntoUserId" = $1,
         "sessionVersion" = "sessionVersion" + 1,
         email = $2,
         "emailVerified" = NULL,
         "passwordHash" = NULL,
         "suspendedAt" = NULL,
         "suspensionReason" = NULL,
         "deletedAt" = NULL,
         role = 'user'
       WHERE id = $3
       RETURNING "sessionVersion"`,
      [prepared.target.id, mergedEmail, prepared.source.id],
    );

    const targetSessionVersion = targetUpdate.rows[0]?.sessionVersion;
    const sourceSessionVersion = sourceUpdate.rows[0]?.sessionVersion;
    if (!targetSessionVersion || !sourceSessionVersion) {
      throw new Error("account merge session version update failed");
    }

    const providers = [...prepared.targetProviders, ...prepared.sourceProviders].sort();
    await client.query(
      `UPDATE public.account_merge
       SET
         status = 'completed',
         "targetUserId" = $1,
         "completedAt" = now(),
         summary = $2::jsonb
       WHERE id = $3 AND status = 'issued'`,
      [
        prepared.target.id,
        JSON.stringify({
          transferredRecordCount,
          providers,
        }),
        prepared.grant.id,
      ],
    );

    await client.query("COMMIT");
    return {
      sourceUserId: prepared.source.id,
      targetUserId: prepared.target.id,
      sourceSessionVersion,
      targetSessionVersion,
      transferredRecordCount,
      providers,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
