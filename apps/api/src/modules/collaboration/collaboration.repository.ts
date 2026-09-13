import { randomUUID } from "node:crypto";

import { ConflictException, ForbiddenException, HttpException, NotFoundException } from "@nestjs/common";

import { collaborationDeadline } from "../../../../../packages/core/src/collaboration";
import { dbPool } from "../../db";
import { escapeLikePattern } from "../../server/sql-like";

import type {
  ApplicationStatus, CollaborationApplication, CollaborationApplicationInput, CollaborationInput,
  CollaborationPost, CollaborationReport, CollaborationStatus,
} from "../../../../../packages/core/src/collaboration";
import type { Pool, PoolClient } from "pg";

type PostRow = CollaborationInput & {
  id: string; userId: string; authorName: string; status: CollaborationStatus; version: number;
  hidden: boolean; saved: boolean; deadlineAt: Date | null; createdAt: Date; updatedAt: Date;
};
type ApplicationRow = Omit<CollaborationApplication, "createdAt"> & { createdAt: Date };
export interface CollaborationQuery {
  type: string; role: string; payType: string; workMode: string; status: string;
  q: string; view: "all" | "mine" | "saved" | "applied";
  cursor: { createdAt: string; id: string } | null;
}
function postOf(row: PostRow): CollaborationPost {
  return {
    id: row.id, author: { id: row.userId, name: row.authorName || "창작자" }, type: row.type,
    role: row.role, title: row.title, payType: row.payType, workMode: row.workMode, details: row.details,
    status: row.status, version: row.version, hidden: row.hidden, saved: row.saved,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
    expired: row.deadlineAt !== null && row.deadlineAt.getTime() < Date.now(),
  };
}
function applicationOf(row: ApplicationRow): CollaborationApplication { return { ...row, createdAt: row.createdAt.toISOString() }; }
const selectPost = `SELECT p.*, u.name AS "authorName",
  EXISTS (SELECT 1 FROM creator_collab_bookmark b WHERE b."postId"=p.id AND b."userId"=$1) AS saved
  FROM creator_collab_post p JOIN "user" u ON u.id=p."userId"`;
const selectApplications = `SELECT a.id, a."postId", a."userId", a.message, a.contact, a."portfolioUrl", a.status,
  a."createdAt", u.name AS "applicantName" FROM creator_collab_application a JOIN "user" u ON u.id=a."userId"`;

