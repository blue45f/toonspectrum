import { randomUUID } from "node:crypto";

import { ConflictException, ForbiddenException, HttpException, NotFoundException } from "@nestjs/common";

import { HiringStore } from "./hiring.store";

import type { HiringApplicationSnapshot, HiringResume, HiringResumeContent, HiringResumeInput, HiringResumeVersion, HiringSubmissionInput } from "../../../../../packages/contracts/src/creator-hiring";
import type { PoolClient } from "pg";

type VersionRow = { id: string; resume_id: string; revision: number; content: HiringResumeContent; created_at: Date };
const versionOf = (r: VersionRow): HiringResumeVersion => ({ id: r.id, resumeId: r.resume_id, revision: r.revision, content: r.content, createdAt: r.created_at.toISOString() });
export class HiringResumeRepository {
  constructor(readonly store = new HiringStore()) {}
  private async own(client: PoolClient, actor: string, id: string) {
    const result = await client.query<{ id: string; revision: number }>(`SELECT id,revision FROM creator_hiring_resume WHERE id=$1 AND user_id=$2 FOR UPDATE`, [id, actor]);
    if (!result.rows[0]) throw new NotFoundException("내 이력서를 찾을 수 없어요.");
    return result.rows[0];
  }
  list(actor: string): Promise<HiringResume[]> {
    return this.store.tx(async (c) => {
      await this.store.active(c, actor);
      const rows = await c.query<VersionRow & { title: string; updated_at: Date; source_invalidated_at: Date | null }>(`SELECT v.*,r.title,r.updated_at,r.source_invalidated_at FROM creator_hiring_resume r
        JOIN creator_hiring_resume_version v ON v.resume_id=r.id AND v.revision=r.revision WHERE r.user_id=$1 ORDER BY r.updated_at DESC,r.id LIMIT 30`, [actor]);
      return rows.rows.map((r) => ({ id: r.resume_id, title: r.title, revision: r.revision, currentVersion: versionOf(r), updatedAt: r.updated_at.toISOString(), submissionBlocked: r.source_invalidated_at !== null }));
    });
  }
  versions(actor: string, id: string): Promise<HiringResumeVersion[]> {
    return this.store.tx(async (c) => {
      await this.store.active(c, actor); await this.own(c, actor, id);
      const rows = await c.query<VersionRow>(`SELECT * FROM creator_hiring_resume_version WHERE resume_id=$1 ORDER BY revision DESC LIMIT 100`, [id]);
      return rows.rows.map(versionOf);
    });
  }
  save(actor: string, id: string | null, input: HiringResumeInput) {
    return this.store.tx(async (c) => {
      await this.store.active(c, actor);
      await c.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [`hiring-resume:${actor}`]);
      const resumeId = id ?? randomUUID();
      if (id) {
        const row = await this.own(c, actor, id);
        if (row.revision !== input.expectedRevision) throw new ConflictException("이력서가 변경되었어요. 최신 버전을 불러와 주세요.");
        if (row.revision >= 100) throw new HttpException("이력서별 최대 100개 버전을 보관할 수 있어요.", 429);
        await c.query(`UPDATE creator_hiring_resume SET title=$2,revision=revision+1,updated_at=now() WHERE id=$1`, [id, input.title]);
      } else {
        if (input.expectedRevision !== 0) throw new ConflictException("새 이력서의 버전은 0이어야 해요.");
        const count = await c.query<{ count: number }>(`SELECT count(*)::int AS count FROM creator_hiring_resume WHERE user_id=$1`, [actor]);
        if (count.rows[0].count >= 30) throw new HttpException("최대 30개 이력서를 보관할 수 있어요.", 429);
        await c.query(`INSERT INTO creator_hiring_resume(id,user_id,title,revision) VALUES ($1,$2,$3,1)`, [resumeId, actor, input.title]);
      }
      const versionId = randomUUID();
      await c.query(`INSERT INTO creator_hiring_resume_version(id,resume_id,revision,content) VALUES ($1,$2,$3,$4)`, [versionId, resumeId, input.expectedRevision + 1, JSON.stringify(input.content)]);
      return { id: resumeId, versionId, revision: input.expectedRevision + 1 };
    });
  }
  remove(actor: string, id: string, expectedRevision: number) {
    return this.store.tx(async (c) => {
      await this.store.active(c, actor); const row = await this.own(c, actor, id);
      if (row.revision !== expectedRevision) throw new ConflictException("이력서가 변경되었어요. 최신 버전을 불러와 주세요.");
      // BEFORE DELETE trigger redacts all submitted copies before FK version links are cleared.
      await c.query(`DELETE FROM creator_hiring_resume WHERE id=$1 AND user_id=$2`, [id, actor]);
      return { ok: true };
    });
  }
  submit(actor: string, postId: string, input: HiringSubmissionInput) {
    return this.store.tx(async (c) => {
      await this.store.active(c, actor);
      const previous = await this.store.prior<{ applicationId: string; snapshotId: string }>(c, actor, `submit:${postId}`, input.mutationId, input);
      if (previous) return previous.result;
      const post = await this.store.post(c, postId);
      return this.store.receipt(c, actor, `submit:${postId}`, input.mutationId, input, async () => {
        this.store.open(post);
        if (post.userId === actor) throw new ForbiddenException("내 공고에는 지원할 수 없어요.");
        await this.store.active(c, post.userId);
        if (post.version !== input.expectedPostVersion) throw new ConflictException("공고 조건이 변경되었어요. 확인 후 다시 지원해 주세요.");
        const versions = await c.query<VersionRow>(`SELECT v.* FROM creator_hiring_resume_version v JOIN creator_hiring_resume r ON r.id=v.resume_id
          WHERE v.id=$1 AND r.user_id=$2 AND r.source_invalidated_at IS NULL FOR UPDATE OF r`, [input.resumeVersionId, actor]);
        const version = versions.rows[0];
        if (!version) throw new NotFoundException("내 이력서 버전을 찾을 수 없어요.");
        if (input.portfolioIndexes.some((i) => i >= version.content.portfolio.length)) throw new ConflictException("선택한 포트폴리오를 확인해 주세요.");
        const current = await c.query<{ status: string }>(`SELECT status FROM creator_collab_application WHERE "postId"=$1 AND "userId"=$2`, [postId, actor]);
        if (current.rows[0] && current.rows[0].status !== "withdrawn") throw new ConflictException("이미 지원했어요. 지원 현황을 확인해 주세요.");
        const count = await c.query<{ count: number }>(`SELECT count(*)::int AS count FROM creator_collab_application WHERE "postId"=$1 AND status<>'withdrawn'`, [postId]);
        if (count.rows[0].count >= 200) throw new HttpException("지원 정원 200명에 도달했어요.", 429);
        const history = await c.query<{ count: number }>(`SELECT count(*)::int AS count FROM creator_hiring_application_snapshot s JOIN creator_collab_application a ON a.id=s.application_id WHERE a."postId"=$1 AND a."userId"=$2`, [postId, actor]);
        if (history.rows[0].count >= 100) throw new HttpException("공고별 이력서 제출 기록 한도에 도달했어요.", 429);
        await this.store.currentOpen(c, post);
        // The original application row remains the only application authority.
        const application = await c.query<{ id: string }>(`INSERT INTO creator_collab_application(id,"postId","userId",message,contact,"portfolioUrl") VALUES ($1,$2,$3,$4,$5,'')
          ON CONFLICT ("postId","userId") DO UPDATE SET message=EXCLUDED.message,contact=EXCLUDED.contact,"portfolioUrl"='',status='submitted',"createdAt"=now(),"updatedAt"=now()
          WHERE creator_collab_application.status='withdrawn' RETURNING id`, [randomUUID(), postId, actor, input.message, input.contact]);
        if (!application.rows[0]) throw new ConflictException("이미 지원했어요.");
        const applicationId = application.rows[0].id, snapshotId = randomUUID();
        const payload = { ...version.content, portfolio: input.portfolioIndexes.map((i) => version.content.portfolio[i]) };
        await c.query(`INSERT INTO creator_hiring_application_snapshot(id,application_id,resume_version_id,owner_id,resume_revision,resume_payload,consent_revision)
          VALUES ($1,$2,$3,$4,$5,$6,$7)`, [snapshotId, applicationId, version.id, actor, version.revision, JSON.stringify(payload), input.consentRevision]);
        return { applicationId, snapshotId }; // Receipt deliberately contains no private payload.
      });
    });
  }
  snapshots(actor: string, postId: string, applicationId: string): Promise<HiringApplicationSnapshot[]> {
    return this.store.tx(async (c) => {
      const post = await this.store.post(c, postId); await this.store.active(c, actor);
      const app = await c.query<{ userId: string }>(`SELECT a."userId" FROM creator_collab_application a JOIN "user" u ON u.id=a."userId" AND u.status='active' WHERE a.id=$1 AND a."postId"=$2`, [applicationId, postId]);
      if (!app.rows[0] || (app.rows[0].userId !== actor && post.userId !== actor)) throw new NotFoundException("지원서를 찾을 수 없어요.");
      const rows = await c.query<{ id: string; application_id: string; resume_version_id: string | null; resume_revision: number; resume_payload: HiringResumeContent | null; submitted_at: Date; redacted_at: Date | null; redaction_reason: string | null }>(
        `SELECT * FROM creator_hiring_application_snapshot WHERE application_id=$1 ORDER BY submitted_at DESC,id DESC LIMIT 100`, [applicationId]);
      return rows.rows.map((r) => ({ id: r.id, applicationId: r.application_id, resumeVersionId: r.resume_version_id,
        resumeRevision: r.resume_revision, content: r.resume_payload, submittedAt: r.submitted_at.toISOString(), redactedAt: r.redacted_at?.toISOString() ?? null, redactionReason: r.redaction_reason }));
    });
  }
}
