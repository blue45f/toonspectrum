import { randomUUID } from "node:crypto";

import { ConflictException, ForbiddenException, HttpException, NotFoundException } from "@nestjs/common";

import { HiringStore } from "../collaboration/hiring.store";

import type { CreatorTeam, CreatorTeamGroup, CreatorTeamInvite, CreatorTeamMember } from "../../../../../packages/contracts/src/creator-hiring";
import type { PoolClient } from "pg";

export class CreatorTeamRepository {
  constructor(readonly store = new HiringStore()) {}
  async team(c: PoolClient, actor: string, id: string, owner = false) {
    const rows = await c.query<{ id: string; owner_id: string; revision: number }>(`SELECT * FROM creator_hiring_team WHERE id=$1 FOR UPDATE`, [id]);
    const membership = await c.query(`SELECT user_id FROM creator_hiring_team_member WHERE team_id=$1 AND user_id=$2 AND status='active'`, [id, actor]);
    if (!rows.rows[0] || !membership.rows.length) throw new NotFoundException("참여 중인 팀을 찾을 수 없어요.");
    if (owner && rows.rows[0].owner_id !== actor) throw new ForbiddenException("팀 소유자만 관리할 수 있어요.");
    return rows.rows[0];
  }
  list(actor: string): Promise<CreatorTeam[]> {
    return this.store.tx(async (c) => {
      await this.store.active(c, actor);
      const rows = await c.query<{ id: string; name: string; owner_id: string; revision: number; count: number }>(`SELECT t.*,(SELECT count(*)::int FROM creator_hiring_team_member x WHERE x.team_id=t.id AND x.status='active') AS count
        FROM creator_hiring_team t JOIN creator_hiring_team_member m ON m.team_id=t.id WHERE m.user_id=$1 AND m.status='active' ORDER BY t.created_at DESC LIMIT 100`, [actor]);
      return rows.rows.map((r) => ({ id: r.id, name: r.name, ownerId: r.owner_id, revision: r.revision, myRole: r.owner_id === actor ? "owner" : "member", memberCount: r.count }));
    });
  }
  create(actor: string, name: string) {
    return this.store.tx(async (c) => {
      await this.store.active(c, actor); await c.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [`hiring-teams:${actor}`]);
      const count = await c.query<{ count: number }>(`SELECT count(*)::int AS count FROM creator_hiring_team WHERE owner_id=$1`, [actor]);
      if (count.rows[0].count >= 20) throw new HttpException("직접 만든 팀은 최대 20개까지 보관할 수 있어요.", 429);
      const id = randomUUID(); await c.query(`INSERT INTO creator_hiring_team(id,name,owner_id) VALUES ($1,$2,$3)`, [id, name, actor]);
      await c.query(`INSERT INTO creator_hiring_team_member(team_id,user_id,status) VALUES ($1,$2,'active')`, [id, actor]);
      return { id };
    });
  }
  rename(actor: string, id: string, name: string, revision: number) {
    return this.store.tx(async (c) => { await this.store.active(c, actor); const team = await this.team(c, actor, id, true);
      if (team.revision !== revision) throw new ConflictException("팀 정보가 변경되었어요.");
      await c.query(`UPDATE creator_hiring_team SET name=$2,revision=revision+1 WHERE id=$1`, [id, name]); return { ok: true }; });
  }
  members(actor: string, id: string): Promise<CreatorTeamMember[]> {
    return this.store.tx(async (c) => { await this.store.active(c, actor); const team = await this.team(c, actor, id);
      const rows = await c.query<{ user_id: string; name: string; status: CreatorTeamMember["status"]; invite_expires_at: Date | null }>(`SELECT m.*,u.name FROM creator_hiring_team_member m JOIN "user" u ON u.id=m.user_id WHERE m.team_id=$1 AND m.status<>'left' ORDER BY m.user_id LIMIT 200`, [id]);
      return rows.rows.map((r) => ({ userId: r.user_id, displayName: r.name || "창작자", role: team.owner_id === r.user_id ? "owner" : "member", status: r.status, inviteExpiresAt: r.invite_expires_at?.toISOString() ?? null })); });
  }
  invite(actor: string, id: string, target: string) {
    return this.store.tx(async (c) => { await this.store.active(c, actor); await this.team(c, actor, id, true); await this.store.active(c, target);
      if (actor === target) throw new ConflictException("자신을 초대할 수 없어요.");
      const blocked = await c.query(`SELECT 1 FROM member_message_block WHERE ("blockerId"=$1 AND "blockedUserId"=$2) OR ("blockerId"=$2 AND "blockedUserId"=$1)`, [actor, target]);
      if (blocked.rows.length) throw new ForbiddenException("이 계정을 초대할 수 없어요.");
      const count = await c.query<{ count: number }>(`SELECT count(*)::int AS count FROM creator_hiring_team_member WHERE team_id=$1 AND (status='active' OR (status='invited' AND invite_expires_at>clock_timestamp()))`, [id]);
      if (count.rows[0].count >= 200) throw new HttpException("팀의 구성원·대기 초대는 최대 200명입니다.", 429);
      const result = await c.query(`INSERT INTO creator_hiring_team_member(team_id,user_id,status,invite_expires_at) VALUES ($1,$2,'invited',clock_timestamp()+interval '7 days')
        ON CONFLICT(team_id,user_id) DO UPDATE SET status='invited',invite_expires_at=EXCLUDED.invite_expires_at,invite_revision=creator_hiring_team_member.invite_revision+1
        WHERE creator_hiring_team_member.status='left' OR (creator_hiring_team_member.status='invited' AND creator_hiring_team_member.invite_expires_at<=clock_timestamp()) RETURNING team_id`, [id, target]);
      if (!result.rows.length) throw new ConflictException("이미 참여 중이거나 유효한 초대가 있어요.");
      return { ok: true }; });
  }
  invitations(actor: string): Promise<CreatorTeamInvite[]> {
    return this.store.tx(async (c) => { await this.store.active(c, actor);
      const rows = await c.query<{ team_id: string; name: string; invite_expires_at: Date; invite_revision: number }>(`SELECT m.*,t.name FROM creator_hiring_team_member m JOIN creator_hiring_team t ON t.id=m.team_id
        JOIN "user" u ON u.id=t.owner_id AND u.status='active' WHERE m.user_id=$1 AND m.status='invited' AND m.invite_expires_at>clock_timestamp()
        AND NOT EXISTS(SELECT 1 FROM member_message_block b WHERE (b."blockerId"=$1 AND b."blockedUserId"=t.owner_id) OR (b."blockerId"=t.owner_id AND b."blockedUserId"=$1)) ORDER BY m.invite_expires_at LIMIT 100`, [actor]);
      return rows.rows.map((r) => ({ teamId: r.team_id, teamName: r.name, expiresAt: r.invite_expires_at.toISOString(), revision: r.invite_revision })); });
  }
  respond(actor: string, id: string, accept: boolean, revision: number) {
    return this.store.tx(async (c) => { await this.store.active(c, actor);
      const teams = await c.query<{ owner_id: string }>(`SELECT owner_id FROM creator_hiring_team WHERE id=$1 FOR UPDATE`, [id]);
      if (!teams.rows[0]) throw new NotFoundException("팀을 찾을 수 없어요.");
      const owner = teams.rows[0].owner_id; await this.store.active(c, owner);
      const blocked = await c.query(`SELECT 1 FROM member_message_block WHERE ("blockerId"=$1 AND "blockedUserId"=$2) OR ("blockerId"=$2 AND "blockedUserId"=$1)`, [actor, owner]);
      if (accept && blocked.rows.length) throw new ForbiddenException("이 초대를 수락할 수 없어요.");
      const row = await c.query(`UPDATE creator_hiring_team_member SET status=$3,invite_expires_at=NULL WHERE team_id=$1 AND user_id=$2
        AND status='invited' AND invite_revision=$4 AND invite_expires_at>clock_timestamp() RETURNING user_id`, [id, actor, accept ? "active" : "left", revision]);
      if (!row.rows.length) throw new ConflictException("내 초대가 없거나 만료·변경되었어요.");
      return { ok: true, documentAccessGranted: false }; });
  }
  removeMember(actor: string, id: string, target: string) {
    return this.store.tx(async (c) => { await this.store.active(c, actor); const team = await this.team(c, actor, id, actor !== target);
      if (team.owner_id === target) throw new ConflictException("마지막 팀 소유자는 탈퇴하거나 제거할 수 없어요.");
      const result = await c.query(`UPDATE creator_hiring_team_member SET status='left',invite_expires_at=NULL,invite_revision=invite_revision+1 WHERE team_id=$1 AND user_id=$2 AND status<>'left' RETURNING user_id`, [id, target]);
      if (!result.rows.length) throw new NotFoundException("팀 구성원을 찾을 수 없어요.");
      await c.query(`DELETE FROM creator_hiring_group_member WHERE team_id=$1 AND user_id=$2`, [id, target]); return { ok: true }; });
  }
  groups(actor: string, id: string): Promise<CreatorTeamGroup[]> {
    return this.store.tx(async (c) => { await this.store.active(c, actor); await this.team(c, actor, id);
      const rows = await c.query<{ id: string; name: string; member_ids: string[] }>(`SELECT g.id,g.name,COALESCE(array_agg(m.user_id ORDER BY m.user_id) FILTER(WHERE m.user_id IS NOT NULL),ARRAY[]::text[]) AS member_ids
        FROM creator_hiring_group g LEFT JOIN creator_hiring_group_member m ON m.group_id=g.id WHERE g.team_id=$1 GROUP BY g.id ORDER BY g.name LIMIT 50`, [id]);
      return rows.rows.map((r) => ({ id: r.id, teamId: id, name: r.name, memberIds: r.member_ids })); });
  }
  saveGroup(actor: string, teamId: string, groupId: string | null, name: string, memberIds: string[]) {
    return this.store.tx(async (c) => { await this.store.active(c, actor); await this.team(c, actor, teamId, true);
      const members = await c.query<{ user_id: string }>(`SELECT user_id FROM creator_hiring_team_member WHERE team_id=$1 AND status='active' AND user_id=ANY($2::text[])`, [teamId, memberIds]);
      if (members.rows.length !== memberIds.length) throw new ForbiddenException("현재 팀의 참여 중인 구성원만 그룹에 넣을 수 있어요.");
      const dup = await c.query(`SELECT id FROM creator_hiring_group WHERE team_id=$1 AND name=$2 AND id<>$3`, [teamId, name, groupId ?? ""]);
      if (dup.rows.length) throw new ConflictException("같은 이름의 그룹이 있어요.");
      const id = groupId ?? randomUUID();
      if (groupId) {
        const result = await c.query(`UPDATE creator_hiring_group SET name=$3 WHERE id=$1 AND team_id=$2 RETURNING id`, [id, teamId, name]);
        if (!result.rows.length) throw new NotFoundException("팀의 그룹을 찾을 수 없어요.");
      } else {
        const count = await c.query<{ count: number }>(`SELECT count(*)::int AS count FROM creator_hiring_group WHERE team_id=$1`, [teamId]);
        if (count.rows[0].count >= 50) throw new HttpException("팀당 그룹은 최대 50개입니다.", 429);
        await c.query(`INSERT INTO creator_hiring_group(id,team_id,name) VALUES ($1,$2,$3)`, [id, teamId, name]);
      }
      await c.query(`DELETE FROM creator_hiring_group_member WHERE group_id=$1 AND team_id=$2`, [id, teamId]);
      for (const memberId of memberIds) await c.query(`INSERT INTO creator_hiring_group_member(group_id,team_id,user_id) VALUES ($1,$2,$3)`, [id, teamId, memberId]);
      return { id }; });
  }
  deleteGroup(actor: string, teamId: string, groupId: string) {
    return this.store.tx(async (c) => { await this.store.active(c, actor); await this.team(c, actor, teamId, true);
      const result = await c.query(`DELETE FROM creator_hiring_group WHERE id=$1 AND team_id=$2 RETURNING id`, [groupId, teamId]);
      if (!result.rows.length) throw new NotFoundException("팀의 그룹을 찾을 수 없어요."); return { ok: true }; });
  }
}