/** Every application mutation locks the parent row, serializing it against closure/deletion. */
export class CollaborationRepository {
  constructor(private readonly pool: Pool = dbPool) {}
  private async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try { await client.query("BEGIN"); const result = await work(client); await client.query("COMMIT"); return result; }
    catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
  private async lockPost(client: PoolClient, id: string): Promise<PostRow> {
    const result = await client.query<PostRow>(`SELECT * FROM creator_collab_post WHERE id=$1 AND "deletedAt" IS NULL FOR UPDATE`, [id]);
    if (!result.rows[0]) throw new NotFoundException("공고를 찾을 수 없어요.");
    return result.rows[0];
  }
  private owner(row: PostRow, userId: string, expectedVersion?: number): void {
    if (row.userId !== userId) throw new ForbiddenException("공고 작성자만 변경할 수 있어요.");
    if (expectedVersion !== undefined && row.version !== expectedVersion) throw new ConflictException("다른 화면에서 공고가 변경되었어요. 새로 불러온 뒤 다시 수정해 주세요.");
  }
  async isModerator(userId?: string): Promise<boolean> {
    if (!userId) return false;
    const result = await this.pool.query<{ role: string }>(`SELECT role FROM "user" WHERE id=$1 AND status='active'`, [userId]);
    return ["admin", "operator"].includes(result.rows[0]?.role ?? "");
  }
  async list(query: CollaborationQuery, viewerId?: string) {
    const args: unknown[] = [viewerId ?? null];
    const bind = (value: unknown) => { args.push(value); return `$${args.length}`; };
    const where = [`p."deletedAt" IS NULL`];
    if (query.view !== "mine") where.push(`NOT p.hidden`);
    for (const [key, value] of Object.entries({ type: query.type, role: query.role, payType: query.payType, workMode: query.workMode })) {
      if (value !== "all") where.push(`p."${key}"=${bind(value)}`);
    }
    if (query.status === "open") where.push(`p.status='open' AND (p."deadlineAt" IS NULL OR p."deadlineAt">=now())`);
    else if (query.status === "closed") where.push(`(p.status='closed' OR (p.status='open' AND p."deadlineAt"<now()))`);
    else if (query.status !== "all") where.push(`p.status=${bind(query.status)}`);
    if (query.q) where.push(`(p.title ILIKE ${bind(`%${escapeLikePattern(query.q)}%`)} OR p.details->>'description' ILIKE $${args.length})`);
    if (query.view === "mine") where.push(`p."userId"=$1`);
    if (query.view === "saved") where.push(`EXISTS (SELECT 1 FROM creator_collab_bookmark b WHERE b."postId"=p.id AND b."userId"=$1)`);
    if (query.view === "applied") where.push(`EXISTS (SELECT 1 FROM creator_collab_application a WHERE a."postId"=p.id AND a."userId"=$1 AND a.status<>'withdrawn')`);
    if (query.cursor) where.push(`(p."createdAt",p.id)<(${bind(query.cursor.createdAt)}::timestamptz,${bind(query.cursor.id)}::text)`);
    const result = await this.pool.query<PostRow>(`${selectPost} WHERE ${where.join(" AND ")} ORDER BY p."createdAt" DESC,p.id DESC LIMIT 25`, args);
    const items = result.rows.slice(0, 24).map(postOf);
    const last = items.at(-1);
    return { items, hasMore: result.rows.length > 24, nextCursor: result.rows.length > 24 && last ? `${last.createdAt}|${last.id}` : null };
  }
  async get(id: string, viewerId?: string, moderator = false): Promise<CollaborationPost> {
    const result = await this.pool.query<PostRow>(`${selectPost} WHERE p.id=$2 AND p."deletedAt" IS NULL AND (NOT p.hidden OR p."userId"=$1 OR $3)`, [viewerId ?? null, id, moderator]);
    if (!result.rows[0]) throw new NotFoundException("삭제되었거나 공개되지 않은 공고예요.");
    return postOf(result.rows[0]);
  }
  async create(userId: string, input: CollaborationInput): Promise<{ id: string }> {
    const id = randomUUID();
    await this.transaction(async (client) => {
      // Shared across serverless instances; deletions cannot reset the daily quota.
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`collaboration:${userId}`]);
      const counts = await client.query<{ daily: number; active: number }>(`SELECT
        count(*) FILTER (WHERE "createdAt" >= now() - interval '24 hours')::int AS daily,
        count(*) FILTER (WHERE "deletedAt" IS NULL)::int AS active
        FROM creator_collab_post WHERE "userId"=$1`, [userId]);
      if (counts.rows[0].daily >= 5 || counts.rows[0].active >= 100) {
        throw new HttpException("공고는 최근 24시간 5개, 계정당 보관 공고 100개까지 등록할 수 있어요.", 429);
      }
    await client.query(`INSERT INTO creator_collab_post (id,"userId",type,role,title,"payType","workMode",details,"deadlineAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, userId, input.type, input.role, input.title, input.payType, input.workMode, JSON.stringify(input.details), input.details.deadline ? new Date(collaborationDeadline(input.details.deadline) ?? 0) : null]);
    });
    return { id };
  }
  async update(id: string, userId: string, input: CollaborationInput, version: number): Promise<void> {
    await this.transaction(async (client) => {
      const row = await this.lockPost(client, id); this.owner(row, userId, version);
      await client.query(`UPDATE creator_collab_post SET type=$2,role=$3,title=$4,"payType"=$5,"workMode"=$6,details=$7,"deadlineAt"=$8,version=version+1,"updatedAt"=now() WHERE id=$1`,
        [id, input.type, input.role, input.title, input.payType, input.workMode, JSON.stringify(input.details), input.details.deadline ? new Date(collaborationDeadline(input.details.deadline) ?? 0) : null]);
    });
  }
  async setStatus(id: string, userId: string, status: CollaborationStatus, version: number): Promise<void> {
    await this.transaction(async (client) => {
      const row = await this.lockPost(client, id); this.owner(row, userId, version);
      if (status === "open" && row.deadlineAt && row.deadlineAt.getTime() < Date.now()) throw new ConflictException("마감일을 수정한 뒤 모집을 재개해 주세요.");
      await client.query(`UPDATE creator_collab_post SET status=$2,version=version+1,"updatedAt"=now() WHERE id=$1`, [id, status]);
    });
  }
  async remove(id: string, userId: string): Promise<void> {
    await this.transaction(async (client) => {
      this.owner(await this.lockPost(client, id), userId);
      await client.query(`UPDATE creator_collab_post SET "deletedAt"=now(),version=version+1,"updatedAt"=now() WHERE id=$1`, [id]);
      await client.query(`UPDATE creator_collab_application SET status='withdrawn',message='',contact='',"portfolioUrl"='',"updatedAt"=now() WHERE "postId"=$1`, [id]);
      await client.query(`DELETE FROM creator_collab_bookmark WHERE "postId"=$1`, [id]);
    });
  }
  async ownApplication(id: string, viewerId?: string): Promise<CollaborationApplication | null> {
    if (!viewerId) return null;
    const result = await this.pool.query<ApplicationRow>(`${selectApplications} WHERE a."postId"=$1 AND a."userId"=$2`, [id, viewerId]);
    return result.rows[0] ? applicationOf(result.rows[0]) : null;
  }
  async apply(id: string, userId: string, input: CollaborationApplicationInput): Promise<void> {
    await this.transaction(async (client) => {
      const row = await this.lockPost(client, id);
      if (row.hidden) throw new NotFoundException("공고를 찾을 수 없어요.");
      if (row.userId === userId) throw new ForbiddenException("내 공고에는 지원할 수 없어요.");
      if (row.status !== "open" || (row.deadlineAt && row.deadlineAt.getTime() < Date.now())) throw new ConflictException("접수가 마감된 공고예요.");
      const existing = await client.query<{ status: string }>(`SELECT status FROM creator_collab_application WHERE "postId"=$1 AND "userId"=$2`, [id, userId]);
      if (existing.rows[0] && existing.rows[0].status !== "withdrawn") throw new ConflictException("이미 지원했어요. 기존 지원 현황을 확인해 주세요.");
      const capacity = await client.query<{ count: number }>(`SELECT count(*)::int AS count FROM creator_collab_application WHERE "postId"=$1 AND status<>'withdrawn'`, [id]);
      if (capacity.rows[0].count >= 200) throw new HttpException("이 공고의 지원 정원 200명에 도달했어요.", 429);
      const result = await client.query(`INSERT INTO creator_collab_application (id,"postId","userId",message,contact,"portfolioUrl") VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT ("postId","userId") DO UPDATE SET message=EXCLUDED.message,contact=EXCLUDED.contact,"portfolioUrl"=EXCLUDED."portfolioUrl",status='submitted',"createdAt"=now(),"updatedAt"=now()
        WHERE creator_collab_application.status='withdrawn' RETURNING id`, [randomUUID(), id, userId, input.message, input.contact, input.portfolioUrl]);
      if (!result.rows.length) throw new ConflictException("이미 지원했어요. 기존 지원 현황을 확인해 주세요.");
    });
  }
  async applications(id: string, userId: string): Promise<CollaborationApplication[]> {
    const post = await this.get(id, userId);
    if (post.author.id !== userId) throw new ForbiddenException("지원서는 공고 작성자만 볼 수 있어요.");
    const result = await this.pool.query<ApplicationRow>(`${selectApplications} WHERE a."postId"=$1 ORDER BY (a.status='withdrawn') ASC, a."createdAt" DESC LIMIT 200`, [id]);
    return result.rows.map(applicationOf);
  }
  async withdraw(id: string, userId: string): Promise<void> {
    await this.transaction(async (client) => {
      // Lock even hidden/deleted posts so withdrawal also works after moderation.
      await client.query(`SELECT id FROM creator_collab_post WHERE id=$1 FOR UPDATE`, [id]);
      const result = await client.query(`UPDATE creator_collab_application SET status='withdrawn',message='',contact='',"portfolioUrl"='',"updatedAt"=now() WHERE "postId"=$1 AND "userId"=$2 RETURNING id`, [id, userId]);
      if (!result.rows.length) throw new NotFoundException("내 지원서를 찾을 수 없어요.");
    });
  }
  async setApplicationStatus(id: string, applicationId: string, userId: string, status: Exclude<ApplicationStatus, "withdrawn">): Promise<void> {
    await this.transaction(async (client) => {
      this.owner(await this.lockPost(client, id), userId);
      const result = await client.query(`UPDATE creator_collab_application SET status=$3,"updatedAt"=now() WHERE id=$1 AND "postId"=$2 AND status<>'withdrawn' RETURNING id`, [applicationId, id, status]);
      if (!result.rows.length) throw new ConflictException("철회되었거나 존재하지 않는 지원서예요.");
    });
  }
  async bookmark(id: string, userId: string, saved: boolean): Promise<void> {
    if (!saved) {
      await this.pool.query(`DELETE FROM creator_collab_bookmark WHERE "postId"=$1 AND "userId"=$2`, [id, userId]);
      return;
    }
    await this.transaction(async (client) => {
      const row = await this.lockPost(client, id);
      if (row.hidden) throw new NotFoundException("저장할 공고를 찾을 수 없어요.");
      await client.query(`INSERT INTO creator_collab_bookmark ("postId","userId") VALUES ($1,$2)
        ON CONFLICT ("postId","userId") DO NOTHING`, [id, userId]);
    });
  }

  async report(id: string, userId: string, reason: string): Promise<void> {
    await this.get(id, userId);
    await this.pool.query(`INSERT INTO creator_collab_report ("postId","userId",reason) VALUES ($1,$2,$3) ON CONFLICT ("postId","userId") DO UPDATE SET reason=EXCLUDED.reason,"createdAt"=now()`, [id, userId, reason]);
  }
  async reports(userId: string): Promise<CollaborationReport[]> {
    if (!await this.isModerator(userId)) throw new ForbiddenException("운영자만 신고를 볼 수 있어요.");
    const result = await this.pool.query<{ postId: string; title: string; hidden: boolean; reason: string; createdAt: Date }>(`SELECT r."postId",p.title,p.hidden,r.reason,r."createdAt" FROM creator_collab_report r JOIN creator_collab_post p ON p.id=r."postId" WHERE p."deletedAt" IS NULL ORDER BY r."createdAt" DESC LIMIT 100`);
    return result.rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
  }
  async moderate(id: string, userId: string, hidden: boolean): Promise<void> {
    if (!await this.isModerator(userId)) throw new ForbiddenException("운영자만 공개 여부를 변경할 수 있어요.");
    await this.transaction(async (client) => {
      await this.lockPost(client, id);
      await client.query(`UPDATE creator_collab_post SET hidden=$2,version=version+1,"updatedAt"=now() WHERE id=$1`, [id, hidden]);
    });
  }
}
