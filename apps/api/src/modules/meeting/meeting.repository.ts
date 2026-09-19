import { randomUUID } from "node:crypto";

import { ConflictException, ForbiddenException, HttpException, NotFoundException, ServiceUnavailableException } from "@nestjs/common";

import { HiringStore } from "../collaboration/hiring.store";
import { CreatorTeamRepository } from "../recruitment/team.repository";

import type { CreatorRoom, CreatorRoomInput, CreatorRoomMessage, CreatorRoomParticipant } from "../../../../../packages/contracts/src/creator-hiring";
import type { PoolClient } from "pg";

type RoomRow = { id: string; title: string; kind: CreatorRoom["kind"]; host_id: string; team_id: string | null; application_id: string | null; starts_at: Date; ends_at: Date; status: CreatorRoom["status"]; epoch: number; now: Date };
/** Every text/lobby operation checks live parent authorization before locking the session. No media tokens exist here. */
export class CreatorMeetingRepository {
  constructor(readonly store = new HiringStore(), readonly teams = new CreatorTeamRepository(store)) {}
  async scope(c: PoolClient, actor: string, id: string) {
    await this.store.active(c, actor);
    const ref = (await c.query<RoomRow>(`SELECT * FROM creator_hiring_room WHERE id=$1`, [id])).rows[0];
    if (!ref) throw new NotFoundException("회의 초대를 찾을 수 없어요.");
    if (ref.team_id) {
      await this.teams.team(c, actor, ref.team_id);
      const host = await c.query(`SELECT m.user_id FROM creator_hiring_team_member m JOIN "user" u ON u.id=m.user_id AND u.status='active' WHERE m.team_id=$1 AND m.user_id=$2 AND m.status='active'`, [ref.team_id, ref.host_id]);
      if (!host.rows.length) throw new ForbiddenException("호스트의 팀 참여가 종료되었어요.");
    } else {
      const application = (await c.query<{ postId: string; userId: string }>(`SELECT "postId","userId" FROM creator_collab_application WHERE id=$1`, [ref.application_id])).rows[0];
      if (!application) throw new NotFoundException("지원서를 찾을 수 없어요.");
      const post = await this.store.post(c, application.postId);
      const current = await c.query(`SELECT id FROM creator_collab_application WHERE id=$1 AND status IN ('submitted','shortlisted')`, [ref.application_id]);
      if (!current.rows.length || post.userId !== ref.host_id || (actor !== post.userId && actor !== application.userId)) throw new ForbiddenException("현재 지원자 또는 해당 공고 작성자만 입장할 수 있어요.");
      await this.store.active(c, ref.host_id);
    }
    const room = (await c.query<RoomRow>(`SELECT *,clock_timestamp() AS now FROM creator_hiring_room WHERE id=$1 FOR UPDATE`, [id])).rows[0];
    const admission = (await c.query<{ status: CreatorRoom["myStatus"]; epoch: number }>(`SELECT status,epoch FROM creator_hiring_admission WHERE room_id=$1 AND user_id=$2`, [id, actor])).rows[0];
    if (!room || !admission || admission.status === "removed") throw new ForbiddenException("현재 방에 초대된 계정만 이용할 수 있어요.");
    return { room, admission };
  }
  private live(room: RoomRow, epoch?: number) {
    if (room.status === "ended" || room.ends_at <= room.now) throw new ConflictException("회의가 종료되었어요.");
    if (epoch !== undefined && epoch !== room.epoch) throw new ConflictException("방 상태가 변경되었어요. 다시 불러와 주세요.");
  }
  create(actor: string, input: CreatorRoomInput) {
    return this.store.tx(async (c) => {
      await this.store.active(c, actor);
      if (input.participantIds.includes(actor)) throw new ConflictException("호스트는 자동으로 포함됩니다.");
      if (input.kind === "meeting") {
        await this.teams.team(c, actor, input.teamId!);
        const members = await c.query(`SELECT m.user_id FROM creator_hiring_team_member m JOIN "user" u ON u.id=m.user_id AND u.status='active' WHERE m.team_id=$1 AND m.status='active' AND m.user_id=ANY($2::text[])`, [input.teamId, input.participantIds]);
        if (members.rows.length !== input.participantIds.length) throw new ForbiddenException("참여 중인 팀 구성원만 초대할 수 있어요.");
      } else {
        const app = (await c.query<{ postId: string; userId: string }>(`SELECT "postId","userId" FROM creator_collab_application WHERE id=$1`, [input.applicationId])).rows[0];
        if (!app) throw new NotFoundException("지원서를 찾을 수 없어요.");
        const post = await this.store.post(c, app.postId); this.store.owner(post, actor);
        const current = await c.query(`SELECT id FROM creator_collab_application WHERE id=$1 AND status IN ('submitted','shortlisted')`, [input.applicationId]);
        if (!current.rows.length || input.participantIds.length !== 1 || input.participantIds[0] !== app.userId) throw new ForbiddenException("해당 지원자만 면접에 초대할 수 있어요.");
      }
      const ids = [actor, ...input.participantIds].sort();
      for (const id of ids) { await this.store.active(c, id); await c.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [`hiring-room-schedule:${id}`]); }
      const now = (await c.query<{ now: Date }>(`SELECT clock_timestamp() AS now`)).rows[0].now.getTime();
      if (Date.parse(input.startsAt) < now - 60000 || Date.parse(input.startsAt) > now + 90 * 86400000 || Date.parse(input.endsAt) <= now) throw new ConflictException("현재부터 90일 이내 일정을 선택해 주세요.");
      const collision = await c.query(`SELECT r.id FROM creator_hiring_room r JOIN creator_hiring_admission a ON a.room_id=r.id WHERE a.user_id=ANY($1::text[]) AND a.status NOT IN ('removed','left') AND r.status<>'ended' AND r.ends_at>clock_timestamp() AND r.starts_at<$3 AND r.ends_at>$2 LIMIT 1`, [ids, input.startsAt, input.endsAt]);
      if (collision.rows.length) throw new ConflictException("참여자의 다른 회의와 시간이 겹쳐요.");
      const count = await c.query<{ count: number }>(`SELECT count(*)::int AS count FROM creator_hiring_room WHERE host_id=$1 AND created_at>now()-interval '24 hours'`, [actor]);
      if (count.rows[0].count >= 20) throw new HttpException("하루 최대 20개 회의를 만들 수 있어요.", 429);
      const id = randomUUID();
      await c.query(`INSERT INTO creator_hiring_room(id,title,kind,host_id,team_id,application_id,starts_at,ends_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [id, input.title, input.kind, actor, input.teamId, input.applicationId, input.startsAt, input.endsAt]);
      for (const user of ids) await c.query(`INSERT INTO creator_hiring_admission(room_id,user_id,status) VALUES ($1,$2,$3)`, [id, user, user === actor ? "admitted" : "invited"]);
      return { id };
    });
  }
  list(actor: string) {
    return this.store.tx(async (c) => {
      await this.store.active(c, actor);
      const rows = await c.query<{ id: string; title: string; kind: CreatorRoom["kind"]; starts_at: Date; ends_at: Date; status: string }>(`SELECT r.* FROM creator_hiring_room r JOIN creator_hiring_admission a ON a.room_id=r.id
        WHERE a.user_id=$1 AND a.status<>'removed' AND (
          (r.team_id IS NOT NULL AND EXISTS(SELECT 1 FROM creator_hiring_team_member m WHERE m.team_id=r.team_id AND m.user_id=$1 AND m.status='active')) OR
          (r.application_id IS NOT NULL AND EXISTS(SELECT 1 FROM creator_collab_application x JOIN creator_collab_post p ON p.id=x."postId" WHERE x.id=r.application_id AND x.status IN ('submitted','shortlisted') AND p."deletedAt" IS NULL AND ($1=x."userId" OR $1=p."userId")))
        ) ORDER BY r.starts_at DESC LIMIT 100`, [actor]);
      return rows.rows.map((r) => ({ id: r.id, title: r.title, kind: r.kind, startsAt: r.starts_at.toISOString(), endsAt: r.ends_at.toISOString() }));
    });
  }
  get(actor: string, id: string): Promise<CreatorRoom> {
    return this.store.tx(async (c) => {
      const { room, admission } = await this.scope(c, actor, id);
      const host = room.host_id === actor;
      // Guests only see themselves and the host, including after admission.
      const rows = await c.query<{ user_id: string; name: string; status: CreatorRoomParticipant["status"] }>(`SELECT a.*,u.name FROM creator_hiring_admission a JOIN "user" u ON u.id=a.user_id WHERE a.room_id=$1 AND ($2::boolean OR a.user_id=$3 OR a.user_id=$4) ORDER BY a.user_id`, [id, host, actor, room.host_id]);
      return { id, title: room.title, kind: room.kind, hostId: room.host_id, teamId: room.team_id, applicationId: room.application_id, startsAt: room.starts_at.toISOString(), endsAt: room.ends_at.toISOString(),
        status: room.ends_at <= room.now ? "ended" : room.status, epoch: room.epoch, myStatus: admission.status,
        participants: rows.rows.map((r) => ({ userId: r.user_id, displayName: r.name || "창작자", role: r.user_id === room.host_id ? "host" : "guest", status: r.status })),
        media: { status: "not-configured", recordingEnabled: false, transcriptionEnabled: false } };
    });
  }
  enter(actor: string, id: string, epoch: number, leave = false) {
    return this.store.tx(async (c) => {
      const { room, admission } = await this.scope(c, actor, id); this.live(room, epoch);
      if (leave && actor === room.host_id) throw new ConflictException("호스트는 회의 종료를 사용해 주세요.");
      if (!leave && room.starts_at.getTime() - room.now.getTime() > 15 * 60000) throw new ConflictException("시작 15분 전부터 대기실에 들어갈 수 있어요.");
      const status = leave ? "left" : admission.status === "admitted" ? "admitted" : "waiting";
      await c.query(`UPDATE creator_hiring_admission SET status=$3,epoch=$4 WHERE room_id=$1 AND user_id=$2`, [id, actor, status, room.epoch]);
      return { status, epoch: room.epoch, media: "not-configured" };
    });
  }
  host(actor: string, id: string, input: { action: "admit" | "remove" | "end"; targetAccountId: string | null; expectedEpoch: number }) {
    return this.store.tx(async (c) => {
      // Account lifecycle cleanup locks the user before the room. Keep that order
      // when a host acts on a guest, then recheck the guest's complete room scope.
      if (input.action !== "end" && input.targetAccountId) await this.store.active(c, input.targetAccountId);
      const { room } = await this.scope(c, actor, id); this.live(room, input.expectedEpoch);
      if (room.host_id !== actor) throw new ForbiddenException("이 방의 호스트만 제어할 수 있어요.");
      if (input.action !== "end") {
        const target = input.targetAccountId;
        if (!target || target === actor) throw new ConflictException("참여자를 선택해 주세요.");
        await this.scope(c, target, id);
        const changed = await c.query(`UPDATE creator_hiring_admission SET status=$3 WHERE room_id=$1 AND user_id=$2 AND status=ANY($4::text[]) RETURNING user_id`, [id, target, input.action === "admit" ? "admitted" : "removed", input.action === "admit" ? ["waiting"] : ["invited", "waiting", "admitted", "left"]]);
        if (!changed.rows.length) throw new ConflictException("대기·입장 상태가 변경되었어요.");
      }
      await c.query(`UPDATE creator_hiring_room SET epoch=epoch+1,status=$2 WHERE id=$1`, [id, input.action === "end" ? "ended" : "live"]);
      await c.query(`UPDATE creator_hiring_admission SET epoch=$2 WHERE room_id=$1`, [id, room.epoch + 1]);
      return { epoch: room.epoch + 1, media: "not-configured" };
    });
  }
  messages(actor: string, id: string, epoch: number): Promise<CreatorRoomMessage[]> {
    return this.store.tx(async (c) => {
      const { room, admission } = await this.scope(c, actor, id); this.live(room, epoch);
      const admitted = admission.status === "admitted", host = room.host_id === actor;
      const rows = await c.query<{ id: string; user_id: string; name: string; text: string; created_at: Date }>(`SELECT m.*,u.name FROM creator_hiring_room_message m JOIN "user" u ON u.id=m.user_id WHERE m.room_id=$1 AND m.epoch=$2
        AND (($3::boolean AND m.audience='admitted') OR (m.audience='lobby' AND ($4::boolean OR m.user_id=$5 OR m.user_id=$6))) ORDER BY m.created_at DESC,m.id DESC LIMIT 100`, [id, epoch, admitted, host, actor, room.host_id]);
      return rows.rows.reverse().map((r) => ({ id: r.id, userId: r.user_id, displayName: r.name || "창작자", text: r.text, createdAt: r.created_at.toISOString() }));
    });
  }
  message(actor: string, id: string, input: { expectedEpoch: number; audience: "lobby" | "admitted"; text: string }) {
    return this.store.tx(async (c) => {
      const { room, admission } = await this.scope(c, actor, id); this.live(room, input.expectedEpoch);
      if (admission.status !== "admitted" && !(input.audience === "lobby" && admission.status === "waiting")) throw new ForbiddenException("호스트의 입장 승인이 필요해요.");
      const count = await c.query<{ recent: number; total: number }>(`SELECT count(*) FILTER(WHERE user_id=$2 AND created_at>now()-interval '1 minute')::int AS recent,count(*)::int AS total FROM creator_hiring_room_message WHERE room_id=$1`, [id, actor]);
      if (count.rows[0].recent >= 20 || count.rows[0].total >= 2000) throw new HttpException("메시지 한도에 도달했어요. 잠시 후 다시 시도해 주세요.", 429);
      const messageId = randomUUID();
      await c.query(`INSERT INTO creator_hiring_room_message(id,room_id,user_id,epoch,audience,text) VALUES ($1,$2,$3,$4,$5,$6)`, [messageId, id, actor, room.epoch, input.audience, input.text]);
      return { id: messageId };
    });
  }
  media(actor: string, id: string, epoch: number) {
    return this.store.tx(async (c) => { const { room } = await this.scope(c, actor, id); this.live(room, epoch);
      throw new ServiceUnavailableException("음성·영상 제공자가 구성되지 않았습니다. 대기실과 텍스트 대화만 사용할 수 있어요."); });
  }
}
