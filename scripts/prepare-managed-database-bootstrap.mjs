#!/usr/bin/env node

import { createHash } from "node:crypto";
import { closeSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { loadBootstrapContract, buildRuntimeBootstrapAclSql } from "./bootstrap-empty-production-database.mjs";
import * as migrations from "./run-production-database-migrations.mjs";
import { buildProductionCapabilityVerificationSql, loadHealthReadinessContract } from "./verify-production-database-capabilities.mjs";
import { buildAdminRuntimeAclSql } from "./admin-database-contract.mjs";
import { buildFeedbackRuntimeAclSql } from "./feedback-database-contract.mjs";
import { buildCommunityCafeRuntimeAclSql } from "./community-cafe-database-contract.mjs";
import { buildHiringRuntimeAclSql } from "./creator-hiring-database-contract.mjs";
import { buildHiringAutomationRuntimeAclSql } from "./creator-hiring-automation-database-contract.mjs";
import { buildFortuneSnapshotRuntimeAclSql } from "./fortune-snapshot-database-contract.mjs";
import { buildCareerConfirmationRuntimeAclSql } from "./creator-career-confirmation-database-contract.mjs";
import { buildProductionOperationsRuntimeAclSql } from "./production-operations-database-contract.mjs";

export const MANAGED_BOOTSTRAP_VERSION = "toonspectrum.managed-bootstrap-preparation.v1";
const ALLOWED_SCHEMAS = new Set(["public", "toonspectrum_ops"]);
const MANAGED_ROLES = ["anon", "authenticated", "service_role"];
const MARKER = "__managed_history_through_0019__";

function fail(message) {
  throw new Error(message);
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function literal(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function validateManagedRuntimeRole(value) {
  migrations.validateRuntimeDatabaseRole(value);
  if (["postgres", ...MANAGED_ROLES].includes(value) || /^(?:pg_|supabase_)/u.test(value)) {
    fail("관리형 DB 내장 역할을 앱 runtime 역할로 사용할 수 없습니다.");
  }
  return value;
}

// 신뢰된 로컬 pg_dump 산출물 전용이다. 임의 SQL을 안전하게 실행하는 sandbox가 아니다.
// 문자열·함수 본문의 세미콜론을 보존하며 최상위 statement의 범위만 검사한다.
export function splitDumpStatements(source) {
  const statements = [];
  let buffer = "";
  let quote = "";
  let dollar = "";
  let blockDepth = 0;
  let lineComment = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (char === "\n") { lineComment = false; buffer += "\n"; }
      continue;
    }
    if (blockDepth > 0) {
      if (char === "/" && next === "*") { blockDepth += 1; index += 1; }
      else if (char === "*" && next === "/") { blockDepth -= 1; index += 1; }
      continue;
    }
    if (dollar) {
      if (source.startsWith(dollar, index)) {
        buffer += dollar;
        index += dollar.length - 1;
        dollar = "";
      } else buffer += char;
      continue;
    }
    if (quote) {
      buffer += char;
      if (char === quote && next === quote) { buffer += next; index += 1; }
      else if (char === quote) quote = "";
      continue;
    }
    if (char === "-" && next === "-") { lineComment = true; index += 1; continue; }
    if (char === "/" && next === "*") { blockDepth = 1; index += 1; buffer += " "; continue; }
    if (char === "'" || char === '"') { quote = char; buffer += char; continue; }
    if (char === "$") {
      const token = /^(?:\$[a-zA-Z_][a-zA-Z0-9_]*\$|\$\$)/u.exec(source.slice(index))?.[0];
      if (token) { dollar = token; buffer += token; index += token.length - 1; continue; }
    }
    if (char === ";") {
      if (buffer.trim()) statements.push(buffer.trim());
      buffer = "";
    } else buffer += char;
  }
  if (quote || dollar || blockDepth > 0 || buffer.trim()) {
    fail("schema dump에 종료되지 않은 SQL이 있습니다. pg_dump 산출물을 다시 확인하세요.");
  }
  return statements;
}

function objectSchema(statement) {
  const qualified = '(?:"?(public|toonspectrum_ops)"?)\\.';
  const prefixes = [
    `^(?:CREATE|ALTER) (?:UNLOGGED )?(?:TABLE|SEQUENCE|FUNCTION|PROCEDURE|TYPE|DOMAIN|VIEW|MATERIALIZED VIEW)(?: ONLY)? ${qualified}`,
    `^CREATE (?:UNIQUE )?INDEX [\\s\\S]*? ON (?:ONLY )?${qualified}`,
    `^CREATE (?:CONSTRAINT )?TRIGGER [\\s\\S]*? ON ${qualified}`,
    `^CREATE POLICY [\\s\\S]*? ON ${qualified}`,
    `^COMMENT ON (?:TABLE|SEQUENCE|FUNCTION|PROCEDURE|TYPE|DOMAIN|VIEW|MATERIALIZED VIEW|COLUMN|INDEX) ${qualified}`,
    `^COMMENT ON (?:CONSTRAINT|TRIGGER|POLICY) [\\s\\S]*? ON ${qualified}`,
  ];
  for (const pattern of prefixes) {
    const match = new RegExp(pattern, "iu").exec(statement);
    if (match) return match[1];
  }
  return null;
}

export function validateManagedSchemaDump(source, expectedSha256, { extensionSchema = "extensions" } = {}) {
  if (!/^[a-f0-9]{64}$/u.test(expectedSha256) || hash(source) !== expectedSha256) {
    fail("schema-only dump의 SHA-256이 검토한 값과 다릅니다.");
  }
  if (!["public", "extensions"].includes(extensionSchema)) fail("pg_trgm schema는 public 또는 extensions만 허용합니다.");
  if (!/^-- PostgreSQL database dump\s*$/mu.test(source)) fail("pg_dump schema-only 산출물이 필요합니다.");
  if (/\b(?:pg_read_file|pg_read_binary_file|pg_ls_dir|lo_import|lo_export|dblink_connect)\s*\(|\bCOPY\b[^;]*\bPROGRAM\b/iu.test(source)) {
    fail("파일 또는 외부 명령을 실행하는 dump는 허용하지 않습니다.");
  }
  if (/\\(?!restrict [a-zA-Z0-9]+\s*$|unrestrict [a-zA-Z0-9]+\s*$)/mu.test(source)) {
    // pg_dump의 restrict 표시는 SQL이 아니므로 제거하고 나머지 psql 명령은 거부한다.
    if (/^\s*\\(?!restrict [a-zA-Z0-9]+\s*$|unrestrict [a-zA-Z0-9]+\s*$)/mu.test(source)) {
      fail("pg_dump restrict 이외의 psql 명령은 허용하지 않습니다.");
    }
  }
  const withoutGuards = source.replace(/^\s*\\(?:un)?restrict [a-zA-Z0-9]+\s*$/gmu, "");
  const statements = splitDumpStatements(withoutGuards);
  const output = [];
  for (const statement of statements) {
    if (/^SET (?:statement_timeout|lock_timeout|idle_in_transaction_session_timeout|transaction_timeout|client_encoding|standard_conforming_strings|check_function_bodies|xmloption|client_min_messages|row_security|default_tablespace|default_table_access_method) = [^;]+$/iu.test(statement)) continue;
    if (/^SELECT pg_catalog\.set_config\('search_path', '', false\)$/u.test(statement)) continue;
    const schemaCreation = /^CREATE SCHEMA "?([a-z_]+)"?$/iu.exec(statement);
    if (schemaCreation && ALLOWED_SCHEMAS.has(schemaCreation[1])) {
      if (schemaCreation[1] !== "public") output.push("CREATE SCHEMA toonspectrum_ops");
      continue;
    }
    if (/^COMMENT ON SCHEMA "?(?:public|toonspectrum_ops)"? IS /iu.test(statement)) continue;
    if (!objectSchema(statement)
      || /\b(?:OWNER TO|SET SCHEMA|ATTACH PARTITION|DETACH PARTITION)\b/iu.test(statement)
      || /\bREFERENCES\s+"?(?:auth|storage|supabase_migrations|toonspectrum_federation)"?\./iu.test(statement)) {
      fail("dump에 허용 범위를 벗어난 SQL이 있습니다. public/toonspectrum_ops의 --schema-only --no-owner --no-privileges dump만 사용하세요.");
    }
    output.push(statement.replaceAll("public.gin_trgm_ops", `${extensionSchema}.gin_trgm_ops`)
      .replaceAll("public.gist_trgm_ops", `${extensionSchema}.gist_trgm_ops`));
  }
  if (!output.some((sql) => /^CREATE TABLE public\."?user"?\s*\(/iu.test(sql))
    || !output.some((sql) => /^CREATE TABLE toonspectrum_ops\.deployment_migration\s*\(/iu.test(sql))) {
    fail("dump에 앱 기본 테이블과 정본 migration 원장이 모두 있어야 합니다.");
  }
  return { sql: `${output.join(";\n\n")};\n`, statementCount: output.length, sourceSha256: expectedSha256 };
}

export function buildManagedInitialRows(contract, releaseSha) {
  if (!/^[a-f0-9]{40}$/u.test(releaseSha)) fail("검토한 40자리 release SHA가 필요합니다.");
  const markerIds = [];
  for (const migration of contract.manifest) {
    const pattern = /INSERT INTO (?:public\.)?"?toonspectrum_schema_migration"?\s*\([\s\S]*?\)\s*VALUES\s*\(\s*'([a-z0-9_]+)'/gu;
    markerIds.push(...[...migration.contents.matchAll(pattern)].map((match) => match[1]));
  }
  const cutovers = [...new Set(markerIds)].sort();
  if (loadHealthReadinessContract().migrationIds.some((id) => !cutovers.includes(id))) {
    fail("정본 cutover marker 추출이 현재 readiness 계약을 충족하지 않습니다.");
  }
  const markerChecksum = hash(contract.historical.map((entry) => `${entry.id}:${entry.checksum}\n`).join(""));
  const ledger = contract.manifest.map((entry) => ({
    id: entry.id,
    checksum: entry.checksum,
    provenance: entry.sequence <= 19 ? "adopted" : entry.sequence === 23 ? "bootstrap" : "executed",
  }));
  ledger.push({ id: MARKER, checksum: markerChecksum, provenance: "adopted" });
  const rows = ledger.map((entry) => `(${literal(entry.id)}, ${literal(entry.checksum)}, 'applied', ${literal(entry.provenance)}, ${literal(releaseSha)}, statement_timestamp(), statement_timestamp(), statement_timestamp())`);
  const seeds = [
    ["0071_supporter_payments", /INSERT INTO public\.supporter_funding_setting\s*\([\s\S]*?ON CONFLICT \(id\) DO NOTHING;/u],
    ["0086_production_operation_policy", /INSERT INTO production_operation_policy\(id,payload\)[\s\S]*?ON CONFLICT\(id\) DO NOTHING;/u],
  ].map(([id, expression]) => {
    const sql = expression.exec(contract.manifest.find((entry) => entry.id === id)?.contents ?? "")?.[0];
    if (!sql) fail("검토된 빈 DB 초기 설정을 추출하지 못했습니다.");
    return sql;
  });
  return {
    ledgerCount: ledger.length,
    cutoverCount: cutovers.length,
    sql: `INSERT INTO public.toonspectrum_schema_migration (id, "appliedAt") VALUES\n${cutovers.map((id) => `(${literal(id)}, statement_timestamp())`).join(",\n")};
INSERT INTO toonspectrum_ops.deployment_migration (id, checksum, state, provenance, "releaseSha", "startedAt", "appliedAt", "updatedAt") VALUES\n${rows.join(",\n")};
${seeds.join("\n")}`,
  };
}

export function buildManagedRuntimeAclSql(role) {
  validateManagedRuntimeRole(role);
  const bootstrap = buildRuntimeBootstrapAclSql(role).replace(
    /SELECT format\([\s\S]*?\) \\gexec/u,
    `DO $connect$ BEGIN EXECUTE format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), ${literal(role)}); END $connect$;`,
  );
  if (bootstrap.includes("\\gexec")) fail("psql ACL 명령을 SQL로 변환하지 못했습니다.");
  const builders = [
    migrations.buildAuthRuntimeAclSql, migrations.buildTrafficAnalyticsRuntimeAclSql,
    migrations.buildCreatorRoleWorkspaceRuntimeAclSql, migrations.buildPersonalCloudRuntimeAclSql,
    migrations.buildCommunityCommentRuntimeAclSql, migrations.buildMessagingRuntimeAclSql,
    buildAdminRuntimeAclSql, buildFeedbackRuntimeAclSql, buildCommunityCafeRuntimeAclSql,
    migrations.buildRuntimeCutoverLedgerAclSql, migrations.buildMembershipRuntimeAclSql,
    buildHiringRuntimeAclSql, buildHiringAutomationRuntimeAclSql, buildFortuneSnapshotRuntimeAclSql,
    buildCareerConfirmationRuntimeAclSql, buildProductionOperationsRuntimeAclSql,
    migrations.buildStudioProductionRuntimeAclSql, migrations.buildStudioProjectGraphRuntimeAclSql,
    migrations.buildCreatorMarketplaceRuntimeAclSql, migrations.buildCreatorAssetObjectStorageRuntimeAclSql,
    migrations.buildMigrationLedgerRuntimeAclSql,
  ];
  // 각 정본 helper의 독립 실행용 BEGIN/COMMIT이 전체 bootstrap을 중간 commit하지 못하게 한다.
  return withoutTransactionWrappers([bootstrap, ...builders.map((build) => build(role))].join("\n"));
}

function withoutTransactionWrappers(sql) {
  const output = [];
  let roleChanged = false;
  for (const statement of splitDumpStatements(sql)) {
    if (/^BEGIN$/iu.test(statement)) continue;
    if (/^SET LOCAL ROLE /iu.test(statement)) {
      output.push("SELECT pg_catalog.set_config('toonspectrum.bootstrap_saved_role', current_setting('role'), true)");
      roleChanged = true;
    }
    if (/^COMMIT$/iu.test(statement)) {
      // 독립 helper에서는 COMMIT이 SET LOCAL ROLE도 해제했다. 바깥 transaction에서는 명시 복원한다.
      if (roleChanged) output.push("SELECT pg_catalog.set_config('role', current_setting('toonspectrum.bootstrap_saved_role'), true)");
      roleChanged = false;
      continue;
    }
    output.push(statement);
  }
  if (roleChanged) fail("정본 SQL helper의 runtime 역할 복원 경계를 찾지 못했습니다.");
  return `${output.join(";\n")};\n`;
}

function managedGuardSql(role, extensionSchema) {
  return `DO $managed_bootstrap_guard$
BEGIN
  IF current_setting('server_version_num')::integer / 10000 <> 17 THEN
    RAISE EXCEPTION '검증 대상은 PostgreSQL 17이어야 합니다';
  END IF;
  IF NOT pg_try_advisory_xact_lock(hashtext('toonspectrum-managed-empty-bootstrap')) THEN
    RAISE EXCEPTION '다른 빈 DB bootstrap 작업이 진행 중입니다';
  END IF;
  IF to_regnamespace('toonspectrum_ops') IS NOT NULL OR EXISTS (
    SELECT 1 FROM (
      SELECT c.oid, 'pg_class'::regclass classid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S','f')
      UNION ALL SELECT p.oid, 'pg_proc'::regclass FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
      UNION ALL SELECT t.oid, 'pg_type'::regclass FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
      WHERE n.nspname='public' AND t.typrelid=0 AND t.typelem=0 AND t.typtype IN ('c','d','e','r','m')
    ) o WHERE NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid=o.classid AND d.objid=o.oid AND d.deptype='e')
  ) THEN RAISE EXCEPTION '앱 schema가 비어 있지 않아 중단합니다. 기존 객체를 삭제하지 않습니다'; END IF;
  IF EXISTS (SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='pg_trgm' AND n.nspname<>${literal(extensionSchema)}) THEN
    RAISE EXCEPTION '기존 pg_trgm 위치를 변경하지 않습니다. 검토한 extension schema로 다시 생성하세요';
  END IF;
  IF current_user=${literal(role)} THEN RAISE EXCEPTION 'runtime은 bootstrap을 수행할 수 없습니다'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=${literal(role)}) THEN
    CREATE ROLE "${role}" NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=${literal(role)} AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls))
    OR EXISTS (SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname=${literal(role)})
    OR EXISTS (SELECT 1 FROM pg_stat_activity WHERE usename=${literal(role)} AND pid<>pg_backend_pid())
    OR EXISTS (SELECT 1 FROM pg_database d JOIN pg_roles r ON r.oid=d.datdba WHERE r.rolname=${literal(role)})
    OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner WHERE r.rolname=${literal(role)})
    OR EXISTS (SELECT 1 FROM pg_namespace n JOIN pg_roles r ON r.oid=n.nspowner WHERE r.rolname=${literal(role)})
    OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE r.rolname=${literal(role)})
  THEN RAISE EXCEPTION '신규 NOLOGIN runtime 역할 분리 또는 세션 경계를 확인하지 못했습니다'; END IF;
END $managed_bootstrap_guard$;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA "${extensionSchema}";
REVOKE ALL ON SCHEMA public FROM PUBLIC, "${role}";
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC;
DO $managed_api_defaults$ DECLARE client_role text; BEGIN
  FOREACH client_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=client_role) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA public FROM %I', client_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', client_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', client_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', client_role);
    END IF;
  END LOOP;
END $managed_api_defaults$;`;
}

function managedApiBoundarySql({ harden = true } = {}) {
  return `DO $managed_api_boundary$ DECLARE client_role text; BEGIN
  FOREACH client_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=client_role) THEN
      ${harden ? `EXECUTE format('REVOKE ALL ON SCHEMA public, toonspectrum_ops FROM %I', client_role);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public, toonspectrum_ops FROM %I', client_role);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public, toonspectrum_ops FROM %I', client_role);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public, toonspectrum_ops FROM %I', client_role);` : ""}
      IF has_schema_privilege(client_role,'public','USAGE') OR has_schema_privilege(client_role,'toonspectrum_ops','USAGE') THEN
        RAISE EXCEPTION 'Supabase Data API 역할의 앱 schema 접근이 남아 있습니다';
      END IF;
    END IF;
  END LOOP;
END $managed_api_boundary$;`;
}

export function buildManagedRoleVerificationAccessSql(role, { restore = false } = {}) {
  validateManagedRuntimeRole(role);
  if (restore) {
    return `DO $managed_role_access_restore$
DECLARE saved jsonb := current_setting('toonspectrum.bootstrap_role_access')::jsonb;
BEGIN
  IF (saved->>'changed')::boolean THEN
    IF (saved->>'existed')::boolean THEN
      EXECUTE format('GRANT %I TO %I WITH SET %s, INHERIT %s, ADMIN %s GRANTED BY %I',
        ${literal(role)}, current_user, saved->'previous'->>'set', saved->'previous'->>'inherit', saved->'previous'->>'admin', current_user);
    ELSE
      EXECUTE format('REVOKE %I FROM %I GRANTED BY %I', ${literal(role)}, current_user, current_user);
    END IF;
  END IF;
END $managed_role_access_restore$;`;
  }
  return `DO $managed_role_access$
DECLARE previous jsonb;
BEGIN
  IF pg_has_role(current_user, ${literal(role)}, 'SET') THEN
    PERFORM set_config('toonspectrum.bootstrap_role_access', '{"changed":false}', true);
  ELSE
    SELECT jsonb_build_object('admin',m.admin_option,'inherit',m.inherit_option,'set',m.set_option)
      INTO previous
      FROM pg_auth_members m
      WHERE m.roleid=(SELECT oid FROM pg_roles WHERE rolname=${literal(role)})
        AND m.member=(SELECT oid FROM pg_roles WHERE rolname=current_user)
        AND m.grantor=(SELECT oid FROM pg_roles WHERE rolname=current_user);
    PERFORM set_config('toonspectrum.bootstrap_role_access',
      jsonb_build_object('changed',true,'existed',previous IS NOT NULL,'previous',previous)::text, true);
    -- PG17의 CREATEROLE 자동 ADMIN grant는 SET 권한을 주지 않는다. 자기 grantor 행만 임시 변경한다.
    EXECUTE format('GRANT %I TO %I WITH SET TRUE, INHERIT %s, ADMIN %s GRANTED BY %I',
      ${literal(role)}, current_user, coalesce(previous->>'inherit','false'), coalesce(previous->>'admin','false'), current_user);
  END IF;
END $managed_role_access$;`;
}

export function prepareManagedBootstrap({ schemaDump, expectedSchemaSha256, releaseSha, runtimeRole, extensionSchema = "extensions" }) {
  const role = validateManagedRuntimeRole(runtimeRole);
  const contract = loadBootstrapContract();
  const schema = validateManagedSchemaDump(schemaDump, expectedSchemaSha256, { extensionSchema });
  const initial = buildManagedInitialRows(contract, releaseSha);
  const verifySql = withoutTransactionWrappers(buildProductionCapabilityVerificationSql(role));
  const sql = `-- 신뢰된 로컬 빈 DB의 정본 bootstrap 산출물 전용. 사용자 데이터 이관 없음.
-- 생성기 실행만으로 로컬 복구 검증이나 운영 반영이 완료되지는 않는다.
BEGIN;
SET LOCAL search_path = public, extensions, pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '10min';
${managedGuardSql(role, extensionSchema)}
SET LOCAL check_function_bodies = false;
${schema.sql}
SET LOCAL check_function_bodies = true;
${initial.sql}
${buildManagedRuntimeAclSql(role)}
${managedApiBoundarySql()}
ALTER ROLE "${role}" LOGIN;
${buildManagedRoleVerificationAccessSql(role)}
${verifySql}
${buildManagedRoleVerificationAccessSql(role, { restore: true })}
ALTER ROLE "${role}" NOLOGIN;
COMMIT;
`;
  return {
    sql,
    verificationSql: `-- PG17 비superuser 검증 역할의 임시 SET 권한까지 마지막 ROLLBACK으로 복원한다.\nBEGIN;\nSET LOCAL search_path = public, extensions, pg_catalog;\n${buildManagedRoleVerificationAccessSql(role)}\n${verifySql}\n${managedApiBoundarySql({ harden: false })}\n${buildManagedRoleVerificationAccessSql(role, { restore: true })}\nROLLBACK;\n`,
    report: {
      version: MANAGED_BOOTSTRAP_VERSION,
      status: "prepared-unverified",
      releaseSha,
      runtimeRole: role,
      runtimeActivation: "별도 안전 경로에서 비밀번호와 LOGIN을 설정한 뒤 final-verification.sql을 실행해야 합니다.",
      verificationMode: "runtime SET 역할 권한을 transaction 내 임시 부여하고 최종 ROLLBACK으로 모든 변경을 취소합니다.",
      schemaSha256: schema.sourceSha256,
      preparedSqlSha256: hash(sql),
      bootstrapContractFingerprint: contract.fingerprint,
      schemaStatements: schema.statementCount,
      migrationLedgerRows: initial.ledgerCount,
      cutoverMarkers: initial.cutoverCount,
      preservedSchemas: ["auth", "storage", "supabase_migrations", "toonspectrum_federation"],
      requiredReference: "이 release의 정본 bootstrap과 capability 검사를 통과한 로컬 PostgreSQL 17의 public/toonspectrum_ops schema-only dump",
      validationRequired: "운영 적용 전에 관리 schema·Data API 역할을 둔 폐기형 PostgreSQL 17에서 전체 SQL과 최종 verifier를 검증하세요.",
      sourceDataRead: false,
      databaseWritesPerformed: false,
    },
  };
}

export function parseManagedBootstrapArguments(argv) {
  const values = new Map();
  const keys = new Set(["--schema-file", "--schema-sha256", "--release-sha", "--runtime-role", "--extension-schema", "--output-directory"]);
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!keys.has(key) || values.has(key) || !value || value.startsWith("--")) fail("schema 파일·SHA·release·runtime·출력 디렉터리를 중복 없이 지정하세요.");
    values.set(key, value);
  }
  for (const key of ["--schema-file", "--schema-sha256", "--release-sha", "--runtime-role", "--output-directory"]) {
    if (!values.has(key)) fail("필수 입력은 --schema-file --schema-sha256 --release-sha --runtime-role --output-directory입니다.");
  }
  return {
    schemaFile: values.get("--schema-file"),
    expectedSchemaSha256: values.get("--schema-sha256"),
    releaseSha: values.get("--release-sha"),
    runtimeRole: values.get("--runtime-role"),
    extensionSchema: values.get("--extension-schema") ?? "extensions",
    outputDirectory: values.get("--output-directory"),
  };
}

export function writeManagedBootstrapBundle(outputDirectory, bundle, { writeFile = writeFileSync } = {}) {
  const output = resolve(outputDirectory);
  // 빈 디렉터리라도 기존 경로는 재사용하지 않는다. 이전 번들과 섞이지 않게 먼저 예약한다.
  mkdirSync(output, { mode: 0o700 });
  const directoryIdentity = lstatSync(output);
  const created = [];
  const sameFile = (actual, expected) => actual.dev === expected.dev && actual.ino === expected.ino;
  try {
    for (const [name, contents] of [
      ["managed-bootstrap.sql", bundle.sql],
      ["final-verification.sql", bundle.verificationSql],
      ["preparation-report.json", `${JSON.stringify(bundle.report, null, 2)}\n`],
    ]) {
      const path = resolve(output, name);
      const descriptor = openSync(path, "wx", 0o600);
      try {
        // 부분 쓰기가 실패해도 소유한 inode를 알고 있어야 안전하게 정리할 수 있다.
        created.push({ path, identity: fstatSync(descriptor) });
        writeFile(descriptor, contents);
      } finally {
        closeSync(descriptor);
      }
    }
  } catch (error) {
    let cleanupFailed = false;
    for (const file of created.reverse()) {
      try {
        if (sameFile(lstatSync(file.path), file.identity)) unlinkSync(file.path);
      } catch (cleanupError) {
        if (cleanupError.code !== "ENOENT") cleanupFailed = true;
      }
    }
    try {
      // 재귀 삭제하지 않는다. 다른 실행이 추가한 파일이나 교체한 디렉터리는 보존한다.
      if (sameFile(lstatSync(output), directoryIdentity)) rmdirSync(output);
    } catch (cleanupError) {
      if (!["ENOENT", "ENOTEMPTY", "EEXIST"].includes(cleanupError.code)) cleanupFailed = true;
    }
    if (cleanupFailed) fail("번들 생성과 이번 파일 정리에 실패했습니다. 출력 경로를 검토한 뒤 새 디렉터리를 지정하세요.");
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseManagedBootstrapArguments(process.argv.slice(2));
    const bundle = prepareManagedBootstrap({ ...options, schemaDump: readFileSync(resolve(options.schemaFile), "utf8") });
    writeManagedBootstrapBundle(options.outputDirectory, bundle);
    process.stdout.write(`${JSON.stringify(bundle.report, null, 2)}\n`);
  } catch (error) {
    // 파일/드라이버 예외 원문에 연결정보가 섞이지 않도록 알려진 검증 오류만 출력한다.
    const message = error?.code ? "파일 준비에 실패했습니다. 입력 파일과 새 출력 디렉터리를 확인하세요." : error.message;
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
