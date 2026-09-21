import { createHash, randomBytes, randomUUID } from "node:crypto";
import { ConflictException, ForbiddenException, HttpException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Pool, PoolClient } from "pg";
import {
  FREE_USAGE_POLICY, isWorkspaceManager, nextSeoulDay,
  type TeamWorkspaceDetail, type TeamWorkspaceSummary, type TeamWorkspaceRole,
  type TeamWorkspaceMember, type TeamWorkspaceInvite, type TeamWorkspaceProject,
  type WorkspaceMutationResult, type WorkspaceUsageResponse,
} from "@toonspectrum/contracts/production-workspace";
import type { WorkspaceCommand } from "./team-workspace.dto";
import { loadOperationPolicy, runtimeLicenseFingerprint, workspaceAdmissionPolicy } from "../operation-policy/operation-policy.repository";
import { resolveOperationPolicy } from "@toonspectrum/contracts/operation-policy";

export const PRODUCTION_TEAM_POOL = Symbol("PRODUCTION_TEAM_POOL");
interface WorkspaceRow { id: string; name: string; owner_user_id: string; revision: number; created_at: Date; role: TeamWorkspaceRole }
interface ActiveUser { id: string; email: string | null; emailVerified: Date | null }
const hash = (value: string): string => createHash("sha256").update(value).digest("hex");
function digest(value: unknown): string {
  const canonical = (input: unknown): unknown => Array.isArray(input) ? input.map(canonical)
    : input !== null && typeof input === "object"
      ? Object.fromEntries(Object.entries(input).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonical(entry)])) : input;
  return hash(JSON.stringify(canonical(value)));
}
function quota(resource: string, current: number, limit: number): never {
  throw new HttpException({ code: "usage_limit_reached", resource, current, limit,
    message: "이용 한도에 도달했습니다. 사용 중인 항목을 정리한 뒤 다시 시도해주세요." }, 429);
}
const projectAccess = `EXISTS (SELECT 1 FROM creator_work cw WHERE cw.id=p."workId" AND (
  cw."userId"=$1 OR EXISTS (SELECT 1 FROM creator_work_collaborator c WHERE c."workId"=cw.id
  AND c."userId"=$1 AND c.status='active' AND c.role IN ('admin','editor','commenter','viewer'))))`;

