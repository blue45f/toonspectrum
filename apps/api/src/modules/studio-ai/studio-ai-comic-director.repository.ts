import { randomUUID } from "node:crypto";

import { dbPool } from "../../db";

import type {
  CreateStudioAiComicArtifactInput,
  CreateStudioAiComicDirectorSessionInput,
  CreateStudioAiComicJobInput,
  CreateStudioAiComicApprovalInput,
  CreateStudioAiVisualBibleRevisionInput,
  StudioAiComicApprovalRecord,
  StudioAiComicArtifactRecord,
  StudioAiComicDirectorSessionRecord,
  StudioAiComicJobEventRecord,
  StudioAiComicJobRecord,
  StudioAiVisualBibleRevisionRecord,
  UpdateStudioAiComicDirectorSessionInput,
  UpdateStudioAiComicJobInput,
} from "./studio-ai-comic-director.contract";

interface SqlResult<Row extends Record<string, unknown> = Record<string, unknown>> {
  rowCount: number | null;
  rows: Row[];
}

interface SqlClient {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<SqlResult<Row>>;
  release(): void;
}

export interface StudioAiComicDirectorSqlPool {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<SqlResult<Row>>;
  connect(): Promise<SqlClient>;
}

export interface StudioAiComicDirectorRepository {
  createSession(
    userId: string,
    input: CreateStudioAiComicDirectorSessionInput,
  ): Promise<StudioAiComicDirectorSessionRecord>;
  getSession(
    userId: string,
    sessionId: string,
  ): Promise<StudioAiComicDirectorSessionRecord | null>;
  listSessions(
    userId: string,
    limit: number,
  ): Promise<StudioAiComicDirectorSessionRecord[]>;
  updateSession(
    userId: string,
    sessionId: string,
    input: UpdateStudioAiComicDirectorSessionInput,
  ): Promise<StudioAiComicDirectorSessionRecord | null>;
  appendVisualBibleRevision(
    userId: string,
    sessionId: string,
    sourceDigest: string,
    input: CreateStudioAiVisualBibleRevisionInput,
  ): Promise<StudioAiVisualBibleRevisionRecord | null>;
  listVisualBibleRevisions(
    userId: string,
    sessionId: string,
  ): Promise<StudioAiVisualBibleRevisionRecord[]>;
  createJob(
    userId: string,
    sessionId: string,
    input: CreateStudioAiComicJobInput,
  ): Promise<StudioAiComicJobRecord | null>;
  updateJob(
    userId: string,
    sessionId: string,
    jobId: string,
    input: UpdateStudioAiComicJobInput,
  ): Promise<StudioAiComicJobRecord | null>;
  listJobs(
    userId: string,
    sessionId: string,
  ): Promise<StudioAiComicJobRecord[]>;
  listJobEvents(
    userId: string,
    sessionId: string,
    afterSequence: number,
  ): Promise<StudioAiComicJobEventRecord[]>;
  createArtifact(
    userId: string,
    sessionId: string,
    input: CreateStudioAiComicArtifactInput,
  ): Promise<StudioAiComicArtifactRecord | null>;
  listArtifacts(
    userId: string,
    sessionId: string,
  ): Promise<StudioAiComicArtifactRecord[]>;
  createApproval(
    userId: string,
    sessionId: string,
    input: CreateStudioAiComicApprovalInput,
  ): Promise<StudioAiComicApprovalRecord | null>;
  currentApproval(
    userId: string,
    sessionId: string,
  ): Promise<StudioAiComicApprovalRecord | null>;
}

export const STUDIO_AI_COMIC_DIRECTOR_REPOSITORY = Symbol(
  "STUDIO_AI_COMIC_DIRECTOR_REPOSITORY",
);

