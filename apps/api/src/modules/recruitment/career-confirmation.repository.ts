import { createHash, randomUUID } from "node:crypto";

import { ConflictException, ForbiddenException, HttpException, NotFoundException, ServiceUnavailableException } from "@nestjs/common";

import { careerConfirmationPublicContent } from "../../../../../packages/contracts/src/creator-career-confirmation";

import { HiringStore } from "../collaboration/hiring.store";

import type { CareerConfirmationActionInput, CareerConfirmationCollaborator, CareerConfirmationPage, CareerConfirmationPreview, CareerConfirmationPublicSummary, CareerConfirmationReceipt, CareerConfirmationRequest, CareerConfirmationRequestInput, CareerConfirmationSelection, CareerConfirmationState } from "../../../../../packages/contracts/src/creator-career-confirmation";
import type { CreatorCareerVersion } from "../../../../../packages/contracts/src/creator-hiring";
import type { PoolClient } from "pg";

// Stable across JSON object key order. It is a source identifier, never a credential.
export function confirmationDigest(input: unknown): string {
  const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, value]) => [k, canonical(value)])) : v;
  return createHash("sha256").update(JSON.stringify(canonical(input))).digest("hex");
}
type RequestRow = {
  id: string; requester_id: string; target_id: string; career_id: string; version_id: string; version_revision: number; team_id: string;
  requester_membership_revision: number; target_membership_revision: number; snapshot: CreatorCareerVersion["content"] | null;
  source_digest: string; state: CareerConfirmationState; revision: number; created_at: Date; expires_at: Date; confirmed_at: Date | null;
  redaction_reason: string | null; live: boolean; counterpart_name: string; now: Date;
};
// A single live predicate is shared by private and public projections. Read-side
// checks remain necessary even with atomic write-side redaction triggers.
const live = `r.snapshot IS NOT NULL AND r.redacted_at IS NULL
  AND EXISTS(SELECT 1 FROM creator_hiring_career c JOIN creator_hiring_career_version v ON v.career_id=c.id AND v.revision=c.revision
    WHERE c.id=r.career_id AND c.user_id=r.requester_id AND v.id=r.version_id AND c.revision=r.version_revision AND c.rights IN ('owned','authorized'))
  AND EXISTS(SELECT 1 FROM "user" u WHERE u.id=r.requester_id AND u.status='active')
  AND EXISTS(SELECT 1 FROM "user" u WHERE u.id=r.target_id AND u.status='active')
  AND EXISTS(SELECT 1 FROM creator_hiring_team_member m WHERE m.team_id=r.team_id AND m.user_id=r.requester_id AND m.status='active' AND m.invite_revision=r.requester_membership_revision)
  AND EXISTS(SELECT 1 FROM creator_hiring_team_member m WHERE m.team_id=r.team_id AND m.user_id=r.target_id AND m.status='active' AND m.invite_revision=r.target_membership_revision)
  AND NOT EXISTS(SELECT 1 FROM member_message_block b WHERE (b."blockerId"=r.requester_id AND b."blockedUserId"=r.target_id) OR (b."blockerId"=r.target_id AND b."blockedUserId"=r.requester_id))`;
