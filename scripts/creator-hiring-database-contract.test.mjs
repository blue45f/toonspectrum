import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { HIRING_FUNCTIONS, HIRING_RELATIONS, buildHiringCapabilitySql, buildHiringRuntimeAclSql } from './creator-hiring-database-contract.mjs';
import { loadMigrationManifest } from './run-production-database-migrations.mjs';
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
test('0078 is atomic, registered and exactly covered by the hiring ACL contract', () => {
  const migration = loadMigrationManifest().at(-1);
  expect(migration.id).toBe('0078_creator_hiring_workspace');
  const sql = migration.contents;
  expect(sql).toMatch(/^--[^\n]*\nBEGIN;[\s\S]*COMMIT;\s*$/u);
  const relations = [...sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(creator_hiring_\w+)/gu)].map((m) => m[1]).sort();
  expect(HIRING_RELATIONS.map((r) => r.relation).sort()).toEqual(relations);
  const functions = [...sql.matchAll(/CREATE (?:OR REPLACE )?FUNCTION (creator_hiring_\w+)/gu)].map((m) => m[1]).sort();
  expect([...HIRING_FUNCTIONS].sort()).toEqual(functions);
  expect(sql).not.toContain('SECURITY DEFINER');
  expect(sql).toContain('REVOKE ALL ON FUNCTION creator_hiring_require_ready() FROM PUBLIC');
});
test('runtime ACL keeps versions, receipts and activity immutable and grants only bounded updates', () => {
  const sql = buildHiringRuntimeAclSql('hiring_runtime');
  for (const relation of ['resume_version', 'career_version', 'receipt', 'activity_ledger', 'resume_career_source']) {
    expect(sql).not.toMatch(new RegExp(`GRANT UPDATE[^;]*creator_hiring_${relation}\\b`, 'u'));
  }
  expect(sql).toContain('GRANT SELECT ON TABLE "public".creator_hiring_activity_ledger');
  expect(sql).toContain('GRANT UPDATE ("resume_payload","redacted_at","redaction_reason")');
  expect(sql).not.toMatch(/GRANT[^;]*(?:TRUNCATE|TRIGGER|REFERENCES|ALL|TO PUBLIC)/u);
  expect(sql).toContain('REVOKE ALL PRIVILEGES (%s)');
  const capability = buildHiringCapabilitySql('hiring_runtime');
  for (const fragment of ['WITH GRANT OPTION', 'has_column_privilege(0::oid', 'has_table_privilege(0::oid', 'pg_auth_members', 'prosecdef', 'creator_hiring_require_ready()']) expect(capability).toContain(fragment);
});
test('approved runner and standalone verification execute the hiring capability contract', () => {
  const runner = read('./run-production-database-migrations.mjs');
  expect(runner).toContain('psql(databaseUrl, buildHiringRuntimeAclSql(runtimeDatabaseRole))');
  expect(runner).toContain('psql(databaseUrl, buildHiringCapabilitySql(runtimeDatabaseRole))');
  expect(read('./verify-production-database-capabilities.mjs')).toContain('${buildHiringCapabilitySql(runtimeDatabaseRole)}');
});
test.each(['PUBLIC', 'public', 'hiring-role', 'role"injection', ''])('rejects unsafe runtime role %s', (role) => {
  expect(() => buildHiringRuntimeAclSql(role)).toThrow();
  expect(() => buildHiringCapabilitySql(role)).toThrow();
});
