import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import pg from "pg";

// 실제 계정/운영 DB를 사용하지 않는, 폐기 가능한 로컬 검증 DB 전용이다.
const raw = process.env.COMMUNITY_TEST_DATABASE_URL;
if (process.argv.includes("--dry-run")) {
  console.log("로컬 전용 DB에 합성 데이터로 마이그레이션·RLS·제약조건·롤백을 검증합니다. 운영 연결은 거부합니다.");
  process.exit(0);
}
if (!raw) throw new Error("COMMUNITY_TEST_DATABASE_URL에 새 로컬 검증 DB를 지정해 주세요. --dry-run으로 절차를 확인할 수 있습니다.");
let url;
try { url = new URL(raw); } catch { throw new Error("유효한 로컬 PostgreSQL 연결 주소를 지정해 주세요."); }
if (!["postgresql:", "postgres:"].includes(url.protocol) || url.search || url.hash || url.hostname !== "127.0.0.1" || url.port !== "61983" || url.pathname !== "/community_qa_verification") {
  throw new Error("운영 보호: 127.0.0.1:61983/community_qa_verification 전용 연결만 허용합니다.");
}
const client = new pg.Client({ connectionString: raw });
let checks = 0;
async function denied(query, code) {
  await assert.rejects(client.query(query), (error) => error.code === code);
  checks += 1;
}
try {
  await client.connect();
  const location = (await client.query("SELECT current_setting('data_directory') AS directory, current_database() AS name")).rows[0];
  assert.match(location.directory, /^\/(?:private\/)?tmp\/toonstudio-community-pg-[^/]+$/, "이 작업에서 만든 임시 DB 디렉터리만 허용합니다.");
  assert.equal(location.name, "community_qa_verification");
  assert.equal((await client.query("SELECT to_regclass('public.\"user\"') AS existing")).rows[0].existing, null, "비어 있는 새 검증 DB가 필요합니다.");
  await client.query(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE toonspectrum_runtime;
    CREATE TABLE public."user" (id text PRIMARY KEY);
    INSERT INTO public."user" VALUES ('local-member'), ('local-admin'), ('local-delete');
    CREATE TABLE public.admin_audit_logs (id text PRIMARY KEY, action text NOT NULL);`);
  const migration = await readFile(new URL("../apps/api/src/platform/database/migrations/0097_admin_member_test_accounts.sql", import.meta.url), "utf8");
  await client.query(migration);
  await client.query(migration);
  checks += 1;
  assert.equal((await client.query("SELECT relrowsecurity FROM pg_class WHERE oid = 'public.admin_member_test_accounts'::regclass")).rows[0].relrowsecurity, true);
  checks += 1;
  for (const role of ["anon", "authenticated"]) {
    await client.query(`SET ROLE ${role}`);
    try {
      await denied("SELECT * FROM public.admin_member_test_accounts", "42501");
      await denied(`INSERT INTO public.admin_member_test_accounts ("userId", reason) VALUES ('local-member', '검증')`, "42501");
      await denied(`UPDATE public.admin_member_test_accounts SET "isTestAccount" = true`, "42501");
      await denied("DELETE FROM public.admin_member_test_accounts", "42501");
    } finally { await client.query("RESET ROLE"); }
  }
  await client.query("SET ROLE toonspectrum_runtime");
  await client.query(`INSERT INTO public.admin_member_test_accounts ("userId", reason, "updatedBy") VALUES ('local-member', '로컬 검증', 'local-admin')`);
  assert.equal((await client.query(`SELECT "isTestAccount" FROM public.admin_member_test_accounts WHERE "userId" = 'local-member'`)).rows[0].isTestAccount, false);
  checks += 1;
  await denied(`UPDATE public.admin_member_test_accounts SET reason = '  '`, "23514");
  await client.query("RESET ROLE");
  await client.query("BEGIN");
  await client.query(`UPDATE public.admin_member_test_accounts SET "isTestAccount" = true WHERE "userId" = 'local-member'`);
  await denied("INSERT INTO public.admin_audit_logs VALUES ('invalid', NULL)", "23502");
  await client.query("ROLLBACK");
  assert.equal((await client.query(`SELECT "isTestAccount" FROM public.admin_member_test_accounts WHERE "userId" = 'local-member'`)).rows[0].isTestAccount, false);
  assert.equal((await client.query("SELECT count(*)::integer AS total FROM public.admin_audit_logs")).rows[0].total, 0);
  checks += 1;
  await client.query(`INSERT INTO public.admin_member_test_accounts ("userId", reason) VALUES ('local-delete', '정리 검증')`);
  await client.query(`DELETE FROM public."user" WHERE id = 'local-delete'`);
  assert.equal((await client.query(`SELECT count(*)::integer AS total FROM public.admin_member_test_accounts WHERE "userId" = 'local-delete'`)).rows[0].total, 0);
  checks += 1;
  console.log(JSON.stringify({ 검증: "로컬 테스트 계정 DB", 통과: checks, 운영변경: false }));
} catch (error) {
  console.error("로컬 커뮤니티 DB 검증 실패:", error instanceof Error ? error.message : "원인을 확인해 주세요.");
  process.exitCode = 1;
} finally { await client.end(); }