function objectPayload(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function iso(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date(0).toISOString();
}

function nullableIso(value: unknown): string | null {
  return value == null ? null : iso(value);
}

function sessionRow(row: Record<string, unknown>): StudioAiComicDirectorSessionRecord {
  return {
    id: String(row.id),
    userId: String(row.userId),
    workId: row.workId == null ? null : String(row.workId),
    remixSourceWorkId:
      row.remixSourceWorkId == null ? null : String(row.remixSourceWorkId),
    title: String(row.title),
    stage: row.stage as StudioAiComicDirectorSessionRecord["stage"],
    status: row.status as StudioAiComicDirectorSessionRecord["status"],
    revision: Number(row.revision),
    baseDocumentRevision:
      row.baseDocumentRevision == null ? null : String(row.baseDocumentRevision),
    payload: objectPayload(row.payload),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function bibleRow(row: Record<string, unknown>): StudioAiVisualBibleRevisionRecord {
  return {
    id: String(row.id),
    sessionId: String(row.sessionId),
    revision: Number(row.revision),
    status: row.status as StudioAiVisualBibleRevisionRecord["status"],
    sourceDigest: String(row.sourceDigest),
    payload: objectPayload(row.payload),
    createdAt: iso(row.createdAt),
  };
}

function jobRow(row: Record<string, unknown>): StudioAiComicJobRecord {
  return {
    id: String(row.id),
    sessionId: String(row.sessionId),
    operationId: String(row.operationId),
    kind: row.kind as StudioAiComicJobRecord["kind"],
    status: row.status as StudioAiComicJobRecord["status"],
    progressDone: Number(row.progressDone),
    progressTotal: Number(row.progressTotal),
    payload: objectPayload(row.payload),
    result: row.result == null ? null : objectPayload(row.result),
    error: row.error == null ? null : String(row.error),
    leaseExpiresAt: nullableIso(row.leaseExpiresAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function eventRow(row: Record<string, unknown>): StudioAiComicJobEventRecord {
  return {
    id: String(row.id),
    jobId: String(row.jobId),
    sessionId: String(row.sessionId),
    sequence: Number(row.sequence),
    type: String(row.type),
    payload: objectPayload(row.payload),
    createdAt: iso(row.createdAt),
  };
}

function artifactRow(row: Record<string, unknown>): StudioAiComicArtifactRecord {
  return {
    id: String(row.id),
    sessionId: String(row.sessionId),
    panelId: row.panelId == null ? null : String(row.panelId),
    parentArtifactId:
      row.parentArtifactId == null ? null : String(row.parentArtifactId),
    kind: row.kind as StudioAiComicArtifactRecord["kind"],
    assetId: row.assetId == null ? null : String(row.assetId),
    payload: objectPayload(row.payload),
    createdAt: iso(row.createdAt),
  };
}

function approvalRow(row: Record<string, unknown>): StudioAiComicApprovalRecord {
  return {
    id: String(row.id),
    sessionId: String(row.sessionId),
    sessionRevision: Number(row.sessionRevision),
    candidateDigest: String(row.candidateDigest),
    status: row.status as StudioAiComicApprovalRecord["status"],
    payload: objectPayload(row.payload),
    createdAt: iso(row.createdAt),
    supersededAt: nullableIso(row.supersededAt),
  };
}

const SESSION_SELECT = `
SELECT "id", "userId", "workId", "remixSourceWorkId", "title", "stage",
       "status", "revision", "baseDocumentRevision", "payload", "createdAt", "updatedAt"
FROM "studio_ai_comic_director_session"
`;

const JOB_SELECT = `
SELECT "id", "sessionId", "operationId", "kind",
       CASE
         WHEN "status" = 'running'
          AND "leaseExpiresAt" IS NOT NULL
          AND "leaseExpiresAt" <= clock_timestamp()
         THEN 'unknown'
         ELSE "status"
       END AS "status",
       "progressDone", "progressTotal", "payload", "result", "error",
       "leaseExpiresAt", "createdAt", "updatedAt"
FROM "studio_ai_comic_director_job"
`;

export class PostgresStudioAiComicDirectorRepository
  implements StudioAiComicDirectorRepository
{
  constructor(
    private readonly pool: StudioAiComicDirectorSqlPool = dbPool,
    private readonly idFactory: () => string = randomUUID,
  ) {}

  async createSession(
    userId: string,
    input: CreateStudioAiComicDirectorSessionInput,
  ): Promise<StudioAiComicDirectorSessionRecord> {
    const result = await this.pool.query(
      `
INSERT INTO "studio_ai_comic_director_session" (
  "id", "userId", "workId", "remixSourceWorkId", "title", "stage", "status",
  "baseDocumentRevision", "payload", "createdAt", "updatedAt"
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, clock_timestamp(), clock_timestamp())
RETURNING "id", "userId", "workId", "remixSourceWorkId", "title", "stage",
          "status", "revision", "baseDocumentRevision", "payload", "createdAt", "updatedAt"
`,
      [
        input.id ?? this.idFactory(),
        userId,
        input.workId ?? null,
        input.remixSourceWorkId ?? null,
        input.title ?? "AI 코믹 디렉터 세션",
        input.stage ?? "brief",
        input.status ?? "draft",
        input.baseDocumentRevision ?? null,
        JSON.stringify(input.payload ?? {}),
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("AI Comic Director session was not created.");
    return sessionRow(row);
  }

  async getSession(
    userId: string,
    sessionId: string,
  ): Promise<StudioAiComicDirectorSessionRecord | null> {
    const result = await this.pool.query(
      `${SESSION_SELECT} WHERE "userId" = $1 AND "id" = $2 LIMIT 1`,
      [userId, sessionId],
    );
    return result.rows[0] ? sessionRow(result.rows[0]) : null;
  }

  async listSessions(
    userId: string,
    limit: number,
  ): Promise<StudioAiComicDirectorSessionRecord[]> {
    const result = await this.pool.query(
      `${SESSION_SELECT}
       WHERE "userId" = $1
       ORDER BY "updatedAt" DESC
       LIMIT $2`,
      [userId, limit],
    );
    return result.rows.map(sessionRow);
  }

  async updateSession(
    userId: string,
    sessionId: string,
    input: UpdateStudioAiComicDirectorSessionInput,
  ): Promise<StudioAiComicDirectorSessionRecord | null> {
    const client = await this.pool.connect();
    let transactionOpen = false;
    try {
      await client.query("BEGIN");
      transactionOpen = true;
      const result = await client.query(
        `
UPDATE "studio_ai_comic_director_session"
SET
  "title" = CASE WHEN $4::boolean THEN $5::text ELSE "title" END,
  "stage" = CASE WHEN $6::boolean THEN $7::text ELSE "stage" END,
  "status" = CASE WHEN $8::boolean THEN $9::text ELSE "status" END,
  "baseDocumentRevision" = CASE WHEN $10::boolean THEN $11::text ELSE "baseDocumentRevision" END,
  "payload" = CASE WHEN $12::boolean THEN $13::jsonb ELSE "payload" END,
  "revision" = "revision" + 1,
  "updatedAt" = clock_timestamp()
WHERE "userId" = $1 AND "id" = $2 AND "revision" = $3
RETURNING "id", "userId", "workId", "remixSourceWorkId", "title", "stage",
          "status", "revision", "baseDocumentRevision", "payload", "createdAt", "updatedAt"
`,
        [
          userId,
          sessionId,
          input.expectedRevision,
          input.title !== undefined,
          input.title ?? "",
          input.stage !== undefined,
          input.stage ?? "brief",
          input.status !== undefined,
          input.status ?? "draft",
          input.baseDocumentRevision !== undefined,
          input.baseDocumentRevision ?? null,
          input.payload !== undefined,
          JSON.stringify(input.payload ?? {}),
        ],
      );
      const row = result.rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        transactionOpen = false;
        return null;
      }
      await client.query(
        `
UPDATE "studio_ai_comic_director_approval"
SET "status" = 'superseded', "supersededAt" = clock_timestamp()
WHERE "sessionId" = $1 AND "userId" = $2 AND "status" = 'active'
`,
        [sessionId, userId],
      );
      await client.query("COMMIT");
      transactionOpen = false;
      return sessionRow(row);
    } catch (error) {
      if (transactionOpen) await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async appendVisualBibleRevision(
    userId: string,
    sessionId: string,
    sourceDigest: string,
    input: CreateStudioAiVisualBibleRevisionInput,
  ): Promise<StudioAiVisualBibleRevisionRecord | null> {
    const client = await this.pool.connect();
    let transactionOpen = false;
    try {
      await client.query("BEGIN");
      transactionOpen = true;
      await client.query(
        "SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended($1::text, 845011213))",
        [sessionId],
      );
      const result = await client.query(
        `
INSERT INTO "studio_ai_visual_bible_revision" (
  "id", "sessionId", "userId", "revision", "status", "sourceDigest", "payload", "createdAt"
)
SELECT $1, session."id", $2,
       COALESCE((SELECT MAX("revision") + 1 FROM "studio_ai_visual_bible_revision" WHERE "sessionId" = session."id"), 1),
       $4, $5, $6::jsonb, clock_timestamp()
FROM "studio_ai_comic_director_session" AS session
WHERE session."id" = $3 AND session."userId" = $2
RETURNING "id", "sessionId", "revision", "status", "sourceDigest", "payload", "createdAt"
`,
        [
          this.idFactory(),
          userId,
          sessionId,
          input.status ?? "draft",
          sourceDigest,
          JSON.stringify(input.payload),
        ],
      );
      await client.query("COMMIT");
      transactionOpen = false;
      return result.rows[0] ? bibleRow(result.rows[0]) : null;
    } catch (error) {
      if (transactionOpen) await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listVisualBibleRevisions(
    userId: string,
    sessionId: string,
  ): Promise<StudioAiVisualBibleRevisionRecord[]> {
    const result = await this.pool.query(
      `
SELECT bible."id", bible."sessionId", bible."revision", bible."status",
       bible."sourceDigest", bible."payload", bible."createdAt"
FROM "studio_ai_visual_bible_revision" AS bible
JOIN "studio_ai_comic_director_session" AS session ON session."id" = bible."sessionId"
WHERE session."userId" = $1 AND bible."sessionId" = $2
ORDER BY bible."revision" DESC
`,
      [userId, sessionId],
    );
    return result.rows.map(bibleRow);
  }

  async createJob(
    userId: string,
    sessionId: string,
    input: CreateStudioAiComicJobInput,
  ): Promise<StudioAiComicJobRecord | null> {
    const result = await this.pool.query(
      `
INSERT INTO "studio_ai_comic_director_job" (
  "id", "sessionId", "userId", "operationId", "kind", "status",
  "progressDone", "progressTotal", "payload", "leaseExpiresAt", "createdAt", "updatedAt"
)
SELECT $1, session."id", $2, $4, $5, 'queued', 0, $6, $7::jsonb,
       clock_timestamp() + ($8::integer * interval '1 millisecond'),
       clock_timestamp(), clock_timestamp()
FROM "studio_ai_comic_director_session" AS session
WHERE session."id" = $3 AND session."userId" = $2
ON CONFLICT ("sessionId", "operationId") DO UPDATE
SET "updatedAt" = "studio_ai_comic_director_job"."updatedAt"
RETURNING "id", "sessionId", "operationId", "kind", "status", "progressDone",
          "progressTotal", "payload", "result", "error", "leaseExpiresAt", "createdAt", "updatedAt"
`,
      [
        this.idFactory(),
        userId,
        sessionId,
        input.operationId,
        input.kind,
        input.progressTotal ?? 0,
        JSON.stringify(input.payload ?? {}),
        input.leaseMs ?? 120_000,
      ],
    );
    return result.rows[0] ? jobRow(result.rows[0]) : null;
  }

  async updateJob(
    userId: string,
    sessionId: string,
    jobId: string,
    input: UpdateStudioAiComicJobInput,
  ): Promise<StudioAiComicJobRecord | null> {
    const client = await this.pool.connect();
    let transactionOpen = false;
    try {
      await client.query("BEGIN");
      transactionOpen = true;
      const result = await client.query(
        `
UPDATE "studio_ai_comic_director_job"
SET
  "status" = COALESCE($4::text, "status"),
  "progressDone" = COALESCE($5::integer, "progressDone"),
  "progressTotal" = COALESCE($6::integer, "progressTotal"),
  "result" = CASE WHEN $7::boolean THEN $8::jsonb ELSE "result" END,
  "error" = CASE WHEN $9::boolean THEN $10::text ELSE "error" END,
  "leaseExpiresAt" = CASE
    WHEN $11::boolean AND $12::integer IS NULL THEN NULL
    WHEN $11::boolean THEN clock_timestamp() + ($12::integer * interval '1 millisecond')
    ELSE "leaseExpiresAt"
  END,
  "updatedAt" = clock_timestamp()
WHERE "userId" = $1 AND "sessionId" = $2 AND "id" = $3
RETURNING "id", "sessionId", "operationId", "kind", "status", "progressDone",
          "progressTotal", "payload", "result", "error", "leaseExpiresAt", "createdAt", "updatedAt"
`,
        [
          userId,
          sessionId,
          jobId,
          input.status ?? null,
          input.progressDone ?? null,
          input.progressTotal ?? null,
          input.result !== undefined,
          input.result == null ? null : JSON.stringify(input.result),
          input.error !== undefined,
          input.error ?? null,
          input.leaseMs !== undefined,
          input.leaseMs,
        ],
      );
      const row = result.rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        transactionOpen = false;
        return null;
      }
      if (input.eventType) {
        await client.query(
          "SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended($1::text, 845011214))",
          [jobId],
        );
        await client.query(
          `
INSERT INTO "studio_ai_comic_director_job_event" (
  "id", "jobId", "sessionId", "sequence", "type", "payload", "createdAt"
)
VALUES (
  $1, $2, $3,
  COALESCE((SELECT MAX("sequence") + 1 FROM "studio_ai_comic_director_job_event" WHERE "jobId" = $2), 1),
  $4, $5::jsonb, clock_timestamp()
)
`,
          [
            this.idFactory(),
            jobId,
            sessionId,
            input.eventType,
            JSON.stringify(input.eventPayload ?? {}),
          ],
        );
      }
      await client.query("COMMIT");
      transactionOpen = false;
      return jobRow(row);
    } catch (error) {
      if (transactionOpen) await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listJobs(
    userId: string,
    sessionId: string,
  ): Promise<StudioAiComicJobRecord[]> {
    await this.pool.query(
      `
UPDATE "studio_ai_comic_director_job"
SET "status" = 'unknown', "updatedAt" = clock_timestamp()
WHERE "userId" = $1 AND "sessionId" = $2 AND "status" = 'running'
  AND "leaseExpiresAt" IS NOT NULL AND "leaseExpiresAt" <= clock_timestamp()
`,
      [userId, sessionId],
    );
    const result = await this.pool.query(
      `${JOB_SELECT}
       WHERE "userId" = $1 AND "sessionId" = $2
       ORDER BY "createdAt" DESC`,
      [userId, sessionId],
    );
    return result.rows.map(jobRow);
  }

  async listJobEvents(
    userId: string,
    sessionId: string,
    afterSequence: number,
  ): Promise<StudioAiComicJobEventRecord[]> {
    const result = await this.pool.query(
      `
SELECT event."id", event."jobId", event."sessionId", event."sequence", event."type",
       event."payload", event."createdAt"
FROM "studio_ai_comic_director_job_event" AS event
JOIN "studio_ai_comic_director_job" AS job ON job."id" = event."jobId"
WHERE job."userId" = $1 AND event."sessionId" = $2 AND event."sequence" > $3
ORDER BY event."createdAt" ASC, event."sequence" ASC
LIMIT 500
`,
      [userId, sessionId, afterSequence],
    );
    return result.rows.map(eventRow);
  }

  async createArtifact(
    userId: string,
    sessionId: string,
    input: CreateStudioAiComicArtifactInput,
  ): Promise<StudioAiComicArtifactRecord | null> {
    const result = await this.pool.query(
      `
INSERT INTO "studio_ai_comic_director_artifact" (
  "id", "sessionId", "userId", "panelId", "parentArtifactId", "kind", "assetId", "payload", "createdAt"
)
SELECT $1, session."id", $2, $4, $5, $6, $7, $8::jsonb, clock_timestamp()
FROM "studio_ai_comic_director_session" AS session
WHERE session."id" = $3 AND session."userId" = $2
RETURNING "id", "sessionId", "panelId", "parentArtifactId", "kind", "assetId", "payload", "createdAt"
`,
      [
        this.idFactory(),
        userId,
        sessionId,
        input.panelId ?? null,
        input.parentArtifactId ?? null,
        input.kind,
        input.assetId ?? null,
        JSON.stringify(input.payload ?? {}),
      ],
    );
    return result.rows[0] ? artifactRow(result.rows[0]) : null;
  }

  async listArtifacts(
    userId: string,
    sessionId: string,
  ): Promise<StudioAiComicArtifactRecord[]> {
    const result = await this.pool.query(
      `
SELECT artifact."id", artifact."sessionId", artifact."panelId", artifact."parentArtifactId",
       artifact."kind", artifact."assetId", artifact."payload", artifact."createdAt"
FROM "studio_ai_comic_director_artifact" AS artifact
JOIN "studio_ai_comic_director_session" AS session ON session."id" = artifact."sessionId"
WHERE session."userId" = $1 AND artifact."sessionId" = $2
ORDER BY artifact."createdAt" ASC
`,
      [userId, sessionId],
    );
    return result.rows.map(artifactRow);
  }

  async createApproval(
    userId: string,
    sessionId: string,
    input: CreateStudioAiComicApprovalInput,
  ): Promise<StudioAiComicApprovalRecord | null> {
    const client = await this.pool.connect();
    let transactionOpen = false;
    try {
      await client.query("BEGIN");
      transactionOpen = true;
      await client.query(
        `
UPDATE "studio_ai_comic_director_approval"
SET "status" = 'superseded', "supersededAt" = clock_timestamp()
WHERE "sessionId" = $1 AND "userId" = $2 AND "status" = 'active'
`,
        [sessionId, userId],
      );
      const result = await client.query(
        `
INSERT INTO "studio_ai_comic_director_approval" (
  "id", "sessionId", "userId", "sessionRevision", "candidateDigest", "status", "payload", "createdAt"
)
SELECT $1, session."id", $2, session."revision", $5, 'active', $6::jsonb, clock_timestamp()
FROM "studio_ai_comic_director_session" AS session
WHERE session."id" = $3 AND session."userId" = $2 AND session."revision" = $4
ON CONFLICT ("sessionId", "sessionRevision", "candidateDigest") DO UPDATE
SET "status" = 'active', "supersededAt" = NULL, "payload" = EXCLUDED."payload"
RETURNING "id", "sessionId", "sessionRevision", "candidateDigest", "status", "payload", "createdAt", "supersededAt"
`,
        [
          this.idFactory(),
          userId,
          sessionId,
          input.expectedRevision,
          input.candidateDigest,
          JSON.stringify(input.payload ?? {}),
        ],
      );
      const row = result.rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        transactionOpen = false;
        return null;
      }
      await client.query("COMMIT");
      transactionOpen = false;
      return approvalRow(row);
    } catch (error) {
      if (transactionOpen) await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async currentApproval(
    userId: string,
    sessionId: string,
  ): Promise<StudioAiComicApprovalRecord | null> {
    const result = await this.pool.query(
      `
SELECT approval."id", approval."sessionId", approval."sessionRevision",
       approval."candidateDigest", approval."status", approval."payload",
       approval."createdAt", approval."supersededAt"
FROM "studio_ai_comic_director_approval" AS approval
JOIN "studio_ai_comic_director_session" AS session ON session."id" = approval."sessionId"
WHERE session."userId" = $1 AND approval."sessionId" = $2
  AND approval."status" = 'active'
  AND approval."sessionRevision" = session."revision"
ORDER BY approval."createdAt" DESC
LIMIT 1
`,
      [userId, sessionId],
    );
    return result.rows[0] ? approvalRow(result.rows[0]) : null;
  }
}
