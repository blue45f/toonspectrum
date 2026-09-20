import { randomUUID } from "node:crypto";

import { ConflictException, ForbiddenException, HttpException, NotFoundException } from "@nestjs/common";

import { expireHiringHolds } from "./hiring-expiry";

import { HiringAvailabilityRepository } from "./hiring-availability.repository";
import { HiringStore } from "./hiring.store";
import { slotTermsSchema } from "./hiring.validation";

import type { HiringAcceptance, HiringOffer, HiringSlotTerms } from "../../../../../packages/contracts/src/creator-hiring";
import type { PoolClient } from "pg";

type OfferRow = { id: string; slot_id: string; post_id: string; candidate_id: string; recruiter_id: string; terms_revision: number; terms: HiringSlotTerms; state: HiringOffer["state"]; expires_at: Date; created_at: Date; commitment_id: string | null; commitment_state: string | null; hold_expires_at: Date | null; now: Date; unavailable: boolean };
export class HiringOfferRepository {
  constructor(readonly store = new HiringStore(), readonly availability = new HiringAvailabilityRepository(store)) {}
  send(actor: string, postId: string, slotId: string, input: { candidateId: string; expectedRevision: number; expiresAt: string; mutationId: string }) {
    return this.store.tx(async (c) => {
      await this.store.active(c, actor);
      const previous = await this.store.prior<{ id: string }>(c, actor, `offer:${slotId}`, input.mutationId, input);
      if (previous) return previous.result;
      const post = await this.store.post(c, postId); this.store.owner(post, actor);
      return this.store.receipt(c, actor, `offer:${slotId}`, input.mutationId, input, async () => {
        this.store.open(post); await this.store.active(c, input.candidateId);
        await c.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [`hiring-offer-send:${actor}`]);
        await this.availability.lockCapacity(c, input.candidateId); await expireHiringHolds(c, postId);
        const slot = await c.query<{ terms: HiringSlotTerms; state: string; revision: number }>(`SELECT terms,state,revision FROM creator_hiring_slot WHERE id=$1 AND post_id=$2 FOR UPDATE`, [slotId, postId]);
        const s = slot.rows[0];
        if (!s || s.revision !== input.expectedRevision || !["open", "matching"].includes(s.state)) throw new ConflictException("모집 조건 또는 상태가 변경되었어요.");
        if (!slotTermsSchema.safeParse(s.terms).success) throw new ConflictException("지원하지 않거나 유효하지 않은 보수 조건입니다. 모집 조건을 수정해 주세요.");
        const time = (await c.query<{ now: Date }>(`SELECT clock_timestamp() AS now`)).rows[0].now.getTime();
        if (Date.parse(input.expiresAt) <= time || Date.parse(input.expiresAt) > time + 2 * 3600000) throw new ConflictException("제안 만료 시각은 현재부터 2시간 이내여야 해요.");
        if (!await this.availability.eligible(c, actor, input.candidateId, s.terms, true)) throw new ConflictException("후보의 동의·차단·가능 시간·조건 또는 작업 여력이 변경되었어요.");
        const count = await c.query<{ count: number }>(`SELECT count(*)::int AS count FROM creator_hiring_offer WHERE recruiter_id=$1 AND created_at>now()-interval '24 hours'`, [actor]);
        if (count.rows[0].count >= 50) throw new HttpException("24시간 제안 한도에 도달했어요.", 429);
        const old = await c.query(`SELECT id FROM creator_hiring_offer WHERE slot_id=$1 AND candidate_id=$2 AND state IN ('pending','accepted','declined')`, [slotId, input.candidateId]);
        if (old.rows.length) throw new ConflictException("이미 제안했거나 거절한 후보에게 같은 자리의 제안을 반복할 수 없어요.");
        await this.store.currentOpen(c, post, s.terms.dueAt);
        const id = randomUUID();
        await c.query(`INSERT INTO creator_hiring_offer(id,slot_id,candidate_id,recruiter_id,terms_revision,terms,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [id, slotId, input.candidateId, actor, s.revision, JSON.stringify(s.terms), input.expiresAt]);
        return { id };
      });
    });
  }
  async offerPost(c: PoolClient, offerId: string) {
    const result = await c.query<{ post_id: string; slot_id: string; candidate_id: string }>(`SELECT s.post_id,o.slot_id,o.candidate_id FROM creator_hiring_offer o JOIN creator_hiring_slot s ON s.id=o.slot_id WHERE o.id=$1`, [offerId]);
    if (!result.rows[0]) throw new NotFoundException("제안을 찾을 수 없어요.");
    return result.rows[0];
  }
  accept(actor: string, offerId: string, mutationId: string): Promise<HiringAcceptance> {
    return this.store.tx(async (c) => {
      await this.store.active(c, actor);
      const previous = await this.store.prior<HiringAcceptance>(c, actor, `accept:${offerId}`, mutationId, { offerId });
      if (previous) return previous.result;
      const ref = await this.offerPost(c, offerId);
      const post = await this.store.post(c, ref.post_id); await this.store.active(c, post.userId);
      if (ref.candidate_id !== actor) throw new ForbiddenException("제안받은 계정만 수락할 수 있어요.");
      return this.store.receipt(c, actor, `accept:${offerId}`, mutationId, { offerId }, async () => {
        this.store.open(post); const capacity = await this.availability.lockCapacity(c, actor);
        await expireHiringHolds(c, post.id);
        const slots = await c.query<{ revision: number; state: string }>(`SELECT revision,state FROM creator_hiring_slot WHERE id=$1 FOR UPDATE`, [ref.slot_id]);
        const offers = await c.query<OfferRow & { now: Date }>(`SELECT *,clock_timestamp() AS now FROM creator_hiring_offer WHERE id=$1 FOR UPDATE`, [offerId]);
        const offer = offers.rows[0], slot = slots.rows[0];
        if (!offer || !slot || !["open", "matching"].includes(slot.state) || offer.state !== "pending" || offer.expires_at <= offer.now || offer.terms_revision !== slot.revision) throw new ConflictException("제안이 만료되었거나 모집 조건·상태가 변경되었어요.");
        if (!slotTermsSchema.safeParse(offer.terms).success) throw new ConflictException("지원하지 않거나 유효하지 않은 보수 조건은 확정할 수 없습니다.");
        if (!await this.availability.eligible(c, post.userId, actor, offer.terms, true) || await this.availability.overlap(c, actor, offer.terms) >= capacity) throw new ConflictException("동의·차단·작업 가능 시간 또는 동시 작업 여력이 변경되었어요.");
        const acceptedAt = await this.store.currentOpen(c, post, offer.terms.dueAt);
        if (offer.expires_at <= acceptedAt) throw new ConflictException("제안이 만료되었어요.");
        const commitmentId = randomUUID();
        // No RoleAssignment is executed here. This receipt cannot grant documents.
        const holdExpiresAt = new Date(Math.min(acceptedAt.getTime() + 30 * 60000, Date.parse(offer.terms.dueAt))).toISOString();
        await c.query(`INSERT INTO creator_hiring_commitment(id,slot_id,offer_id,candidate_id,state,starts_at,ends_at,hold_expires_at) VALUES ($1,$2,$3,$4,'reserved',$5,$6,$7)`, [commitmentId, ref.slot_id, offerId, actor, offer.terms.startsAt, offer.terms.dueAt, holdExpiresAt]);
        await c.query(`UPDATE creator_hiring_offer SET state='accepted' WHERE id=$1`, [offerId]);
        await c.query(`UPDATE creator_hiring_slot SET state='reserved',updated_at=now() WHERE id=$1`, [ref.slot_id]);
        await c.query(`INSERT INTO creator_hiring_outbox(id,event_type,aggregate_id,payload) VALUES ($1,'role-assignment-requested',$2,$3)`, [randomUUID(), commitmentId, JSON.stringify({ commitmentId, postId: post.id, slotId: ref.slot_id })]);
        await c.query(`UPDATE creator_hiring_campaign SET state='completed' WHERE slot_id=$1`, [ref.slot_id]);
        await c.query(`UPDATE creator_hiring_invitation SET state='cancelled' WHERE slot_id=$1 AND state IN ('unread','read','interested')`, [ref.slot_id]);
        return { offerId, commitmentId, holdExpiresAt, onboardingStatus: "pending", documentAccessGranted: false };
      });
    });
  }
  change(actor: string, offerId: string, action: "decline" | "cancel", mutationId: string) {
    return this.store.tx(async (c) => {
      const ref = await this.offerPost(c, offerId), post = await this.store.post(c, ref.post_id); await this.store.active(c, actor);
      if (actor !== ref.candidate_id && actor !== post.userId) throw new NotFoundException("제안을 찾을 수 없어요.");
      if (action === "decline" && actor !== ref.candidate_id) throw new ForbiddenException("후보만 거절할 수 있어요.");
      return this.store.receipt(c, actor, `offer-action:${offerId}`, mutationId, { action }, async () => {
        await this.availability.lockCapacity(c, ref.candidate_id); await expireHiringHolds(c, post.id);
        await c.query(`SELECT id FROM creator_hiring_slot WHERE id=$1 FOR UPDATE`, [ref.slot_id]);
        const offer = await c.query<{ state: string }>(`SELECT state FROM creator_hiring_offer WHERE id=$1 FOR UPDATE`, [offerId]);
        if (!offer.rows[0] || !["pending", "accepted"].includes(offer.rows[0].state)) throw new ConflictException("이미 종료된 제안이에요.");
        await c.query(`UPDATE creator_hiring_offer SET state=$2 WHERE id=$1`, [offerId, action === "decline" ? "declined" : "cancelled"]);
        await c.query(`UPDATE creator_hiring_commitment SET state='cancelled' WHERE offer_id=$1 AND state='reserved'`, [offerId]);
        await c.query(`UPDATE creator_hiring_slot s SET state='open',updated_at=now() WHERE s.id=$1 AND s.state='reserved' AND NOT EXISTS(SELECT 1 FROM creator_hiring_commitment c WHERE c.slot_id=s.id AND c.state IN ('active','reserved'))`, [ref.slot_id]);
        await expireHiringHolds(c, post.id);
        return { ok: true };
      });
    });
  }
  list(actor: string): Promise<HiringOffer[]> {
    return this.store.tx(async (c) => {
      await this.store.active(c, actor);
      const rows = await c.query<OfferRow>(`SELECT o.*,s.post_id,c.id AS commitment_id,c.state AS commitment_state,c.hold_expires_at,clock_timestamp() AS now,
        (p.status<>'open' OR p.hidden OR COALESCE(p."deadlineAt"<=clock_timestamp(),false)) AS unavailable
        FROM creator_hiring_offer o JOIN creator_hiring_slot s ON s.id=o.slot_id JOIN creator_collab_post p ON p.id=s.post_id
        LEFT JOIN creator_hiring_commitment c ON c.offer_id=o.id WHERE (o.candidate_id=$1 OR o.recruiter_id=$1) AND p."deletedAt" IS NULL ORDER BY o.created_at DESC,o.id LIMIT 100`, [actor]);
      return rows.rows.map((r) => {
        const expired = (["pending", "accepted"].includes(r.state) && Date.parse(r.terms.dueAt) <= r.now.getTime()) || (r.state === "pending" && r.expires_at <= r.now) || (r.state === "accepted" && r.commitment_state === "reserved" && r.hold_expires_at !== null && r.hold_expires_at <= r.now);
        const state = r.unavailable && ["pending", "accepted"].includes(r.state) ? "cancelled" : expired ? "expired" : r.state;
        return { id: r.id, postId: r.post_id, slotId: r.slot_id, candidateId: r.candidate_id, recruiterId: r.recruiter_id,
          termsRevision: r.terms_revision, terms: r.terms, state, expiresAt: r.expires_at.toISOString(), createdAt: r.created_at.toISOString(), commitmentId: r.commitment_id,
          onboardingStatus: state === "accepted" ? "pending" : r.commitment_id ? "cancelled" : "not-started" };
      });
    });
  }
}