@Injectable()
export class TeamWorkspaceRepository {
  constructor(@Inject(PRODUCTION_TEAM_POOL) private readonly pool: Pool) {}
  private async transaction<T>(action: (client: PoolClient) => Promise<T>, write = false): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // Shared only by low-frequency organization changes; never manuscript edits.
      if (write) await client.query("SELECT pg_advisory_xact_lock(173205, 1101)");
      const result = await action(client);
      await client.query("COMMIT");
      return result;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
  private async activeUser(client: PoolClient, actor: string): Promise<ActiveUser> {
    const result = await client.query<ActiveUser>(`SELECT id,email,"emailVerified" FROM "user" WHERE id=$1 AND status='active' FOR SHARE`, [actor]);
    if (!result.rows[0]) throw new ForbiddenException("유효한 로그인이 필요합니다.");
    return result.rows[0];
  }
  private async access(client: PoolClient, actor: string, workspaceId: string, lock = false): Promise<WorkspaceRow> {
    const result = await client.query<WorkspaceRow>(`SELECT w.*,m.role FROM production_team_workspace w
      JOIN production_team_member m ON m.workspace_id=w.id AND m.user_id=$1 WHERE w.id=$2 ${lock ? "FOR UPDATE OF w FOR SHARE OF m" : "FOR SHARE OF w, m"}`, [actor, workspaceId]);
    if (!result.rows[0]) throw new NotFoundException("접근 가능한 워크스페이스가 없습니다.");
    return result.rows[0];
  }
  private async summary(client: PoolClient, actor: string, row: WorkspaceRow): Promise<TeamWorkspaceSummary> {
    const result = await client.query<{ projects: number; members: number; pending: number }>(`SELECT
      (SELECT count(*)::int FROM production_team_project l JOIN production_project p ON p.id=l.project_id
        WHERE l.workspace_id=$2 AND ${projectAccess}) projects,
      (SELECT count(*)::int FROM production_team_member WHERE workspace_id=$2) members,
      (SELECT count(*)::int FROM production_team_invite WHERE workspace_id=$2 AND revoked_at IS NULL
        AND accepted_at IS NULL AND expires_at>now()) pending`, [actor, row.id]);
    const counts = result.rows[0];
    return { id: row.id, name: row.name, ownerUserId: row.owner_user_id, revision: row.revision,
      role: row.role, createdAt: row.created_at.toISOString(), projectCount: counts.projects,
      memberCount: counts.members, pendingInvites: isWorkspaceManager(row.role) ? counts.pending : 0 };
  }
  async list(actor: string): Promise<{ workspaces: TeamWorkspaceSummary[] }> {
    return this.transaction(async (client) => {
      await this.activeUser(client, actor);
      const rows = await client.query<WorkspaceRow>(`SELECT w.*,m.role FROM production_team_workspace w
        JOIN production_team_member m ON m.workspace_id=w.id AND m.user_id=$1 ORDER BY w.created_at DESC,w.id LIMIT 100`, [actor]);
      const workspaces: TeamWorkspaceSummary[] = [];
      for (const row of rows.rows) workspaces.push(await this.summary(client, actor, row));
      return { workspaces };
    });
  }
  async detail(actor: string, workspaceId: string): Promise<TeamWorkspaceDetail> {
    return this.transaction(async (client) => {
      await this.activeUser(client, actor);
      const row = await this.access(client, actor, workspaceId);
      const projects = await client.query<TeamWorkspaceProject>(`SELECT p.id,p."workId",p.title
        FROM production_team_project l JOIN production_project p ON p.id=l.project_id
        WHERE l.workspace_id=$2 AND ${projectAccess} ORDER BY p.title,p.id`, [actor, workspaceId]);
      const members = row.role === "guest" ? [] : (await client.query<TeamWorkspaceMember>(`SELECT m.user_id "userId",
        coalesce(u.name,'구성원') "displayName",m.role,to_char(m.joined_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') "joinedAt"
        FROM production_team_member m JOIN "user" u ON u.id=m.user_id WHERE m.workspace_id=$1 ORDER BY m.joined_at,m.user_id`, [workspaceId])).rows;
      const invites = !isWorkspaceManager(row.role) ? [] : (await client.query<TeamWorkspaceInvite>(`SELECT id,email,role,
        to_char(expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') "expiresAt" FROM production_team_invite
        WHERE workspace_id=$1 AND revoked_at IS NULL AND accepted_at IS NULL AND expires_at>now() ORDER BY created_at`, [workspaceId])).rows;
      return { workspace: await this.summary(client, actor, row), projects: projects.rows, members, invites };
    });
  }
  async usage(actor: string, workspaceId: string): Promise<WorkspaceUsageResponse> {
    return this.transaction(async (client) => {
      await this.activeUser(client, actor);
      const row = await this.access(client, actor, workspaceId);
      if (!isWorkspaceManager(row.role)) throw new ForbiddenException("운영 사용량은 관리자만 확인할 수 있습니다.");
      const counts = (await client.query<{ owned: number; projects: number; members: number; pending: number }>(`SELECT
        (SELECT count(*)::int FROM production_team_workspace WHERE owner_user_id=$1) owned,
        (SELECT count(*)::int FROM production_team_project WHERE workspace_id=$2) projects,
        (SELECT count(*)::int FROM production_team_member WHERE workspace_id=$2) members,
        (SELECT count(*)::int FROM production_team_invite WHERE workspace_id=$2 AND revoked_at IS NULL AND accepted_at IS NULL AND expires_at>now()) pending`, [row.owner_user_id, workspaceId])).rows[0];
      const effective = resolveOperationPolicy(await loadOperationPolicy(client), runtimeLicenseFingerprint(), new Date());
      return { policy: { ...FREE_USAGE_POLICY, ...effective.limits }, workspaceId, operationMode: effective.mode, policyRevision: effective.revision, counters: { ownedWorkspaces: counts.owned,
        projects: counts.projects, members: counts.members, pendingInvites: counts.pending },
        originalStorage: { status: "not-instrumented", usedBytes: null }, nextDailyResetAt: nextSeoulDay(new Date()),
        externalAiEnabled: false, meteredProvidersEnabled: false };
    });
  }
  private async receipt(client: PoolClient, actor: string, mutationId: string, input: unknown): Promise<WorkspaceMutationResult | null> {
    const receipt = (await client.query<{ request_digest: string; response: WorkspaceMutationResult; workspace_id: string }>(
      "SELECT request_digest,response,workspace_id FROM production_team_receipt WHERE actor_user_id=$1 AND mutation_id=$2", [actor, mutationId])).rows[0];
    if (!receipt) return null;
    await this.access(client, actor, receipt.workspace_id);
    if (receipt.request_digest !== digest(input)) throw new ConflictException({ code: "idempotency_key_reuse", message: "같은 요청 ID의 내용이 다릅니다." });
    return receipt.response;
  }
  private async record(client: PoolClient, actor: string, mutationId: string, input: unknown,
    result: WorkspaceMutationResult, action: string, target: string): Promise<void> {
    const safeResult = { ...result, token: undefined };
    await client.query(`INSERT INTO production_team_receipt(actor_user_id,mutation_id,workspace_id,request_digest,response)
      VALUES($1,$2,$3,$4,$5::jsonb)`, [actor, mutationId, result.workspaceId, digest(input), JSON.stringify(safeResult)]);
    await client.query(`INSERT INTO production_team_audit(workspace_id,actor_user_id,action,target_id,revision)
      VALUES($1,$2,$3,$4,$5)`, [result.workspaceId, actor, action, target, result.revision]);
  }
  async create(actor: string, input: { name: string; mutationId: string }): Promise<WorkspaceMutationResult> {
    return this.transaction(async (client) => {
      await this.activeUser(client, actor);
      const replay = await this.receipt(client, actor, input.mutationId, { type: "create", ...input });
      if (replay) return replay;
      const policy = await workspaceAdmissionPolicy(client);
      const count = (await client.query<{ count: number }>("SELECT count(*)::int count FROM production_team_workspace WHERE owner_user_id=$1", [actor])).rows[0].count;
      if (count >= (policy?.limits.ownedWorkspaces ?? FREE_USAGE_POLICY.ownedWorkspaces)) quota("ownedWorkspaces", count, (policy?.limits.ownedWorkspaces ?? FREE_USAGE_POLICY.ownedWorkspaces));
      const id = randomUUID();
      await client.query("INSERT INTO production_team_workspace(id,name,owner_user_id) VALUES($1,$2,$3)", [id, input.name, actor]);
      await client.query("INSERT INTO production_team_member(workspace_id,user_id,role) VALUES($1,$2,'owner')", [id, actor]);
      const result = { workspaceId: id, revision: 0 };
      await this.record(client, actor, input.mutationId, { type: "create", ...input }, result, "workspace.created", id);
      return result;
    }, true);
  }
  async command(actor: string, workspaceId: string, input: WorkspaceCommand): Promise<WorkspaceMutationResult> {
    return this.transaction(async (client) => {
      await this.activeUser(client, actor);
      const row = await this.access(client, actor, workspaceId, true);
      const leaving = input.type === "remove-member" && input.userId === actor;
      if (!isWorkspaceManager(row.role) && !leaving) throw new ForbiddenException("관리 권한이 필요합니다.");
      const request = { workspaceId, ...input };
      const replay = await this.receipt(client, actor, input.mutationId, request);
      if (replay) return replay;
      if (row.revision !== input.expectedRevision) throw new ConflictException({ code: "workspace_revision_conflict", message: "다른 변경이 있습니다. 새로고침 후 다시 확인해주세요.", currentRevision: row.revision });
      const policy = ["invite", "attach-project", "transfer-owner"].includes(input.type)
        ? await workspaceAdmissionPolicy(client) : null;
      let extra: Partial<WorkspaceMutationResult> = {};
      let target = workspaceId;
      switch (input.type) {
        case "rename":
          await client.query("UPDATE production_team_workspace SET name=$2 WHERE id=$1", [workspaceId, input.name]);
          break;
        case "invite": {
          if (row.role !== "owner" && input.role === "admin") throw new ForbiddenException("관리자 초대는 소유자만 할 수 있습니다.");
          const exists = await client.query(`SELECT 1 FROM production_team_member m JOIN "user" u ON u.id=m.user_id
            WHERE m.workspace_id=$1 AND lower(u.email)=$2`, [workspaceId, input.email]);
          if (exists.rowCount) throw new ConflictException("이미 참여한 구성원입니다.");
          await client.query(`UPDATE production_team_invite SET revoked_at=now() WHERE workspace_id=$1
            AND revoked_at IS NULL AND accepted_at IS NULL AND (expires_at<=now() OR email=$2)`, [workspaceId, input.email]);
          const count = await this.capacity(client, workspaceId);
          if (count >= (policy?.limits.membersPerWorkspace ?? FREE_USAGE_POLICY.membersPerWorkspace)) quota("members", count, (policy?.limits.membersPerWorkspace ?? FREE_USAGE_POLICY.membersPerWorkspace));
          const token = randomBytes(32).toString("base64url");
          const invitationId = randomUUID();
          const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
          await client.query(`INSERT INTO production_team_invite(id,workspace_id,email,role,token_hash,created_by,expires_at)
            VALUES($1,$2,$3,$4,$5,$6,$7)`, [invitationId, workspaceId, input.email, input.role, hash(token), actor, expiresAt]);
          extra = { invitationId, token, expiresAt, delivery: "manual-link" };
          target = invitationId;
          break;
        }
        case "revoke-invite":
          await client.query("UPDATE production_team_invite SET revoked_at=now() WHERE id=$1 AND workspace_id=$2 AND accepted_at IS NULL", [input.invitationId, workspaceId]);
          target = input.invitationId;
          break;
        case "change-member-role":
        case "remove-member": {
          const member = (await client.query<{ role: TeamWorkspaceRole }>("SELECT role FROM production_team_member WHERE workspace_id=$1 AND user_id=$2", [workspaceId, input.userId])).rows[0];
          if (!member) throw new NotFoundException("구성원을 찾을 수 없습니다.");
          if (member.role === "owner") throw new ConflictException("소유권을 먼저 이전해주세요.");
          if (!leaving && row.role !== "owner" && (member.role === "admin" || (input.type === "change-member-role" && input.role === "admin"))) throw new ForbiddenException("관리자 권한 변경은 소유자만 할 수 있습니다.");
          if (input.type === "remove-member") await client.query("DELETE FROM production_team_member WHERE workspace_id=$1 AND user_id=$2", [workspaceId, input.userId]);
          else await client.query("UPDATE production_team_member SET role=$3 WHERE workspace_id=$1 AND user_id=$2", [workspaceId, input.userId, input.role]);
          target = input.userId;
          break;
        }
        case "transfer-owner": {
          if (row.role !== "owner") throw new ForbiddenException("소유자만 이전할 수 있습니다.");
          if (actor === input.userId) throw new ConflictException("현재 소유자입니다.");
          await this.activeUser(client, input.userId);
          await this.access(client, input.userId, workspaceId);
          const count = (await client.query<{ count: number }>("SELECT count(*)::int count FROM production_team_workspace WHERE owner_user_id=$1", [input.userId])).rows[0].count;
          if (count >= (policy?.limits.ownedWorkspaces ?? FREE_USAGE_POLICY.ownedWorkspaces)) quota("ownedWorkspaces", count, (policy?.limits.ownedWorkspaces ?? FREE_USAGE_POLICY.ownedWorkspaces));
          await client.query("UPDATE production_team_member SET role='admin' WHERE workspace_id=$1 AND user_id=$2", [workspaceId, actor]);
          await client.query("UPDATE production_team_member SET role='owner' WHERE workspace_id=$1 AND user_id=$2", [workspaceId, input.userId]);
          await client.query("UPDATE production_team_workspace SET owner_user_id=$2 WHERE id=$1", [workspaceId, input.userId]);
          target = input.userId;
          break;
        }
        case "attach-project": {
          // Linking an organization never grants manuscript access or changes work ownership.
          const project = await client.query(`SELECT p.id FROM production_project p JOIN creator_work w ON w.id=p."workId"
            WHERE p.id=$1 AND w."userId"=$2 FOR SHARE OF w`, [input.projectId, actor]);
          if (!project.rowCount) throw new NotFoundException("직접 소유한 작품만 연결할 수 있습니다.");
          const linked = (await client.query<{ workspace_id: string }>("SELECT workspace_id FROM production_team_project WHERE project_id=$1", [input.projectId])).rows[0];
          if (linked && linked.workspace_id !== workspaceId) throw new ConflictException("다른 워크스페이스에 연결된 작품입니다.");
          if (!linked) {
            const count = (await client.query<{ count: number }>("SELECT count(*)::int count FROM production_team_project WHERE workspace_id=$1", [workspaceId])).rows[0].count;
            if (count >= (policy?.limits.projectsPerWorkspace ?? FREE_USAGE_POLICY.projectsPerWorkspace)) quota("projects", count, (policy?.limits.projectsPerWorkspace ?? FREE_USAGE_POLICY.projectsPerWorkspace));
            await client.query("INSERT INTO production_team_project(project_id,workspace_id,linked_by) VALUES($1,$2,$3)", [input.projectId, workspaceId, actor]);
          }
          target = input.projectId;
          break;
        }
        case "detach-project":
          await client.query("DELETE FROM production_team_project WHERE project_id=$1 AND workspace_id=$2", [input.projectId, workspaceId]);
          target = input.projectId;
          break;
      }
      const revision = row.revision + 1;
      await client.query("UPDATE production_team_workspace SET revision=$2,updated_at=now() WHERE id=$1", [workspaceId, revision]);
      const result = { workspaceId, revision, ...extra };
      await this.record(client, actor, input.mutationId, request, result, `workspace.${input.type}`, target);
      return result;
    }, true);
  }
  private async capacity(client: PoolClient, workspaceId: string): Promise<number> {
    return (await client.query<{ count: number }>(`SELECT (
      (SELECT count(*) FROM production_team_member WHERE workspace_id=$1) +
      (SELECT count(*) FROM production_team_invite WHERE workspace_id=$1 AND revoked_at IS NULL
        AND accepted_at IS NULL AND expires_at>now()))::int count`, [workspaceId])).rows[0].count;
  }
  async accept(actor: string, input: { token: string; mutationId: string }): Promise<WorkspaceMutationResult> {
    return this.transaction(async (client) => {
      const user = await this.activeUser(client, actor);
      if (!user.email || !user.emailVerified) throw new ForbiddenException("초대받은 이메일의 인증이 필요합니다.");
      const request = { type: "accept-invite", ...input };
      const replay = await this.receipt(client, actor, input.mutationId, request);
      if (replay) return replay;
      const invitation = (await client.query<{ id: string; workspace_id: string; email: string; role: TeamWorkspaceRole; accepted_at: Date | null }>(
        `SELECT id,workspace_id,email,role,accepted_at FROM production_team_invite WHERE token_hash=$1
         AND revoked_at IS NULL AND expires_at>now() FOR UPDATE`, [hash(input.token)])).rows[0];
      if (!invitation || invitation.email !== user.email.trim().toLowerCase()) throw new NotFoundException("사용 가능한 초대가 없습니다. 초대받은 이메일로 로그인해주세요.");
      const row = (await client.query<{ revision: number }>("SELECT revision FROM production_team_workspace WHERE id=$1 FOR UPDATE", [invitation.workspace_id])).rows[0];
      if (!row) throw new NotFoundException("사용 가능한 초대가 없습니다.");
      const member = await client.query("SELECT 1 FROM production_team_member WHERE workspace_id=$1 AND user_id=$2", [invitation.workspace_id, actor]);
      if (invitation.accepted_at && !member.rowCount) throw new NotFoundException("이미 사용된 초대입니다.");
      if (!member.rowCount) {
        const policy = await workspaceAdmissionPolicy(client);
        const count = await this.capacity(client, invitation.workspace_id);
        if (count > (policy?.limits.membersPerWorkspace ?? FREE_USAGE_POLICY.membersPerWorkspace)) quota("members", count, (policy?.limits.membersPerWorkspace ?? FREE_USAGE_POLICY.membersPerWorkspace));
        await client.query("INSERT INTO production_team_member(workspace_id,user_id,role) VALUES($1,$2,$3)", [invitation.workspace_id, actor, invitation.role]);
      }
      await client.query("UPDATE production_team_invite SET accepted_at=coalesce(accepted_at,now()) WHERE id=$1", [invitation.id]);
      const revision = row.revision + (invitation.accepted_at ? 0 : 1);
      await client.query("UPDATE production_team_workspace SET revision=$2,updated_at=now() WHERE id=$1", [invitation.workspace_id, revision]);
      const result = { workspaceId: invitation.workspace_id, revision };
      await this.record(client, actor, input.mutationId, request, result, "workspace.invite-accepted", invitation.id);
      return result;
    }, true);
  }
}
