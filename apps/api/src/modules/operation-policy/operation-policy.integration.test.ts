import { validatePostgresIntegrationUrl } from "../../../../../scripts/run-postgres-integration-tests.mjs";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { buildProductionOperationCapabilitySql, buildProductionOperationRuntimeAclSql } from "../../../../../scripts/production-operation-database-contract.mjs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { initialOperationPolicy, type OperationPolicyDraft } from "@toonspectrum/contracts/operation-policy";
import { TeamWorkspaceRepository } from "../production-collaboration/team-workspace.repository";
import { OperationPolicyRepository } from "./operation-policy.repository";

const target = process.env.TEST_DATABASE_URL;
const suite = describe.skipIf(!target);
const fingerprint = `sha256:${"c".repeat(64)}`;
const schema = `operation_policy_${randomUUID().replaceAll('-', '')}`;
const migration = (name: string) => readFileSync(new URL(`../../platform/database/migrations/${name}`, import.meta.url), "utf8").replaceAll("public.", `"${schema}".`);
suite("real Postgres: workspace + operating mode", () => {
  let root: Pool;
  let pool: Pool;
  let policy: OperationPolicyRepository;
  let team: TeamWorkspaceRepository;
  const oldFingerprint = process.env.TOONSTUDIO_LICENSE_FINGERPRINT;
  beforeAll(async () => {
    if (!target) throw new Error("TEST_DATABASE_URL required");
    validatePostgresIntegrationUrl(target);
    root = new Pool({ connectionString: target, max: 1 });
    await root.query(`CREATE SCHEMA "${schema}"`);
    pool = new Pool({ connectionString: target, max: 8, options: `-c search_path=${schema}` });
    await pool.query(`CREATE TABLE "user"(id text PRIMARY KEY,name text,email text,"emailVerified" timestamptz,role text NOT NULL DEFAULT 'user',status text NOT NULL DEFAULT 'active');
      CREATE TABLE creator_work(id text PRIMARY KEY,"userId" text REFERENCES "user"(id),title text);
      CREATE TABLE creator_work_collaborator("workId" text REFERENCES creator_work(id),"userId" text REFERENCES "user"(id),role text,status text,PRIMARY KEY("workId","userId"));`);
    // Apply the real baseline with only its explicit public schema redirected to this isolated fixture.
    await pool.query(migration('0053_production_collaboration_core.sql').replaceAll('public.', `"${schema}".`));
    for (const name of ['0084_production_model_v2_compatibility.sql','0085_production_team_workspace.sql','0086_production_operation_policy.sql']) await pool.query(migration(name));
    policy = new OperationPolicyRepository(pool); team = new TeamWorkspaceRepository(pool);
    process.env.TOONSTUDIO_LICENSE_FINGERPRINT = fingerprint;
  });
  beforeEach(async () => {
    await pool.query(`TRUNCATE production_team_workspace,production_operation_policy_receipt,production_operation_policy_audit,production_project,creator_work,"user" CASCADE`);
    await pool.query(`INSERT INTO "user"(id,name,email,"emailVerified",role) VALUES
      ('admin','관리자','admin@example.test',now(),'admin'),('owner','소유자','owner@example.test',now(),'user'),
      ('member','구성원','member@example.test',now(),'user'),('outsider','외부인','outsider@example.test',now(),'user'),
      ('operator','운영자','operator@example.test',now(),'operator'),('unverified','미인증','unverified@example.test',null,'user')`);
    await pool.query("UPDATE production_operation_policy SET revision=0,payload=$1::jsonb WHERE id=1", [JSON.stringify(initialOperationPolicy())]);
    process.env.TOONSTUDIO_LICENSE_FINGERPRINT = fingerprint;
  });
  afterAll(async () => {
    if (oldFingerprint === undefined) delete process.env.TOONSTUDIO_LICENSE_FINGERPRINT; else process.env.TOONSTUDIO_LICENSE_FINGERPRINT = oldFingerprint;
    await pool?.end();
    if (root) { await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await root.end(); }
  });
  const create = () => team.create('owner',{ name:'검증 팀',mutationId:randomUUID() });
  async function applyDraft(draft: OperationPolicyDraft, reason = '격리 테스트 정책 변경') {
    const { policy: current } = await policy.read('admin');
    const preview = await policy.preview('admin',{ expectedRevision:current.revision,draft });
    return policy.apply('admin',{ expectedRevision:current.revision,draft,previewDigest:preview.digest,reason,mutationId:randomUUID() });
  }
  it('seeds the exact runtime default and excludes license evidence from public response', async () => {
    expect((await policy.read('admin')).policy.draft).toEqual(initialOperationPolicy());
    const response = await policy.publicPolicy('owner');
    expect(response.mode).toBe('free'); expect(response.billing.checkoutEnabled).toBe(false);
    expect(response).not.toHaveProperty('releaseReview');
  });
  it('blocks nonadmins including operators and suspended admins', async () => {
    await expect(policy.read('owner')).rejects.toMatchObject({ status:403 });
    await expect(policy.preview('operator',{expectedRevision:0,draft:initialOperationPolicy()})).rejects.toMatchObject({status:403});
    await pool.query("UPDATE \"user\" SET status='suspended' WHERE id='admin'");
    await expect(policy.read('admin')).rejects.toMatchObject({status:403});
  });
  it('persists no-card workspaces and rejects an outsider', async () => {
    const w = await create();
    expect((await team.list('owner')).workspaces[0].id).toBe(w.workspaceId);
    expect((await team.usage('owner',w.workspaceId)).originalStorage.usedBytes).toBeNull();
    await expect(team.detail('outsider',w.workspaceId)).rejects.toMatchObject({status:404});
  });
  it('serializes concurrent creation at the owner cap, without evicting data', async () => {
    const results = await Promise.allSettled(Array.from({length:3},()=>create()));
    expect(results.filter((r)=>r.status==='fulfilled')).toHaveLength(2);
    expect((await team.list('owner')).workspaces).toHaveLength(2);
  });
  it('replays a create idempotently and rejects a changed body', async () => {
    const request = { name:'한 팀',mutationId:randomUUID() };
    expect(await team.create('owner',request)).toEqual(await team.create('owner',request));
    await expect(team.create('owner',{...request,name:'다른 팀'})).rejects.toMatchObject({status:409});
  });
  it('matches invitations to verified recipients and stores only hashed tokens', async () => {
    const w = await create();
    const invitation = await team.command('owner',w.workspaceId,{ type:'invite',email:'member@example.test',role:'member',mutationId:randomUUID(),expectedRevision:0 });
    expect(invitation.delivery).toBe('manual-link');
    await expect(team.accept('outsider',{token:invitation.token!,mutationId:randomUUID()})).rejects.toMatchObject({status:404});
    await expect(team.accept('unverified',{token:invitation.token!,mutationId:randomUUID()})).rejects.toMatchObject({status:403});
    await team.accept('member',{token:invitation.token!,mutationId:randomUUID()});
    expect((await team.detail('member',w.workspaceId)).workspace.role).toBe('member');
    const raw = JSON.stringify((await pool.query('SELECT * FROM production_team_receipt')).rows);
    expect(raw).not.toContain(invitation.token!);
  });
  it('includes pending invites in the cap and allows revoke at capacity', async () => {
    const base = initialOperationPolicy();
    await applyDraft({...base,profiles:{...base.profiles,free:{...base.profiles.free,limits:{...base.profiles.free.limits,membersPerWorkspace:2}}}});
    const w = await create();
    const first = await team.command('owner',w.workspaceId,{type:'invite',email:'member@example.test',role:'member',expectedRevision:0,mutationId:randomUUID()});
    await expect(team.command('owner',w.workspaceId,{type:'invite',email:'outsider@example.test',role:'member',expectedRevision:1,mutationId:randomUUID()})).rejects.toMatchObject({status:429});
    await team.command('owner',w.workspaceId,{type:'revoke-invite',invitationId:first.invitationId!,expectedRevision:1,mutationId:randomUUID()});
    expect((await team.usage('owner',w.workspaceId)).counters.pendingInvites).toBe(0);
    await expect(team.accept('member',{token:first.token!,mutationId:randomUUID()})).rejects.toMatchObject({status:404});
  });
  it('does not grant project content access merely by inviting a member', async () => {
    const w = await create();
    await pool.query(`INSERT INTO creator_work(id,"userId",title) VALUES('work','owner','비공개 작품')`);
    const aggregate = { modelVersion:2,projectId:'project',workId:'work',revision:0,parties:[],assignments:[],auditEvents:[] };
    await pool.query(`INSERT INTO production_project(id,"workId",title,"collaborationModel","modelVersion",aggregate) VALUES('project','work','비공개 작품','solo',2,$1::jsonb)`,[JSON.stringify(aggregate)]);
    await team.command('owner',w.workspaceId,{type:'attach-project',projectId:'project',expectedRevision:0,mutationId:randomUUID()});
    const invitation = await team.command('owner',w.workspaceId,{type:'invite',email:'member@example.test',role:'member',expectedRevision:1,mutationId:randomUUID()});
    await team.accept('member',{token:invitation.token!,mutationId:randomUUID()});
    expect((await team.detail('member',w.workspaceId)).projects).toEqual([]);
    expect((await team.detail('member',w.workspaceId)).workspace.projectCount).toBe(0);
    await pool.query(`INSERT INTO creator_work_collaborator("workId","userId",role,status) VALUES('work','member','viewer','active')`);
    expect((await team.detail('member',w.workspaceId)).projects).toHaveLength(1);
  });
  it('supports atomic owner transfer and DB-level last-owner protection', async () => {
    const w = await create();
    const invitation = await team.command('owner',w.workspaceId,{type:'invite',email:'member@example.test',role:'member',expectedRevision:0,mutationId:randomUUID()});
    await team.accept('member',{token:invitation.token!,mutationId:randomUUID()});
    await team.command('owner',w.workspaceId,{type:'transfer-owner',userId:'member',expectedRevision:2,mutationId:randomUUID()});
    expect((await team.detail('member',w.workspaceId)).workspace.ownerUserId).toBe('member');
    await expect(pool.query("DELETE FROM production_team_member WHERE workspace_id=$1 AND role='owner'",[w.workspaceId])).rejects.toMatchObject({code:'23514'});
  });
  it('does not allow replay to bypass a membership revocation', async () => {
    const w = await create();
    const invitation = await team.command('owner',w.workspaceId,{type:'invite',email:'member@example.test',role:'member',expectedRevision:0,mutationId:randomUUID()});
    const accept = {token:invitation.token!,mutationId:randomUUID()};
    await team.accept('member',accept);
    await team.command('owner',w.workspaceId,{type:'remove-member',userId:'member',expectedRevision:2,mutationId:randomUUID()});
    await expect(team.accept('member',accept)).rejects.toMatchObject({status:404});
  });
  it('requires matching commercial evidence and never silently bills in paid mode', async () => {
    await expect(applyDraft({...initialOperationPolicy(),mode:'paid'})).rejects.toMatchObject({status:409});
    const base = initialOperationPolicy();
    const draft: OperationPolicyDraft = { ...base,mode:'paid',releaseReview:{state:'approved',approvedModes:['paid'],subjectDigest:fingerprint,evidenceRef:'test-only-evidence',validUntil:null},
      profiles:{...base.profiles,paid:{...base.profiles.paid,limits:{...base.profiles.paid.limits,ownedWorkspaces:3}}} };
    await applyDraft(draft);
    await Promise.all([create(),create(),create()]);
    const response = await policy.publicPolicy('owner');
    expect(response.mode).toBe('paid'); expect(response.billing.checkoutEnabled).toBe(false);
    const w = (await team.list('owner')).workspaces[0];
    expect((await team.usage('owner',w.id)).operationMode).toBe('paid');
    await applyDraft({...draft,mode:'free'});
    expect((await team.list('owner')).workspaces).toHaveLength(3);
    await expect(create()).rejects.toMatchObject({status:429});
  });
  it('rejects stale previews and keeps policy updates idempotent', async () => {
    const draft = initialOperationPolicy();
    const impact = await policy.preview('admin',{expectedRevision:0,draft});
    const first = {expectedRevision:0,draft,previewDigest:impact.digest,reason:'첫 정책 저장 테스트',mutationId:randomUUID()};
    expect(await policy.apply('admin',first)).toEqual(await policy.apply('admin',first));
    await expect(policy.apply('admin',{...first,mutationId:randomUUID()})).rejects.toMatchObject({status:409});
    await expect(policy.apply('admin',{...first,reason:'다른 내용 테스트'})).rejects.toMatchObject({status:409});
    expect((await policy.read('admin')).audit).toHaveLength(1);
  });
  it('serializes concurrent administrators rather than losing a policy update', async () => {
    const draft = initialOperationPolicy();
    const impact = await policy.preview('admin',{expectedRevision:0,draft});
    const results = await Promise.allSettled([1,2].map((n)=>policy.apply('admin',{expectedRevision:0,draft,previewDigest:impact.digest,reason:`동시 변경 테스트 ${n}`,mutationId:randomUUID()})));
    expect(results.filter((result)=>result.status==='fulfilled')).toHaveLength(1);
    expect((await policy.read('admin')).policy.revision).toBe(1);
  });
  it('keeps revoke and read available when new workspace operations are disabled', async () => {
    const w = await create();
    const invitation = await team.command('owner',w.workspaceId,{type:'invite',email:'member@example.test',role:'member',expectedRevision:0,mutationId:randomUUID()});
    const base = initialOperationPolicy();
    await applyDraft({...base,profiles:{...base.profiles,free:{...base.profiles.free,features:{...base.profiles.free.features,'team-workspace':false}}}});
    await expect(create()).rejects.toMatchObject({status:403});
    expect((await team.detail('owner',w.workspaceId)).workspace.id).toBe(w.workspaceId);
    await team.command('owner',w.workspaceId,{type:'revoke-invite',invitationId:invitation.invitationId!,expectedRevision:1,mutationId:randomUUID()});
  });
  it('revalidates a changed deployment fingerprint at execution time', async () => {
    const draft: OperationPolicyDraft = {...initialOperationPolicy(),mode:'paid',releaseReview:{state:'approved',approvedModes:['paid'],subjectDigest:fingerprint,evidenceRef:'test-only-deployment-review',validUntil:null}};
    const impact = await policy.preview('admin',{expectedRevision:0,draft});
    process.env.TOONSTUDIO_LICENSE_FINGERPRINT = `sha256:${'d'.repeat(64)}`;
    await expect(policy.apply('admin',{expectedRevision:0,draft,previewDigest:impact.digest,reason:'다른 배포물 변경 테스트',mutationId:randomUUID()})).rejects.toMatchObject({status:409});
    expect((await policy.read('admin')).policy.draft.mode).toBe('free');
  });
  it('reruns additive migrations without resetting saved policy', async () => {
    const base = initialOperationPolicy();
    await applyDraft({...base,profiles:{...base.profiles,free:{...base.profiles.free,notice:'보존되는 운영 정책 안내'}}});
    for (const name of ['0084_production_model_v2_compatibility.sql','0085_production_team_workspace.sql','0086_production_operation_policy.sql']) await pool.query(migration(name));
    const saved = await policy.read('admin');
    expect(saved.policy.revision).toBe(1);
    expect(saved.policy.draft.profiles.free.notice).toBe('보존되는 운영 정책 안내');
    expect(saved.audit).toHaveLength(1);
  });
  it.skipIf(!process.env.PRODUCTION_OPERATION_TEST_RUNTIME_ROLE)('executes using least-privilege runtime grants and denies changing audit evidence', async () => {
    const role = process.env.PRODUCTION_OPERATION_TEST_RUNTIME_ROLE!;
    if (!/^[a-z_][a-z0-9_]{0,62}$/u.test(role)) throw new Error('Invalid isolated runtime role');
    await pool.query(`GRANT USAGE ON SCHEMA "${schema}" TO "${role}"`);
    await pool.query(`GRANT SELECT ON TABLE "user",creator_work,creator_work_collaborator,production_project TO "${role}"`);
    await pool.query(`GRANT UPDATE(status) ON TABLE "user" TO "${role}"`);
    await pool.query(buildProductionOperationRuntimeAclSql(role,schema));
    await pool.query(buildProductionOperationCapabilitySql(role,schema));
    const runtime = new Pool({connectionString:target,max:2,options:`-c search_path=${schema} -c role=${role}`});
    try {
      const runtimeTeam = new TeamWorkspaceRepository(runtime);
      const workspace = await runtimeTeam.create('owner',{name:'최소 권한 팀',mutationId:randomUUID()});
      expect((await runtimeTeam.detail('owner',workspace.workspaceId)).workspace.id).toBe(workspace.workspaceId);
      const runtimePolicy = new OperationPolicyRepository(runtime);
      const proposal = {expectedRevision:0,draft:initialOperationPolicy()};
      const result = await runtimePolicy.preview('admin',proposal);
      expect(await runtimePolicy.apply('admin',{...proposal,previewDigest:result.digest,mutationId:randomUUID(),reason:'최소 권한 설정 저장 검증'})).toEqual({acceptedRevision:1});
      await expect(runtime.query("UPDATE production_team_receipt SET response='{}'::jsonb")).rejects.toMatchObject({code:'42501'});
      await expect(runtime.query('DELETE FROM production_operation_policy_audit')).rejects.toMatchObject({code:'42501'});
    } finally { await runtime.end(); }
  });

});
