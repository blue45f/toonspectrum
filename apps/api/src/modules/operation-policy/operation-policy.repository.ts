import { createHash } from "node:crypto";
import { ConflictException, ForbiddenException, Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import type { Pool, PoolClient } from "pg";
import {
  operationTransitionBlockers, resolveOperationPolicy,
  type OperationPolicyRecord, type OperationPolicyPreview, type OperationPolicyAdminView,
} from "@toonspectrum/contracts/operation-policy";
import { OperationPolicyDraftSchema, type OperationPolicyProposal, type OperationPolicyApply } from "./operation-policy.dto";

export const OPERATION_POLICY_POOL = Symbol("OPERATION_POLICY_POOL");
export function policyDigest(value: unknown): string {
  const stable = (item: unknown): unknown => Array.isArray(item) ? item.map(stable) : item !== null && typeof item === "object"
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, stable(entry)])) : item;
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}
export function runtimeLicenseFingerprint(): string | null {
  const value = process.env.TOONSTUDIO_LICENSE_FINGERPRINT?.trim();
  return value && /^sha256:[a-f0-9]{64}$/u.test(value) ? value : null;
}
export async function loadOperationPolicy(client: PoolClient, lock: "read" | "share" | "update" = "read"): Promise<OperationPolicyRecord> {
  const suffix = lock === "update" ? " FOR UPDATE" : lock === "share" ? " FOR SHARE" : "";
  const row = (await client.query<{ revision: number; payload: unknown; updated_at: Date }>(
    `SELECT revision,payload,updated_at FROM production_operation_policy WHERE id=1${suffix}`)).rows[0];
  const parsed = OperationPolicyDraftSchema.safeParse(row?.payload);
  if (!row || !parsed.success) throw new ServiceUnavailableException("운영 정책이 준비되지 않았습니다. 관리자에게 문의해주세요.");
  return { revision: row.revision, draft: parsed.data, updatedAt: row.updated_at.toISOString() };
}
/** In the same transaction as the quota-consuming command, preventing a mode-change race. */
export async function workspaceAdmissionPolicy(client: PoolClient) {
  const record = await loadOperationPolicy(client, "share");
  const effective = resolveOperationPolicy(record, runtimeLicenseFingerprint(), new Date());
  if (!effective.features["team-workspace"].enabled) throw new ForbiddenException({ code: "operation_policy_restricted",
    message: effective.features["team-workspace"].reason, revision: record.revision });
  return effective;
}
function preview(record: OperationPolicyRecord, input: OperationPolicyProposal): OperationPolicyPreview {
  if (record.revision !== input.expectedRevision) throw new ConflictException({ code: "operation_policy_conflict", currentRevision: record.revision,
    message: "다른 관리자가 설정을 변경했습니다. 최신 내용을 다시 확인해주세요." });
  const fingerprint = runtimeLicenseFingerprint();
  const changes: string[] = [];
  if (record.draft.mode !== input.draft.mode) changes.push(`운영 모드: ${record.draft.mode} → ${input.draft.mode}`);
  for (const mode of ["free", "paid"] as const) {
    if (policyDigest(record.draft.profiles[mode]) !== policyDigest(input.draft.profiles[mode])) changes.push(`${mode} 기능·이용 한도·안내 변경`);
  }
  if (policyDigest(record.draft.releaseReview) !== policyDigest(input.draft.releaseReview)) changes.push("배포물 라이선스 검토 근거 변경");
  if (policyDigest(record.draft.featureReviews) !== policyDigest(input.draft.featureReviews)) changes.push("기능별 라이선스 검토 근거 변경");
  changes.push("기존 회원·작품·파일은 보존됩니다. 결제·자동 가입·정기 청구는 활성화되지 않습니다.");
  return { expectedRevision: record.revision,
    digest: policyDigest({ revision: record.revision, draft: input.draft, fingerprint }),
    blockedReasons: operationTransitionBlockers(input.draft, fingerprint, new Date()),
    effective: resolveOperationPolicy({ ...record, draft: input.draft }, fingerprint, new Date()), changes };
}
@Injectable()
export class OperationPolicyRepository {
  constructor(@Inject(OPERATION_POLICY_POOL) private readonly pool: Pool) {}
  private async transaction<T>(action: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try { await client.query("BEGIN"); const result = await action(client); await client.query("COMMIT"); return result; }
    catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
  private async requireAdmin(client: PoolClient, actor: string): Promise<void> {
    const row = (await client.query<{ role: string }>(`SELECT role FROM "user" WHERE id=$1 AND status='active' FOR SHARE`, [actor])).rows[0];
    if (row?.role !== "admin") throw new ForbiddenException("운영 모드는 서비스 관리자만 관리할 수 있습니다.");
  }
  async publicPolicy(actor: string) {
    return this.transaction(async (client) => {
      const user = await client.query(`SELECT id FROM "user" WHERE id=$1 AND status='active'`, [actor]);
      if (!user.rowCount) throw new ForbiddenException("로그인이 필요합니다.");
      return resolveOperationPolicy(await loadOperationPolicy(client), runtimeLicenseFingerprint(), new Date());
    });
  }
  async read(actor: string): Promise<OperationPolicyAdminView> {
    return this.transaction(async (client) => {
      await this.requireAdmin(client, actor);
      const policy = await loadOperationPolicy(client);
      const audit = await client.query<{ revision: number; actorUserId: string; reason: string; occurredAt: string }>(
        `SELECT revision,actor_user_id "actorUserId",reason,
        to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') "occurredAt"
        FROM production_operation_policy_audit ORDER BY revision DESC LIMIT 30`);
      const runtimeFingerprint = runtimeLicenseFingerprint();
      return { policy, effective: resolveOperationPolicy(policy, runtimeFingerprint, new Date()), runtimeFingerprint, audit: audit.rows };
    });
  }
  async preview(actor: string, input: OperationPolicyProposal): Promise<OperationPolicyPreview> {
    return this.transaction(async (client) => { await this.requireAdmin(client, actor); return preview(await loadOperationPolicy(client), input); });
  }
  async apply(actor: string, input: OperationPolicyApply): Promise<{ acceptedRevision: number }> {
    return this.transaction(async (client) => {
      await this.requireAdmin(client, actor);
      const record = await loadOperationPolicy(client, "update");
      const previous = (await client.query<{ request_digest: string; accepted_revision: number }>(
        "SELECT request_digest,accepted_revision FROM production_operation_policy_receipt WHERE actor_user_id=$1 AND mutation_id=$2",
        [actor, input.mutationId])).rows[0];
      if (previous) {
        if (previous.request_digest !== policyDigest(input)) throw new ConflictException("같은 요청 ID의 내용이 다릅니다.");
        return { acceptedRevision: previous.accepted_revision };
      }
      const impact = preview(record, input);
      if (impact.blockedReasons.length) throw new ConflictException({ code: "license_review_required", message: impact.blockedReasons.join(" ") });
      if (impact.digest !== input.previewDigest) throw new ConflictException("변경 내용을 다시 미리 확인해주세요.");
      const revision = record.revision + 1;
      await client.query("UPDATE production_operation_policy SET revision=$1,payload=$2::jsonb,updated_at=now() WHERE id=1", [revision, JSON.stringify(input.draft)]);
      await client.query(`INSERT INTO production_operation_policy_audit(revision,actor_user_id,reason,before_digest,after_digest)
        VALUES($1,$2,$3,$4,$5)`, [revision, actor, input.reason, policyDigest(record.draft), policyDigest(input.draft)]);
      await client.query(`INSERT INTO production_operation_policy_receipt(actor_user_id,mutation_id,request_digest,accepted_revision)
        VALUES($1,$2,$3,$4)`, [actor, input.mutationId, policyDigest(input), revision]);
      return { acceptedRevision: revision };
    });
  }
}
