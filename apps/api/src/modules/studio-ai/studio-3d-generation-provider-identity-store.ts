export interface Studio3dGenerationProviderIdentityStore {
  put(jobId: string, sealedIdentity: string, updatedAtMs: number): Promise<void>;
  get(jobId: string): Promise<string | undefined>;
  delete(jobId: string): Promise<void>;
}

interface PostgresSql {
  unsafe(query: string, parameters?: readonly unknown[]): Promise<readonly Record<string, unknown>[]>;
  end(options?: { readonly timeout?: number }): Promise<void>;
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
  readonly #clientPromise: Promise<PostgresSql>;
  #bootstrapPromise?: Promise<void>;

  constructor(connectionString: string) {
    const url = connectionString.trim();
    if (!url) throw new TypeError("DATABASE_URL is required for 3D provider identity storage.");
    this.#clientPromise = this.#createClient(url);
  }

  async #createClient(connectionString: string): Promise<PostgresSql> {
    const moduleName = "postgres";
    const imported = (await import(moduleName)) as Record<string, unknown>;
    const factory = (imported.default ?? imported) as (
      url: string,
      options: Readonly<Record<string, unknown>>,
    ) => PostgresSql;
    if (typeof factory !== "function") throw new TypeError("The postgres driver did not expose a client factory.");
    return factory(connectionString, {
      max: 2,
      idle_timeout: 20,
      connect_timeout: 15,
      prepare: false,
    });
  }

  async #client(): Promise<PostgresSql> {
    const client = await this.#clientPromise;
    if (!this.#bootstrapPromise) {
      this.#bootstrapPromise = client.unsafe(`
        CREATE TABLE IF NOT EXISTS studio_3d_generation_provider_identities (
          job_id text PRIMARY KEY,
          sealed_identity text NOT NULL,
          updated_at_ms bigint NOT NULL
        )
      `).then(() => undefined);
    }
    await this.#bootstrapPromise;
    return client;
  }

  async put(jobId: string, sealedIdentity: string, updatedAtMs: number): Promise<void> {
    if (!jobId.trim() || !sealedIdentity.trim()) throw new TypeError("3D provider identity record is invalid.");
    await (await this.#client()).unsafe(
      `INSERT INTO studio_3d_generation_provider_identities (job_id, sealed_identity, updated_at_ms)
       VALUES ($1, $2, $3)
       ON CONFLICT (job_id) DO UPDATE SET
         sealed_identity = EXCLUDED.sealed_identity,
         updated_at_ms = EXCLUDED.updated_at_ms`,
      [jobId, sealedIdentity, updatedAtMs],
    );
  }

  async get(jobId: string): Promise<string | undefined> {
    const rows = await (await this.#client()).unsafe(
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
    await (await this.#client()).unsafe(
      "DELETE FROM studio_3d_generation_provider_identities WHERE job_id = $1",
      [jobId],
    );
  }

  async close(): Promise<void> {
    await (await this.#clientPromise).end({ timeout: 5 });
  }
}
