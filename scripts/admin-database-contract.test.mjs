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
