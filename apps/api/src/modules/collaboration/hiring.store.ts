import { createHash } from "node:crypto";

import { ConflictException, ForbiddenException, HttpException, NotFoundException, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";

import { dbPool } from "../../platform/database";

import type { Pool, PoolClient } from "pg";

export interface HiringPost { id: string; userId: string; version: number; status: string; hidden: boolean; deletedAt: Date | null; deadlineAt: Date | null; now: Date; }
export class HiringStore {
  constructor(readonly pool: Pool = dbPool) {}
  async tx<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    let client: PoolClient | undefined;
    try {
      client = await this.pool.connect(); await client.query("BEGIN");
      // Bound each HTTP statement and lock wait, including readiness and advisory locks.
      await client.query("SET LOCAL statement_timeout = '10s'; SET LOCAL lock_timeout = '3s'");
      await client.query("SELECT creator_hiring_require_ready()");
      const result = await work(client); await client.query("COMMIT"); return result;
    } catch (error) {
      if (client) { try { await client.query("ROLLBACK"); } catch { /* Connection may already be lost. */ } }
      if (error instanceof HttpException) throw error;
      // Never expose SQL arguments, resume content, contacts or database diagnostics.
      throw new ServiceUnavailableException("저장소 응답을 확인하지 못했어요. 완료로 처리하지 않았습니다.");
    } finally { client?.release(); }
  }
  async active(client: PoolClient, actor: string): Promise<void> {
    const result = await client.query(`SELECT id FROM "user" WHERE id=$1 AND status='active' FOR SHARE`, [actor]);
    if (!result.rows.length) throw new UnauthorizedException("사용 가능한 계정으로 로그인해 주세요.");
  }
  async post(client: PoolClient, id: string): Promise<HiringPost> {
    const result = await client.query<HiringPost>(`SELECT *,clock_timestamp() AS now FROM creator_collab_post WHERE id=$1 FOR UPDATE`, [id]);
    if (!result.rows[0] || result.rows[0].deletedAt) throw new NotFoundException("공고를 찾을 수 없어요.");
    return result.rows[0];
  }
  owner(post: HiringPost, actor: string) {
    if (post.userId !== actor) throw new ForbiddenException("공고 작성자만 관리할 수 있어요.");
  }
  open(post: HiringPost) {
    if (post.hidden) throw new NotFoundException("공고를 찾을 수 없어요.");
    if (post.status !== "open" || (post.deadlineAt && post.deadlineAt <= post.now)) throw new ConflictException("모집이 마감되었어요.");
  }
  async currentOpen(client: PoolClient, post: HiringPost, dueAt?: string) {
    const time = await client.query<{ now: Date }>(`SELECT clock_timestamp() AS now`);
    this.open({ ...post, now: time.rows[0].now });
    if (dueAt !== undefined && (!Number.isFinite(Date.parse(dueAt)) || Date.parse(dueAt) <= time.rows[0].now.getTime())) throw new ConflictException("작업 납기일이 지났어요. 모집 조건을 다시 확인해 주세요.");
    return time.rows[0].now;
  }
  async prior<T>(client: PoolClient, actor: string, action: string, mutationId: string, input: unknown): Promise<{ result: T } | null> {
    const digest = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const old = await client.query<{ request_digest: string; result: T }>(`SELECT request_digest,result FROM creator_hiring_receipt WHERE actor_id=$1 AND action=$2 AND mutation_id=$3`, [actor, action, mutationId]);
    if (!old.rows[0]) return null;
    if (old.rows[0].request_digest !== digest) throw new ConflictException("같은 요청 번호에 다른 내용이 사용되었어요.");
    return { result: old.rows[0].result };
  }
  async receipt<T>(client: PoolClient, actor: string, action: string, mutationId: string, input: unknown, work: () => Promise<T>): Promise<T> {
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [`hiring-receipt:${actor}:${action}:${mutationId}`]);
    const previous = await this.prior<T>(client, actor, action, mutationId, input);
    if (previous) return previous.result;
    const digest = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const result = await work();
    await client.query(`INSERT INTO creator_hiring_receipt(actor_id,action,mutation_id,request_digest,result) VALUES ($1,$2,$3,$4,$5)`, [actor, action, mutationId, digest, JSON.stringify(result)]);
    return result;
  }
}
