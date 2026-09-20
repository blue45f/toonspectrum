import { randomUUID } from "node:crypto";

import { ConflictException, ServiceUnavailableException } from "@nestjs/common";

import { hiringAutomationConfig } from "./hiring-automation.config";
import { HiringCampaignRepository } from "./hiring-campaign.repository";
import { HiringStore } from "./hiring.store";

import type { HiringAutomationConfig } from "./hiring-automation.config";
import type { PoolClient } from "pg";

export interface CampaignJob {
  id: string; slot_id: string; post_id: string; recruiter_id: string; generation: number; terms_revision: number; post_version: number;
  status: "queued" | "processing" | "completed" | "failed" | "stopped" | "expired";
  requested_mode: "automatic"; next_execution_at: Date; attempts: number; lease_until: Date | null; claim_token: string | null;
  next_round: number; terminal_reason: string | null; updated_at: Date;
}
export const automationBackoffMs = (attempt: number) => Math.min(300000, 5000 * 2 ** Math.max(0, attempt - 1));
export class HiringAutomationRepository {
  constructor(readonly store = new HiringStore(), readonly config: HiringAutomationConfig = hiringAutomationConfig(), readonly campaigns = new HiringCampaignRepository(store)) {}
  requireEnabled() { if (!this.config.enabled || !this.config.supported) throw new ServiceUnavailableException("자동 초대가 운영 설정에서 활성화되지 않았어요. 수동 초대를 이용해 주세요."); }
  async ready(c: PoolClient) { await c.query("SELECT creator_hiring_automation_require_ready()"); }
  state(actor: string, postId: string, slotId: string) {
    return this.store.tx(async (c) => {
      await this.store.active(c, actor); const post = await this.store.post(c, postId); this.store.owner(post, actor);
      // Read-only capability inspection keeps an existing job visible for cancellation
      // even after the operator disables the worker. No timer/worker query is enabled here.
      const installed = await c.query<{ available: boolean }>(`SELECT to_regprocedure('creator_hiring_automation_require_ready()') IS NOT NULL AS available`);
      if (!installed.rows[0].available) return { enabled: false, supported: this.config.supported, job: null };
      await this.ready(c); await this.reconcile(c, postId);
      const result = await c.query<CampaignJob>(`SELECT * FROM creator_hiring_campaign_job WHERE slot_id=$1 AND post_id=$2`, [slotId, postId]);
      const r = result.rows[0];
      return { enabled: this.config.enabled && this.config.supported, supported: this.config.supported, job: r ? { id: r.id, generation: r.generation, termsRevision: r.terms_revision, mode: r.requested_mode, status: r.status, attempts: r.attempts, nextExecutionAt: r.next_execution_at.toISOString(), leaseUntil: r.lease_until?.toISOString() ?? null, terminalReason: r.terminal_reason, updatedAt: r.updated_at.toISOString() } : null };
    });
  }
  start(actor: string, postId: string, slotId: string, input: { mutationId: string; expectedRevision: number; expectedPostVersion: number; mode: "automatic" }) {
    this.requireEnabled();
    return this.store.tx(async (c) => {
      await this.ready(c);
      await this.store.active(c, actor); const post = await this.store.post(c, postId); this.store.owner(post, actor); this.store.open(post);
      return this.store.receipt(c, actor, `auto-start:${slotId}`, input.mutationId, input, async () => {
        const slot = (await c.query<{ revision: number; state: string; due_at: Date }>(`SELECT revision,state,due_at FROM creator_hiring_slot WHERE id=$1 AND post_id=$2 FOR UPDATE`, [slotId, postId])).rows[0];
        if (!slot || slot.revision !== input.expectedRevision || post.version !== input.expectedPostVersion || !["open", "matching"].includes(slot.state)) throw new ConflictException("모집 조건이 변경되었어요. 새 조건을 확인하고 다시 동의해 주세요.");
        await this.store.currentOpen(c, post, slot.due_at.toISOString());
        await c.query(`INSERT INTO creator_hiring_campaign(slot_id) VALUES ($1) ON CONFLICT DO NOTHING`, [slotId]);
        const campaign = (await c.query<{ round: number; next_dispatch_at: Date }>(`SELECT round,next_dispatch_at FROM creator_hiring_campaign WHERE slot_id=$1 FOR UPDATE`, [slotId])).rows[0];
        if (campaign.round >= 2) throw new ConflictException("두 차례 초대를 모두 실행했어요.");
        const old = (await c.query<CampaignJob>(`SELECT * FROM creator_hiring_campaign_job WHERE slot_id=$1 FOR UPDATE`, [slotId])).rows[0];
        if (old && ["queued", "processing"].includes(old.status)) throw new ConflictException("자동 초대가 이미 진행 중이에요.");
        await c.query(`UPDATE creator_hiring_campaign SET state='active' WHERE slot_id=$1`, [slotId]);
        const id = old?.id ?? randomUUID();
        await c.query(`INSERT INTO creator_hiring_campaign_job(id,slot_id,post_id,recruiter_id,terms_revision,post_version,next_round,next_execution_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(slot_id) DO UPDATE SET generation=creator_hiring_campaign_job.generation+1,
          terms_revision=EXCLUDED.terms_revision,post_version=EXCLUDED.post_version,next_round=EXCLUDED.next_round,next_execution_at=EXCLUDED.next_execution_at,
          status='queued',attempts=0,lease_until=NULL,claim_token=NULL,terminal_reason=NULL,updated_at=clock_timestamp()`, [id, slotId, postId, actor, slot.revision, post.version, campaign.round, campaign.next_dispatch_at]);
        return { id };
      });
    });
  }
  stop(actor: string, postId: string, slotId: string) {
    // Stop is available even after an operator disables automation.
    return this.store.tx(async (c) => {
      await this.ready(c); await this.store.active(c, actor); const post = await this.store.post(c, postId); this.store.owner(post, actor);
      await c.query(`UPDATE creator_hiring_campaign_job SET status='stopped',terminal_reason='recruiter-stopped',claim_token=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE slot_id=$1 AND post_id=$2 AND status IN ('queued','processing','failed')`, [slotId, postId]);
      await c.query(`UPDATE creator_hiring_campaign SET state='stopped' WHERE slot_id=$1 AND EXISTS(SELECT 1 FROM creator_hiring_slot s WHERE s.id=$1 AND s.post_id=$2)`, [slotId, postId]);
      await c.query(`UPDATE creator_hiring_invitation SET state='cancelled' WHERE slot_id=$1 AND state IN ('unread','read','interested') AND EXISTS(SELECT 1 FROM creator_hiring_slot s WHERE s.id=$1 AND s.post_id=$2)`, [slotId, postId]);
      return { ok: true };
    });
  }
  async reconcile(c: PoolClient, postId: string) {
    await c.query(`UPDATE creator_hiring_campaign_job j SET status=CASE WHEN s.due_at<=clock_timestamp() OR p."deadlineAt"<=clock_timestamp() THEN 'expired' ELSE 'stopped' END,
      terminal_reason='authority-changed',claim_token=NULL,lease_until=NULL,updated_at=clock_timestamp()
      FROM creator_hiring_slot s,creator_collab_post p,"user" u,creator_hiring_campaign a
      WHERE j.post_id=$1 AND s.id=j.slot_id AND p.id=j.post_id AND u.id=j.recruiter_id AND a.slot_id=j.slot_id AND j.status IN ('queued','processing')
      AND (s.revision<>j.terms_revision OR p.version<>j.post_version OR s.state NOT IN ('open','matching') OR p.status<>'open' OR p.hidden OR p."deletedAt" IS NOT NULL
        OR u.status<>'active' OR a.state='stopped' OR s.due_at<=clock_timestamp() OR p."deadlineAt"<=clock_timestamp())`, [postId]);
  }
  async claim(): Promise<CampaignJob | null> {
    this.requireEnabled();
    return this.store.tx(async (c) => {
      await this.ready(c);
      // Global order: parent post -> recruiter quota -> slot/campaign/job -> candidate
      // capacity (account order). Claim never locks a job before its parent post.
      const parent = (await c.query<{ id: string }>(`SELECT p.id FROM creator_collab_post p WHERE EXISTS(SELECT 1 FROM creator_hiring_campaign_job j WHERE j.post_id=p.id
        AND ((j.status='queued' AND j.next_execution_at<=clock_timestamp()) OR (j.status='processing' AND j.lease_until<=clock_timestamp())))
        ORDER BY (SELECT min(j.next_execution_at) FROM creator_hiring_campaign_job j WHERE j.post_id=p.id),p.id LIMIT 1 FOR UPDATE OF p SKIP LOCKED`)).rows[0];
      if (!parent) return null;
      await this.reconcile(c, parent.id);
      await c.query(`UPDATE creator_hiring_campaign_job SET status='failed',terminal_reason='attempts-exhausted',claim_token=NULL,lease_until=NULL,updated_at=clock_timestamp()
        WHERE post_id=$1 AND attempts>=$2 AND (status='queued' OR (status='processing' AND lease_until<=clock_timestamp()))`, [parent.id, this.config.maxAttempts]);
      const result = await c.query<CampaignJob>(`UPDATE creator_hiring_campaign_job SET status='processing',attempts=attempts+1,claim_token=$2,
        lease_until=clock_timestamp()+$3*interval '1 millisecond',updated_at=clock_timestamp() WHERE id=(SELECT id FROM creator_hiring_campaign_job
        WHERE post_id=$1 AND attempts<$4 AND ((status='queued' AND next_execution_at<=clock_timestamp()) OR (status='processing' AND lease_until<=clock_timestamp()))
        ORDER BY next_execution_at,id LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`, [parent.id, randomUUID(), this.config.leaseMs, this.config.maxAttempts]);
      return result.rows[0] ?? null;
    });
  }
  async fence(c: PoolClient, job: CampaignJob) {
    const found = await c.query(`SELECT id FROM creator_hiring_campaign_job WHERE id=$1 AND generation=$2 AND claim_token=$3 AND status='processing' AND lease_until>clock_timestamp()`, [job.id, job.generation, job.claim_token]);
    if (!found.rows.length) throw new ConflictException("자동 작업 임대가 종료되었어요.");
  }
  async execute(job: CampaignJob) {
    this.requireEnabled();
    return this.store.tx(async (c) => {
      await this.ready(c);
      await this.store.active(c, job.recruiter_id);
      const post = await this.store.post(c, job.post_id);
      await this.reconcile(c, job.post_id);
      await this.fence(c, job); this.store.owner(post, job.recruiter_id);
      const receipt = (await c.query<{ result: { round: number; sent: number } }>(`SELECT result FROM creator_hiring_campaign_round WHERE job_id=$1 AND generation=$2 AND round=$3`, [job.id, job.generation, job.next_round])).rows[0];
      if (receipt) return receipt.result;
      const current = (await c.query<{ round: number }>(`SELECT round FROM creator_hiring_campaign WHERE slot_id=$1`, [job.slot_id])).rows[0];
      // A manual dispatch may have completed this exact round while the job waited.
      if (!current) throw new ConflictException("초대 캠페인이 종료되었어요.");
      const result = current.round > job.next_round ? { round: current.round, sent: 0 } : await this.campaigns.dispatchRound(c, post, job.recruiter_id, job.slot_id, () => this.fence(c, job));
      await this.fence(c, job);
      await c.query(`INSERT INTO creator_hiring_campaign_round(job_id,generation,round,result) VALUES ($1,$2,$3,$4)`, [job.id, job.generation, job.next_round, JSON.stringify(result)]);
      return result;
    });
  }
  async acknowledge(job: CampaignJob) {
    return this.store.tx(async (c) => {
      await this.ready(c); await this.store.post(c, job.post_id); await this.reconcile(c, job.post_id); await this.fence(c, job);
      await c.query(`UPDATE creator_hiring_campaign_job j SET next_round=c.round,status=CASE WHEN c.round>=2 THEN 'completed' ELSE 'queued' END,
        terminal_reason=CASE WHEN c.round>=2 THEN 'rounds-completed' ELSE NULL END,next_execution_at=COALESCE(c.next_dispatch_at,clock_timestamp()),attempts=0,lease_until=NULL,claim_token=NULL,updated_at=clock_timestamp()
        FROM creator_hiring_campaign c WHERE j.id=$1 AND c.slot_id=j.slot_id AND EXISTS(SELECT 1 FROM creator_hiring_campaign_round r WHERE r.job_id=j.id AND r.generation=j.generation AND r.round=j.next_round)`, [job.id]);
    });
  }
  async fail(job: CampaignJob) {
    return this.store.tx(async (c) => {
      await this.ready(c); await this.store.post(c, job.post_id); await this.reconcile(c, job.post_id);
      await c.query(`UPDATE creator_hiring_campaign_job SET status=CASE WHEN attempts>=$4 THEN 'failed' ELSE 'queued' END,
        terminal_reason=CASE WHEN attempts>=$4 THEN 'attempts-exhausted' ELSE 'retry-pending' END,next_execution_at=clock_timestamp()+$5*interval '1 millisecond',
        lease_until=NULL,claim_token=NULL,updated_at=clock_timestamp() WHERE id=$1 AND generation=$2 AND claim_token=$3 AND status='processing' AND lease_until>clock_timestamp()`,
      [job.id, job.generation, job.claim_token, this.config.maxAttempts, automationBackoffMs(job.attempts)]);
    });
  }
}
