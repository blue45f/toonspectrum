import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type * as DatabaseRuntime from "../../db";
import type { StudioReviewVoiceNoteRepository } from "./studio-review-voice-note.repository";

vi.mock("./pinned-share/pinned-share-storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./pinned-share/pinned-share-storage")>();
  return { ...actual, pinnedShareCapture: vi.fn(async (_client: unknown, subject: unknown) => ({ subject, pages: [] })) };
});

const connection = process.env.STUDIO_LIVE_POSTGRES_INTEGRATION_URL?.trim();
if (process.env.CI && !connection) throw new Error("CI must provide real PostgreSQL for review voice-note authority tests");
(connection ? describe : describe.skip)("review voice notes on PostgreSQL", () => {
  let pool: Pool, database: typeof DatabaseRuntime, repository: StudioReviewVoiceNoteRepository;
  const works: string[] = [], users: string[] = [], previous = process.env.DATABASE_URL;
  beforeAll(async () => {
    process.env.DATABASE_URL = connection!; pool = new Pool({ connectionString: connection, max: 4 });
    database = await import("../../db");
    repository = new (await import("./studio-review-voice-note.repository")).StudioReviewVoiceNoteRepository();
    const table = await pool.query("SELECT to_regclass('public.studio_review_voice_note') AS name");
    expect(table.rows[0]?.name).toBe("studio_review_voice_note");
  });
  afterEach(async () => {
    await pool.query('DELETE FROM creator_work WHERE id=ANY($1::text[])', [works]);
    await pool.query('DELETE FROM "user" WHERE id=ANY($1::text[])', [users]);
    works.length = 0; users.length = 0;
  });
  afterAll(async () => {
    await Promise.all([pool?.end(), database?.dbPool.end()]);
    if (previous === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous;
  });
  async function user(name = "Voice actor") { const id = randomUUID(); users.push(id); await pool.query('INSERT INTO "user" (id,name) VALUES ($1,$2)', [id, name]); return id; }
  async function member(workId: string, role: "commenter" | "viewer" | "editor" = "commenter") {
    const id = await user(role); await pool.query(`INSERT INTO creator_work_collaborator ("workId","userId",role,status,"invitationId","respondedAt") VALUES ($1,$2,$3,'active',$4,now())`, [workId, id, role, randomUUID()]); return id;
  }
  async function fixture() {
    const owner = await user("Owner"), workId = randomUUID(); works.push(workId);
    await pool.query('INSERT INTO creator_work (id,"userId",title) VALUES ($1,$2,$3)', [workId, owner, "Voice fixture"]);
    const commenter = await member(workId), viewer = await member(workId, "viewer"), outsider = await user("Outsider");
    const subject = { schemaVersion: 1 as const, workId, projectId: randomUUID(), artifactId: randomUUID(), reviewId: randomUUID(), revisionId: randomUUID(), rootGraphHash: "a".repeat(64) };
    const bytes = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]); const sha256 = createHash("sha256").update(bytes).digest("hex");
    const object = { contractVersion: "toonspectrum.private-object-storage.v2" as const, providerId: "cloudflare-r2" as const, purpose: "derived" as const,
      digest: `sha256:${sha256}`, objectPath: `sha256/${sha256.slice(0, 2)}/${sha256}`, byteLength: bytes.length, contentType: "audio/webm" };
    const input = { operationId: randomUUID(), noteId: randomUUID(), subject, title: "Panel context", transcript: "Raise the eye line.", durationMs: 1_200, retentionDays: 14 };
    return { owner, commenter, viewer, outsider, workId, subject, sha256, object, input, file: { contentType: "audio/webm", byteLength: bytes.length, sha256, object } };
  }

  it("persists one exact pinned note and replays only the identical idempotent request", async () => {
    const f = await fixture();
    const first = await repository.create(f.commenter, f.workId, f.input, f.file);
    expect(first.view.note).toMatchObject({ id: f.input.noteId, subject: f.subject, transcript: f.input.transcript });
    expect((await repository.create(f.commenter, f.workId, f.input, f.file))).toEqual({ ...first, replayed: true });
    await expect(repository.create(f.commenter, f.workId, { ...f.input, title: "Changed" }, f.file)).rejects.toMatchObject({ code: "idempotency" });
    expect((await repository.list(f.viewer, f.workId, f.subject)).items).toHaveLength(1);
  });

  it("requires comment authority to upload and current view authority to read", async () => {
    const f = await fixture();
    await expect(repository.create(f.viewer, f.workId, f.input, f.file)).rejects.toMatchObject({ code: "forbidden" });
    await expect(repository.list(f.outsider, f.workId, f.subject)).rejects.toMatchObject({ code: "forbidden" });
    await repository.create(f.commenter, f.workId, f.input, f.file);
    await pool.query('DELETE FROM creator_work_collaborator WHERE "workId"=$1 AND "userId"=$2', [f.workId, f.commenter]);
    await expect(repository.read(f.commenter, f.workId, f.input.noteId)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("keeps delete explicit and prunes expired rows without deleting a shared object still referenced by another note", async () => {
    const f = await fixture(); await repository.create(f.commenter, f.workId, f.input, f.file);
    const second = { ...f.input, operationId: randomUUID(), noteId: randomUUID(), title: "Second" };
    await repository.create(f.owner, f.workId, second, f.file);
    const removed = await repository.delete(f.commenter, f.workId, f.input.noteId, { operationId: randomUUID(), expectedSha256: f.sha256 });
    expect(removed.deleteObject).toBe(false);
    const final = await repository.delete(f.owner, f.workId, second.noteId, { operationId: randomUUID(), expectedSha256: f.sha256 });
    expect(final.deleteObject).toBe(true);
    const expiredId = randomUUID(), expiredOperation = randomUUID(), expiredRequest = "c".repeat(64);
    await pool.query(`INSERT INTO studio_review_voice_note (id,"workId","reviewId","revisionId","rootGraphHash",subject,"authorUserId",title,transcript,
      "durationMs","contentType","byteLength",sha256,"objectReference","requestHash","operationId","createdAt","expiresAt")
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,'Expired','Expired explanation',1200,'audio/webm',$8,$9,$10::jsonb,$11,$12,
        statement_timestamp()-interval '2 days',statement_timestamp()-interval '1 day')`, [expiredId, f.workId, f.subject.reviewId, f.subject.revisionId,
      f.subject.rootGraphHash, JSON.stringify(f.subject), f.owner, f.object.byteLength, f.sha256, JSON.stringify(f.object), expiredRequest, expiredOperation]);
    const expired = await repository.claimExpired();
    expect(expired).toEqual([{ object: f.object, deleteObject: true }]);
  });
});
