import { validatePostgresIntegrationUrl } from "./run-postgres-integration-tests.mjs";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildProductionOperationsRuntimeAclSql, buildProductionOperationsRuntimeAclViolationSql } from "./production-operations-database-contract.mjs";
import { TeamWorkspaceRepository } from "../apps/api/src/modules/production-collaboration/team-workspace.repository.ts";
import { OperationPolicyRepository } from "../apps/api/src/modules/operation-policy/operation-policy.repository.ts";
import { initialOperationPolicy } from "../packages/contracts/src/operation-policy.ts";
const target = process.env.TEST_DATABASE_URL;
const suffix = randomUUID().replaceAll("-", "");
const schema = `ops_acl_${suffix}`;
const role = `ops_run_${suffix}`;
const redirect = (sql) => sql.replaceAll("public.", `${schema}.`);
describe.skipIf(!target)("actual non-owner runtime grants for production operations", () => {
  let owner, runtimeBacking, runtime, team, policy;
  let roleCreated = false, schemaCreated = false;
  beforeAll(async () => {
    if (!target) throw new Error("Explicit disposable local owner connection required");
    validatePostgresIntegrationUrl(target);
    owner = new pg.Pool({ connectionString: target, options: `-c search_path=${schema}`, max: 1 });
    await owner.query(`CREATE ROLE ${role} NOLOGIN`); roleCreated = true;
    await owner.query(`CREATE SCHEMA ${schema}`); schemaCreated = true;
    await owner.query(`CREATE TABLE "user"(id text PRIMARY KEY,name text,email text,"emailVerified" timestamptz,status text,role text);
      CREATE TABLE creator_work(id text PRIMARY KEY,"userId" text REFERENCES "user"(id),title text);
      CREATE TABLE creator_work_collaborator("workId" text REFERENCES creator_work(id),"userId" text REFERENCES "user"(id),role text,status text);
      INSERT INTO "user" VALUES('owner','Owner','owner@example.test',now(),'active','user'),('admin','Admin','admin@example.test',now(),'active','admin');`);
    for (const name of ['0053_production_collaboration_core.sql','0084_production_model_v2_compatibility.sql','0085_production_team_workspace.sql','0086_production_operation_policy.sql']) {
      await owner.query(redirect(readFileSync(new URL(`../apps/api/src/db/migrations/${name}`,import.meta.url),'utf8')));
    }
    await owner.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role};
      GRANT SELECT ON "user",creator_work,creator_work_collaborator,production_project TO ${role};
      GRANT UPDATE(name) ON "user" TO ${role}; GRANT UPDATE(title) ON creator_work TO ${role};`);
    await owner.query(redirect(buildProductionOperationsRuntimeAclSql(role)));
    runtimeBacking = new pg.Pool({ connectionString: target, options: `-c search_path=${schema}`, max: 2 });
    runtime = { async connect() { const client = await runtimeBacking.connect(); await client.query(`SET ROLE ${role}`); return client; } };
    team = new TeamWorkspaceRepository(runtime); policy = new OperationPolicyRepository(runtime);
  });
  afterAll(async () => {
    await runtimeBacking?.end();
    if (owner) {
      if (schemaCreated) await owner.query(`DROP SCHEMA ${schema} CASCADE`);
      if (roleCreated) await owner.query(`DROP ROLE ${role}`);
      await owner.end();
    }
  });
  async function queryRuntime(sql, parameters) {
    const client = await runtime.connect();
    try { return await client.query(sql,parameters); } finally { client.release(); }
  }
  it("checks actual grants and owner trigger under a non-owner role", async () => {
    expect((await queryRuntime('SELECT current_user role')).rows[0].role).toBe(role);
    expect((await owner.query(`SELECT ${redirect(buildProductionOperationsRuntimeAclViolationSql(role))} invalid`)).rows[0].invalid).toBe(false);
    const workspace = await team.create('owner',{name:'런타임 검증',mutationId:randomUUID()});
    expect((await team.detail('owner',workspace.workspaceId)).workspace.memberCount).toBe(1);
    await expect(queryRuntime('DELETE FROM production_team_member WHERE workspace_id=$1',[workspace.workspaceId])).rejects.toMatchObject({code:'23514'});
  });
  it("updates policy via the repository while audit/receipt rows remain immutable", async () => {
    const draft = initialOperationPolicy();
    const impact = await policy.preview('admin',{draft,expectedRevision:0});
    await policy.apply('admin',{draft,expectedRevision:0,previewDigest:impact.digest,mutationId:randomUUID(),reason:'실제 비소유자 정책 검증'});
    expect((await policy.read('admin')).policy.revision).toBe(1);
    await expect(queryRuntime("UPDATE production_operation_policy_audit SET reason='tamper' WHERE revision=1")).rejects.toMatchObject({code:'42501'});
    await expect(queryRuntime('DELETE FROM production_operation_policy WHERE id=1')).rejects.toMatchObject({code:'42501'});
    await expect(queryRuntime('UPDATE production_team_workspace SET id=id')).rejects.toMatchObject({code:'42501'});
    await expect(queryRuntime('UPDATE production_team_receipt SET response=response')).rejects.toMatchObject({code:'42501'});
  });
  it("detects and normalizes unexpected public privileges", async () => {
    await owner.query(`GRANT SELECT ON production_operation_policy TO PUBLIC`);
    expect((await owner.query(`SELECT ${redirect(buildProductionOperationsRuntimeAclViolationSql(role))} invalid`)).rows[0].invalid).toBe(true);
    await owner.query(redirect(buildProductionOperationsRuntimeAclSql(role)));
    expect((await owner.query(`SELECT ${redirect(buildProductionOperationsRuntimeAclViolationSql(role))} invalid`)).rows[0].invalid).toBe(false);
  });
});
