import { expect, it } from "vitest";

import { buildAdminCapabilitySql, buildAdminRuntimeAclSql } from "./admin-database-contract.mjs";

it.each(["", "public", "MixedCase", 'role"; DROP SCHEMA public; --'])("refuses unsafe administrator runtime role %s", (role) => {
  expect(() => buildAdminRuntimeAclSql(role)).toThrow("explicit safe administrator runtime role");
  expect(() => buildAdminCapabilitySql(role)).toThrow("explicit safe administrator runtime role");
});

it("uses read-only shared schema evidence and checks each required DML privilege independently", () => {
  const sql = buildAdminCapabilitySql("runtime_test");
  expect(sql).toContain("admin_announcements");
  expect(sql).toContain("idx_revenue_ledger_reviewedat");
  expect(sql).toContain("ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']");
  expect(sql).not.toMatch(/CREATE TABLE|ALTER TABLE|CREATE INDEX|GRANT /u);
});

it("내부 테스트 계정은 지정한 런타임 역할과 최소 DML에만 연결한다", () => {
  const sql = buildAdminRuntimeAclSql("community_runtime");
  expect(sql).toContain('GRANT SELECT, INSERT, UPDATE ON TABLE public.admin_member_test_accounts TO "community_runtime"');
  expect(sql).toContain('TO "community_runtime" USING (true) WITH CHECK (true)');
  expect(sql).toContain("REVOKE ALL ON TABLE public.admin_member_test_accounts FROM PUBLIC");
  expect(sql).not.toMatch(/GRANT[^;]*DELETE[^;]*admin_member_test_accounts/u);
  expect(sql).not.toContain("toonspectrum_runtime");
  const capability = buildAdminCapabilitySql("community_runtime");
  expect(capability).toContain("public.admin_member_test_accounts");
  expect(capability).toContain("'DELETE'");
  expect(capability).toContain("relrowsecurity");
  expect(capability).toContain("classification privileges are incompatible");
});
