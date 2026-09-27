import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { validatePostgresIntegrationUrl } from "./run-postgres-integration-tests.mjs";
const target = process.env.TEST_DATABASE_URL;
const schema = `release_${randomUUID().replaceAll("-", "")}`;
const read = (name) => readFileSync(new URL(`../apps/api/src/platform/database/migrations/${name}.sql`, import.meta.url), "utf8");
const scoped = (sql) => sql.replaceAll("public.", `${schema}.`).replaceAll("search_path = pg_catalog, public", `search_path = pg_catalog, ${schema}`).replaceAll("search_path=pg_catalog,public", `search_path=pg_catalog,${schema}`);
const migration = scoped(read("0093_review_voice_note_constraints_repair"));
describe.skipIf(!target)("운영 음성 리뷰 검증 전진 마이그레이션", () => {
  let client;
  let createdAnon = false;
  const hash = "a".repeat(64);
  const subject = { schemaVersion: 1, workId: "work", reviewId: "review", revisionId: "revision", rootGraphHash: hash, projectId: "project", artifactId: "artifact" };
  const object = { contractVersion: "toonspectrum.private-object-storage.v2", purpose: "derived", contentType: "audio/webm", byteLength: 128, digest: `sha256:${hash}`, providerId: "supabase", objectPath: `sha256/aa/${hash}` };
  const add = (id, snapshot = subject) => client.query(`INSERT INTO studio_review_voice_note
    (id,"workId","reviewId","revisionId","rootGraphHash",subject,"authorUserId",title,transcript,"durationMs","contentType","byteLength",sha256,"objectReference","requestHash","operationId","createdAt","expiresAt")
    VALUES($1,'work','review','revision',$2,$3,'author','검토','설명',1000,'audio/webm',128,$2,$4,$2,$1,now(),now()+interval '1 day')`, [id, hash, snapshot, object]);
  beforeAll(async () => {
    validatePostgresIntegrationUrl(target);
    client = new pg.Client({ connectionString: target, options: `-c search_path=${schema}` });
    await client.connect();
    await client.query(`CREATE SCHEMA ${schema}; CREATE TABLE "user"(id text PRIMARY KEY);
      CREATE TABLE creator_work(id text PRIMARY KEY); INSERT INTO "user" VALUES('author'); INSERT INTO creator_work VALUES('work');`);
    await client.query(scoped(read("0090_studio_review_voice_note")));
    // 운영의 부분 스키마를 로컬 일회성 fixture에만 재현한다.
    await client.query(`ALTER TABLE studio_review_voice_note DROP CONSTRAINT studio_review_voice_note_retention,
      DROP CONSTRAINT studio_review_voice_note_delete_state, DROP CONSTRAINT studio_review_voice_note_subject,
      DROP CONSTRAINT studio_review_voice_note_object; DROP TRIGGER studio_review_voice_note_guard_update ON studio_review_voice_note;`);
    await add("legacy-note");
    if (!(await client.query("SELECT 1 FROM pg_roles WHERE rolname='anon'")).rowCount) {
      await client.query("CREATE ROLE anon NOLOGIN"); createdAnon = true;
    }
    await client.query(`GRANT USAGE ON SCHEMA ${schema} TO anon; GRANT SELECT,INSERT ON studio_review_voice_note TO anon;`);
  });
  afterAll(async () => {
    if (client) { await client.query("ROLLBACK"); await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); if (createdAnon) await client.query("DROP ROLE anon"); await client.end(); }
  });
  it("기존 본문·객체·해시를 보존하며 누락된 검증을 복구한다", async () => {
    const before = (await client.query("SELECT to_jsonb(t) value FROM studio_review_voice_note t")).rows[0].value;
    await client.query(migration);
    expect((await client.query("SELECT to_jsonb(t) value FROM studio_review_voice_note t")).rows[0].value).toEqual(before);
    const result = await client.query(`SELECT count(*)::integer n FROM pg_constraint WHERE conrelid='${schema}.studio_review_voice_note'::regclass AND convalidated AND conname IN ('studio_review_voice_note_retention','studio_review_voice_note_delete_state','studio_review_voice_note_subject','studio_review_voice_note_object','studio_review_voice_note_release_bounds')`);
    expect(result.rows[0].n).toBe(5);
  });
  it("누락된 JSON 필드와 본문 변조 및 직접 삭제를 거부한다", async () => {
    await expect(add("invalid-note", { projectId: "project", artifactId: "artifact" })).rejects.toMatchObject({code:"23514"});
    await expect(client.query("UPDATE studio_review_voice_note SET transcript='변조' WHERE id='legacy-note'")).rejects.toMatchObject({code:"P0001"});
    await expect(client.query("DELETE FROM studio_review_voice_note WHERE id='legacy-note'")).rejects.toMatchObject({code:"P0001"});
  });
  it("공개 역할은 권한이 잘못 부여돼도 RLS로 기존 행 조회와 새 쓰기를 거부한다", async () => {
    await client.query("SET ROLE anon");
    try {
      expect((await client.query("SELECT count(*)::integer n FROM studio_review_voice_note")).rows[0].n).toBe(0);
      await expect(add("anonymous-note")).rejects.toMatchObject({code:"42501"});
    } finally { await client.query("RESET ROLE"); }
    expect((await client.query("SELECT count(*)::integer n FROM studio_review_voice_note")).rows[0].n).toBe(1);
  });
  it("재적용해도 기존 행과 해시가 바뀌지 않는다", async () => {
    const before = (await client.query("SELECT to_jsonb(t) value FROM studio_review_voice_note t")).rows[0].value;
    await client.query(migration);
    expect((await client.query("SELECT to_jsonb(t) value FROM studio_review_voice_note t")).rows[0].value).toEqual(before);
  });
  it("잘못된 기존 행을 발견하면 전체 DDL을 롤백한다", async () => {
    await client.query("ALTER TABLE studio_review_voice_note DROP CONSTRAINT studio_review_voice_note_subject");
    await add("bad-existing-note", { projectId: "project", artifactId: "artifact" });
    await expect(client.query(migration)).rejects.toMatchObject({code:"23514"});
    await client.query("ROLLBACK");
    const check = await client.query(`SELECT count(*)::integer n FROM pg_constraint WHERE conrelid='${schema}.studio_review_voice_note'::regclass AND conname='studio_review_voice_note_subject'`);
    expect(check.rows[0].n).toBe(0);
    expect((await client.query("SELECT count(*)::integer n FROM studio_review_voice_note")).rows[0].n).toBe(2);
  });
});
