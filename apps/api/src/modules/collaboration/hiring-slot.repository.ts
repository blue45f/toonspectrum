import { randomUUID } from "node:crypto";

import { ConflictException, HttpException } from "@nestjs/common";

import { expireHiringHolds } from "./hiring-expiry";

import { HiringStore } from "./hiring.store";

import type { HiringSlot, HiringSlotTerms } from "../../../../../packages/contracts/src/creator-hiring";

export type SlotInput = { terms: HiringSlotTerms; expectedRevision: number; expectedPostVersion: number };
export type SlotRow = { id: string; post_id: string; revision: number; state: HiringSlot["state"]; terms: HiringSlotTerms; created_at: Date };
export const slotOf = (r: SlotRow): HiringSlot => ({ id: r.id, postId: r.post_id, revision: r.revision, state: r.state, terms: r.terms, createdAt: r.created_at.toISOString() });
export class HiringSlotRepository {
  constructor(readonly store = new HiringStore()) {}
  list(actor: string, postId: string) {
    return this.store.tx(async (c) => {
      await this.store.active(c, actor); const post = await this.store.post(c, postId);
      await expireHiringHolds(c, postId);
      if (post.hidden && post.userId !== actor) this.store.open(post);
      const rows = await c.query<SlotRow>(`SELECT * FROM creator_hiring_slot WHERE post_id=$1 ORDER BY created_at,id LIMIT 30`, [postId]);
      return rows.rows.map(slotOf);
    });
  }
  save(actor: string, postId: string, slotId: string | null, input: SlotInput) {
    return this.store.tx(async (c) => {
      const post = await this.store.post(c, postId); await this.store.active(c, actor); this.store.owner(post, actor); this.store.open(post);
      if (post.version !== input.expectedPostVersion) throw new ConflictException("공고가 변경되었어요. 다시 불러와 주세요.");
      if (Date.parse(input.terms.dueAt) <= post.now.getTime() || Date.parse(input.terms.startsAt) > post.now.getTime() + 366 * 86400000) throw new ConflictException("작업 시작·마감 일정을 확인해 주세요.");
      const id = slotId ?? randomUUID();
      if (slotId) {
        const row = await c.query<SlotRow>(`SELECT * FROM creator_hiring_slot WHERE id=$1 AND post_id=$2 FOR UPDATE`, [slotId, postId]);
        if (!row.rows[0] || row.rows[0].revision !== input.expectedRevision || !["open", "paused", "matching"].includes(row.rows[0].state)) throw new ConflictException("모집 자리의 버전이나 상태가 변경되었어요.");
        await c.query(`UPDATE creator_hiring_slot SET terms=$2,starts_at=$3,due_at=$4,revision=revision+1,updated_at=now() WHERE id=$1`, [id, JSON.stringify(input.terms), input.terms.startsAt, input.terms.dueAt]);
        await c.query(`UPDATE creator_hiring_offer SET state='cancelled' WHERE slot_id=$1 AND state='pending'`, [id]);
      } else {
        if (input.expectedRevision !== 0) throw new ConflictException("새 모집 자리의 버전을 확인해 주세요.");
        const count = await c.query<{ count: number }>(`SELECT count(*)::int AS count FROM creator_hiring_slot WHERE post_id=$1`, [postId]);
        if (count.rows[0].count >= 30) throw new HttpException("공고당 최대 30개 모집 자리를 만들 수 있어요.", 429);
        await c.query(`INSERT INTO creator_hiring_slot(id,post_id,terms,starts_at,due_at) VALUES ($1,$2,$3,$4,$5)`, [id, postId, JSON.stringify(input.terms), input.terms.startsAt, input.terms.dueAt]);
      }
      return { id, revision: input.expectedRevision + 1 };
    });
  }
  state(actor: string, postId: string, slotId: string, input: { state: "open" | "paused" | "cancelled"; expectedRevision: number }) {
    return this.store.tx(async (c) => {
      const post = await this.store.post(c, postId); await this.store.active(c, actor); this.store.owner(post, actor);
      if (input.state === "open") this.store.open(post);
      const row = await c.query<SlotRow>(`SELECT * FROM creator_hiring_slot WHERE id=$1 AND post_id=$2 FOR UPDATE`, [slotId, postId]);
      if (!row.rows[0] || row.rows[0].revision !== input.expectedRevision || row.rows[0].state === "filled") throw new ConflictException("모집 자리의 버전이나 상태가 변경되었어요.");
      if (input.state === "open" && row.rows[0].state === "reserved") throw new ConflictException("예약된 제안을 먼저 취소해 주세요.");
      await c.query(`UPDATE creator_hiring_slot SET state=$2,revision=revision+1,updated_at=now() WHERE id=$1`, [slotId, input.state]);
      if (input.state !== "open") {
        await c.query(`UPDATE creator_hiring_commitment SET state='cancelled' WHERE slot_id=$1 AND state='reserved'`, [slotId]);
        await c.query(`UPDATE creator_hiring_offer SET state='cancelled' WHERE slot_id=$1 AND state IN ('pending','accepted')`, [slotId]);
        await c.query(`UPDATE creator_hiring_campaign SET state='stopped' WHERE slot_id=$1`, [slotId]);
        await c.query(`UPDATE creator_hiring_invitation SET state='cancelled' WHERE slot_id=$1 AND state IN ('unread','read','interested')`, [slotId]);
      }
      await expireHiringHolds(c, postId);
      return { ok: true };
    });
  }
}
