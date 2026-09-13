import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import type { MediaInferenceKind } from "./studio-media-inference-graph";

export interface MediaArtifact { filename: string; subfolder: string; type: "output"; mime: string }
export interface MediaJob {
  id: string; owner_id: string; idempotency_key: string; request_hash: string; kind: MediaInferenceKind;
  state: string; provider_id: string | null; artifacts: MediaArtifact[]; error_code: string | null;
  created_at: Date; updated_at: Date;
}
export class MediaInferenceStore {
  readonly pool: Pool;
  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString, max: 2, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000 });
    this.pool.on("error", () => { /* Request methods surface database unavailability; never admit without a ledger. */ });
  }
  async ready(): Promise<void> { await this.pool.query("SELECT id FROM studio_media_inference_jobs LIMIT 0"); }
  async list(owner: string): Promise<MediaJob[]> { return (await this.pool.query<MediaJob>("SELECT * FROM studio_media_inference_jobs WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 30", [owner])).rows; }
  async get(owner: string, id: string): Promise<MediaJob> {
    const job = (await this.pool.query<MediaJob>("SELECT * FROM studio_media_inference_jobs WHERE owner_id=$1 AND id=$2", [owner, id])).rows[0];
    if (!job) throw new Error("job-not-found"); return job;
  }
  async admit(owner: string, key: string, hash: string, kind: MediaInferenceKind): Promise<{ job: MediaJob; created: boolean }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // Cross-instance admission: serialize the short ledger transaction, never a GPU operation.
      await client.query("SELECT pg_advisory_xact_lock(hashtext('studio-media-inference-admission-v1'))");
      const prior = (await client.query<MediaJob>("SELECT * FROM studio_media_inference_jobs WHERE owner_id=$1 AND idempotency_key=$2", [owner, key])).rows[0];
      if (prior) {
        if (prior.request_hash !== hash) throw new Error("idempotency-conflict");
        await client.query("COMMIT"); return { job: prior, created: false };
      }
      const counts = (await client.query<{ active: string; mine: string; daily: string }>(`SELECT
        count(*) FILTER (WHERE state IN ('submitting','queued','running','submission-unknown','cancel-requested')) AS active,
        count(*) FILTER (WHERE owner_id=$1 AND state IN ('submitting','queued','running','submission-unknown','cancel-requested')) AS mine,
        count(*) FILTER (WHERE owner_id=$1 AND created_at > now()-interval '24 hours') AS daily
        FROM studio_media_inference_jobs`, [owner])).rows[0];
      if (Number(counts.active) >= 4 || Number(counts.mine) >= 1 || Number(counts.daily) >= 12) throw new Error("inference-capacity-exceeded");
      const job = (await client.query<MediaJob>(`INSERT INTO studio_media_inference_jobs(id,owner_id,idempotency_key,request_hash,kind)
        VALUES($1,$2,$3,$4,$5) RETURNING *`, [randomUUID(), owner, key, hash, kind])).rows[0];
      await client.query("COMMIT"); return { job, created: true };
    } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
    finally { client.release(); }
  }
  async patch(owner: string, id: string, state: string, providerId: string | null, artifacts: MediaArtifact[] = [], error: string | null = null): Promise<MediaJob> {
    const result = await this.pool.query<MediaJob>(`UPDATE studio_media_inference_jobs SET state=CASE WHEN state='cancel-requested' AND $3 IN ('queued','running','submitting','submission-unknown') THEN state ELSE $3 END,
      provider_id=COALESCE($4,provider_id),artifacts=$5::jsonb,error_code=$6,updated_at=now()
      WHERE owner_id=$1 AND id=$2 AND state NOT IN ('succeeded','failed','cancelled') RETURNING *`, [owner,id,state,providerId,JSON.stringify(artifacts),error]);
    return result.rows[0] ?? this.get(owner,id);
  }
  async close(): Promise<void> { await this.pool.end(); }
}
