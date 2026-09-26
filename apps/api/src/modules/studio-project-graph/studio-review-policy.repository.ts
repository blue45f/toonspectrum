import { Injectable } from "@nestjs/common";
import { canonicalJson, reviewPolicyCommandSchema, reviewPolicyHistoryQuerySchema, reviewPolicyHistoryResponseSchema, type ReviewPolicyHistoryQuery, type ReviewPolicyHistoryResponse, type ReviewPolicyCommand, type ReviewPolicyPin, type ReviewPolicyResponse } from "@toonspectrum/studio-project-model";
import type { PoolClient } from "pg";
import { dbPool } from "../../platform/database";
import { loadArtifactAccess, assertAccess } from "./studio-project-graph.repository";
import { policyCurrentAccess, policyCommandHash, readReviewPolicy, StudioReviewPolicyError } from "./studio-review-policy-store";

interface LockedReview extends ReviewPolicyPin { status: string }
@Injectable()
export class StudioReviewPolicyRepository {
  private async transaction<T>(actorId: string, reviewId: string, write: boolean,
    action: (client: PoolClient, review: LockedReview) => Promise<T>): Promise<T> {
    const client = await dbPool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<LockedReview>(
        `SELECT r.id AS "reviewId", r."artifactId", r."revisionId", v."rootGraphHash", r.status
         FROM studio_review r JOIN studio_revision v ON v.id=r."revisionId"
         WHERE r.id=$1 ${write ? "FOR UPDATE" : "FOR SHARE"} OF r`, [reviewId]);
      const review = result.rows[0]; if (!review) throw new StudioReviewPolicyError("not-found");
      const access = await loadArtifactAccess(client, actorId, review.artifactId);
      if (!access) throw new StudioReviewPolicyError("not-found"); assertAccess(access.access, "view");
      const value = await action(client, review); await client.query("COMMIT"); return value;
    } catch (error) {
      await client.query("ROLLBACK");
      if (error && typeof error === "object" && "code" in error && ["42P01", "42703", "42883"].includes(String(error.code))) throw new StudioReviewPolicyError("unavailable");
      if (error && typeof error === "object" && "code" in error && ["23505", "23514", "55000"].includes(String(error.code))) throw new StudioReviewPolicyError("conflict");
      throw error;
    } finally { client.release(); }
  }
  current(actorId: string, reviewId: string): Promise<ReviewPolicyResponse> {
    return this.transaction(actorId, reviewId, false, async (client) => {
      const access = await policyCurrentAccess(client, reviewId, actorId);
      return { ...access, policy: await readReviewPolicy(client, reviewId, access.eligibleReviewerIds) };
    });
  }
  async history(actorId: string, reviewId: string, raw: ReviewPolicyHistoryQuery = {}): Promise<ReviewPolicyHistoryResponse> {
    const query = reviewPolicyHistoryQuerySchema.parse(raw);
    return this.transaction(actorId, reviewId, false, async (client, review) => {
      await policyCurrentAccess(client, reviewId, actorId);
      const result = await client.query<{ id: string; policyVersion: number; stateVersion: number; actorId: string; createdAt: Date; payload: unknown }>(
        `SELECT id,"policyVersion","stateVersion","actorId","createdAt",payload FROM studio_review_policy_event
         WHERE "reviewId"=$1 AND ($2::integer IS NULL OR "stateVersion"<$2)
         ORDER BY "stateVersion" DESC LIMIT 26`, [reviewId, query.beforeStateVersion ?? null]);
      const entries = result.rows.slice(0, 25).map((row) => ({ id: row.id, policyVersion: row.policyVersion, stateVersion: row.stateVersion,
        actorId: row.actorId, createdAt: new Date(row.createdAt).toISOString(), command: row.payload }));
      return reviewPolicyHistoryResponseSchema.parse({ pin: { reviewId, artifactId: review.artifactId,
        revisionId: review.revisionId, rootGraphHash: review.rootGraphHash }, actorId, entries,
        nextBeforeStateVersion: result.rows.length > 25 ? entries.at(-1)!.stateVersion : null });
    });
  }
  command(actorId: string, reviewId: string, raw: ReviewPolicyCommand): Promise<ReviewPolicyResponse> {
    const input = reviewPolicyCommandSchema.parse(raw);
    return this.transaction(actorId, reviewId, true, async (client, review) => {
      const access = await policyCurrentAccess(client, reviewId, actorId);
      const pin: ReviewPolicyPin = { reviewId, artifactId: review.artifactId, revisionId: review.revisionId, rootGraphHash: review.rootGraphHash };
      if (canonicalJson(pin) !== canonicalJson(input.pin)) throw new StudioReviewPolicyError("conflict");
      const hash = policyCommandHash(input);
      const receipt = await client.query<{ reviewId: string; actorId: string; commandHash: string }>(
        `SELECT "reviewId", "actorId", "commandHash" FROM studio_review_policy_event WHERE id=$1`, [input.id]);
      if (receipt.rows[0]) {
        const previous = receipt.rows[0];
        if (previous.reviewId !== reviewId || previous.actorId !== actorId || previous.commandHash !== hash) throw new StudioReviewPolicyError("conflict");
        return { ...access, replayed: true, policy: await readReviewPolicy(client, reviewId, access.eligibleReviewerIds) };
      }
      if (!["open", "changes-requested"].includes(review.status)) throw new StudioReviewPolicyError("closed");
      const policy = await readReviewPolicy(client, reviewId, access.eligibleReviewerIds);
      if ((policy?.policyVersion ?? 0) !== input.expectedPolicyVersion || (policy?.stateVersion ?? 0) !== input.expectedStateVersion) throw new StudioReviewPolicyError("conflict");
      const count = await client.query<{ count: number }>(`SELECT count(*)::integer AS count FROM studio_review_policy_event WHERE "reviewId"=$1`, [reviewId]);
      if (Number(count.rows[0]?.count) >= 4096) throw new StudioReviewPolicyError("capacity");
      const stateVersion = (policy?.stateVersion ?? 0) + 1;
      const policyVersion = (policy?.policyVersion ?? 0) + (input.type === "configure" ? 1 : 0);
      if (input.type === "configure") {
        if (!access.canConfigure) throw new StudioReviewPolicyError("forbidden");
        if (input.definition.groups.some((group) => group.reviewerIds.some((id) => !access.eligibleReviewerIds.includes(id)))) throw new StudioReviewPolicyError("invalid");
        await client.query(
          `INSERT INTO studio_review_policy ("reviewId", "revisionId", "rootGraphHash", "policyVersion", "stateVersion", definition, "configuredBy")
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7) ON CONFLICT ("reviewId") DO UPDATE
           SET "policyVersion"=$4,"stateVersion"=$5,definition=$6::jsonb,"configuredBy"=$7,
               "configuredAt"=GREATEST(statement_timestamp(), studio_review_policy."configuredAt")`,
          [reviewId, review.revisionId, review.rootGraphHash, policyVersion, stateVersion, JSON.stringify(input.definition), actorId]);
      } else {
        if (!policy) throw new StudioReviewPolicyError("conflict");
        const group = policy.definition.groups.find((entry) => entry.id === input.groupId);
        const groupState = policy.groups.find((entry) => entry.id === input.groupId);
        if (!group || !group.reviewerIds.includes(actorId) || !access.eligibleReviewerIds.includes(actorId)) throw new StudioReviewPolicyError("forbidden");
        if (input.decision === "approve" && !groupState?.ready) throw new StudioReviewPolicyError("unsatisfied");
        await client.query(`UPDATE studio_review_policy SET "stateVersion"=$2 WHERE "reviewId"=$1`, [reviewId, stateVersion]);
      }
      await client.query(
        `INSERT INTO studio_review_policy_event (id,"reviewId","policyVersion","stateVersion",kind,"actorId","commandHash",payload,"accessEpoch")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,CASE WHEN $5='vote' THEN studio_review_policy_actor_epoch($2,$6) ELSE NULL END)`,
        [input.id, reviewId, policyVersion, stateVersion, input.type, actorId, hash, JSON.stringify(input)]);
      return { ...access, replayed: false, policy: await readReviewPolicy(client, reviewId, access.eligibleReviewerIds) };
    });
  }
}
