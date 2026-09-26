import { studioHandoffEnvelopeCreateSchema, studioHandoffEnvelopeAcceptSchema, studioHandoffEnvelopeActionSchema, studioHandoffEnvelopeSchema, studioHandoffEnvelopeViewSchema,
  studioHandoffEnvelopePrepareSchema, studioReviewRoleAssignmentCoversTask,
  type StudioHandoffEnvelopeCreate, type StudioHandoffEnvelopeView, type StudioHandoffEnvelopeAction,
  type StudioHandoffEnvelopeList } from "@toonspectrum/studio-project-model";
import { z } from "zod";
import type { PoolClient } from "pg";
import { dbPool } from "../../platform/database";
import { resolveCreatorCollaborationAccess } from "./creator-collaboration.policy";
import { type StudioProductionWorkspaceDocument } from "./studio-production.dto";
import { StudioReviewTaskCompletionError, inspectStudioReviewTaskCompletion } from "./studio-review-task-completion.repository";
import { studioReviewTaskCompletionFingerprint as hash } from "./studio-review-task-completion-invalidation";
import { studioHandoffRoleBasis } from "./studio-handoff-envelope-basis";

export class StudioHandoffEnvelopeError extends Error {
  constructor(readonly code: "unavailable" | "forbidden" | "changed" | "conflict" | "idempotency" | "not-opened") { super(code); }
}
const fail = (code: StudioHandoffEnvelopeError["code"]): never => { throw new StudioHandoffEnvelopeError(code); };
const storedSchema = z.object({
  contract: z.literal("studio-handoff-envelope-v1"), envelope: studioHandoffEnvelopeSchema,
  envelopeDigest: z.string().regex(/^[a-f0-9]{64}$/u), recipientBindingDigest: z.string().regex(/^[a-f0-9]{64}$/u),
  completionFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
}).strict();
type StoredEnvelope = z.infer<typeof storedSchema>;
function parseStored(raw: unknown): StoredEnvelope {
  const result = storedSchema.safeParse(raw);
  if (!result.success || hash(result.data.envelope) !== result.data.envelopeDigest
    || hash(result.data.envelope.completion) !== result.data.completionFingerprint) return fail("unavailable");
  return result.data;
}
const actionSchema = z.object({ contract: z.literal("studio-handoff-envelope-action-v1"), workId: z.string(), envelopeId: z.string(),
  phase: z.enum(["open", "accept", "cancel"]), envelopeDigest: z.string().regex(/^[a-f0-9]{64}$/u),
  evidence: studioHandoffEnvelopeViewSchema.shape.opened.unwrap(),
}).strict();
const nowSql = `to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
async function now(client: PoolClient): Promise<string> { return (await client.query<{ at: string }>(`SELECT ${nowSql} AS at`)).rows[0]!.at; }
async function access(client: PoolClient, actor: string, workId: string) {
  const work = (await client.query<{ userId: string }>('SELECT "userId" FROM creator_work WHERE id=$1 FOR UPDATE', [workId])).rows[0];
  const user = (await client.query<{ status: string }>('SELECT status FROM "user" WHERE id=$1 FOR SHARE', [actor])).rows[0];
  if (!work || user?.status !== "active") return fail("forbidden");
  const member = (await client.query<{ userId: string; role: string; status: string }>('SELECT "userId",role,status FROM creator_work_collaborator WHERE "workId"=$1 AND "userId"=$2 FOR SHARE', [workId, actor])).rows[0];
  const result = resolveCreatorCollaborationAccess({ actorUserId: actor, ownerUserId: work.userId, membership: member ?? null });
  if (!result.view) return fail("forbidden");
  return { ...result, ownerUserId: work.userId };
}
async function recipientBinding(client: PoolClient, document: StudioProductionWorkspaceDocument, workId: string, ownerId: string, roleId: string, userId: string) {
  const role = document.roleAssignments.find((candidate) => candidate.id === roleId);
  if (!role || role.memberId !== userId) return null;
  const user = (await client.query<{ status: string; name: string | null }>('SELECT status,name FROM "user" WHERE id=$1 FOR SHARE', [userId])).rows[0];
  if (user?.status !== "active") return null;
  const member = (await client.query<{ userId: string; role: string; status: string; invitationId: string }>(
    'SELECT "userId",role,status,"invitationId" FROM creator_work_collaborator WHERE "workId"=$1 AND "userId"=$2 FOR SHARE', [workId, userId])).rows[0];
  if (!resolveCreatorCollaborationAccess({ actorUserId: userId, ownerUserId: ownerId, membership: member ?? null }).view) return null;
  // Target-specific DB sequence survives revoke/regrant and role A/B/A. Other members do not change it.
  const sequence = (await client.query<{ sequence: string }>('SELECT COALESCE(MAX(sequence),0)::text AS sequence FROM creator_work_collaboration_event WHERE "workId"=$1 AND "targetUserId"=$2', [workId, userId])).rows[0]!.sequence;
  return { digest: hash({ userId, owner: ownerId === userId, invitationId: ownerId === userId ? null : member?.invitationId,
    sequence, role: studioHandoffRoleBasis(document, roleId) }), displayName: user.name?.trim() && user.name.trim() !== userId ? user.name.trim() : "이름 확인이 필요한 담당자" };
}
async function load(client: PoolClient, workId: string, id: string): Promise<StoredEnvelope> {
  const rows = (await client.query<{ response: StoredEnvelope }>(`SELECT receipt.response FROM studio_mutation_receipt receipt JOIN studio_artifact artifact ON artifact.id=receipt."artifactId" JOIN studio_project_graph project ON project.id=artifact."projectId"
    WHERE project."workId"=$1 AND response->>'contract'='studio-handoff-envelope-v1' AND response->'envelope'->>'workId'=$1 AND response->'envelope'->>'id'=$2`, [workId, id])).rows;
  if (rows.length !== 1) return fail("unavailable");
  return parseStored(rows[0]!.response);
}
async function actionRecords(client: PoolClient, workId: string, id: string) {
  return (await client.query<{ response: { contract: string; phase: "open" | "accept" | "cancel"; evidence: NonNullable<StudioHandoffEnvelopeView["opened"]>; envelopeDigest: string } }>(
    `SELECT receipt.response FROM studio_mutation_receipt receipt JOIN studio_artifact artifact ON artifact.id=receipt."artifactId" JOIN studio_project_graph project ON project.id=artifact."projectId" WHERE project."workId"=$1 AND response->>'contract'='studio-handoff-envelope-action-v1'
      AND response->>'workId'=$1 AND response->>'envelopeId'=$2 ORDER BY receipt."createdAt"`, [workId, id])).rows.map((row) => actionSchema.parse(row.response));
}
async function view(client: PoolClient, actor: string, stored: StoredEnvelope, authority: Awaited<ReturnType<typeof access>>): Promise<StudioHandoffEnvelopeView> {
  const envelope = stored.envelope;
  if (![envelope.senderUserId, envelope.recipient.userId].includes(actor)) return fail("forbidden");
  const actions = (await actionRecords(client, envelope.workId, envelope.id)).filter((record) => record.envelopeDigest === stored.envelopeDigest);
  const opened = actions.find((item) => item.phase === "open" && item.evidence.actorUserId === envelope.recipient.userId)?.evidence ?? null;
  const accepted = actions.find((item) => item.phase === "accept" && item.evidence.actorUserId === envelope.recipient.userId)?.evidence ?? null;
  const cancelled = actions.find((item) => item.phase === "cancel" && item.evidence.actorUserId === envelope.senderUserId)?.evidence ?? null;
  let current = false;
  try {
    const { context, document } = await inspectStudioReviewTaskCompletion(client, actor, envelope.workId, envelope.taskId, "view");
    const binding = await recipientBinding(client, document, envelope.workId, authority.ownerUserId, envelope.recipient.roleAssignmentId, envelope.recipient.userId);
    const invalidated = (await client.query(`SELECT 1 FROM studio_mutation_receipt WHERE "artifactId"=$3 AND response->>'contract'='studio-handoff-envelope-invalidated-v1'
      AND response->>'workId'=$1 AND response->>'envelopeId'=$2 LIMIT 1`, [envelope.workId, envelope.id, envelope.completion.replacement.artifactId])).rows.length > 0;
    current = !invalidated && binding?.digest === stored.recipientBindingDigest && context.evidence?.current === true
      && hash(context.evidence.receipt) === stored.completionFingerprint;
  } catch (error) {
    if (!(error instanceof StudioReviewTaskCompletionError)) throw error;
    if (error.code === "forbidden") return fail("forbidden");
    // A removed/reopened task remains readable as historical evidence, never acceptable.
  }
  return studioHandoffEnvelopeViewSchema.parse({ envelope, envelopeDigest: stored.envelopeDigest,
    status: cancelled ? "cancelled" : !current ? "changed" : accepted ? "accepted" : opened ? "read" : "delivered",
    opened, accepted, cancelled, canAccept: actor === envelope.recipient.userId && current && !cancelled && !accepted && opened !== null,
    canCancel: actor === envelope.senderUserId && authority.edit && !cancelled });
}

export class StudioHandoffEnvelopeRepository {
  private async transaction<T>(operation: (client: PoolClient) => Promise<T>) {
    const client = await dbPool.connect();
    try { await client.query("BEGIN"); const result = await operation(client); await client.query("COMMIT"); return result; }
    catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }
  prepare(actor: string, workId: string, taskId: string) {
    return this.transaction(async (client) => {
      const authority = await access(client, actor, workId); if (!authority.edit) return fail("forbidden");
      const { context, document } = await inspectStudioReviewTaskCompletion(client, actor, workId, taskId);
      if (!context.evidence?.current) return fail("changed");
      const handoff = document.handoffs.find((item) => item.id === context.reference.handoffId)!;
      const task = document.tasks.find((item) => item.id === taskId)!;
      const recipients = [];
      for (const role of document.roleAssignments) {
        if (!role.memberId || role.memberId === actor || !role.roles.includes(handoff.toRole)
          || !studioReviewRoleAssignmentCoversTask(task.hierarchyNodeId, role.hierarchyNodeId, document.hierarchy)) continue;
        const binding = await recipientBinding(client, document, workId, authority.ownerUserId, role.id, role.memberId);
        if (binding) recipients.push({ userId: role.memberId, roleAssignmentId: role.id, displayName: binding.displayName, roleLabel: role.displayName, bindingDigest: binding.digest });
      }
      return studioHandoffEnvelopePrepareSchema.parse({ workId, taskId, taskTitle: context.taskTitle, baseRevision: context.baseRevision,
        completionFingerprint: hash(context.evidence.receipt), recipients });
    });
  }
  create(actor: string, workId: string, raw: StudioHandoffEnvelopeCreate) {
    const input = studioHandoffEnvelopeCreateSchema.parse(raw);
    return this.transaction(async (client) => {
      const authority = await access(client, actor, workId); if (!authority.edit) return fail("forbidden");
      const existing = (await client.query<{ requestHash: string }>(`SELECT receipt."requestHash" FROM studio_mutation_receipt receipt JOIN studio_artifact artifact ON artifact.id=receipt."artifactId" JOIN studio_project_graph project ON project.id=artifact."projectId"
        WHERE project."workId"=$1 AND response->>'contract'='studio-handoff-envelope-v1' AND response->'envelope'->>'workId'=$1 AND response->'envelope'->>'id'=$2`, [workId, input.envelopeId])).rows;
      if (existing.length) {
        const stored = await load(client, workId, input.envelopeId);
        if (stored.envelope.senderUserId !== actor || existing.length !== 1 || existing[0]!.requestHash !== hash(input)) return fail("idempotency");
        return view(client, actor, stored, authority);
      }
      const { context, document } = await inspectStudioReviewTaskCompletion(client, actor, workId, input.taskId);
      if (!context.evidence?.current || hash(context.evidence.receipt) !== input.completionFingerprint || context.baseRevision !== input.baseRevision) return fail("conflict");
      const handoff = document.handoffs.find((item) => item.id === context.reference.handoffId)!;
      const role = document.roleAssignments.find((item) => item.id === input.recipient.roleAssignmentId);
      const task = document.tasks.find((item) => item.id === input.taskId)!;
      const binding = await recipientBinding(client, document, workId, authority.ownerUserId, input.recipient.roleAssignmentId, input.recipient.userId);
      if (input.recipient.userId === actor || !role?.roles.includes(handoff.toRole)
        || !studioReviewRoleAssignmentCoversTask(task.hierarchyNodeId, role.hierarchyNodeId, document.hierarchy)
        || !binding || binding.digest !== input.recipientBindingDigest) return fail("changed");
      const issues = await client.query(`SELECT comment.id AS "commentId",review.id AS "reviewId",review."revisionId",comment.body,comment.severity,comment.status,
        to_char(comment."updatedAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "updatedAt"
        FROM studio_review_comment comment JOIN studio_review review ON review.id=comment."reviewId"
        WHERE (review.id=$1 AND review."revisionId"=$2 OR review.id=$3 AND review."revisionId"=$4) AND review."artifactId"=$5
          AND comment.status IN ('open','reopened') AND comment.anchor->>'artifactId'=$5 AND comment.anchor->>'revisionId'=review."revisionId"
        ORDER BY review.id,comment.id FOR SHARE OF review,comment`,
      [context.reference.subject.reviewId, context.reference.subject.revisionId, context.replacement.reviewId, context.replacement.revisionId, context.reference.subject.artifactId]);
      const envelope = studioHandoffEnvelopeSchema.parse({ contract: "studio-handoff-envelope-v1", id: input.envelopeId, workId, taskId: input.taskId,
        taskTitle: context.taskTitle, senderUserId: actor, recipient: input.recipient, createdAt: await now(client), completion: context.evidence.receipt,
        brief: { id: handoff.id, fromRole: handoff.fromRole, toRole: handoff.toRole, scenePurpose: handoff.scenePurpose, emotionalBeat: handoff.emotionalBeat,
          mustShow: handoff.mustShow, continuityNotes: handoff.continuityNotes, lockedFields: handoff.lockedFields, acceptanceCriteria: handoff.acceptanceCriteria },
        remainingIssues: issues.rows, usageConditions: input.usageConditions, remainingNotes: input.remainingNotes });
      const stored: StoredEnvelope = { contract: "studio-handoff-envelope-v1", envelope, envelopeDigest: hash(envelope),
        recipientBindingDigest: binding.digest, completionFingerprint: input.completionFingerprint };
      await this.append(client, actor, stored, "create", input.envelopeId, hash(input), stored);
      return view(client, actor, stored, authority);
    });
  }
  private async append(client: PoolClient, actor: string, stored: StoredEnvelope, phase: string, requestId: string, requestHash: string, response: unknown) {
    const key = hash({ contract: "studio-handoff-envelope-v1", workId: stored.envelope.workId, envelopeId: stored.envelope.id, actor, phase, requestId });
    await client.query(`INSERT INTO studio_mutation_receipt ("artifactId","actorUserId","idempotencyKeyHash","requestHash","resultRevisionId",response)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb)`, [stored.envelope.completion.replacement.artifactId, actor, key, requestHash, stored.envelope.completion.replacement.revisionId, JSON.stringify(response)]);
  }
  read(actor: string, workId: string, id: string) {
    return this.transaction(async (client) => { const authority = await access(client, actor, workId); return view(client, actor, await load(client, workId, id), authority); });
  }
  act(actor: string, workId: string, id: string, phase: "open" | "accept" | "cancel", raw: StudioHandoffEnvelopeAction & { confirmed?: true }) {
    const input = phase === "accept" ? studioHandoffEnvelopeAcceptSchema.parse(raw) : studioHandoffEnvelopeActionSchema.parse(raw);
    return this.transaction(async (client) => {
      const authority = await access(client, actor, workId), stored = await load(client, workId, id);
      const current = await view(client, actor, stored, authority), envelope = stored.envelope;
      if (input.envelopeDigest !== stored.envelopeDigest) return fail("conflict");
      if (phase === "cancel" ? actor !== envelope.senderUserId || !authority.edit : actor !== envelope.recipient.userId) return fail("forbidden");
      const prior = phase === "open" ? current.opened : phase === "accept" ? current.accepted : current.cancelled;
      if (prior) return current;
      if (phase === "accept" && !current.canAccept) return fail(current.opened ? "changed" : "not-opened");
      if (phase === "open" && current.status === "cancelled") return current;
      const record = { contract: "studio-handoff-envelope-action-v1", workId, envelopeId: id, envelopeDigest: stored.envelopeDigest, phase,
        evidence: { actorUserId: actor, requestId: input.requestId, at: await now(client) } };
      await this.append(client, actor, stored, phase, input.requestId, hash(input), record);
      return view(client, actor, stored, authority);
    });
  }
  list(actor: string, workId: string, cursor: string | null): Promise<StudioHandoffEnvelopeList> {
    return this.transaction(async (client) => {
      const authority = await access(client, actor, workId);
      const rows = (await client.query<{ response: StoredEnvelope }>(`SELECT receipt.response FROM studio_mutation_receipt receipt JOIN studio_artifact artifact ON artifact.id=receipt."artifactId" JOIN studio_project_graph project ON project.id=artifact."projectId"
        WHERE project."workId"=$1 AND response->>'contract'='studio-handoff-envelope-v1' AND response->'envelope'->>'workId'=$1
          AND (response->'envelope'->>'senderUserId'=$2 OR response->'envelope'->'recipient'->>'userId'=$2)
          AND ($3::text IS NULL OR response->'envelope'->>'id'>$3) ORDER BY response->'envelope'->>'id' LIMIT 26`, [workId, actor, cursor])).rows;
      const items = [];
      for (const row of rows.slice(0, 25)) { const result = await view(client, actor, parseStored(row.response), authority); items.push({ id: result.envelope.id, taskTitle: result.envelope.taskTitle,
        direction: result.envelope.senderUserId === actor ? "sent" as const : "received" as const, createdAt: result.envelope.createdAt, status: result.status }); }
      return { items, nextCursor: rows.length > 25 ? items.at(-1)!.id : null };
    });
  }
}
