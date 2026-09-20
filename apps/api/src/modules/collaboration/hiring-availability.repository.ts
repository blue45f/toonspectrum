import { ConflictException, NotFoundException } from "@nestjs/common";

import { expireHiringHolds } from "./hiring-expiry";

import { matchingFacts, peakOverlap } from "./hiring-matching";
import { HiringStore } from "./hiring.store";

import type { HiringAvailability, HiringAvailabilityInput, HiringCandidate, HiringSlotTerms } from "../../../../../packages/contracts/src/creator-hiring";
import type { PoolClient } from "pg";

export type AvailabilityRow = { user_id: string; name: string; starts_at: Date; ends_at: Date; confirmed_at: Date; expires_at: Date; roles: HiringAvailability["roles"]; tools: string[]; formats: string[]; capacity: number; min_rate: string; rate_unit: HiringAvailability["rateUnit"]; discoverable: boolean; notification_opt_in: boolean; revision: number };
export const availabilityOf = (r: AvailabilityRow, now: Date): HiringAvailability => ({ userId: r.user_id, startsAt: r.starts_at.toISOString(), endsAt: r.ends_at.toISOString(), confirmedAt: r.confirmed_at.toISOString(), expiresAt: r.expires_at.toISOString(), roles: r.roles, tools: r.tools, formats: r.formats, capacity: r.capacity, minRate: Number(r.min_rate), rateUnit: r.rate_unit, discoverable: r.discoverable, notificationOptIn: r.notification_opt_in, revision: r.revision, expectedRevision: r.revision, valid: r.expires_at > now && r.starts_at <= now });
export class HiringAvailabilityRepository {
  constructor(readonly store = new HiringStore()) {}
  async lockCapacity(c: PoolClient, actor: string) {
    await c.query(`INSERT INTO creator_hiring_capacity(user_id) VALUES ($1) ON CONFLICT DO NOTHING`, [actor]);
    const row = await c.query<{ capacity: number }>(`SELECT capacity FROM creator_hiring_capacity WHERE user_id=$1 FOR UPDATE`, [actor]);
    return row.rows[0].capacity;
  }
  async overlap(c: PoolClient, actor: string, terms?: HiringSlotTerms) {
    const intervals = await c.query<{ starts_at: Date; ends_at: Date }>(`SELECT starts_at,ends_at FROM creator_hiring_commitment
      WHERE candidate_id=$1 AND (state='active' OR (state='reserved' AND hold_expires_at>clock_timestamp()))
      AND ends_at>clock_timestamp() AND (state='active' OR EXISTS(SELECT 1 FROM creator_hiring_slot s JOIN creator_collab_post p ON p.id=s.post_id WHERE s.id=creator_hiring_commitment.slot_id AND p.status='open' AND NOT p.hidden AND p."deletedAt" IS NULL AND (p."deadlineAt" IS NULL OR p."deadlineAt">clock_timestamp())))`, [actor]);
    return peakOverlap(intervals.rows.map((r) => ({ startsAt: r.starts_at.getTime(), endsAt: r.ends_at.getTime() })), terms ? { startsAt: Date.parse(terms.startsAt), endsAt: Date.parse(terms.dueAt) } : undefined);
  }
  own(actor: string) {
    return this.store.tx(async (c) => {
      await this.store.active(c, actor);
      const rows = await c.query<AvailabilityRow & { now: Date }>(`SELECT a.*,c.capacity,clock_timestamp() AS now FROM creator_hiring_availability a JOIN creator_hiring_capacity c ON c.user_id=a.user_id WHERE a.user_id=$1`, [actor]);
      return rows.rows[0] ? availabilityOf(rows.rows[0], rows.rows[0].now) : null;
    });
  }
  save(actor: string, input: HiringAvailabilityInput) {
    return this.store.tx(async (c) => {
      await this.store.active(c, actor); await this.lockCapacity(c, actor);
      const time = (await c.query<{ now: Date }>(`SELECT clock_timestamp() AS now`)).rows[0].now;
      const now = time.getTime();
      if (Date.parse(input.startsAt) > now || Date.parse(input.startsAt) < now - 86400000 || Date.parse(input.endsAt) <= now || Date.parse(input.endsAt) > now + 31 * 86400000) throw new ConflictException("현재 가능한 시작 시각과 31일 이내 작업 가능 기간을 확인해 주세요.");
      const old = await c.query<{ revision: number }>(`SELECT revision FROM creator_hiring_availability WHERE user_id=$1`, [actor]);
      if ((old.rows[0]?.revision ?? 0) !== input.expectedRevision) throw new ConflictException("작업 가능 정보가 변경되었어요. 다시 불러와 주세요.");
      if (input.capacity < await this.overlap(c, actor)) throw new ConflictException("이미 예약된 동시 작업 수보다 낮출 수 없어요. 예약을 먼저 취소해 주세요.");
      const expiresAt = new Date(Math.min(now + 2 * 3600000, Date.parse(input.endsAt)));
      await c.query(`UPDATE creator_hiring_capacity SET capacity=$2 WHERE user_id=$1`, [actor, input.capacity]);
      await c.query(`INSERT INTO creator_hiring_availability(user_id,starts_at,ends_at,confirmed_at,expires_at,roles,tools,formats,min_rate,rate_unit,discoverable,notification_opt_in,revision)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,1) ON CONFLICT(user_id) DO UPDATE SET starts_at=EXCLUDED.starts_at,ends_at=EXCLUDED.ends_at,confirmed_at=EXCLUDED.confirmed_at,expires_at=EXCLUDED.expires_at,
        roles=EXCLUDED.roles,tools=EXCLUDED.tools,formats=EXCLUDED.formats,min_rate=EXCLUDED.min_rate,rate_unit=EXCLUDED.rate_unit,discoverable=EXCLUDED.discoverable,notification_opt_in=EXCLUDED.notification_opt_in,revision=creator_hiring_availability.revision+1`,
      [actor, input.startsAt, input.endsAt, time, expiresAt, JSON.stringify(input.roles), JSON.stringify(input.tools), JSON.stringify(input.formats), input.minRate, input.rateUnit, input.discoverable, input.notificationOptIn]);
      if (!input.notificationOptIn || !input.discoverable) {
        await c.query(`UPDATE creator_hiring_invitation SET state='cancelled' WHERE candidate_id=$1 AND state IN ('unread','read','interested')`, [actor]);
      }
      return { revision: input.expectedRevision + 1, confirmedAt: time.toISOString(), expiresAt: expiresAt.toISOString() };
    });
  }
  async eligible(c: PoolClient, recruiter: string, candidate: string, terms: HiringSlotTerms, notification = false): Promise<HiringCandidate | null> {
    const rows = await c.query<AvailabilityRow & { now: Date }>(`SELECT a.*,u.name,c.capacity,clock_timestamp() AS now FROM creator_hiring_availability a
      JOIN "user" u ON u.id=a.user_id AND u.status='active' JOIN creator_hiring_capacity c ON c.user_id=a.user_id
      WHERE a.user_id=$1 AND a.user_id<>$2 AND EXISTS(SELECT 1 FROM "user" r WHERE r.id=$2 AND r.status='active')
      AND NOT EXISTS(SELECT 1 FROM member_message_block b WHERE (b."blockerId"=$1 AND b."blockedUserId"=$2) OR (b."blockerId"=$2 AND b."blockedUserId"=$1)) FOR SHARE OF u`, [candidate, recruiter]);
    const r = rows.rows[0]; if (!r) return null;
    const availability = availabilityOf(r, r.now), facts = matchingFacts(availability, terms, r.now.getTime(), notification);
    if (!facts) return null;
    const remaining = r.capacity - await this.overlap(c, candidate, terms);
    if (remaining <= 0) return null;
    return { userId: r.user_id, displayName: r.name || "창작자", roles: availability.roles, tools: availability.tools, formats: availability.formats,
      startsAt: availability.startsAt, endsAt: availability.endsAt, confirmedAt: availability.confirmedAt, expiresAt: availability.expiresAt,
      capacity: remaining, minRate: availability.minRate, rateUnit: availability.rateUnit, reasons: [...facts, `해당 기간 동시 작업 여력 ${remaining}건`] };
  }
  async candidates(c: PoolClient, recruiter: string, terms: HiringSlotTerms, notification = false, campaignPost: string | null = null): Promise<HiringCandidate[]> {
    // One set-based read. Capacity is filtered BEFORE LIMIT, so saturated early
    // account IDs cannot hide later eligible candidates. Half-open intervals use
    // grouped end/start events at the same timestamp (adjacent work does not overlap).
    const rows = await c.query<AvailabilityRow & { now: Date; remaining: number }>(`WITH matched AS MATERIALIZED (
      SELECT a.*,u.name,c.capacity,statement_timestamp() AS now
      FROM creator_hiring_availability a JOIN "user" u ON u.id=a.user_id AND u.status='active'
      JOIN creator_hiring_capacity c ON c.user_id=a.user_id
      WHERE $6::timestamptz>statement_timestamp() AND a.discoverable AND a.expires_at>statement_timestamp() AND a.starts_at<=statement_timestamp() AND a.user_id<>$1
      AND EXISTS(SELECT 1 FROM "user" recruiter WHERE recruiter.id=$1 AND recruiter.status='active')
      AND a.roles @> $2::jsonb AND a.tools @> $3::jsonb AND a.formats @> $4::jsonb
      AND a.starts_at<=$5 AND a.ends_at>=$6 AND a.min_rate<=$7 AND a.rate_unit=$8 AND (NOT $9::boolean OR a.notification_opt_in)
      AND ($10::text IS NULL OR (
        NOT EXISTS(SELECT 1 FROM creator_hiring_invitation i JOIN creator_hiring_slot s ON s.id=i.slot_id WHERE s.post_id=$10 AND i.candidate_id=a.user_id)
        AND (SELECT count(*) FROM creator_hiring_invitation i WHERE i.candidate_id=a.user_id AND i.created_at>statement_timestamp()-interval '24 hours')<5
        AND NOT EXISTS(SELECT 1 FROM creator_collab_application app WHERE app."postId"=$10 AND app."userId"=a.user_id AND app.status='withdrawn')
      ))
      AND NOT EXISTS(SELECT 1 FROM member_message_block b WHERE (b."blockerId"=a.user_id AND b."blockedUserId"=$1) OR (b."blockerId"=$1 AND b."blockedUserId"=a.user_id))
    ), occupied AS (
      SELECT c.candidate_id,GREATEST(c.starts_at,$5::timestamptz) AS starts_at,LEAST(c.ends_at,$6::timestamptz) AS ends_at
      FROM creator_hiring_commitment c JOIN matched m ON m.user_id=c.candidate_id
      JOIN creator_hiring_slot s ON s.id=c.slot_id JOIN creator_collab_post p ON p.id=s.post_id
      WHERE c.starts_at<$6 AND c.ends_at>$5 AND c.ends_at>m.now
      AND (c.state='active' OR (c.state='reserved' AND c.hold_expires_at>m.now
        AND p.status='open' AND NOT p.hidden AND p."deletedAt" IS NULL AND (p."deadlineAt" IS NULL OR p."deadlineAt">m.now)))
    ), events AS (
      SELECT candidate_id,starts_at AS at,1 AS delta FROM occupied
      UNION ALL SELECT candidate_id,ends_at AS at,-1 AS delta FROM occupied
    ), loads AS (
      SELECT candidate_id,sum(sum(delta)) OVER (PARTITION BY candidate_id ORDER BY at) AS concurrent
      FROM events GROUP BY candidate_id,at
    ), peaks AS (
      SELECT candidate_id,max(concurrent)::int AS peak FROM loads GROUP BY candidate_id
    ) SELECT m.*,m.capacity-COALESCE(p.peak,0) AS remaining FROM matched m LEFT JOIN peaks p ON p.candidate_id=m.user_id
      WHERE m.capacity>COALESCE(p.peak,0) ORDER BY m.user_id LIMIT 30`,
    [recruiter, JSON.stringify([terms.role]), JSON.stringify(terms.tools), JSON.stringify(terms.formats), terms.startsAt, terms.dueAt, terms.maxRate, terms.rateUnit, notification, campaignPost]);
    return rows.rows.map((r) => {
      const a = availabilityOf(r, r.now);
      return { userId: r.user_id, displayName: r.name || "창작자", roles: a.roles, tools: a.tools, formats: a.formats,
        startsAt: a.startsAt, endsAt: a.endsAt, confirmedAt: a.confirmedAt, expiresAt: a.expiresAt,
        capacity: r.remaining, minRate: a.minRate, rateUnit: a.rateUnit,
        reasons: [...(matchingFacts(a, terms, r.now.getTime(), notification) ?? []), `해당 기간 동시 작업 여력 ${r.remaining}건`] };
    });
  }

  discover(actor: string, postId: string, slotId: string) {
    return this.store.tx(async (c) => {
      const post = await this.store.post(c, postId); await this.store.active(c, actor); this.store.owner(post, actor); this.store.open(post); await expireHiringHolds(c, postId);
      const slot = await c.query<{ terms: HiringSlotTerms; state: string }>(`SELECT terms,state FROM creator_hiring_slot WHERE id=$1 AND post_id=$2`, [slotId, postId]);
      if (!slot.rows[0] || !["open", "matching"].includes(slot.rows[0].state)) throw new NotFoundException("탐색 가능한 모집 자리가 없어요.");
      return { items: await this.candidates(c, actor, slot.rows[0].terms), ordering: "account-id" as const, limit: 30 };
    });
  }
}
