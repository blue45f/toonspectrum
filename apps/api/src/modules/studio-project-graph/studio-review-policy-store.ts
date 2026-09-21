import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { canonicalJson, evaluateReviewPolicy, reviewPolicyDefinitionSchema, reviewPolicyRecordSchema, type ReviewPolicyExpectation, type ReviewPolicyRecord, type ReviewPolicyVoteRecord } from "@toonspectrum/studio-project-model";
import { resolveCreatorCollaborationAccess } from "../creator/creator-collaboration.policy";

export class StudioReviewPolicyError extends Error {
  constructor(readonly code: "conflict" | "closed" | "forbidden" | "invalid" | "unsatisfied" | "unavailable" | "capacity" | "not-found") {
    super(`studio_review_policy_${code}`); this.name = "StudioReviewPolicyError";
  }
}
export const policyCommandHash = (value: unknown): string => createHash("sha256").update(canonicalJson(value)).digest("hex");
export async function policyCurrentAccess(client: PoolClient, reviewId: string, actorId: string) {
  const work = await client.query<{ workId: string; ownerId: string }>(
    `SELECT w.id AS "workId", w."userId" AS "ownerId" FROM studio_review r JOIN studio_artifact a ON a.id=r."artifactId"
     JOIN studio_project_graph p ON p.id=a."projectId" JOIN creator_work w ON w.id=p."workId"
     WHERE r.id=$1 FOR SHARE OF w`, [reviewId]);
  const owner = work.rows[0]; if (!owner) throw new StudioReviewPolicyError("not-found");
  const reviewers = await client.query<{ id: string }>(`SELECT "reviewerUserId" AS id FROM studio_review_reviewer WHERE "reviewId"=$1 ORDER BY "reviewerUserId"`, [reviewId]);
  if (reviewers.rows.length > 64) throw new StudioReviewPolicyError("capacity");
  const ids = [...new Set([actorId, ...reviewers.rows.map((row) => row.id)])].sort();
  const users = await client.query<{ id: string; status: string }>('SELECT id,status FROM "user" WHERE id=ANY($1::text[]) ORDER BY id FOR SHARE', [ids]);
  const activeUsers = new Set(users.rows.filter((user) => user.status === "active").map((user) => user.id));
  const members = await client.query<{ userId: string; role: string; status: string }>(
    `SELECT "userId",role,status FROM creator_work_collaborator WHERE "workId"=$1 AND "userId"=ANY($2::text[]) ORDER BY "userId" FOR SHARE`, [owner.workId, ids]);
  const access = (id: string) => resolveCreatorCollaborationAccess({ actorUserId: id, ownerUserId: owner.ownerId,
    membership: members.rows.find((member) => member.userId === id) ?? null });
  const actorAccess = access(actorId);
  if (!actorAccess.view || !activeUsers.has(actorId)) throw new StudioReviewPolicyError("forbidden");
  return { canConfigure: actorAccess.manageMembers, eligibleReviewerIds: reviewers.rows.filter((row) => activeUsers.has(row.id) && access(row.id).view).map((row) => row.id), actorId };
}
export async function readReviewPolicy(client: PoolClient, reviewId: string, activeIds: readonly string[]): Promise<ReviewPolicyRecord | null> {
  const result = await client.query<{ reviewId: string; artifactId: string; revisionId: string; rootGraphHash: string; policyVersion: number; stateVersion: number; definition: unknown; configuredBy: string; configuredAt: Date }>(
    `SELECT p.*, r."artifactId" FROM studio_review_policy p JOIN studio_review r ON r.id=p."reviewId" WHERE p."reviewId"=$1`, [reviewId]);
  const policy = result.rows[0]; if (!policy) return null;
  const definition = reviewPolicyDefinitionSchema.parse(policy.definition);
  const events = await client.query<{ actorId: string; stateVersion: number; accessCurrent: boolean; payload: { groupId: string; decision: "approve" | "request-changes"; note: string }; createdAt: Date }>(
    `SELECT DISTINCT ON (payload->>'groupId', "actorId") "actorId", "stateVersion", payload, "createdAt",
       COALESCE("accessEpoch"=studio_review_policy_actor_epoch($1,"actorId"),false) AS "accessCurrent"
     FROM studio_review_policy_event WHERE "reviewId"=$1 AND "policyVersion"=$2 AND kind='vote'
     ORDER BY payload->>'groupId', "actorId", "stateVersion" DESC`, [reviewId, policy.policyVersion]);
  const votes: ReviewPolicyVoteRecord[] = events.rows.map((event) => ({ groupId: event.payload.groupId, actorId: event.actorId,
    decision: event.payload.decision, accessCurrent: event.accessCurrent, note: event.payload.note, stateVersion: event.stateVersion, decidedAt: new Date(event.createdAt).toISOString() }));
  return reviewPolicyRecordSchema.parse({ pin: { reviewId, artifactId: policy.artifactId, revisionId: policy.revisionId, rootGraphHash: policy.rootGraphHash },
    definition, policyVersion: policy.policyVersion, stateVersion: policy.stateVersion, configuredBy: policy.configuredBy,
    configuredAt: new Date(policy.configuredAt).toISOString(), votes, ...evaluateReviewPolicy(definition, votes, activeIds) });
}
/** Called inside the same existing review lock/transaction as the terminal approval. */
export async function assertReviewPolicyApproval(client: PoolClient, reviewId: string, actorId: string, expected?: ReviewPolicyExpectation): Promise<void> {
  const presence = await client.query<{ reviewId: string }>(`SELECT "reviewId" FROM studio_review_policy WHERE "reviewId"=$1`, [reviewId]).catch((error: unknown) => {
    if (error && typeof error === "object" && "code" in error && error.code === "42P01") throw new StudioReviewPolicyError("unavailable");
    throw error;
  });
  if (!presence.rows.length) { if (expected) throw new StudioReviewPolicyError("conflict"); return; }
  const access = await policyCurrentAccess(client, reviewId, actorId);
  const policy = await readReviewPolicy(client, reviewId, access.eligibleReviewerIds);
  if (!policy || !expected || canonicalJson(policy.pin) !== canonicalJson({ reviewId: expected.reviewId, artifactId: expected.artifactId,
    revisionId: expected.revisionId, rootGraphHash: expected.rootGraphHash }) || expected.policyVersion !== policy.policyVersion || expected.stateVersion !== policy.stateVersion) {
    throw new StudioReviewPolicyError("conflict");
  }
  if (!access.canConfigure && !access.eligibleReviewerIds.includes(actorId)) throw new StudioReviewPolicyError("forbidden");
  if (!policy.satisfied) throw new StudioReviewPolicyError("unsatisfied");
}
