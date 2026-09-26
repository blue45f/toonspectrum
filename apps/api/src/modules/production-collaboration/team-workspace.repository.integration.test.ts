import { validatePostgresIntegrationUrl } from "../../../../../scripts/run-postgres-integration-tests.mjs";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TeamWorkspaceRepository } from "./team-workspace.repository";
import { WorkspaceCommandSchema, WorkspaceCreateSchema } from "./team-workspace.dto";

const url = process.env.TEST_DATABASE_URL;
const schema = `creco_free_${randomUUID().replaceAll("-", "")}`;
const migration = (name: string): string => readFileSync(new URL(`../../platform/database/migrations/${name}`, import.meta.url), "utf8").replaceAll("public.", `"${schema}".`);
const create = (name: string) => ({ name, mutationId: randomUUID() });
const versioned = (expectedRevision: number) => ({ expectedRevision, mutationId: randomUUID() });
describe.skipIf(!url)("free team workspace actual Postgres", () => {
  let admin: Pool;
  let pool: Pool;
  let repository: TeamWorkspaceRepository;
  beforeAll(async () => {
    validatePostgresIntegrationUrl(url);
    admin = new Pool({ connectionString: url, max: 1 });
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new Pool({ connectionString: url, max: 8, options: `-c search_path=${schema}` });
    await pool.query(`CREATE TABLE "user"(id text PRIMARY KEY,name text,email text UNIQUE,"emailVerified" timestamptz,status text NOT NULL DEFAULT 'active');
      CREATE TABLE creator_work(id text PRIMARY KEY,"userId" text NOT NULL REFERENCES "user"(id),title text NOT NULL);
      CREATE TABLE creator_work_collaborator("workId" text REFERENCES creator_work(id),"userId" text REFERENCES "user"(id),role text,status text,PRIMARY KEY("workId","userId"));`);
    await pool.query(migration("0053_production_collaboration_core.sql").replaceAll("public.", `"${schema}".`));
    await pool.query(migration("0084_production_model_v2_compatibility.sql"));
    await pool.query(migration("0085_production_team_workspace.sql"));
    await pool.query(migration("0086_production_operation_policy.sql"));
    repository = new TeamWorkspaceRepository(pool);
  });
  afterAll(async () => {
    await pool?.end();
    if (admin) { await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); }
  });
  async function user(verified = true): Promise<string> {
    const id = randomUUID();
    await pool.query(`INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,$4)`, [id, `Tester ${id.slice(0, 4)}`, `${id}@example.test`, verified ? new Date() : null]);
    return id;
  }
  async function invite(owner: string, workspaceId: string, target: string, revision: number, role: "member" | "admin" | "guest" = "member") {
    return repository.command(owner, workspaceId, { ...versioned(revision), type: "invite", email: `${target}@example.test`, role });
  }
  it("creates and replays without duplicate rows, rejects key reuse and strangers", async () => {
    const owner = await user(); const input = create("검증 팀");
    const first = await repository.create(owner, input);
    expect(await repository.create(owner, input)).toEqual(first);
    expect((await repository.list(owner)).workspaces).toHaveLength(1);
    await expect(repository.create(owner, { ...input, name: "다른 내용" })).rejects.toThrow();
    await expect(repository.detail(await user(), first.workspaceId)).rejects.toThrow();
    expect((await repository.detail(owner, first.workspaceId)).workspace.role).toBe("owner");
  });
  it("atomically admits only two owned workspaces under concurrent requests", async () => {
    const owner = await user();
    const outcomes = await Promise.allSettled(Array.from({ length: 8 }, (_, index) => repository.create(owner, create(`경쟁 ${index}`))));
    expect(outcomes.filter((item) => item.status === "fulfilled")).toHaveLength(2);
    expect((await repository.list(owner)).workspaces).toHaveLength(2);
  });
  it("rejects unverified or different-email invite acceptance", async () => {
    const owner = await user(); const invited = await user(false); const other = await user();
    const workspace = await repository.create(owner, create("이메일 확인"));
    const invitation = await invite(owner, workspace.workspaceId, invited, 0);
    expect(invitation.token).toHaveLength(43);
    await expect(repository.accept(other, { token: invitation.token!, mutationId: randomUUID() })).rejects.toThrow();
    await expect(repository.accept(invited, { token: invitation.token!, mutationId: randomUUID() })).rejects.toThrow();
  });
  it("reserves pending invites, swaps acceptance without double counting and never stores raw tokens", async () => {
    const owner = await user(); const workspace = await repository.create(owner, create("정원 팀"));
    const people = await Promise.all(Array.from({ length: 10 }, () => user()));
    let firstToken = ""; let firstId = "";
    for (let index = 0; index < 9; index += 1) {
      const invitation = await invite(owner, workspace.workspaceId, people[index], index);
      if (index === 0) { firstToken = invitation.token!; firstId = invitation.invitationId!; }
    }
    const usage = await repository.usage(owner, workspace.workspaceId);
    expect(usage.counters).toMatchObject({ members: 1, pendingInvites: 9 });
    expect(usage.originalStorage.usedBytes).toBeNull();
    await expect(invite(owner, workspace.workspaceId, people[9], 9)).rejects.toMatchObject({ status: 429 });
    const acceptInput = { token: firstToken, mutationId: randomUUID() };
    const accepted = await repository.accept(people[0], acceptInput);
    expect(await repository.accept(people[0], acceptInput)).toEqual(accepted);
    expect((await repository.usage(owner, workspace.workspaceId)).counters).toMatchObject({ members: 2, pendingInvites: 8 });
    const stored = await pool.query("SELECT response FROM production_team_receipt WHERE workspace_id=$1", [workspace.workspaceId]);
    expect(JSON.stringify(stored.rows)).not.toContain(firstToken);
    expect((await pool.query("SELECT token_hash FROM production_team_invite WHERE id=$1", [firstId])).rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/u);
  });
  it("invalidates old tokens on reissue and rejects revoked tokens", async () => {
    const owner = await user(); const target = await user(); const workspace = await repository.create(owner, create("초대 회수"));
    const old = await invite(owner, workspace.workspaceId, target, 0);
    const fresh = await invite(owner, workspace.workspaceId, target, 1);
    await expect(repository.accept(target, { token: old.token!, mutationId: randomUUID() })).rejects.toThrow();
    expect((await repository.usage(owner, workspace.workspaceId)).counters.pendingInvites).toBe(1);
    await repository.command(owner, workspace.workspaceId, { ...versioned(2), type: "revoke-invite", invitationId: fresh.invitationId! });
    await expect(repository.accept(target, { token: fresh.token!, mutationId: randomUUID() })).rejects.toThrow();
  });
  it("has one successful concurrent rename and forbids non-manager mutations", async () => {
    const owner = await user(); const member = await user(); const workspace = await repository.create(owner, create("변경 경쟁"));
    const invitation = await invite(owner, workspace.workspaceId, member, 0);
    await repository.accept(member, { token: invitation.token!, mutationId: randomUUID() });
    await expect(repository.command(member, workspace.workspaceId, { ...versioned(2), type: "rename", name: "승격 시도" })).rejects.toMatchObject({ status: 403 });
    const results = await Promise.allSettled(["변경 A", "변경 B"].map((name) => repository.command(owner, workspace.workspaceId, { ...versioned(2), type: "rename", name })));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  });
  it("protects the last owner in both commands and deferred database constraints", async () => {
    const owner = await user(); const workspace = await repository.create(owner, create("소유자 보호"));
    await expect(repository.command(owner, workspace.workspaceId, { ...versioned(0), type: "remove-member", userId: owner })).rejects.toThrow();
    await expect(pool.query("DELETE FROM production_team_member WHERE workspace_id=$1", [workspace.workspaceId])).rejects.toMatchObject({ code: "23514" });
    expect((await repository.detail(owner, workspace.workspaceId)).workspace.memberCount).toBe(1);
  });
  it("transfers owner atomically without changing work ownership", async () => {
    const owner = await user(); const member = await user(); const workspace = await repository.create(owner, create("소유권 이전"));
    const invitation = await invite(owner, workspace.workspaceId, member, 0);
    await repository.accept(member, { token: invitation.token!, mutationId: randomUUID() });
    await repository.command(owner, workspace.workspaceId, { ...versioned(2), type: "transfer-owner", userId: member });
    expect((await repository.detail(member, workspace.workspaceId)).workspace).toMatchObject({ ownerUserId: member, role: "owner" });
    expect((await repository.detail(owner, workspace.workspaceId)).workspace.role).toBe("admin");
    await expect(repository.command(owner, workspace.workspaceId, { ...versioned(3), type: "remove-member", userId: member })).rejects.toThrow();
  });
  it("rechecks current membership before replaying an old successful mutation", async () => {
    const owner = await user(); const member = await user(); const workspace = await repository.create(owner, create("재전송 권한"));
    const invitation = await invite(owner, workspace.workspaceId, member, 0, "admin");
    await repository.accept(member, { token: invitation.token!, mutationId: randomUUID() });
    const input = { ...versioned(2), type: "rename" as const, name: "변경됨" };
    await repository.command(member, workspace.workspaceId, input);
    await repository.command(owner, workspace.workspaceId, { ...versioned(3), type: "remove-member", userId: member });
    await expect(repository.command(member, workspace.workspaceId, input)).rejects.toThrow();
  });
  async function project(owner: string, modelVersion = 2): Promise<string> {
    const workId = randomUUID(); const id = randomUUID();
    await pool.query('INSERT INTO creator_work(id,"userId",title) VALUES($1,$2,$3)', [workId, owner, "비공개 작품"]);
    const aggregate = { modelVersion, projectId: id, workId, revision: 0, parties: [], assignments: [], auditEvents: [] };
    await pool.query(`INSERT INTO production_project(id,"workId",title,"collaborationModel","modelVersion",revision,aggregate)
      VALUES($1,$2,$3,'solo',$4,0,$5::jsonb)`, [id, workId, "비공개 작품", modelVersion, JSON.stringify(aggregate)]);
    return id;
  }
  it("accepts v1 and v2 records, upgrades metadata with content, rejects unknown versions", async () => {
    const owner = await user(); const legacy = await project(owner, 1); const current = await project(owner, 2);
    expect((await pool.query('SELECT "modelVersion" FROM production_project WHERE id=$1', [current])).rows[0].modelVersion).toBe(2);
    await pool.query(`UPDATE production_project SET "modelVersion"=2,aggregate=jsonb_set(aggregate,'{modelVersion}','2') WHERE id=$1`, [legacy]);
    await expect(project(owner, 3)).rejects.toMatchObject({ code: "23514" });
    await expect(pool.query('UPDATE production_project SET "modelVersion"=1 WHERE id=$1', [current])).rejects.toMatchObject({ code: "23514" });
  });
  it("links only owned projects and does not leak titles or grant work access to team members", async () => {
    const owner = await user(); const member = await user(); const stranger = await user();
    const workspace = await repository.create(owner, create("작품 권한"));
    const projectId = await project(owner);
    await repository.command(owner, workspace.workspaceId, { ...versioned(0), type: "attach-project", projectId });
    await expect(repository.command(owner, workspace.workspaceId, { ...versioned(1), type: "attach-project", projectId: await project(stranger) })).rejects.toThrow();
    const invitation = await invite(owner, workspace.workspaceId, member, 1);
    await repository.accept(member, { token: invitation.token!, mutationId: randomUUID() });
    expect((await repository.detail(owner, workspace.workspaceId)).projects).toHaveLength(1);
    const hidden = await repository.detail(member, workspace.workspaceId);
    expect(hidden.projects).toEqual([]); expect(hidden.workspace.projectCount).toBe(0);
    const work = (await pool.query('SELECT "workId" FROM production_project WHERE id=$1', [projectId])).rows[0].workId;
    await pool.query(`INSERT INTO creator_work_collaborator("workId","userId",role,status) VALUES($1,$2,'viewer','active')`, [work, member]);
    expect((await repository.detail(member, workspace.workspaceId)).projects).toHaveLength(1);
    const second = await repository.create(owner, create("다른 팀"));
    await expect(repository.command(owner, second.workspaceId, { ...versioned(0), type: "attach-project", projectId })).rejects.toThrow();
    await repository.command(owner, workspace.workspaceId, { ...versioned(3), type: "detach-project", projectId });
    expect((await pool.query("SELECT id FROM production_project WHERE id=$1", [projectId])).rowCount).toBe(1);
  });
  it("hides invite identities from members and stops suspended accounts", async () => {
    const owner = await user(); const member = await user(); const workspace = await repository.create(owner, create("노출 방지"));
    const invitation = await invite(owner, workspace.workspaceId, member, 0, "guest");
    await repository.accept(member, { token: invitation.token!, mutationId: randomUUID() });
    const guest = await repository.detail(member, workspace.workspaceId);
    expect(guest.members).toEqual([]); expect(guest.invites).toEqual([]);
    await expect(repository.usage(member, workspace.workspaceId)).rejects.toMatchObject({ status: 403 });
    await pool.query(`UPDATE "user" SET status='suspended' WHERE id=$1`, [member]);
    await expect(repository.list(member)).rejects.toThrow();
  });
});

describe("workspace strict input contracts", () => {
  it("rejects billing commands, actor spoofing, owner invitation and empty names", () => {
    expect(WorkspaceCreateSchema.safeParse({ ...create(""), ownerUserId: "forged" }).success).toBe(false);
    expect(WorkspaceCommandSchema.safeParse({ ...versioned(0), type: "checkout", price: 0 }).success).toBe(false);
    expect(WorkspaceCommandSchema.safeParse({ ...versioned(0), type: "invite", email: "a@example.test", role: "owner" }).success).toBe(false);
    expect(WorkspaceCommandSchema.safeParse({ ...versioned(0), type: "rename", name: "ok", userId: "forged" }).success).toBe(false);
  });
});
