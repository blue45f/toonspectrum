import { Logger } from "@nestjs/common";
import { Pool } from "pg";

import {
  normalizePgConnectionStringForTls,
  observePgPoolIdleErrors,
} from "../../db/pg-connection";

export interface Studio3dGenerationProviderIdentityStore {
  put(jobId: string, sealedIdentity: string, updatedAtMs: number): Promise<void>;
  get(jobId: string): Promise<string | undefined>;
  delete(jobId: string): Promise<void>;
}

export class InMemoryStudio3dGenerationProviderIdentityStore
  implements Studio3dGenerationProviderIdentityStore
{
  readonly #records = new Map<string, string>();

  async put(jobId: string, sealedIdentity: string): Promise<void> {
    this.#records.set(jobId, sealedIdentity);
  }

  async get(jobId: string): Promise<string | undefined> {
    return this.#records.get(jobId);
  }

  async delete(jobId: string): Promise<void> {
    this.#records.delete(jobId);
  }
}

export class PostgresStudio3dGenerationProviderIdentityStore
  implements Studio3dGenerationProviderIdentityStore
{
  readonly #pool: Pool;
  #bootstrapPromise?: Promise<void>;
  #closePromise?: Promise<void>;

  constructor(connectionString: string) {
    const url = connectionString.trim();
    if (!url) throw new TypeError("DATABASE_URL is required for 3D provider identity storage.");
    const normalized = normalizePgConnectionStringForTls(url);
    // Use the declared, statically traceable driver shared by the durable job store.
    // Pool construction does not connect or execute DDL during unrelated Studio reads.
    this.#pool = new Pool({
      connectionString: normalized,
      max: 2,
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 15_000,
      allowExitOnIdle: true,
    });
    observePgPoolIdleErrors(this.#pool, {
      connectionString: normalized,
      logger: new Logger("Studio3dGenerationProviderIdentityStore"),
    });
  }

  async #client(): Promise<Pool> {
    if (this.#closePromise) throw new Error("3D provider identity storage is closed.");
    if (!this.#bootstrapPromise) {
      this.#bootstrapPromise = this.#pool.query(`
        CREATE TABLE IF NOT EXISTS studio_3d_generation_provider_identities (
          job_id text PRIMARY KEY,
          sealed_identity text NOT NULL,
          updated_at_ms bigint NOT NULL
        )
      `).then(() => undefined).catch((error: unknown) => {
        // A transient database outage must not permanently poison this warm instance.
        this.#bootstrapPromise = undefined;
        throw error;
      });
    }
    await this.#bootstrapPromise;
    if (this.#closePromise) throw new Error("3D provider identity storage is closed.");
    return this.#pool;
  }

  async put(jobId: string, sealedIdentity: string, updatedAtMs: number): Promise<void> {
    if (!jobId.trim() || !sealedIdentity.trim()) throw new TypeError("3D provider identity record is invalid.");
    await (await this.#client()).query(
      `INSERT INTO studio_3d_generation_provider_identities (job_id, sealed_identity, updated_at_ms)
       VALUES ($1, $2, $3)
       ON CONFLICT (job_id) DO UPDATE SET
         sealed_identity = EXCLUDED.sealed_identity,
         updated_at_ms = EXCLUDED.updated_at_ms`,
      [jobId, sealedIdentity, updatedAtMs],
    );
  }

  async get(jobId: string): Promise<string | undefined> {
    const { rows } = await (await this.#client()).query<{ sealed_identity: unknown }>(
      `SELECT sealed_identity
       FROM studio_3d_generation_provider_identities
       WHERE job_id = $1
       LIMIT 1`,
      [jobId],
    );
    const value = rows[0]?.sealed_identity;
    return typeof value === "string" ? value : undefined;
  }

  async delete(jobId: string): Promise<void> {
    await (await this.#client()).query(
      "DELETE FROM studio_3d_generation_provider_identities WHERE job_id = $1",
      [jobId],
    );
  }

  close(): Promise<void> {
    // Closing an unused store never bootstraps its table; shutdown is idempotent.
    if (!this.#closePromise) this.#closePromise = this.#pool.end();
    return this.#closePromise;
  }
}
