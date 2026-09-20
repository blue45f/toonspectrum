import { randomUUID } from "node:crypto";

import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";

import { HiringAvailabilityRepository } from "./hiring-availability.repository";
import { expireHiringHolds } from "./hiring-expiry";
import { HiringStore } from "./hiring.store";

import type { PoolClient } from "pg";
import type { HiringPost } from "./hiring.store";

import type { HiringCampaign, HiringInvitation, HiringSlotTerms } from "../../../../../packages/contracts/src/creator-hiring";

export const HIRING_CAMPAIGN_POLICY = { rounds: [5, 10], secondRoundDelayMs: 5 * 60000, candidateDaily: 5, recruiterDaily: 100, postTotal: 15, automaticDispatchEnabled: false } as const;
export class HiringCampaignRepository {
  constructor(readonly store = new HiringStore(), readonly availability = new HiringAvailabilityRepository(store)) {}
  state(actor: string, postId: string, slotId: string): Promise<HiringCampaign | null> {
    return this.store.tx(async (c) => {
      const post = await this.store.post(c, postId); await this.store.active(c, actor); this.store.owner(post, actor); await expireHiringHolds(c, postId);
      const rows = await c.query<{ round: number; state: HiringCampaign["state"]; next_dispatch_at: Date; count: number }>(`SELECT c.*, (SELECT count(*)::int FROM creator_hiring_invitation i WHERE i.slot_id=c.slot_id) AS count
        FROM creator_hiring_campaign c JOIN creator_hiring_slot s ON s.id=c.slot_id WHERE s.id=$1 AND s.post_id=$2`, [slotId, postId]);
      const r = rows.rows[0]; return r ? { slotId, round: r.round, state: r.state, nextDispatchAt: r.state === "active" ? r.next_dispatch_at.toISOString() : null, invitedCount: r.count, automaticDispatchEnabled: false } : null;
    });
  }
  dispatch(actor: string, postId: string, slotId: string, mutationId: string) {
    return this.store.tx(async (c) => {
      const post = await this.store.post(c, postId); await this.store.active(c, actor); this.store.owner(post, actor);
      return this.store.receipt(c, actor, `campaign:${slotId}`, mutationId, { slotId }, async () => {
        return this.dispatchRound(c, post, actor, slotId);

      });
    });
  }
  // Caller holds the parent post. Shared by manual dispatch and the fenced worker.
  async dispatchRound(c: PoolClient, post: HiringPost, actor: string, slotId: string, fence?: () => Promise<void>) {
        const postId = post.id;
        this.store.open(post); await expireHiringHolds(c, postId);
        await c.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [`hiring-campaign:${actor}`]);
        const slots = await c.query<{ state: string; terms: HiringSlotTerms }>(`SELECT state,terms FROM creator_hiring_slot WHERE id=$1 AND post_id=$2 FOR UPDATE`, [slotId, postId]);
        const slot = slots.rows[0]; if (!slot || !["open", "matching"].includes(slot.state)) throw new ConflictException("초대 가능한 모집 자리가 아니에요.");
        await c.query(`INSERT INTO creator_hiring_campaign(slot_id) VALUES ($1) ON CONFLICT DO NOTHING`, [slotId]);
        const campaign = (await c.query<{ round: number; state: string; next_dispatch_at: Date; now: Date }>(`SELECT *,clock_timestamp() AS now FROM creator_hiring_campaign WHERE slot_id=$1 FOR UPDATE`, [slotId])).rows[0];
        if (campaign.state !== "active" || campaign.round >= 2 || campaign.next_dispatch_at > campaign.now) throw new ConflictException("다음 초대 시간이 아니거나 캠페인이 종료되었어요.");
        const candidates = await this.availability.candidates(c, actor, slot.terms, true, postId);
        let sent = 0;
        for (const candidate of candidates) {
          if (sent >= HIRING_CAMPAIGN_POLICY.rounds[campaign.round]) break;
          // All candidate locks are acquired in account-ID order, including across campaigns.
          await this.availability.lockCapacity(c, candidate.userId);
          if (!await this.availability.eligible(c, actor, candidate.userId, slot.terms, true)) continue;
          const counts = (await c.query<{ candidate: number; recruiter: number; post: number; duplicate: number }>(`SELECT
            (SELECT count(*)::int FROM creator_hiring_invitation WHERE candidate_id=$1 AND created_at>now()-interval '24 hours') AS candidate,
            (SELECT count(*)::int FROM creator_hiring_invitation WHERE recruiter_id=$2 AND created_at>now()-interval '24 hours') AS recruiter,
            (SELECT count(*)::int FROM creator_hiring_invitation i JOIN creator_hiring_slot s ON s.id=i.slot_id WHERE s.post_id=$3) AS post,
            (SELECT count(*)::int FROM creator_hiring_invitation i JOIN creator_hiring_slot s ON s.id=i.slot_id WHERE s.post_id=$3 AND i.candidate_id=$1) AS duplicate`, [candidate.userId, actor, postId])).rows[0];
          if (counts.recruiter >= HIRING_CAMPAIGN_POLICY.recruiterDaily || counts.post >= HIRING_CAMPAIGN_POLICY.postTotal) break;
          if (counts.candidate >= HIRING_CAMPAIGN_POLICY.candidateDaily || counts.duplicate) continue;
          await this.store.currentOpen(c, post, slot.terms.dueAt);
          await fence?.();
          await c.query(`INSERT INTO creator_hiring_invitation(id,slot_id,candidate_id,recruiter_id,expires_at) VALUES ($1,$2,$3,$4,LEAST($5::timestamptz,$6::timestamptz,clock_timestamp()+interval '2 hours'))`, [randomUUID(), slotId, candidate.userId, actor, candidate.expiresAt, slot.terms.dueAt]);
          sent++;
        }
        await this.store.currentOpen(c, post, slot.terms.dueAt);
        await fence?.();
        const round = campaign.round + 1, state = round >= 2 ? "completed" : "active";
        await c.query(`UPDATE creator_hiring_campaign SET round=$2,state=$3,next_dispatch_at=clock_timestamp()+$4*interval '1 millisecond' WHERE slot_id=$1`, [slotId, round, state, HIRING_CAMPAIGN_POLICY.secondRoundDelayMs]);
        return { sent, round, state, automaticDispatchEnabled: false };
  }
  stop(actor: string, postId: string, slotId: string) {
    return this.store.tx(async (c) => {
      const post = await this.store.post(c, postId); await this.store.active(c, actor); this.store.owner(post, actor);
      const slot = await c.query(`SELECT id FROM creator_hiring_slot WHERE id=$1 AND post_id=$2`, [slotId, postId]);
      if (!slot.rows.length) throw new NotFoundException("모집 자리를 찾을 수 없어요.");
      await c.query(`UPDATE creator_hiring_campaign SET state='stopped' WHERE slot_id=$1`, [slotId]);
      await c.query(`UPDATE creator_hiring_invitation SET state='cancelled' WHERE slot_id=$1 AND state IN ('unread','read','interested')`, [slotId]);
      return { ok: true };
    });
  }
  inbox(actor: string): Promise<HiringInvitation[]> {
    return this.store.tx(async (c) => {
      await this.store.active(c, actor);
      const rows = await c.query<{ id: string; slot_id: string; post_id: string; title: string; role: HiringInvitation["role"]; state: HiringInvitation["state"]; expires_at: Date; created_at: Date; now: Date; unavailable: boolean; task_due_at: Date }>(`SELECT i.*,s.due_at AS task_due_at,s.post_id,p.title,s.terms->>'role' AS role,clock_timestamp() AS now,
        (p.status<>'open' OR p.hidden OR COALESCE(p."deadlineAt"<=clock_timestamp(),false) OR s.state NOT IN ('open','matching')) AS unavailable
        FROM creator_hiring_invitation i JOIN creator_hiring_slot s ON s.id=i.slot_id JOIN creator_collab_post p ON p.id=s.post_id
        JOIN "user" u ON u.id=i.recruiter_id AND u.status='active' WHERE i.candidate_id=$1 AND p."deletedAt" IS NULL
        AND NOT EXISTS(SELECT 1 FROM member_message_block b WHERE (b."blockerId"=$1 AND b."blockedUserId"=i.recruiter_id) OR (b."blockerId"=i.recruiter_id AND b."blockedUserId"=$1)) ORDER BY i.created_at DESC,i.id LIMIT 100`, [actor]);
      return rows.rows.map((r) => ({ id: r.id, slotId: r.slot_id, postId: r.post_id, title: r.title, role: r.role,
        state: ["unread", "read", "interested"].includes(r.state) ? r.unavailable ? "cancelled" : (r.expires_at <= r.now || r.task_due_at <= r.now) ? "expired" : r.state : r.state,
        expiresAt: r.expires_at.toISOString(), createdAt: r.created_at.toISOString() }));
    });
  }
  respond(actor: string, invitationId: string, action: "read" | "interested" | "declined" | "stop") {
    return this.store.tx(async (c) => {
      await this.store.active(c, actor);
      const refs = await c.query<{ post_id: string; candidate_id: string; slot_id: string }>(`SELECT s.post_id,i.candidate_id,i.slot_id FROM creator_hiring_invitation i JOIN creator_hiring_slot s ON s.id=i.slot_id WHERE i.id=$1`, [invitationId]);
      const ref = refs.rows[0]; if (!ref || ref.candidate_id !== actor) throw new NotFoundException("내 초대를 찾을 수 없어요.");
      const post = await this.store.post(c, ref.post_id); await this.availability.lockCapacity(c, actor);
      const inv = (await c.query<{ state: string; expires_at: Date; now: Date }>(`SELECT *,clock_timestamp() AS now FROM creator_hiring_invitation WHERE id=$1 FOR UPDATE`, [invitationId])).rows[0];
      if (action === "stop") {
        await c.query(`UPDATE creator_hiring_availability SET notification_opt_in=false,revision=revision+1 WHERE user_id=$1`, [actor]);
        await c.query(`UPDATE creator_hiring_invitation SET state='cancelled' WHERE candidate_id=$1 AND state IN ('unread','read','interested')`, [actor]);
      } else {
        if (!inv || inv.expires_at <= inv.now || !["unread", "read", "interested"].includes(inv.state)) throw new ConflictException("만료되었거나 종료된 초대입니다.");
        if (action !== "declined") {
          this.store.open(post);
          const slot = (await c.query<{ terms: HiringSlotTerms; state: string }>(`SELECT terms,state FROM creator_hiring_slot WHERE id=$1`, [ref.slot_id])).rows[0];
          if (!slot || !["open", "matching"].includes(slot.state) || !await this.availability.eligible(c, post.userId, actor, slot.terms, true)) throw new ForbiddenException("초대 동의 또는 현재 조건을 확인해 주세요.");
        }
        await c.query(`UPDATE creator_hiring_invitation SET state=$2 WHERE id=$1`, [invitationId, action === "read" && inv.state === "interested" ? "interested" : action]);
      }
      return { ok: true, termsAccepted: false, documentAccessGranted: false };
    });
  }
}
