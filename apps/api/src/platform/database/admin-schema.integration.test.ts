import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ADMIN_SCHEMA_COLUMNS_SQL } from "./admin-schema-contract";

const integrationUrl = process.env.STUDIO_LIVE_POSTGRES_INTEGRATION_URL?.trim();
if (process.env.CI && !integrationUrl) {
  throw new Error("CI must provide STUDIO_LIVE_POSTGRES_INTEGRATION_URL for administrator schema tests");
}
const postgres = integrationUrl ? describe : describe.skip;
const tables = ["admin_announcements", "admin_audit_logs", "admin_banned_words", "admin_content_reports", "admin_promos", "admin_security_policies"];

postgres("Managed administrator PostgreSQL schema", () => {
  let pool: Pool;
  let migration: string;
  let legacy: string;
  const schemas: string[] = [];

  beforeAll(async () => {
    pool = new Pool({ connectionString: integrationUrl, max: 4, statement_timeout: 10_000 });
    migration = await readFile(new URL("./migrations/0043_admin_runtime_schema.sql", import.meta.url), "utf8");
    legacy = await readFile(new URL("./fixtures/admin-runtime-legacy.sql", import.meta.url), "utf8");
  });
  afterAll(async () => {
    try {
      for (const schema of schemas) await pool?.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    } finally {
      await pool?.end();
    }
  });

  async function fixture(oldAdmin = false) {
    const schema = `admin_schema_${randomUUID().replaceAll("-", "")}`;
    schemas.push(schema);
    const client = await pool.connect();
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET search_path TO "${schema}", public`);
      await client.query('CREATE TABLE "user" (id text PRIMARY KEY)');
      await client.query(`CREATE TABLE revenue_ledger (id text PRIMARY KEY, status text NOT NULL DEFAULT 'paid', "createdAt" timestamp DEFAULT now())`);
      await client.query('CREATE TABLE toonspectrum_schema_migration (id text PRIMARY KEY, "appliedAt" timestamp NOT NULL)');
      if (oldAdmin) await client.query(legacy);
      return { schema, client };
    } catch (error) {
      client.release();
      throw error;
    }
  }

  function migrate(client: PoolClient, schema: string) {
    return client.query(migration.replaceAll("public.", `"${schema}".`).replaceAll("to_regnamespace('public')", `to_regnamespace('${schema}')`));
  }

  async function columns(schema: string) {
    return (await pool.query(`SELECT table_name, column_name, data_type, is_nullable, column_default
      FROM information_schema.columns WHERE table_schema=$1 AND table_name=ANY($2::text[])
      ORDER BY table_name, ordinal_position`, [schema, tables])).rows;
  }

  async function constraints(schema: string) {
    return (await pool.query(`SELECT relation.relname, constraint_record.contype, constraint_record.confdeltype,
      constraint_record.condeferrable, constraint_record.convalidated,
      ARRAY(SELECT att.attname::text FROM unnest(constraint_record.conkey) WITH ORDINALITY AS k(num, pos)
        JOIN pg_attribute att ON att.attrelid=relation.oid AND att.attnum=k.num ORDER BY k.pos) AS columns,
      parent.relname AS parent
      FROM pg_constraint constraint_record JOIN pg_class relation ON relation.oid=constraint_record.conrelid
      LEFT JOIN pg_class parent ON parent.oid=constraint_record.confrelid
      WHERE relation.relnamespace=to_regnamespace($1) AND relation.relname=ANY($2::text[])
      ORDER BY relation.relname, constraint_record.contype, columns`, [schema, tables])).rows;
  }

  it("fresh managed tables preserve every legacy column, SQL default, unique key and foreign-key action", async () => {
    const old = await fixture(true);
    const fresh = await fixture();
    try {
      await migrate(fresh.client, fresh.schema);
      expect(await columns(fresh.schema)).toEqual(await columns(old.schema));
      expect(await constraints(fresh.schema)).toEqual(await constraints(old.schema));
      expect((await fresh.client.query('SELECT id FROM toonspectrum_schema_migration')).rows).toEqual([{ id: "0043_admin_runtime_schema" }]);
    } finally {
      old.client.release();
      fresh.client.release();
    }
  });

  it("upgrades legacy administrator records without changing values, and safely repeats", async () => {
    const { schema, client } = await fixture(true);
    try {
      await client.query(`INSERT INTO "user" VALUES ('administrator'), ('reporter');
        INSERT INTO admin_audit_logs(id, "adminId", action, details) VALUES ('audit', 'administrator', 'fixture', '{"retained":true}');
        INSERT INTO admin_banned_words(id, word, "createdBy") VALUES ('word', 'fixture', 'administrator');
        INSERT INTO admin_promos(id, code) VALUES ('promo', 'fixture');
        INSERT INTO admin_announcements(id, title, "createdBy") VALUES ('announcement', 'Fixture', 'administrator');
        INSERT INTO admin_security_policies(id, "ipAddress", "createdBy") VALUES ('policy', '192.0.2.1', 'administrator');
        INSERT INTO admin_content_reports(id, "reporterId", "targetType", "targetId") VALUES ('report', 'reporter', 'fixture', 'retained');`);
      const before = await Promise.all(tables.map(async (table) => (await client.query(`SELECT * FROM ${table}`)).rows));
      await migrate(client, schema);
      await migrate(client, schema);
      const after = await Promise.all(tables.map(async (table) => (await client.query(`SELECT * FROM ${table}`)).rows));
      expect(after).toEqual(before);
      const indexes = (await client.query(`SELECT indexname FROM pg_indexes WHERE schemaname=$1 AND indexname LIKE 'idx_%' ORDER BY indexname`, [schema])).rows.map((row) => row.indexname);
      expect(indexes).toEqual(["idx_admin_announcements_active", "idx_admin_audit_logs_action", "idx_admin_audit_logs_createdat", "idx_admin_reports_status", "idx_revenue_ledger_createdat", "idx_revenue_ledger_reviewedat", "idx_revenue_ledger_settledat", "idx_revenue_ledger_status_createdat"]);
    } finally {
      client.release();
    }
  });

  it("preserves cascade and set-null behavior when an administrator account is removed", async () => {
    const { schema, client } = await fixture();
    try {
      await migrate(client, schema);
      await client.query(`INSERT INTO "user" VALUES ('administrator'), ('reporter');
        INSERT INTO admin_audit_logs(id, "adminId", action) VALUES ('audit', 'administrator', 'fixture');
        INSERT INTO admin_announcements(id, title, "createdBy") VALUES ('announcement', 'Fixture', 'administrator');
        INSERT INTO admin_content_reports(id, "reporterId", "targetType", "targetId", "resolvedBy") VALUES ('report', 'reporter', 'fixture', 'retained', 'administrator');
        DELETE FROM "user" WHERE id='administrator';`);
      expect((await client.query('SELECT count(*)::int AS count FROM admin_audit_logs')).rows[0].count).toBe(0);
      expect((await client.query('SELECT "createdBy" FROM admin_announcements')).rows[0].createdBy).toBeNull();
      expect((await client.query('SELECT "resolvedBy" FROM admin_content_reports')).rows[0].resolvedBy).toBeNull();
      await client.query(`DELETE FROM "user" WHERE id='reporter'`);
      expect((await client.query('SELECT count(*)::int AS count FROM admin_content_reports')).rows[0].count).toBe(0);
    } finally {
      client.release();
    }
  });

  it("grants existing administrator CRUD without schema ownership or destructive table privileges", async () => {
    const { schema, client } = await fixture();
    const role = `admin_runtime_${randomUUID().replaceAll("-", "")}`;
    const { buildAdminRuntimeAclSql, buildAdminCapabilitySql } = await import(
      new URL("../../../../scripts/admin-database-contract.mjs", import.meta.url).href
    );
    try {
      await migrate(client, schema);
      await client.query(`CREATE ROLE "${role}" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`);
      await client.query(`GRANT USAGE ON SCHEMA "${schema}" TO "${role}"`);
      const inSchema = (sql: string) => sql.replaceAll("public.", `"${schema}".`)
        .replaceAll("to_regnamespace('public')", `to_regnamespace('${schema}')`);
      await expect(client.query(inSchema(buildAdminCapabilitySql(role)))).rejects.toThrow("administrator runtime DML privileges are incomplete");
      await client.query(inSchema(buildAdminRuntimeAclSql(role)));
      await client.query(inSchema(buildAdminCapabilitySql(role)));
      await client.query(`SET ROLE "${role}"`);
      await client.query("INSERT INTO admin_promos(id, code) VALUES ('runtime', 'retained')");
      await client.query("UPDATE admin_promos SET \"isActive\"=false WHERE id='runtime'");
      expect((await client.query('SELECT "isActive" FROM admin_promos')).rows).toEqual([{ isActive: false }]);
      await expect(client.query('CREATE TABLE forbidden (id text)')).rejects.toMatchObject({ code: "42501" });
      await expect(client.query('TRUNCATE admin_promos')).rejects.toMatchObject({ code: "42501" });
      expect((await client.query("SELECT has_table_privilege(current_user, 'admin_promos', 'SELECT WITH GRANT OPTION') AS delegable")).rows[0].delegable).toBe(false);
      await client.query("DELETE FROM admin_promos WHERE id='runtime'");
      expect((await client.query('SELECT * FROM admin_promos')).rows).toEqual([]);
    } finally {
      await client.query("RESET ROLE");
      await client.query(`DROP OWNED BY "${role}"`);
      await client.query(`DROP ROLE "${role}"`);
      client.release();
    }
  });

  it("the health column probe detects real missing administrator metadata and recovers after rollback", async () => {
    const { schema, client } = await fixture();
    try {
      await migrate(client, schema);
      const sql = `SELECT ${ADMIN_SCHEMA_COLUMNS_SQL.replaceAll("public.", `"${schema}".`)} AS ready`;
      expect((await client.query(sql)).rows[0].ready).toBe(true);
      await client.query("BEGIN");
      await client.query('ALTER TABLE admin_promos RENAME COLUMN "discountValue" TO unavailable');
      expect((await client.query(sql)).rows[0].ready).toBe(false);
      await client.query("ROLLBACK");
      expect((await client.query(sql)).rows[0].ready).toBe(true);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  it("refuses an incompatible existing table and rolls back the new schema and completion marker", async () => {
    const { schema, client } = await fixture();
    try {
      await client.query('CREATE TABLE admin_promos (id text PRIMARY KEY, code integer NOT NULL)');
      await client.query("INSERT INTO admin_promos VALUES ('retained', 17)");
      await expect(migrate(client, schema)).rejects.toThrow("managed administrator schema is incomplete or incompatible");
      await client.query("ROLLBACK");
      expect((await client.query('SELECT * FROM admin_promos')).rows).toEqual([{ id: "retained", code: 17 }]);
      expect((await client.query('SELECT * FROM toonspectrum_schema_migration')).rows).toEqual([]);
      expect((await client.query("SELECT to_regclass($1) AS name", [`${schema}.admin_announcements`])).rows[0].name).toBeNull();
    } finally {
      client.release();
    }
  });
});
