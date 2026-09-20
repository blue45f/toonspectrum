import type { PoolClient } from "pg";

export async function expireHiringHolds(c: PoolClient, postId: string) {
  // Read/mutation path cleanup means stopped workers never keep capacity reserved.
  // Callers hold the original post row lock. A natural deadline has no UPDATE trigger.
  await c.query(`UPDATE creator_hiring_commitment c SET state='cancelled' FROM creator_hiring_slot s,creator_collab_post p
    WHERE c.slot_id=s.id AND s.post_id=p.id AND p.id=$1 AND c.state='reserved'
    AND (p.status<>'open' OR p.hidden OR p."deletedAt" IS NOT NULL OR p."deadlineAt"<=clock_timestamp())`, [postId]);
  await c.query(`UPDATE creator_hiring_commitment c SET state='expired' FROM creator_hiring_slot s
    WHERE c.slot_id=s.id AND s.post_id=$1 AND c.state='reserved' AND (c.hold_expires_at<=clock_timestamp() OR c.ends_at<=clock_timestamp())`, [postId]);
  await c.query(`UPDATE creator_hiring_offer o SET state='expired' FROM creator_hiring_slot s WHERE o.slot_id=s.id AND s.post_id=$1
    AND ((o.state='pending' AND (o.expires_at<=clock_timestamp() OR s.due_at<=clock_timestamp())) OR (o.state='accepted' AND EXISTS(SELECT 1 FROM creator_hiring_commitment c WHERE c.offer_id=o.id AND c.state='expired')))`, [postId]);
  await c.query(`UPDATE creator_hiring_offer o SET state='cancelled' FROM creator_hiring_slot s,creator_collab_post p
    WHERE o.slot_id=s.id AND s.post_id=p.id AND p.id=$1 AND o.state IN ('pending','accepted')
    AND (p.status<>'open' OR p.hidden OR p."deletedAt" IS NOT NULL OR p."deadlineAt"<=clock_timestamp())`, [postId]);
  await c.query(`UPDATE creator_hiring_slot s SET state='paused',revision=s.revision+1,updated_at=now() FROM creator_collab_post p
    WHERE s.post_id=p.id AND p.id=$1 AND s.state IN ('open','matching','reserved')
    AND (s.due_at<=clock_timestamp() OR p.status<>'open' OR p.hidden OR p."deletedAt" IS NOT NULL OR p."deadlineAt"<=clock_timestamp())`, [postId]);
  await c.query(`UPDATE creator_hiring_campaign c SET state='stopped' FROM creator_hiring_slot s
    WHERE c.slot_id=s.id AND s.post_id=$1 AND s.state IN ('paused','cancelled','filled') AND c.state='active'`, [postId]);
  await c.query(`UPDATE creator_hiring_invitation i SET state=CASE WHEN i.expires_at<=clock_timestamp() OR s.due_at<=clock_timestamp() THEN 'expired' ELSE 'cancelled' END FROM creator_hiring_slot s
    WHERE i.slot_id=s.id AND s.post_id=$1 AND i.state IN ('unread','read','interested')
    AND (i.expires_at<=clock_timestamp() OR s.due_at<=clock_timestamp() OR s.state NOT IN ('open','matching'))`, [postId]);
  await c.query(`UPDATE creator_hiring_slot s SET state='open',updated_at=now() WHERE s.post_id=$1 AND s.state='reserved'
    AND NOT EXISTS(SELECT 1 FROM creator_hiring_commitment c WHERE c.slot_id=s.id AND c.state IN ('reserved','active'))`, [postId]);
  await c.query(`UPDATE creator_hiring_outbox o SET state='failed' WHERE event_type='role-assignment-requested' AND state IN ('pending','processing')
    AND EXISTS(SELECT 1 FROM creator_hiring_commitment c JOIN creator_hiring_slot s ON s.id=c.slot_id WHERE c.id=o.aggregate_id AND s.post_id=$1 AND c.state IN ('expired','cancelled'))`, [postId]);
}
