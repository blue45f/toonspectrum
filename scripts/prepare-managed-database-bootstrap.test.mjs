import { createHash } from "node:crypto";

import { describe, expect, test } from "vitest";

import { loadBootstrapContract } from "./bootstrap-empty-production-database.mjs";
import { loadHealthReadinessContract } from "./verify-production-database-capabilities.mjs";
import {
  buildManagedInitialRows,
  buildManagedRoleVerificationAccessSql,
  buildManagedRuntimeAclSql,
  parseManagedBootstrapArguments,
  prepareManagedBootstrap,
  splitDumpStatements,
  validateManagedRuntimeRole,
  validateManagedSchemaDump,
} from "./prepare-managed-database-bootstrap.mjs";

const RELEASE = "a".repeat(40);
const ROLE = "toonspectrum_runtime";
const schemaDump = `-- PostgreSQL database dump
\\restrict abc123
SET statement_timeout = 0;
SET client_encoding = 'UTF8';
SELECT pg_catalog.set_config('search_path', '', false);
CREATE SCHEMA public;
CREATE SCHEMA toonspectrum_ops;
CREATE TABLE public."user" (id text PRIMARY KEY);
CREATE TABLE public.creator_work (id text PRIMARY KEY);
CREATE TABLE toonspectrum_ops.deployment_migration (id text PRIMARY KEY);
CREATE FUNCTION public.test_guard() RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF NEW.id = 'a; b' THEN RAISE EXCEPTION 'bad'; END IF;
  RETURN NEW;
END;
$function$;
CREATE INDEX work_search ON public.creator_work USING gin (id public.gin_trgm_ops);
ALTER TABLE ONLY public.creator_work ADD CONSTRAINT creator_work_id_nonempty CHECK (length(id)>0);
\\unrestrict abc123
`;
const digest = (value) => createHash("sha256").update(value).digest("hex");

