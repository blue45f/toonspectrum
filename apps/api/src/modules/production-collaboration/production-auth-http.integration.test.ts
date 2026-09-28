import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { Pool } from "pg";
import { vi, afterAll, beforeAll, describe, expect, it  } from "vitest";
import { validatePostgresIntegrationUrl } from "../../../../../scripts/run-postgres-integration-tests.mjs";

import { randomBytes, randomUUID } from "node:crypto";
import type { ProductionProjectAggregate, ProductionTask } from "@toonstudio/core/production";
import { createProductionWorkflowProfile } from "@toonstudio/contracts/production-workflow";

const url = process.env.TEST_DATABASE_URL;
type Actor = { email: string; password: string; id: string; cookie: string; verifiedToken: string };
type Workspace = { workspace: { revision: number; role: string; memberCount: number }; projects: unknown[] };
type Project = { aggregate: ProductionProjectAggregate; access: { view: boolean; edit: boolean; manage: boolean } };
describe.skipIf(!url)("실제 일반 가입·쿠키·PostgreSQL 협업 HTTP", () => {
  let h: Awaited<ReturnType<typeof createProductionAuthHttpHarness>>;
  const actors: Actor[] = [];
  let workspaceId = ""; let projectId = ""; let workId = "";
  beforeAll(async () => {
    h = await createProductionAuthHttpHarness(url!);
    for (const name of ["소유자", "편집자", "열람자"]) {
      const email = `collab-${randomUUID()}@example.test`;
      const password = `Aa7!${randomBytes(24).toString("base64url")}`;
      const signup = await h.request("/auth/signup", { body: { email, password, name } });
      expect(signup.status).toBe(201); expect(signup.body.verificationRequired).toBe(true);
      const denied = await h.request("/auth/login", { body: { email, password } });
      expect(denied.status).toBe(403); expect(denied.cookie).toBeNull();
      const token = h.outbox.get(email); expect(token).toBeTruthy();
      const verified = await h.request("/auth/email/verify", { body: { token } }); expect(verified.status).toBe(201);
      const login = await h.request<{ user: { id: string; role: string }; token?: string }>("/auth/login", { body: { email, password } });
      expect(login.status).toBe(201); expect(login.body.user.role).toBe("user"); expect(login.body.token).toBeUndefined();
      expect(login.cookie).toBeTruthy();
      actors.push({ email, password, id: login.body.user.id, cookie: login.cookie!, verifiedToken: token! });
    }
  }, 60_000);
  afterAll(async () => { await h?.close(); });
  const owner = () => actors[0]!, editor = () => actors[1]!, viewer = () => actors[2]!;
  async function team(actor = owner()): Promise<Workspace> {
    const result = await h.request<Workspace>(`/production/workspaces/${workspaceId}`, { cookie: actor.cookie });
    expect(result.status).toBe(200); return result.body;
  }
  async function teamCommand(command: Record<string, unknown>, actor = owner()) {
    const current = await team(actor);
    return h.request<{ token?: string; invitationId?: string }>(`/production/workspaces/${workspaceId}/commands`, {
      cookie: actor.cookie, body: { ...command, expectedRevision: current.workspace.revision, mutationId: randomUUID() },
    });
  }
  it("일반 계정 3개의 인증·세션을 실제 쿠키로 복원한다", async () => {
    expect(actors.length).toBe(3);
    for (const actor of actors) {
      const result = await h.request<{ user: { id: string } }>("/auth/session", { cookie: actor.cookie });
      expect(result.status).toBe(200); expect(result.body.user.id).toBe(actor.id);
      expect(result.headers.get("cache-control")).toContain("no-store");
      const repeated = await h.request("/auth/email/verify", { body: { token: actor.verifiedToken } });
      expect(repeated.status).toBe(400);
    }
  });
  it("위조 사용자 헤더와 미인증 요청은 팀 목록을 읽지 못한다", async () => {
    expect((await h.request("/production/workspaces")).status).toBe(403);
    expect((await h.request("/production/workspaces", { headers: { "x-user-id": owner().id } })).status).toBe(403);
  });
  it("쿠키가 있어도 CSRF 증명·출처가 없으면 변경을 거절한다", async () => {
    const body = { name: "CSRF 검증", mutationId: randomUUID() };
    const attempts: Record<string, string>[] = [{ "x-toonstudio-csrf": "" }, { Origin: "https://untrusted.example" }];
    for (const headers of attempts) {
      expect((await h.request("/production/workspaces", { body, cookie: owner().cookie, headers })).status).toBe(403);
    }
  });
  it("팀 생성은 정상 가입자의 쿠키로만 처리하고 재전송은 중복 생성하지 않는다", async () => {
    const body = { name: "협업 HTTP 검증", mutationId: randomUUID() };
    const first = await h.request<{ workspaceId: string }>("/production/workspaces", { cookie: owner().cookie, body });
    expect(first.status).toBe(201); workspaceId = first.body.workspaceId;
    const repeated = await h.request("/production/workspaces", { cookie: owner().cookie, body });
    expect(repeated.body).toEqual(first.body);
    expect((await team()).workspace.role).toBe("owner");
    expect((await h.request(`/production/workspaces/${workspaceId}`, { cookie: viewer().cookie })).status).toBe(404);
  });
  it("대상 이메일이 아닌 계정의 초대 수락을 차단하고 올바른 구성원을 수락한다", async () => {
    const invite = await teamCommand({ type: "invite", email: editor().email, role: "member" });
    expect(invite.status).toBe(201); expect(invite.body.token).toBeTruthy();
    const body = { token: invite.body.token, mutationId: randomUUID() };
    expect((await h.request("/production/workspaces/accept-invite", { cookie: viewer().cookie, body })).status).toBe(404);
    const accepted = await h.request("/production/workspaces/accept-invite", { cookie: editor().cookie, body });
    expect(accepted.status).toBe(201);
    expect((await h.request("/production/workspaces/accept-invite", { cookie: editor().cookie, body })).body).toEqual(accepted.body);
    expect((await team(editor())).workspace.role).toBe("member");
  });
  it("회수·재발행된 초대 링크는 사용할 수 없다", async () => {
    const old = await teamCommand({ type: "invite", email: viewer().email, role: "guest" });
    const fresh = await teamCommand({ type: "invite", email: viewer().email, role: "guest" });
    expect((await h.request("/production/workspaces/accept-invite", { cookie: viewer().cookie,
      body: { token: old.body.token, mutationId: randomUUID() } })).status).toBe(404);
    expect((await teamCommand({ type: "revoke-invite", invitationId: fresh.body.invitationId })).status).toBe(201);
    expect((await h.request("/production/workspaces/accept-invite", { cookie: viewer().cookie,
      body: { token: fresh.body.token, mutationId: randomUUID() } })).status).toBe(404);
    const final = await teamCommand({ type: "invite", email: viewer().email, role: "guest" });
    expect((await h.request("/production/workspaces/accept-invite", { cookie: viewer().cookie,
      body: { token: final.body.token, mutationId: randomUUID() } })).status).toBe(201);
    expect((await team(viewer())).workspace.role).toBe("guest");
  });
  it("비관리자 역할 승격·이름 변경과 마지막 소유자 제거를 거절한다", async () => {
    expect((await teamCommand({ type: "rename", name: "권한 없는 변경" }, editor())).status).toBe(403);
    expect((await teamCommand({ type: "change-member-role", userId: editor().id, role: "admin" }, editor())).status).toBe(403);
    expect((await teamCommand({ type: "remove-member", userId: owner().id })).status).toBe(409);
  });
  it("같은 버전의 동시 변경은 하나만 반영한다", async () => {
    const current = await team();
    const results = await Promise.all(["동시 변경 A", "동시 변경 B"].map((name) => h.request(`/production/workspaces/${workspaceId}/commands`, {
      cookie: owner().cookie, body: { type: "rename", name, mutationId: randomUUID(), expectedRevision: current.workspace.revision },
    })));
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    expect((await team()).workspace.revision).toBe(current.workspace.revision + 1);
  });
  async function project(actor = owner()) {
    const result = await h.request<Project>(`/production/projects/${projectId}`, { cookie: actor.cookie });
    expect(result.status).toBe(200); return result.body;
  }
  async function command(value: Record<string, unknown>, actor = owner()) {
    const current = await project(actor);
    return h.request<Project>(`/production/projects/${projectId}/commands`, { cookie: actor.cookie,
      body: { command: value, expectedRevision: current.aggregate.revision, mutationId: randomUUID() } });
  }
  it("동시에 재전송한 동일 프로젝트 생성은 같은 결과를 반환한다", async () => {
    workId = randomUUID(); projectId = randomUUID();
    // 계정은 가입 API로 생성한다. 작품과 작품별 ACL만 격리 DB의 선행 fixture다.
    await h.pool.query('INSERT INTO creator_work(id,"userId",title) VALUES($1,$2,$3)', [workId, owner().id, "비공개 검증 원고"]);
    const body = { projectId, workId, title: "실계정 HTTP 검증", collaborationModel: "solo",
      ownerPartyId: "http-owner", ownerDisplayName: "소유자", clientMutationId: randomUUID() };
    const results = await Promise.all([0, 1].map(() => h.request<Project>("/production/projects", { cookie: owner().cookie, body })));
    expect(results.map((result) => result.status)).toEqual([201, 201]);
    expect(results[1]!.body).toEqual(results[0]!.body);
    const rows = await h.pool.query('SELECT count(*)::int AS count FROM production_project WHERE "workId"=$1', [workId]);
    expect(rows.rows[0].count).toBe(1);
  });
  it("팀 초대 수락만으로 비공개 작품에 접근할 수 없다", async () => {
    expect((await teamCommand({ type: "attach-project", projectId })).status).toBe(201);
    expect((await team(editor())).projects).toHaveLength(0);
    expect((await h.request(`/production/projects/${projectId}`, { cookie: editor().cookie })).status).toBe(403);
    expect((await h.request(`/production/projects/${projectId}`, { cookie: viewer().cookie })).status).toBe(403);
  });
  it("소유권 회수 후 과거 프로젝트 생성 영수증으로 비공개 원고를 다시 읽지 못한다", async () => {
    const work = randomUUID(), id = randomUUID();
    await h.pool.query('INSERT INTO creator_work(id,"userId",title) VALUES($1,$2,$3)', [work, owner().id, "이전할 원고"]);
    const body = { projectId: id, workId: work, title: "이전 전 원고", collaborationModel: "solo",
      ownerPartyId: "previous-owner", ownerDisplayName: "소유자", clientMutationId: randomUUID() };
    expect((await h.request("/production/projects", { cookie: owner().cookie, body })).status).toBe(201);
    await h.pool.query('UPDATE creator_work SET "userId"=$2 WHERE id=$1', [work, viewer().id]);
    expect((await h.request(`/production/projects/${id}`, { cookie: owner().cookie })).status).toBe(403);
    expect((await h.request("/production/projects", { cookie: owner().cookie, body })).status).toBe(403);
  });
  it("작품별 편집자·열람자 권한을 분리하고 공정 설정 권한을 제한한다", async () => {
    await h.pool.query('INSERT INTO creator_work_collaborator("workId","userId",role,status) VALUES($1,$2,$3,$4),($1,$5,$6,$4)',
      [workId, editor().id, "editor", "active", viewer().id, "viewer"]);
    expect((await project(editor())).access).toMatchObject({ view: true, edit: true, manage: false });
    expect((await project(viewer())).access).toMatchObject({ view: true, edit: false, manage: false });
    const profile = createProductionWorkflowProfile(projectId, "solo", new Date().toISOString());
    expect((await command({ type: "configure-workflow", profile, expectedWorkflowRevision: 0 }, editor())).status).toBe(403);
    expect((await command({ type: "configure-workflow", profile, expectedWorkflowRevision: 0 }, viewer())).status).toBe(403);
    const saved = await command({ type: "configure-workflow", profile, expectedWorkflowRevision: 0 });
    expect(saved.status).toBe(201); expect(saved.body.aggregate.workflowProfile?.name).toBe(profile.name);
  });
  const scope = () => ({ kind: "project" as const, id: projectId, ancestors: [] });
  const taskDraft = (id: string): ProductionTask => ({ id, projectId, scope: scope(), processKey: "story-lock", title: id,
    status: "draft", priority: "normal", assignmentIds: ["assignment:http-owner:producer"], reviewerAssignmentIds: [],
    inputRevisionRefs: [], outputDeliverableIds: [], dependencyTaskIds: [], dueAt: null, estimateHours: null,
    completionCriteria: [], briefBlocks: [], sourceAgreementMilestoneId: null });
  it("공정 순환과 낡은 설정 버전은 전체 변경 없이 거절한다", async () => {
    const current = await project(); const profile = current.aggregate.workflowProfile!;
    const steps = profile.steps.map((step, index) => index === 0 ? { ...step, dependsOn: [profile.steps[1]!.key] } : step);
    expect((await command({ type: "configure-workflow", profile: { ...profile, steps, revision: profile.revision + 1 }, expectedWorkflowRevision: profile.revision })).status).toBe(400);
    expect((await project()).aggregate.revision).toBe(current.aggregate.revision);
    expect((await command({ type: "configure-workflow", profile: { ...profile, revision: profile.revision + 1 }, expectedWorkflowRevision: 0 })).status).toBe(409);
  });
  it("편집자는 작업을 만들고 열람자는 변경할 수 없으며 입력 고정 전 시작을 거절한다", async () => {
    const task = taskDraft("http-task-one");
    expect((await command({ type: "upsert-task", task }, viewer())).status).toBe(403);
    expect((await command({ type: "upsert-task", task }, editor())).status).toBe(201);
    expect((await command({ type: "transition-task-batch", transitions: [{ taskId: task.id, fromStatus: "draft", toStatus: "ready" }] }, editor())).status).toBe(201);
    const current = await project();
    const rejected = await command({ type: "transition-task-batch", transitions: [{ taskId: task.id, fromStatus: "ready", toStatus: "in-progress" }] }, editor());
    expect(rejected.status).toBe(400);
    expect((await project()).aggregate.revision).toBe(current.aggregate.revision);
    expect((await project()).aggregate.tasks[0]?.status).toBe("ready");
  });
  it("동시 진행 한도 초과는 원자적으로 거절하고 승인 없는 완료를 차단한다", async () => {
    const inputRevisionRefs = [{ id: "http-input", lineage: "narrative" as const, revision: 1,
      digest: `sha256:${"b".repeat(64)}`, createdAt: new Date().toISOString() }];
    const first = (await project()).aggregate.tasks[0]!;
    expect((await command({ type: "upsert-task", task: { ...first, inputRevisionRefs } }, editor())).status).toBe(201);
    expect((await command({ type: "upsert-task", task: { ...taskDraft("http-task-two"), inputRevisionRefs } }, editor())).status).toBe(201);
    expect((await command({ type: "transition-task-batch", transitions: [{ taskId: "http-task-two", fromStatus: "draft", toStatus: "ready" }] }, editor())).status).toBe(201);
    const transitions = [first.id, "http-task-two"].map((taskId) => ({ taskId, fromStatus: "ready", toStatus: "in-progress" }));
    const current = await project();
    expect((await command({ type: "transition-task-batch", transitions }, editor())).status).toBe(400);
    const after = await project(); expect(after.aggregate.revision).toBe(current.aggregate.revision);
    expect(after.aggregate.tasks.every((task) => task.status === "ready")).toBe(true);
    expect((await command({ type: "transition-task-batch", transitions: [transitions[0]] }, editor())).status).toBe(201);
    expect((await command({ type: "transition-task-batch", transitions: [{ taskId: first.id, fromStatus: "in-progress", toStatus: "done" }] }, editor())).status).toBe(400);
  });
  it("변경 재전송은 한 번만 저장하고 같은 요청 ID의 다른 내용은 거절한다", async () => {
    const current = await project(); const task = current.aggregate.tasks[0]!;
    const body = { expectedRevision: current.aggregate.revision, mutationId: randomUUID(), command: { type: "upsert-task", task: { ...task, title: "한 번만 저장" } } };
    const first = await h.request<Project>(`/production/projects/${projectId}/commands`, { cookie: editor().cookie, body });
    expect(first.status).toBe(201);
    const repeat = await h.request<Project>(`/production/projects/${projectId}/commands`, { cookie: editor().cookie, body });
    expect(repeat.body).toEqual(first.body);
    const changed = { ...body, command: { ...body.command, task: { ...task, title: "다른 내용" } } };
    expect((await h.request(`/production/projects/${projectId}/commands`, { cookie: editor().cookie, body: changed })).status).toBe(409);
    expect((await project()).aggregate.revision).toBe(current.aggregate.revision + 1);
  });
  it("다른 사용자의 검수 역할 사칭을 거절하고 승인자의 결정만 저장한다", async () => {
    const assignmentId = "assignment:http-owner:producer";
    const policy = { id: "http-review-policy", projectId, scope: scope(), responseDueHours: 24, expiredReviewAction: "escalate",
      lanes: [{ lane: "production", eligibleAssignmentIds: [assignmentId], requiredAssignmentIds: [assignmentId], quorum: 1, vetoAssignmentIds: [], blocksPublication: true }] };
    expect((await command({ type: "upsert-review-policy", policy })).status).toBe(201);
    const decision = { id: randomUUID(), reviewRoundId: "http-round", lane: "production", assignmentId,
      value: "approve", reasonCode: "checked", evidenceScopeRefs: [scope()], conditions: [], createdAt: new Date().toISOString() };
    expect((await command({ type: "record-review-decision", policyId: policy.id, decision }, editor())).status).toBe(403);
    expect((await command({ type: "record-review-decision", policyId: policy.id, decision }, viewer())).status).toBe(403);
    const saved = await command({ type: "record-review-decision", policyId: policy.id, decision });
    expect(saved.status).toBe(201); expect(saved.body.aggregate.reviewDecisions).toHaveLength(1);
  });
  it("작품 변경도 같은 revision의 동시 저장에서 하나만 성공한다", async () => {
    const current = await project(); const task = current.aggregate.tasks[0]!;
    const results = await Promise.all(["제목 A", "제목 B"].map((title) => h.request(`/production/projects/${projectId}/commands`, {
      cookie: editor().cookie, body: { expectedRevision: current.aggregate.revision, mutationId: randomUUID(), command: { type: "upsert-task", task: { ...task, title } } },
    })));
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
  });
  it("회수된 작품 권한은 과거 저장 요청 재전송에도 적용한다", async () => {
    const current = await project(); const task = current.aggregate.tasks[0]!;
    const body = { expectedRevision: current.aggregate.revision, mutationId: randomUUID(), command: { type: "upsert-task", task: { ...task, title: "회수 전 저장" } } };
    expect((await h.request(`/production/projects/${projectId}/commands`, { cookie: editor().cookie, body })).status).toBe(201);
    await h.pool.query('DELETE FROM creator_work_collaborator WHERE "workId"=$1 AND "userId"=$2', [workId, editor().id]);
    expect((await h.request(`/production/projects/${projectId}`, { cookie: editor().cookie })).status).toBe(403);
    expect((await h.request(`/production/projects/${projectId}/commands`, { cookie: editor().cookie, body })).status).toBe(403);
  });
  it("로그아웃은 다른 탭에 남은 같은 로그인 쿠키도 무효화한다", async () => {
    const oldCookie = owner().cookie;
    const response = await h.request("/auth/logout", { cookie: oldCookie, body: {} });
    expect(response.status).toBe(201);
    expect(response.cookie).toBe("toonstudio-auth-session=");
    expect(response.headers.get("set-cookie")).toContain("Expires=Thu, 01 Jan 1970");
    expect((await h.request(`/production/projects/${projectId}`, { cookie: oldCookie })).status).toBe(403);
    const session = await h.request("/auth/session", { cookie: oldCookie });
    expect(session.body.user).toBeNull();
  });
});

