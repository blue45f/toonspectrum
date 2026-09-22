import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { expect, test } from 'vitest';
import { CAREER_CONFIRMATION_FUNCTIONS, CAREER_CONFIRMATION_RELATIONS, buildCareerConfirmationCapabilitySql, buildCareerConfirmationRuntimeAclSql } from './creator-career-confirmation-database-contract.mjs';
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const sql = read('../apps/api/src/db/migrations/0080_creator_career_confirmation.sql');
test('managed 0080 is atomic with exact87 inventory and immutable original0078', () => {
  expect(sql).toMatch(/\nBEGIN;[\s\S]*COMMIT;\s*$/u);
  expect(readdirSync(new URL('../apps/api/src/db/migrations/', import.meta.url)).filter((f) => /^\d{4}_.+\.sql$/u.test(f))).toHaveLength(88);
  expect(createHash('sha256').update(read('../apps/api/src/db/migrations/0078_creator_hiring_workspace.sql')).digest('hex')).toBe('c8094e53ce497dfd8f0649adb3e51ad67ae4a67f27d4547b5863484d2e8e2085');
  expect([...sql.matchAll(/CREATE TABLE (\w+)/gu)].map((m) => m[1]).sort()).toEqual(CAREER_CONFIRMATION_RELATIONS.map((r) => r.relation).sort());
  expect([...sql.matchAll(/CREATE FUNCTION (\w+)/gu)].map((m) => m[1]).sort()).toEqual([...CAREER_CONFIRMATION_FUNCTIONS].sort());
  expect(sql).not.toMatch(/SECURITY DEFINER|CREATE OR REPLACE|ALTER TABLE creator_hiring_/u);
});
test('least privilege contract grants only state and one-way redaction columns, never audit mutation or DDL', () => {
  const acl = buildCareerConfirmationRuntimeAclSql('fixture_runtime');
  expect(acl).not.toMatch(/GRANT[^;]*(?:DELETE|TRUNCATE|TRIGGER|REFERENCES|ALL|TO PUBLIC)/u);
  expect(acl).not.toMatch(/GRANT UPDATE[^;]*confirmation_(?:event|receipt)/u);
  expect(acl).toContain('GRANT UPDATE ("state","revision","confirmed_at","snapshot","redacted_at","redaction_reason")');
  expect(acl).not.toContain('creator_hiring_');
  expect(acl).toContain('REVOKE ALL PRIVILEGES (%s)');
  for (const check of ['WITH GRANT OPTION', 'has_column_privilege(0::oid', 'has_table_privilege(0::oid', 'pg_auth_members', 'prosecdef', 'convalidated', 'indisvalid']) expect(sql).toContain(check);
  expect(buildCareerConfirmationCapabilitySql('fixture_runtime')).toContain('SET LOCAL ROLE "fixture_runtime"');
});
test.each(['public', 'PUBLIC', '', 'runtime-role', 'role";DROP'])('rejects unsafe role %s', (role) => {
  expect(() => buildCareerConfirmationRuntimeAclSql(role)).toThrow(); expect(() => buildCareerConfirmationCapabilitySql(role)).toThrow();
});
