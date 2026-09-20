import { randomUUID } from "node:crypto";

import { ConflictException, HttpException, NotFoundException } from "@nestjs/common";

import { HiringStore } from "../collaboration/hiring.store";

import type { CreatorActivitySummary, CreatorCareerInput, CreatorCareerItem, CreatorCareerVersion } from "../../../../../packages/contracts/src/creator-hiring";

type CareerRow = { id: string; user_id: string; name: string; revision: number; content: Omit<CreatorCareerInput, "expectedRevision">; updated_at: Date; version_id: string };
export class CreatorCareerRepository {
  constructor(readonly store = new HiringStore()) {}
  private item(r: CareerRow): CreatorCareerItem { return { ...r.content, id: r.id, userId: r.user_id, displayName: r.name || "창작자", revision: r.revision, expectedRevision: r.revision, proof: "self-declared", updatedAt: r.updated_at.toISOString(), currentVersionId: r.version_id }; }
  list(actor: string) {
    return this.store.tx(async (c) => { await this.store.active(c, actor); const rows = await c.query<CareerRow>(`SELECT c.*,u.name,v.id AS version_id FROM creator_hiring_career c JOIN "user" u ON u.id=c.user_id JOIN creator_hiring_career_version v ON v.career_id=c.id AND v.revision=c.revision WHERE c.user_id=$1 ORDER BY c.updated_at DESC,c.id LIMIT 100`, [actor]); return rows.rows.map((r) => this.item(r)); });
  }
  gallery() {
    return this.store.tx(async (c) => { const rows = await c.query<CareerRow>(`SELECT c.*,u.name,v.id AS version_id FROM creator_hiring_career c JOIN "user" u ON u.id=c.user_id AND u.status='active'
      JOIN creator_hiring_career_version v ON v.career_id=c.id AND v.revision=c.revision WHERE c.visibility='public' AND c.rights IN ('owned','authorized') ORDER BY c.updated_at DESC,c.id LIMIT 50`);
      // Explicit public projection; no raw evidence, contact, documents or unapproved media.
      return rows.rows.map((r) => ({ id: r.id, displayName: r.name || "창작자", title: r.content.title, role: r.content.role, startMonth: r.content.startMonth, endMonth: r.content.endMonth, episodeFrom: r.content.episodeFrom, episodeTo: r.content.episodeTo,
        scope: r.content.scope, contribution: r.content.contribution, portfolioUrl: r.content.portfolioUrl, proof: "self-declared" as const })); });
  }
  versions(actor: string, id: string): Promise<CreatorCareerVersion[]> {
    return this.store.tx(async (c) => { await this.store.active(c, actor); const own = await c.query(`SELECT id FROM creator_hiring_career WHERE id=$1 AND user_id=$2`, [id, actor]); if (!own.rows.length) throw new NotFoundException("내 경력을 찾을 수 없어요.");
      const rows = await c.query<{ id: string; career_id: string; revision: number; content: CreatorCareerVersion["content"]; created_at: Date }>(`SELECT * FROM creator_hiring_career_version WHERE career_id=$1 ORDER BY revision DESC LIMIT 100`, [id]);
      return rows.rows.map((r) => ({ id: r.id, careerId: r.career_id, revision: r.revision, content: r.content, createdAt: r.created_at.toISOString() })); });
  }
  save(actor: string, id: string | null, input: CreatorCareerInput) {
    return this.store.tx(async (c) => { await this.store.active(c, actor); await c.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [`hiring-career:${actor}`]);
      const { expectedRevision, ...content } = input; const careerId = id ?? randomUUID();
      if (id) {
        const row = (await c.query<{ revision: number }>(`SELECT revision FROM creator_hiring_career WHERE id=$1 AND user_id=$2 FOR UPDATE`, [id, actor])).rows[0];
        if (!row) throw new NotFoundException("내 경력을 찾을 수 없어요.");
        if (row.revision !== expectedRevision) throw new ConflictException("경력 정보가 변경되었어요.");
        if (row.revision >= 100) throw new HttpException("경력당 최대 100개 버전을 저장할 수 있어요.", 429);
        await c.query(`UPDATE creator_hiring_career SET revision=revision+1,rights=$2,visibility=$3,content=$4,updated_at=now() WHERE id=$1`, [id, input.rights, input.visibility, JSON.stringify(content)]);
      } else {
        if (expectedRevision !== 0) throw new ConflictException("새 경력의 버전을 확인해 주세요.");
        const count = await c.query<{ count: number }>(`SELECT count(*)::int AS count FROM creator_hiring_career WHERE user_id=$1`, [actor]);
        if (count.rows[0].count >= 100) throw new HttpException("최대 100개 경력을 보관할 수 있어요.", 429);
        await c.query(`INSERT INTO creator_hiring_career(id,user_id,rights,visibility,content) VALUES ($1,$2,$3,$4,$5)`, [careerId, actor, input.rights, input.visibility, JSON.stringify(content)]);
      }
      const versionId = randomUUID(); await c.query(`INSERT INTO creator_hiring_career_version(id,career_id,revision,content) VALUES ($1,$2,$3,$4)`, [versionId, careerId, expectedRevision + 1, JSON.stringify(content)]);
      return { id: careerId, versionId, revision: expectedRevision + 1, publication: input.visibility, cacheCleanup: "not-applicable-link-only" as const }; });
  }
  remove(actor: string, id: string, expectedRevision: number) {
    return this.store.tx(async (c) => { await this.store.active(c, actor); const row = (await c.query<{ revision: number }>(`SELECT revision FROM creator_hiring_career WHERE id=$1 AND user_id=$2 FOR UPDATE`, [id, actor])).rows[0];
      if (!row) throw new NotFoundException("내 경력을 찾을 수 없어요."); if (row.revision !== expectedRevision) throw new ConflictException("경력 정보가 변경되었어요.");
      await c.query(`DELETE FROM creator_hiring_career WHERE id=$1`, [id]); return { ok: true, cacheCleanup: "not-applicable-link-only" as const }; });
  }
  revoke(actor: string, id: string) {
    return this.store.tx(async (c) => {
      await this.store.active(c, actor);
      const row = (await c.query<CareerRow>(`SELECT * FROM creator_hiring_career WHERE id=$1 AND user_id=$2 FOR UPDATE`, [id, actor])).rows[0];
      if (!row) throw new NotFoundException("내 경력을 찾을 수 없어요.");
      if (row.content.rights === "pending" && row.content.visibility === "private") return { revision: row.revision };
      const content = { ...row.content, rights: "pending", visibility: "private" };
      await c.query(`UPDATE creator_hiring_career SET rights='pending',visibility='private',content=$2,revision=revision+1,updated_at=now() WHERE id=$1`, [id, JSON.stringify(content)]);
      await c.query(`INSERT INTO creator_hiring_career_version(id,career_id,revision,content) VALUES ($1,$2,$3,$4)`, [randomUUID(), id, row.revision + 1, JSON.stringify(content)]);
      return { revision: row.revision + 1 };
    });
  }
  importResume(actor: string, careerId: string, versionId: string, penName: string, mutationId: string) {
    return this.store.tx(async (c) => {
      await this.store.active(c, actor);
      const previous = await this.store.prior<{ id: string }>(c, actor, "career-resume-import", mutationId, { careerId, versionId, penName });
      if (previous) return previous.result;
      const career = (await c.query<{ rights: string }>(`SELECT rights FROM creator_hiring_career WHERE id=$1 AND user_id=$2 FOR UPDATE`, [careerId, actor])).rows[0];
      if (!career || career.rights === "pending") throw new ConflictException("현재 공유 권리가 확인된 내 경력만 가져올 수 있어요.");
      return this.store.receipt(c, actor, "career-resume-import", mutationId, { careerId, versionId, penName }, async () => {
        const version = (await c.query<{ content: CreatorCareerVersion["content"] }>(`SELECT content FROM creator_hiring_career_version WHERE id=$1 AND career_id=$2`, [versionId, careerId])).rows[0];
        if (!version || version.content.rights === "pending") throw new ConflictException("가져올 수 있는 경력 버전이 아니에요.");
        await c.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [`hiring-resume:${actor}`]);
        const count = await c.query<{ count: number }>(`SELECT count(*)::int AS count FROM creator_hiring_resume WHERE user_id=$1`, [actor]);
        if (count.rows[0].count >= 30) throw new HttpException("최대 30개 이력서를 보관할 수 있어요.", 429);
        const e = version.content, id = randomUUID();
        const content = { penName, summary: e.scope, roles: [e.role], tools: [], formats: [], languages: [], experiences: [{ title: e.title, role: e.role, startMonth: e.startMonth, endMonth: e.endMonth, episodeFrom: e.episodeFrom, episodeTo: e.episodeTo, contribution: e.contribution }], portfolio: [{ title: e.title, url: e.portfolioUrl, contribution: e.contribution.slice(0, 500), permission: career.rights }] };
        await c.query(`INSERT INTO creator_hiring_resume(id,user_id,title,revision) VALUES ($1,$2,$3,1)`, [id, actor, `${e.title} 경력 이력서`.slice(0, 100)]);
        await c.query(`INSERT INTO creator_hiring_resume_version(id,resume_id,revision,content) VALUES ($1,$2,1,$3)`, [randomUUID(), id, JSON.stringify(content)]);
        await c.query(`INSERT INTO creator_hiring_resume_career_source(resume_id,career_id,career_version_id) VALUES ($1,$2,$3)`, [id, careerId, versionId]);
        return { id };
      });
    });
  }
  activity(actor: string): Promise<CreatorActivitySummary> {
    return this.store.tx(async (c) => { await this.store.active(c, actor);
      const total = (await c.query<{ points: number }>(`SELECT COALESCE(sum(points),0)::int AS points FROM creator_hiring_activity_ledger WHERE user_id=$1`, [actor])).rows[0].points;
      const rows = await c.query<{ id: string; kind: "award" | "reversal"; points: number; occurred_at: Date }>(`SELECT id,kind,points,occurred_at FROM creator_hiring_activity_ledger WHERE user_id=$1 ORDER BY occurred_at DESC,id LIMIT 100`, [actor]);
      return { points: total, level: total >= 150 ? 4 : total >= 50 ? 3 : total >= 10 ? 2 : 1, label: "협업 참여 기록", events: rows.rows.map((r) => ({ id: r.id, kind: r.kind, points: r.points, occurredAt: r.occurred_at.toISOString() })), hiringEffect: false, verificationEffect: false }; });
  }
}
