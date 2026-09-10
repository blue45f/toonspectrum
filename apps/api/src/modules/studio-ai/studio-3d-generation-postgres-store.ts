import { AsyncLocalStorage } from "node:async_hooks";

import { Logger } from "@nestjs/common";
import { Pool, type PoolClient } from "pg";

import {
  normalizePgConnectionStringForTls,
  observePgPoolIdleErrors,
} from "../../db/pg-connection";
import type {
  Studio3dGenerationArtifactRevision,
  Studio3dGenerationJobRecord,
  Studio3dGenerationJobStore,
} from "./studio-3d-generation-job-ledger";

type SqlRow = Record<string, unknown>;
type SqlResult = readonly SqlRow[];

interface PostgresSql {
  unsafe(query: string, parameters?: readonly unknown[]): Promise<SqlResult>;
  begin<T>(operation: (sql: PostgresSql) => Promise<T>): Promise<T>;
  end(options?: { readonly timeout?: number }): Promise<void>;
}

class NodePostgresSql implements PostgresSql {
  constructor(
    private readonly pool: Pool,
    private readonly transactionClient?: PoolClient,
  ) {}

  async unsafe(query: string, parameters: readonly unknown[] = []): Promise<SqlResult> {
    const queryable = this.transactionClient ?? this.pool;
    const result = await queryable.query<SqlRow>(query, [...parameters]);
    return result.rows;
  }

  async begin<T>(operation: (sql: PostgresSql) => Promise<T>): Promise<T> {
    if (this.transactionClient) return operation(this);

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const transaction = new NodePostgresSql(this.pool, client);
      const result = await operation(transaction);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the original operation error if the connection is already unusable.
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async end(_options?: { readonly timeout?: number }): Promise<void> {
    if (!this.transactionClient) await this.pool.end();
  }
}

export interface Studio3dGenerationStoredArtifact {
  readonly revision: Studio3dGenerationArtifactRevision;
  readonly bytes: Uint8Array;
}

export interface Studio3dGenerationArtifactStore {
  putArtifact(artifact: Studio3dGenerationStoredArtifact): Promise<void>;
  getArtifact(revisionId: string): Promise<Studio3dGenerationStoredArtifact | undefined>;
}

function parseRecord(value: unknown): Studio3dGenerationJobRecord {
  if (typeof value === "string") return JSON.parse(value) as Studio3dGenerationJobRecord;
  if (value && typeof value === "object") return value as Studio3dGenerationJobRecord;
  throw new TypeError("Postgres 3D generation record is malformed.");
}

function byteArray(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) {
    return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
  }
  if (typeof value === "string") {
    const normalized = value.startsWith("\\x") ? value.slice(2) : value;
    return Uint8Array.from(Buffer.from(normalized, "hex"));
  }
  throw new TypeError("Postgres 3D artifact bytes are malformed.");
}

