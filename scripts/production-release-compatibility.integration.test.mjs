import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { validatePostgresIntegrationUrl } from "./run-postgres-integration-tests.mjs";
const target = process.env.TEST_DATABASE_URL;
const schema = `release_${randomUUID().replaceAll("-", "")}`;
const read = (name) => readFileSync(new URL(`../apps/api/src/platform/database/migrations/${name}.sql`, import.meta.url), "utf8");
const scoped = (sql) => sql.replaceAll("public.", `${schema}.`).replaceAll("search_path = pg_catalog, public", `search_path = pg_catalog, ${schema}`).replaceAll("search_path=pg_catalog,public", `search_path=pg_catalog,${schema}`);
const migration = scoped(read("0093_release_brand_compatibility"));
describe.skipIf(!target)("운영 브랜드 호환 전진 마이그레이션", () => {
  let client;
  beforeAll(async () => {
    validatePostgresIntegrationUrl(target);
    client = new pg.Client({ connectionString: target, options: `-c search_path=${schema}` });
    await client.connect();
    await client.query(`CREATE SCHEMA ${schema};
      CREATE TABLE "user"(id text PRIMARY KEY);
      CREATE TABLE creator_work(id text PRIMARY KEY);
      CREATE TABLE creator_asset(id text PRIMARY KEY, license text NOT NULL);
      CREATE TABLE creator_marketplace_resource(id text PRIMARY KEY, license text NOT NULL);
      CREATE TABLE creator_marketplace_resource_report(evidence jsonb, "resourceSnapshotId" text, "resourceId" text,
        "packagePublisherIdSnapshot" text, "packageIdSnapshot" text, "packageModerationRevision" integer, "packageReportEpoch" integer);
      CREATE TABLE creator_asset_storage_object(id text PRIMARY KEY, "contractVersion" text NOT NULL);
      CREATE TABLE creator_asset_processing_run(id text PRIMARY KEY, "sourceDigest" text, "toolchainDigest" text, "pipelineProfile" text, "pipelineVersion" integer);
      CREATE TABLE creator_asset_artifact_set(id text PRIMARY KEY, "processingRunId" text, "sourceDigest" text, "toolchainDigest" text, "entryKind" text, descriptor jsonb NOT NULL);
      INSERT INTO "user" VALUES('author'); INSERT INTO creator_work VALUES('work');
      INSERT INTO creator_asset VALUES('legacy','toonspectrum-standard');
      INSERT INTO creator_asset_storage_object VALUES('legacy','toonspectrum.private-object-storage.v2');`);
    await client.query(scoped(read("0090_studio_review_voice_note")));
    // 운영에서 발견한 부분 스키마를 재현한다. 사용자 DB에는 이 준비 SQL을 실행하지 않는다.
    await client.query(`ALTER TABLE studio_review_voice_note DROP CONSTRAINT studio_review_voice_note_retention,
      DROP CONSTRAINT studio_review_voice_note_delete_state, DROP CONSTRAINT studio_review_voice_note_subject,
      DROP CONSTRAINT studio_review_voice_note_object; DROP TRIGGER studio_review_voice_note_guard_update ON studio_review_voice_note;`);
  });
  afterAll(async () => {
    if (client) { await client.query("ROLLBACK"); await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await client.end(); }
  });
  it("기존 식별자를 보존하고 누락된 제약과 트리거를 복구한다", async () => {
    await client.query(migration);
    expect((await client.query("SELECT license FROM creator_asset WHERE id='legacy'")).rows[0].license).toBe("toonspectrum-standard");
    expect((await client.query(`SELECT "contractVersion" FROM creator_asset_storage_object WHERE id='legacy'`)).rows[0].contractVersion).toBe("toonspectrum.private-object-storage.v2");
    const result = await client.query(`SELECT count(*)::integer n FROM pg_constraint WHERE conrelid='${schema}.studio_review_voice_note'::regclass AND convalidated AND conname IN ('studio_review_voice_note_retention','studio_review_voice_note_delete_state','studio_review_voice_note_subject','studio_review_voice_note_object','studio_review_voice_note_release_bounds')`);
    expect(result.rows[0].n).toBe(5);
    const trigger = await client.query(`SELECT count(*)::integer n FROM pg_trigger WHERE tgrelid='${schema}.studio_review_voice_note'::regclass AND tgname='studio_review_voice_note_guard_update' AND tgenabled='O'`);
    expect(trigger.rows[0].n).toBe(1);
  });
  it("구형·신형 쓰기를 허용하되 알 수 없는 사용권은 거부한다", async () => {
    await client.query("INSERT INTO creator_asset VALUES('current','toonstudio-standard')");
    await expect(client.query("INSERT INTO creator_asset VALUES('invalid','unknown-standard')")).rejects.toMatchObject({code:"23514"});
    await client.query("INSERT INTO creator_asset_storage_object VALUES('current','toonstudio.private-object-storage.v2')");
    await expect(client.query("INSERT INTO creator_asset_storage_object VALUES('invalid','untrusted.v3')")).rejects.toMatchObject({code:"23514"});
  });
  it("같은 마이그레이션을 재적용해도 기존 행이 바뀌지 않는다", async () => {
    const before = (await client.query("SELECT jsonb_agg(t ORDER BY id) data FROM creator_asset t")).rows[0].data;
    await client.query(migration);
    expect((await client.query("SELECT jsonb_agg(t ORDER BY id) data FROM creator_asset t")).rows[0].data).toEqual(before);
  });
  it("잘못된 기존 데이터가 있으면 전체 DDL이 롤백된다", async () => {
    await client.query("ALTER TABLE creator_asset DROP CONSTRAINT creator_asset_license_check; INSERT INTO creator_asset VALUES('legacy-invalid','invalid')");
    await expect(client.query(migration)).rejects.toMatchObject({code:"23514"});
    await client.query("ROLLBACK");
    const check = await client.query(`SELECT count(*)::integer n FROM pg_constraint WHERE conrelid='${schema}.creator_asset'::regclass AND conname='creator_asset_license_check'`);
    expect(check.rows[0].n).toBe(0);
    expect((await client.query("SELECT count(*)::integer n FROM creator_asset")).rows[0].n).toBe(3);
  });
});