describe("관리형 빈 DB bootstrap SQL 준비", () => {
  test("검토된 pg_dump의 public/ops 객체만 남기고 관리 schema는 생성하지 않는다", () => {
    const result = validateManagedSchemaDump(schemaDump, digest(schemaDump));
    expect(result.statementCount).toBe(7);
    expect(result.sql).toContain("CREATE SCHEMA toonspectrum_ops;");
    expect(result.sql).not.toContain("CREATE SCHEMA public");
    expect(result.sql).not.toContain("\\restrict");
    expect(result.sql).not.toContain("SET statement_timeout");
    expect(result.sql).toContain("extensions.gin_trgm_ops");
  });

  test("schema hash 불일치와 함수 본문의 미종결 quote를 차단한다", () => {
    expect(() => validateManagedSchemaDump(schemaDump, "0".repeat(64))).toThrow(/SHA-256/u);
    expect(() => splitDumpStatements("CREATE FUNCTION public.test() AS $$ BEGIN;")).toThrow(/종료되지/u);
  });

  test("주석의 storage 단어를 관리 schema 변경으로 오인하지 않는다", () => {
    const input = `${schemaDump}\nCOMMENT ON TABLE public.creator_work IS 'Derived storage. No user rows.';`;
    expect(validateManagedSchemaDump(input, digest(input)).sql).toContain("Derived storage.");
  });

  test("함수 본문·인용 식별자·주석의 세미콜론을 statement로 분리하지 않는다", () => {
    const statements = splitDumpStatements(`/* outside ; */ CREATE FUNCTION public.fn() RETURNS text AS $fn$ SELECT 'x;''y'; $fn$ LANGUAGE sql; -- end ;\n COMMENT ON FUNCTION public.fn() IS 'text;';`);
    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain("SELECT 'x;''y';");
  });

  test.each([
    "INSERT INTO public.\"user\" VALUES ('private-data');",
    "COPY public.\"user\" FROM STDIN;",
    "DROP SCHEMA public CASCADE;",
    "ALTER TABLE public.creator_work OWNER TO postgres;",
    "ALTER TABLE public.creator_work SET SCHEMA storage;",
    "CREATE TABLE auth.extra (id text);",
    "CREATE TABLE toonspectrum_federation.extra (id text);",
    "CREATE EXTENSION dblink;",
    "CREATE ROLE stranger LOGIN;",
    "GRANT ALL ON public.creator_work TO anon;",
    "SELECT pg_catalog.setval('public.some_seq', 1);",
    "DO $$ BEGIN RAISE NOTICE 'arbitrary'; END $$;",
    "\\include private-file.sql\n",
  ])("데이터·관리 객체·임의 실행을 입력 dump에서 거부한다: %s", (statement) => {
    const input = `${schemaDump}\n${statement}\n`;
    expect(() => validateManagedSchemaDump(input, digest(input))).toThrow();
  });

  test("서버 파일 접근은 함수 본문 안에서도 거부한다", () => {
    const input = `${schemaDump}\nCREATE FUNCTION public.read_secret() RETURNS text LANGUAGE sql AS $$ SELECT pg_read_file('/server/file'); $$;`;
    expect(() => validateManagedSchemaDump(input, digest(input))).toThrow(/파일/u);
  });

  test("Supabase·PostgreSQL 관리 역할은 runtime으로 사용할 수 없다", () => {
    for (const role of ["postgres", "anon", "authenticated", "service_role", "pg_signal_backend", "supabase_admin"]) {
      expect(() => validateManagedRuntimeRole(role)).toThrow(/관리형/u);
    }
    expect(validateManagedRuntimeRole(ROLE)).toBe(ROLE);
  });

  test("초기 행은 92개 정본 원장과 모든 필수 cutover 및 소스의 초기 설정뿐이다", () => {
    const contract = loadBootstrapContract();
    const result = buildManagedInitialRows(contract, RELEASE);
    expect(result.ledgerCount).toBe(contract.manifest.length + 1);
    expect(result.ledgerCount).toBe(92);
    for (const entry of contract.manifest) expect(result.sql).toContain(entry.checksum);
    for (const marker of loadHealthReadinessContract().migrationIds) expect(result.sql).toContain(marker);
    expect(result.sql).toContain("'0023_production_migration_ledger'");
    expect(result.sql).toContain("'bootstrap'");
    expect(result.sql).toContain("INSERT INTO public.supporter_funding_setting");
    expect(result.sql).toContain("INSERT INTO production_operation_policy");
    expect(result.sql).not.toMatch(/INSERT INTO public\."?user"?\s/iu);
    expect(() => buildManagedInitialRows(contract, "main")).toThrow(/40자리/u);
  });

  test("ACL은 정본 builder를 재사용하고 psql 메타 명령을 남기지 않는다", () => {
    const sql = buildManagedRuntimeAclSql(ROLE);
    expect(sql).not.toContain("\\gexec");
    expect(sql).toContain("DO $connect$");
    expect(sql).toContain("creator_hiring_campaign");
    expect(sql).toContain("studio_review_policy_actor_epoch");
    expect(sql).toContain("REVOKE ALL ON SCHEMA toonspectrum_ops FROM PUBLIC");
    expect(splitDumpStatements(sql).filter((statement) => /^(?:BEGIN|COMMIT)$/iu.test(statement))).toEqual([]);
  });

  test("단일 transaction·빈 대상 guard·Data API 차단·최종 검증·NOLOGIN 종료를 생성한다", () => {
    const bundle = prepareManagedBootstrap({ schemaDump, expectedSchemaSha256: digest(schemaDump), releaseSha: RELEASE, runtimeRole: ROLE });
    expect(bundle.report).toMatchObject({ status: "prepared-unverified", sourceDataRead: false, databaseWritesPerformed: false, migrationLedgerRows: 92 });
    expect(bundle.report.preparedSqlSha256).toBe(digest(bundle.sql));
    expect(bundle.sql).toContain("NOLOGIN NOINHERIT NOSUPERUSER");
    expect(bundle.sql).toContain("to_regnamespace('toonspectrum_ops') IS NOT NULL");
    expect(bundle.sql).toContain("ARRAY['anon','authenticated','service_role']");
    expect(bundle.sql).toContain("ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES");
    expect(bundle.sql).toContain("SET LOCAL check_function_bodies = false;");
    expect(bundle.sql).toContain("SET LOCAL check_function_bodies = true;");
    expect(bundle.sql).toContain("migration ledger is missing exact applied checksums");
    expect(bundle.sql.trimEnd()).toMatch(/ALTER ROLE "toonspectrum_runtime" NOLOGIN;\nCOMMIT;$/u);
    expect(bundle.sql).not.toMatch(/DROP SCHEMA|DROP EXTENSION|ALTER SCHEMA|PASSWORD\s+'/iu);
    expect(bundle.verificationSql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|CREATE)\s+(?:INTO|ALL|ON|TABLE|ROLE)/iu);
    expect(bundle.verificationSql).toContain("Supabase Data API 역할");
    expect(splitDumpStatements(bundle.sql).filter((statement) => /^(?:BEGIN|COMMIT)$/iu.test(statement))).toEqual(["BEGIN", "COMMIT"]);
    expect(bundle.verificationSql.trimEnd()).toMatch(/ROLLBACK;$/u);
    expect(bundle.verificationSql).toContain("set_config('role', current_setting('toonspectrum.bootstrap_saved_role'), true)");
  });

  test("비superuser 역할 검증은 자기 grantor만 임시 변경하고 원상 복원한다", () => {
    const grant = buildManagedRoleVerificationAccessSql(ROLE);
    const restore = buildManagedRoleVerificationAccessSql(ROLE, { restore: true });
    expect(grant).toContain("pg_has_role(current_user, 'toonspectrum_runtime', 'SET')");
    expect(grant).toContain("m.grantor=(SELECT oid FROM pg_roles WHERE rolname=current_user)");
    expect(grant).toContain("coalesce(previous->>'inherit','false')");
    expect(grant).toContain("coalesce(previous->>'admin','false')");
    expect(restore).toContain("REVOKE %I FROM %I GRANTED BY %I");
    expect(restore).toContain("saved->'previous'->>'set'");
  });

  test("CLI는 기존 출력이나 암묵적인 release/runtime을 허용하지 않는다", () => {
    expect(() => parseManagedBootstrapArguments([])).toThrow(/필수/u);
    expect(() => parseManagedBootstrapArguments(["--execute", "yes"])).toThrow();
    expect(parseManagedBootstrapArguments([
      "--schema-file", "/tmp/blank-schema.sql", "--schema-sha256", digest(schemaDump),
      "--release-sha", RELEASE, "--runtime-role", ROLE, "--output-directory", "/tmp/new-bundle",
    ])).toMatchObject({ extensionSchema: "extensions", runtimeRole: ROLE });
  });
});