export class PostgresStudio3dGenerationStore
  implements Studio3dGenerationJobStore, Studio3dGenerationArtifactStore
{
  readonly #transaction = new AsyncLocalStorage<PostgresSql>();
  readonly #clientPromise: Promise<PostgresSql>;
  #bootstrapped?: Promise<void>;

  constructor(connectionString: string) {
    const url = connectionString.trim();
    if (!url) throw new TypeError("DATABASE_URL is required for the durable 3D generation store.");
    this.#clientPromise = this.#createClient(url);
  }

  async #createClient(connectionString: string): Promise<PostgresSql> {
    const normalizedConnectionString = normalizePgConnectionStringForTls(connectionString);
    const pool = new Pool({
      connectionString: normalizedConnectionString,
      max: 4,
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 15_000,
      allowExitOnIdle: true,
    });
    observePgPoolIdleErrors(pool, {
      connectionString: normalizedConnectionString,
      logger: new Logger("Studio3dGenerationPostgresStore"),
    });
    return new NodePostgresSql(pool);
  }

  async #client(): Promise<PostgresSql> {
    const active = this.#transaction.getStore();
    if (active) return active;
    const client = await this.#clientPromise;
    await this.#bootstrap(client);
    return client;
  }

  async #bootstrap(client: PostgresSql): Promise<void> {
    if (!this.#bootstrapped) {
      this.#bootstrapped = (async () => {
        await client.unsafe(`
          CREATE TABLE IF NOT EXISTS studio_3d_generation_jobs (
            job_id text PRIMARY KEY,
            user_id text NOT NULL,
            idempotency_key_hash text NOT NULL,
            generation integer NOT NULL,
            state text NOT NULL,
            created_at_ms bigint NOT NULL,
            updated_at_ms bigint NOT NULL,
            record_json jsonb NOT NULL,
            UNIQUE (user_id, idempotency_key_hash)
          )
        `);
        await client.unsafe(`
          CREATE INDEX IF NOT EXISTS studio_3d_generation_jobs_user_created_idx
          ON studio_3d_generation_jobs (user_id, created_at_ms DESC)
        `);
        await client.unsafe(`
          CREATE TABLE IF NOT EXISTS studio_3d_generation_artifacts (
            revision_id text PRIMARY KEY,
            source_job_id text NOT NULL REFERENCES studio_3d_generation_jobs(job_id) ON DELETE RESTRICT,
            content_hash_sha256 text NOT NULL,
            byte_length bigint NOT NULL,
            mime_type text NOT NULL,
            object_key text NOT NULL,
            revision_json jsonb NOT NULL,
            artifact_bytes bytea NOT NULL,
            created_at_ms bigint NOT NULL
          )
        `);
        await client.unsafe(`
          CREATE UNIQUE INDEX IF NOT EXISTS studio_3d_generation_artifacts_hash_idx
          ON studio_3d_generation_artifacts (content_hash_sha256)
        `);
      })();
    }
    await this.#bootstrapped;
  }

  async withUserLock<T>(userId: string, operation: () => Promise<T>): Promise<T> {
    const root = await this.#clientPromise;
    await this.#bootstrap(root);
    return root.begin(async (transaction) => {
      await transaction.unsafe("SELECT pg_advisory_xact_lock(hashtext($1))", [userId]);
      return this.#transaction.run(transaction, operation);
    });
  }

  async getById(jobId: string): Promise<Studio3dGenerationJobRecord | undefined> {
    const rows = await (await this.#client()).unsafe(
      "SELECT record_json::text AS record_json FROM studio_3d_generation_jobs WHERE job_id = $1 LIMIT 1",
      [jobId],
    );
    const row = rows[0];
    return row ? parseRecord(row.record_json) : undefined;
  }

  async getByIdempotencyHash(
    userId: string,
    hash: string,
  ): Promise<Studio3dGenerationJobRecord | undefined> {
    const rows = await (await this.#client()).unsafe(
      `SELECT record_json::text AS record_json
       FROM studio_3d_generation_jobs
       WHERE user_id = $1 AND idempotency_key_hash = $2
       LIMIT 1`,
      [userId, hash],
    );
    const row = rows[0];
    return row ? parseRecord(row.record_json) : undefined;
  }

  async put(record: Studio3dGenerationJobRecord): Promise<void> {
    await (await this.#client()).unsafe(
      `INSERT INTO studio_3d_generation_jobs (
         job_id, user_id, idempotency_key_hash, generation, state,
         created_at_ms, updated_at_ms, record_json
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       ON CONFLICT (job_id) DO UPDATE SET
         generation = EXCLUDED.generation,
         state = EXCLUDED.state,
         updated_at_ms = EXCLUDED.updated_at_ms,
         record_json = EXCLUDED.record_json
       WHERE studio_3d_generation_jobs.generation <= EXCLUDED.generation`,
      [
        record.id,
        record.userId,
        record.idempotencyKeyHash,
        record.generation,
        record.state,
        record.createdAtMs,
        record.updatedAtMs,
        JSON.stringify(record),
      ],
    );
  }

  async listByUser(userId: string): Promise<readonly Studio3dGenerationJobRecord[]> {
    const rows = await (await this.#client()).unsafe(
      `SELECT record_json::text AS record_json
       FROM studio_3d_generation_jobs
       WHERE user_id = $1
       ORDER BY created_at_ms DESC
       LIMIT 500`,
      [userId],
    );
    return rows.map((row) => parseRecord(row.record_json));
  }

  async putArtifact(artifact: Studio3dGenerationStoredArtifact): Promise<void> {
    const revision = artifact.revision;
    if (artifact.bytes.byteLength !== revision.byteLength) {
      throw new RangeError("3D artifact byte length does not match its immutable revision.");
    }
    await (await this.#client()).unsafe(
      `INSERT INTO studio_3d_generation_artifacts (
         revision_id, source_job_id, content_hash_sha256, byte_length,
         mime_type, object_key, revision_json, artifact_bytes, created_at_ms
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
       ON CONFLICT (revision_id) DO NOTHING`,
      [
        revision.id,
        revision.sourceJobId,
        revision.contentHashSha256,
        revision.byteLength,
        revision.mimeType,
        revision.objectKey,
        JSON.stringify(revision),
        artifact.bytes,
        revision.createdAtMs,
      ],
    );
  }

  async getArtifact(revisionId: string): Promise<Studio3dGenerationStoredArtifact | undefined> {
    const rows = await (await this.#client()).unsafe(
      `SELECT revision_json::text AS revision_json, artifact_bytes
       FROM studio_3d_generation_artifacts
       WHERE revision_id = $1
       LIMIT 1`,
      [revisionId],
    );
    const row = rows[0];
    if (!row) return undefined;
    return Object.freeze({
      revision: typeof row.revision_json === "string"
        ? (JSON.parse(row.revision_json) as Studio3dGenerationArtifactRevision)
        : (row.revision_json as Studio3dGenerationArtifactRevision),
      bytes: byteArray(row.artifact_bytes),
    });
  }

  async close(): Promise<void> {
    const client = await this.#clientPromise;
    await client.end({ timeout: 5 });
  }
}