export class CareerConfirmationRepository {
  constructor(readonly store = new HiringStore()) {}
  private tx<T>(work: (c: PoolClient) => Promise<T>) {
    return this.store.tx(async (c) => { await c.query("SELECT creator_career_confirmation_require_ready()"); return work(c); }).catch((error: unknown) => {
      if (error instanceof ServiceUnavailableException) throw new ServiceUnavailableException({ available: false, code: "career-confirmation-unavailable", message: "상대방 확인 저장소를 사용할 수 없어요. 기존 경력·이력서 기능은 계속 이용할 수 있습니다." });
      throw error;
    });
  }
  capability(actor: string) { return this.tx(async (c) => { await this.store.active(c, actor); return { available: true as const, tier: "counterparty-confirmed" as const }; }); }
  private async accounts(c: PoolClient, actor: string, target: string) {
    for (const id of [actor, target].sort()) await this.store.active(c, id);
    await c.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [`career-confirmation-pair:${[actor, target].sort().join(":")}`]);
    const blocked = await c.query(`SELECT 1 FROM member_message_block WHERE ("blockerId"=$1 AND "blockedUserId"=$2) OR ("blockerId"=$2 AND "blockedUserId"=$1)`, [actor, target]);
    if (blocked.rows.length) throw new ForbiddenException("차단된 관계에는 확인을 요청하거나 수락할 수 없어요.");
  }
  private async source(c: PoolClient, actor: string, s: CareerConfirmationSelection): Promise<CareerConfirmationPreview> {
    if (actor === s.targetAccountId) throw new ForbiddenException("자신에게 확인을 요청할 수 없어요.");
    // Do not expose account availability for guessed IDs outside the actor's team.
    // This is routing only; locked membership/account checks below are authoritative.
    const relationship = await c.query(`SELECT 1 FROM creator_hiring_team_member own
      JOIN creator_hiring_team_member target ON target.team_id=own.team_id AND target.user_id=$3 AND target.status='active'
      JOIN "user" u ON u.id=target.user_id AND u.status='active'
      WHERE own.team_id=$1 AND own.user_id=$2 AND own.status='active'`, [s.teamId, actor, s.targetAccountId]);
    if (!relationship.rows.length) throw new ForbiddenException("현재 같은 팀에 참여 중인 구성원만 선택할 수 있어요.");
    await this.accounts(c, actor, s.targetAccountId);
    const career = (await c.query<{ revision: number }>(`SELECT revision FROM creator_hiring_career WHERE id=$1 AND user_id=$2 AND rights IN ('owned','authorized') FOR UPDATE`, [s.careerId, actor])).rows[0];
    if (!career) throw new ConflictException("공유 권리가 있는 내 현재 경력을 선택해 주세요.");
    const version = (await c.query<{ content: CreatorCareerVersion["content"] }>(`SELECT content FROM creator_hiring_career_version WHERE id=$1 AND career_id=$2 AND revision=$3`, [s.versionId, s.careerId, career.revision])).rows[0];
    if (!version) throw new ConflictException("경력이 변경되었어요. 현재 버전을 다시 확인해 주세요.");
    await c.query(`SELECT id FROM creator_hiring_team WHERE id=$1 FOR SHARE`, [s.teamId]);
    const members = await c.query<{ user_id: string; invite_revision: number; name: string }>(`SELECT m.user_id,m.invite_revision,u.name FROM creator_hiring_team_member m JOIN "user" u ON u.id=m.user_id
      WHERE m.team_id=$1 AND m.user_id=ANY($2::text[]) AND m.status='active' ORDER BY m.user_id FOR SHARE OF m`, [s.teamId, [actor, s.targetAccountId]]);
    if (members.rows.length !== 2) throw new ForbiddenException("현재 같은 팀에 참여 중인 구성원만 선택할 수 있어요.");
    return { ...s, snapshot: version.content, sourceDigest: confirmationDigest(version.content), versionRevision: career.revision,
      requesterMembershipRevision: members.rows.find((m) => m.user_id === actor)!.invite_revision,
      targetMembershipRevision: members.rows.find((m) => m.user_id === s.targetAccountId)!.invite_revision,
      targetName: members.rows.find((m) => m.user_id === s.targetAccountId)!.name || "창작자" };
  }
  preview(actor: string, input: CareerConfirmationSelection) { return this.tx((c) => this.source(c, actor, input)); }
  collaborators(actor: string, after?: string): Promise<CareerConfirmationPage<CareerConfirmationCollaborator>> {
    return this.tx(async (c) => {
      await this.store.active(c, actor);
      const rows = await c.query<{ team_id: string; team_name: string; user_id: string; name: string }>(`SELECT t.id AS team_id,t.name AS team_name,m.user_id,u.name
        FROM creator_hiring_team_member own JOIN creator_hiring_team t ON t.id=own.team_id
        JOIN creator_hiring_team_member m ON m.team_id=t.id AND m.user_id<>own.user_id AND m.status='active'
        JOIN "user" u ON u.id=m.user_id AND u.status='active'
        WHERE own.user_id=$1 AND own.status='active' AND ($2::text IS NULL OR t.id||':'||m.user_id>$2)
          AND NOT EXISTS(SELECT 1 FROM member_message_block b WHERE (b."blockerId"=$1 AND b."blockedUserId"=m.user_id) OR (b."blockerId"=m.user_id AND b."blockedUserId"=$1))
        ORDER BY t.id||':'||m.user_id LIMIT 51`, [actor, after ?? null]);
      const page = rows.rows.slice(0, 50), last = page.at(-1);
      return { items: page.map((r) => ({ teamId: r.team_id, teamName: r.team_name, targetAccountId: r.user_id, displayName: r.name || "창작자" })), nextCursor: rows.rows.length > 50 && last ? `${last.team_id}:${last.user_id}` : null };
    });
  }
  private async receipt(c: PoolClient, actor: string, mutationId: string, payload: unknown, work: () => Promise<CareerConfirmationReceipt>) {
    await c.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [`career-confirmation-receipt:${actor}:${mutationId}`]);
    const digest = confirmationDigest(payload);
    const old = (await c.query<{ request_digest: string; result: CareerConfirmationReceipt }>(`SELECT request_digest,result FROM creator_career_confirmation_receipt WHERE actor_id=$1 AND mutation_id=$2`, [actor, mutationId])).rows[0];
    if (old) {
      if (old.request_digest !== digest) throw new ConflictException("같은 요청 번호에 다른 내용이 사용되었어요.");
      return old.result; // Historical command receipt, never a live proof projection.
    }
    const result = await work();
    await c.query(`INSERT INTO creator_career_confirmation_receipt(actor_id,mutation_id,request_digest,result) VALUES ($1,$2,$3,$4)`, [actor, mutationId, digest, JSON.stringify(result)]);
    return result;
  }
  request(actor: string, input: CareerConfirmationRequestInput) {
    return this.tx(async (c) => {
      await this.store.active(c, actor);
      return this.receipt(c, actor, input.mutationId, { command: "request", input }, async () => {
        for (const id of [actor, input.targetAccountId].sort()) await c.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [`career-confirmation-budget:${id}`]);
        const preview = await this.source(c, actor, input);
        if (preview.sourceDigest !== input.sourceDigest || preview.requesterMembershipRevision !== input.requesterMembershipRevision || preview.targetMembershipRevision !== input.targetMembershipRevision)
          throw new ConflictException("공유 내용이나 팀 관계가 바뀌었어요. 미리보기를 다시 확인해 주세요.");
        const counts = (await c.query<{ sent: number; received: number; total: number }>(`SELECT
          count(*) FILTER(WHERE requester_id=$1 AND created_at>=date_trunc('day',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')::int AS sent,
          count(*) FILTER(WHERE target_id=$2 AND created_at>=date_trunc('day',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')::int AS received,
          count(*) FILTER(WHERE requester_id=$1)::int AS total
          FROM creator_career_confirmation_request WHERE requester_id=$1 OR target_id=$2`, [actor, input.targetAccountId])).rows[0];
        if (counts.sent >= 20 || counts.received >= 50 || counts.total >= 2000) throw new HttpException("확인 요청 보관·일일 한도에 도달했어요. 요청자는 하루 20건, 수신자는 하루 50건까지 받을 수 있어요.", 429);
        await c.query(`WITH changed AS (UPDATE creator_career_confirmation_request SET state='expired',revision=revision+1
          WHERE version_id=$1 AND target_id=$2 AND state IN ('requested','confirmed') AND expires_at<=clock_timestamp() RETURNING id,revision)
          INSERT INTO creator_career_confirmation_event(request_id,action,revision) SELECT id,'expired',revision FROM changed`, [input.versionId, input.targetAccountId]);
        if ((await c.query(`SELECT 1 FROM creator_career_confirmation_request WHERE version_id=$1 AND target_id=$2 AND state IN ('requested','confirmed')`, [input.versionId, input.targetAccountId])).rows.length)
          throw new ConflictException("이 버전에 대한 유효한 요청 또는 확인이 이미 있어요.");
        const id = randomUUID();
        await c.query(`INSERT INTO creator_career_confirmation_request(id,requester_id,target_id,career_id,version_id,version_revision,team_id,requester_membership_revision,target_membership_revision,snapshot,source_digest,consent)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [id, actor, input.targetAccountId, input.careerId, input.versionId, preview.versionRevision, input.teamId, preview.requesterMembershipRevision, preview.targetMembershipRevision, JSON.stringify(preview.snapshot), preview.sourceDigest, input.consent]);
        await c.query(`INSERT INTO creator_career_confirmation_event(request_id,actor_id,action,revision) VALUES ($1,$2,'requested',1)`, [id, actor]);
        return { id, state: "requested", revision: 1 };
      });
    });
  }
  action(actor: string, id: string, input: CareerConfirmationActionInput) {
    return this.tx(async (c) => {
      await this.store.active(c, actor);
      return this.receipt(c, actor, input.mutationId, { command: "action", id, input }, async () => {
        // Read immutable routing metadata without locking a child ahead of parents.
        const route = (await c.query<RequestRow>(`SELECT * FROM creator_career_confirmation_request WHERE id=$1 AND (requester_id=$2 OR target_id=$2)`, [id, actor])).rows[0];
        if (!route) throw new NotFoundException("내 확인 요청을 찾을 수 없어요.");
        if (input.action !== "revoked" && actor !== route.target_id) throw new ForbiddenException("요청받은 상대방만 확인하거나 거절할 수 있어요.");
        if (input.action === "confirmed") {
          const source = await this.source(c, route.requester_id, { careerId: route.career_id, versionId: route.version_id, teamId: route.team_id, targetAccountId: route.target_id });
          if (source.sourceDigest !== route.source_digest || source.requesterMembershipRevision !== route.requester_membership_revision || source.targetMembershipRevision !== route.target_membership_revision) throw new ConflictException("요청 이후 내용이나 팀 관계가 변경되었어요.");
        }
        const row = (await c.query<RequestRow>(`SELECT r.*,clock_timestamp() AS now FROM creator_career_confirmation_request r WHERE id=$1 FOR UPDATE`, [id])).rows[0];
        if (row.revision !== input.expectedRevision && !(input.action === "revoked" && input.expectedRevision < row.revision && row.state === "confirmed")) throw new ConflictException("요청 상태가 바뀌었어요. 새로 불러와 주세요.");
        if (!['requested', 'confirmed'].includes(row.state)) throw new ConflictException("이미 종료된 요청이에요.");
        if (input.action !== "revoked" && row.state !== "requested") throw new ConflictException("대기 중인 요청에만 응답할 수 있어요.");
        // Fresh DB clock after all waits; expiry is persisted even without a worker.
        const now = (await c.query<{ now: Date }>(`SELECT clock_timestamp() AS now`)).rows[0].now;
        const state: CareerConfirmationState = row.expires_at <= now ? "expired" : input.action;
        const result = { id, state, revision: row.revision + 1 };
        await c.query(`UPDATE creator_career_confirmation_request SET state=$2,revision=revision+1,confirmed_at=CASE WHEN $2='confirmed' THEN $3 ELSE confirmed_at END WHERE id=$1`, [id, state, now]);
        await c.query(`INSERT INTO creator_career_confirmation_event(request_id,actor_id,action,revision) VALUES ($1,$2,$3,$4)`, [id, actor, state, result.revision]);
        return result;
      });
    });
  }
  private project(r: RequestRow, actor: string): CareerConfirmationRequest {
    const usable = r.live && !r.redaction_reason;
    const state = ['requested', 'confirmed'].includes(r.state) ? !usable ? "revoked" : r.expires_at <= r.now ? "expired" : r.state : r.state;
    return { id: r.id, state, revision: r.revision, careerId: r.career_id, versionId: r.version_id, versionRevision: r.version_revision,
      direction: r.requester_id === actor ? "sent" : "received", counterpartName: r.counterpart_name || "이용할 수 없는 계정",
      snapshot: usable ? r.snapshot : null, sourceDigest: r.source_digest, createdAt: r.created_at.toISOString(), expiresAt: r.expires_at.toISOString(), confirmedAt: r.confirmed_at?.toISOString() ?? null,
      unavailableReason: r.redaction_reason ?? (!usable ? "unavailable" : state === "expired" ? "expired" : null),
      canRespond: state === "requested" && actor === r.target_id, canRevoke: state === "requested" || state === "confirmed" };
  }
  list(actor: string, direction: "sent" | "received", after?: string): Promise<CareerConfirmationPage<CareerConfirmationRequest>> {
    return this.tx(async (c) => {
      await this.store.active(c, actor);
      const rows = await c.query<RequestRow>(`SELECT r.*,(${live}) AS live,clock_timestamp() AS now,u.name AS counterpart_name FROM creator_career_confirmation_request r
        LEFT JOIN "user" u ON u.id=CASE WHEN r.requester_id=$1 THEN r.target_id ELSE r.requester_id END AND u.status='active'
        WHERE r.${direction === "sent" ? "requester_id" : "target_id"}=$1 AND ($2::uuid IS NULL OR r.id<$2::uuid) ORDER BY r.id DESC LIMIT 31`, [actor, after ?? null]);
      return { items: rows.rows.slice(0, 30).map((r) => this.project(r, actor)), nextCursor: rows.rows.length > 30 ? rows.rows[29].id : null };
    });
  }
  publicSummaries(careerIds: string[]): Promise<CareerConfirmationPublicSummary[]> {
    return this.tx(async (c) => {
      const rows = await c.query<RequestRow>(`SELECT DISTINCT ON (r.career_id) r.* FROM creator_career_confirmation_request r
        JOIN creator_hiring_career public_career ON public_career.id=r.career_id AND public_career.visibility='public' AND public_career.rights IN ('owned','authorized')
        WHERE r.career_id=ANY($1::text[]) AND r.state='confirmed' AND r.expires_at>clock_timestamp() AND (${live})
        ORDER BY r.career_id,r.confirmed_at DESC,r.id LIMIT 50`, [careerIds]);
      return rows.rows.map((r) => ({ careerId: r.career_id, publicDigest: createHash("sha256").update(careerConfirmationPublicContent(r.snapshot!)).digest("hex"), tier: "counterparty-confirmed", confirmedAt: r.confirmed_at!.toISOString(), expiresAt: r.expires_at.toISOString(),
        scope: r.snapshot!.scope, contribution: r.snapshot!.contribution, startMonth: r.snapshot!.startMonth, endMonth: r.snapshot!.endMonth }));
    });
  }
}
