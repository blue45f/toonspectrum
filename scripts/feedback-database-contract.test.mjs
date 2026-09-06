import { readFileSync } from "node:fs";

import { expect, test } from "vitest";

import { buildFeedbackCapabilitySql, buildFeedbackRuntimeAclSql } from "./feedback-database-contract.mjs";

test("feedback runtime grants stay DML-only and role-explicit", () => {
  const sql = buildFeedbackRuntimeAclSql("feedback_runtime");
  expect(sql).toContain('GRANT SELECT, INSERT, DELETE ON TABLE public.feedback_vote TO "feedback_runtime"');
  expect(sql).toContain('REVOKE ALL ON TABLE public.feedback_vote FROM PUBLIC');
  expect(sql).not.toMatch(/GRANT ALL|GRANT CREATE|GRANT.*TRUNCATE|OWNER TO/u);
  for (const role of [undefined, "", "public", "PUBLIC", "runtime; DROP ROLE x", "x".repeat(64)]) {
    expect(() => buildFeedbackRuntimeAclSql(role)).toThrow();
    expect(() => buildFeedbackCapabilitySql(role)).toThrow();
  }
});
test("feedback readiness checks relation shape, each privilege and composite uniqueness", () => {
  const sql = buildFeedbackCapabilitySql("feedback_runtime");
  for (const text of ["feedback_post", "feedback_reply", "feedback_vote", "progress", "metadata", "has_table_privilege", "ARRAY['postId', 'userId']"])
    expect(sql).toContain(text);
  expect(sql).not.toContain("'SELECT, INSERT'");
});
test("the API capability probe never runs migration DDL", () => {
  const code = readFileSync(new URL("../apps/api/src/server/feedback.ts", import.meta.url), "utf8");
  expect(code).not.toMatch(/CREATE TABLE|ALTER TABLE|CREATE INDEX|pg_advisory_xact_lock/u);
  expect(code).toContain("FROM public.feedback_vote LIMIT 0");
  expect(code).toContain('code === "42501"');
  expect(code).toContain("503");
});
test("managed migration is additive and wired to migration and readiness commands", () => {
  const sql = readFileSync(new URL("../apps/api/src/db/migrations/0038_feedback_community.sql", import.meta.url), "utf8");
  expect(sql).toContain("ADD COLUMN IF NOT EXISTS progress");
  expect(sql).toContain('PRIMARY KEY ("postId", "userId")');
  expect(sql).not.toMatch(/DROP TABLE|DELETE FROM|TRUNCATE/u);
  for (const path of ["./run-production-database-migrations.mjs", "./verify-production-database-capabilities.mjs"]) {
    expect(readFileSync(new URL(path, import.meta.url), "utf8")).toContain("buildFeedbackCapabilitySql(runtimeDatabaseRole)");
  }
});