/** 가입·인증·세션·협업은 실제 구현, 이메일 전송만 테스트 수신함으로 대체한다. */
async function createProductionAuthHttpHarness(url: string) {
  validatePostgresIntegrationUrl(url);
  const schema = `collab_http_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: url, max: 1 });
  let app: INestApplication | null = null;
  let databasePool: Pool | null = null;
  let schemaCreated = false;
  const outbox = new Map<string, string>();
  const close = async () => {
    const failures: unknown[] = [];
    for (const action of [
      () => app?.close(), () => databasePool?.end(),
      () => schemaCreated ? admin.query(`DROP SCHEMA "${schema}" CASCADE`) : undefined,
      () => admin.end(),
    ]) { try { await action(); } catch (cause) { failures.push(cause); } }
    vi.unstubAllGlobals(); vi.unstubAllEnvs(); outbox.clear();
    if (failures.length) throw new AggregateError(failures, "격리 검증 환경 정리에 실패했습니다.");
  };
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`); schemaCreated = true;
    const target = new URL(url); target.searchParams.set("options", `-c search_path=${schema}`);
    vi.stubEnv("DATABASE_URL", target.href);
    vi.stubEnv("AUTH_SESSION_SECRET", randomBytes(48).toString("base64url"));
    vi.stubEnv("AUTH_EMAIL_PROVIDER", "resend");
    vi.stubEnv("AUTH_EMAIL_FROM", "test@example.test");
    vi.stubEnv("RESEND_API_KEY", randomBytes(24).toString("base64url"));
    vi.stubEnv("WEB_APP_BASE_URL", "http://127.0.0.1:5199");
    const originalFetch = globalThis.fetch;
    const { dbPool } = await import("../../platform/database");
    databasePool = dbPool;

    await dbPool.query(`CREATE TABLE "user" (
      id text PRIMARY KEY, name text, email text UNIQUE, "emailVerified" timestamp, image text,
      role text NOT NULL DEFAULT 'user', status text NOT NULL DEFAULT 'active', "mergedIntoUserId" text,
      "sessionVersion" integer NOT NULL DEFAULT 1, "suspendedAt" timestamp, "suspensionReason" text,
      "deletedAt" timestamp, "passwordHash" text, avatar text, bio text, "creatorRoleProfile" jsonb NOT NULL DEFAULT '{}',
      "regionSettings" jsonb, "createdAt" timestamp);
      CREATE TABLE "verificationToken"(identifier text NOT NULL, token text NOT NULL, expires timestamp NOT NULL, PRIMARY KEY(identifier, token));
      CREATE TABLE "session"("sessionToken" text PRIMARY KEY, "userId" text, expires timestamp);
      CREATE TABLE creator_work(id text PRIMARY KEY, "userId" text NOT NULL REFERENCES "user"(id), title text NOT NULL);
      CREATE TABLE creator_work_collaborator("workId" text REFERENCES creator_work(id), "userId" text REFERENCES "user"(id), role text, status text, PRIMARY KEY("workId", "userId"));`);
    for (const name of ["0053_production_collaboration_core.sql", "0084_production_model_v2_compatibility.sql", "0085_production_team_workspace.sql", "0086_production_operation_policy.sql"]) {
      const migration = readFileSync(new URL(`../../platform/database/migrations/${name}`, import.meta.url), "utf8").replaceAll("public.", `"${schema}".`);
      await dbPool.query(migration);
    }
    vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
      const href = input instanceof Request ? input.url : String(input);
      if (href === "https://api.resend.com/emails") {
        const mail = JSON.parse(String(init?.body)) as { to: string[]; text: string };
        const link = mail.text.split("\n").find((line) => line.startsWith("http://127.0.0.1:"));
        if (!link || !mail.to[0]) throw new Error("테스트 인증 메일 형식 오류");
        const token = new URL(link).searchParams.get("token");
        if (!token) throw new Error("테스트 인증 토큰 없음");
        outbox.set(mail.to[0], token);
        return new Response(JSON.stringify({ id: randomUUID() }));
      }
      if (new URL(href).hostname !== "127.0.0.1") throw new Error("검증 중 외부 통신 차단");
      return originalFetch(input, init);
    });
    const { Module } = await import("@nestjs/common");
    const { NestFactory } = await import("@nestjs/core");
    const { json } = await import("express");
    const { AuthController } = await import("../auth/auth.controller");
    const { AUTH_CLIENT_IP_POLICY, AUTH_RATE_LIMIT_CONFIG } = await import("../auth/auth.tokens");
    const { UPSTASH_COORDINATION_PORT } = await import("../../platform/adapters/upstash-coordination/upstash-coordination.port");
    const { StudioRealtimeRevocationService } = await import("../../platform/adapters/studio-realtime-revocation/studio-realtime-revocation.client");
    const { TeamWorkspaceController } = await import("./team-workspace.controller");
    const { TeamWorkspaceRepository, PRODUCTION_TEAM_POOL } = await import("./team-workspace.repository");
    const { ProductionCollaborationController } = await import("./production-collaboration.controller");
    const { ProductionCollaborationRepository } = await import("./production-collaboration.repository");
    const { ProductionCollaborationService } = await import("./production-collaboration.service");
    const { sessionAuth } = await import("../../session-middleware");
    const { createCsrfProtectionMiddleware } = await import("../../csrf-middleware");
    @Module({ controllers: [AuthController, TeamWorkspaceController, ProductionCollaborationController], providers: [
      { provide: AUTH_RATE_LIMIT_CONFIG, useValue: { distributed: false } },
      { provide: AUTH_CLIENT_IP_POLICY, useValue: { mode: "direct" } },
      { provide: UPSTASH_COORDINATION_PORT, useValue: null },
      { provide: StudioRealtimeRevocationService, useValue: new StudioRealtimeRevocationService({ enabled: false }) },
      { provide: PRODUCTION_TEAM_POOL, useValue: dbPool }, TeamWorkspaceRepository,
      ProductionCollaborationRepository, ProductionCollaborationService,
    ] })
    class IntegrationModule {}
    app = await NestFactory.create(IntegrationModule, { logger: false, bodyParser: false });
    app.use(sessionAuth);
    app.use(createCsrfProtectionMiddleware({ NODE_ENV: "test", API_CORS_ALLOWED_ORIGINS: "http://127.0.0.1:5199" }));
    app.use(json({ limit: "2mb" })); app.setGlobalPrefix("api");
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address() as AddressInfo;
    const base = `http://127.0.0.1:${address.port}`;
    async function request<T = Record<string, unknown>>(route: string, options: {
      method?: string; body?: unknown; cookie?: string | null; headers?: Record<string, string>;
    } = {}) {
      const response = await originalFetch(`${base}/api${route}`, {
        method: options.method ?? (options.body === undefined ? "GET" : "POST"), redirect: "error",
        headers: { "Content-Type": "application/json", Origin: "http://127.0.0.1:5199", "x-toonstudio-csrf": "1",
          ...(options.cookie ? { Cookie: options.cookie } : {}), ...options.headers },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }), signal: AbortSignal.timeout(15_000),
      });
      return { status: response.status, body: await response.json() as T,
        cookie: response.headers.get("set-cookie")?.split(";")[0] ?? null, headers: response.headers };
    }
    return { request, pool: dbPool, outbox, base, schema, close };
  } catch (cause) {
    try { await close(); }
    catch (cleanupError) { throw new AggregateError([cause, cleanupError], "검증 환경 초기화와 정리에 실패했습니다.", { cause: cleanupError }); }
    throw cause;
  }
}
