import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { z } from "zod";
import type { PoolClient } from "pg";
import { canonicalJson } from "@toonspectrum/studio-project-model";
import { STUDIO_WORK_SESSION_ARTIFACT_PREFIX, createStudioWorkSession, reduceStudioWorkSession, studioWorkSessionCreateSchema, studioWorkSessionCommandSchema, studioWorkSessionReceiptSchema, type StudioWorkSession, type StudioWorkSessionActor, type StudioWorkSessionCreate, type StudioWorkSessionCommand, type StudioWorkSessionView, type StudioWorkSessionReceipt, type StudioWorkSessionResult } from "@toonspectrum/studio-project-model/work-session";
import { dbPool } from "../../db";
import { resolveCreatorCollaborationAccess } from "../creator/creator-collaboration.policy";
import { studioRequestHash as hash } from "./studio-project-graph.repository";

const DEVICE = "studio-work-session-authority-v1";
const EVENT = "studio-work-session-event-v1";
const artifactFor = (workId: string, sessionId: string) => `${STUDIO_WORK_SESSION_ARTIFACT_PREFIX}${hash({ workId, sessionId })}`;
const keyFor = (workId: string, sessionId: string, actor: string, operationId: string) => hash({ contract: EVENT, workId, sessionId, actor, operationId });
export class StudioWorkSessionRepositoryError extends Error {
  constructor(readonly code: "forbidden" | "unavailable" | "not-found" | "idempotency" | "invalid-target" | "capacity") { super(code); }
}
const fail = (code: StudioWorkSessionRepositoryError["code"]): never => { throw new StudioWorkSessionRepositoryError(code); };
const eventBase = { contract: z.literal(EVENT), workId: z.string(), sessionId: z.string(), at: z.iso.datetime({ offset: true }),
  actor: z.object({ userId: z.string(), canEdit: z.boolean(), canComment: z.boolean() }).strict(), idempotencyKeyHash: z.string().regex(/^[a-f0-9]{64}$/u) };
const eventSchema = z.discriminatedUnion("type", [
  z.object({ ...eventBase, type: z.literal("create"), input: studioWorkSessionCreateSchema }).strict(),
  z.object({ ...eventBase, type: z.literal("command"), input: studioWorkSessionCommandSchema }).strict(),
]);
type Event = z.infer<typeof eventSchema>;
async function transaction<T>(action: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await dbPool.connect();
  try { await client.query("BEGIN"); const result = await action(client); await client.query("COMMIT"); return result; }
  catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
async function access(client: PoolClient, actor: string, workId: string, write = false) {
  const work = (await client.query<{ userId: string }>(`SELECT "userId" FROM creator_work WHERE id=$1 FOR ${write ? "UPDATE" : "SHARE"}`, [workId])).rows[0];
  const user = (await client.query<{ status: string }>('SELECT status FROM "user" WHERE id=$1 FOR SHARE', [actor])).rows[0];
  if (!work || user?.status !== "active") return fail("forbidden");
  const membership = (await client.query<{ userId: string; role: string; status: string }>('SELECT "userId",role,status FROM creator_work_collaborator WHERE "workId"=$1 AND "userId"=$2 FOR SHARE', [workId, actor])).rows[0];
  const authority = resolveCreatorCollaborationAccess({ actorUserId: actor, ownerUserId: work.userId, membership });
  if (!authority.view) return fail("forbidden");
  return { actor: { userId: actor, canEdit: authority.edit, canComment: authority.comment }, ownerUserId: work.userId };
}
async function verifyPin(client: PoolClient, workId: string, pin: StudioWorkSession["input"]) {
  if (pin.workId !== workId) return fail("invalid-target");
  const found = await client.query(`SELECT review.id FROM studio_review review
    JOIN studio_artifact artifact ON artifact.id=review."artifactId"
    JOIN studio_project_graph project ON project.id=artifact."projectId"
    JOIN studio_revision revision ON revision.id=review."revisionId" AND revision."artifactId"=artifact.id
    WHERE project."workId"=$1 AND project.id=$2 AND artifact.id=$3 AND review.id=$4 AND revision.id=$5
      AND revision."rootGraphHash"=$6 AND revision.kind='review-snapshot' FOR SHARE OF review,artifact,project,revision`,
  [workId, pin.projectId, pin.artifactId, pin.reviewId, pin.revisionId, pin.rootGraphHash]);
  if (found.rows.length !== 1) return fail("invalid-target");
}
async function verifyInvitees(client: PoolClient, workId: string, owner: string, invitees: readonly string[]) {
  for (const userId of invitees) {
    const row = (await client.query<{ status: string; memberStatus: string | null }>(`SELECT u.status,member.status AS "memberStatus" FROM "user" u
      LEFT JOIN creator_work_collaborator member ON member."workId"=$1 AND member."userId"=u.id WHERE u.id=$2`, [workId, userId])).rows[0];
    if (row?.status !== "active" || (userId !== owner && row.memberStatus !== "active")) return fail("invalid-target");
  }
}
type Meta = { projectId: string; headRevisionId: string; kind: string; scope: unknown; workId: string };
type EventRow = { scope: unknown; sequence: string; commandType: string; deviceId: string; actorUserId: string | null; baseRevisionId: string;
  resultRevisionId: string; payloadHash: string; operation: unknown; issuedAt: Date; rootGraphHash: string; revisionKind: string;
  revisionDevice: string; createdBy: string | null; createdAt: Date; parentRevisionId: string; parentCount: string;
  operationFirst: string; operationLast: string; response: unknown; requestHash: string; receiptActor: string | null };
async function load(client: PoolClient, workId: string, sessionId: string): Promise<{ session: StudioWorkSession; meta: Meta; receipts: StudioWorkSessionReceipt[] }> {
  const artifactId = artifactFor(workId, sessionId);
  const meta = (await client.query<Meta>(`SELECT artifact."projectId",artifact."headRevisionId",artifact.kind,artifact.scope,project."workId"
    FROM studio_artifact artifact JOIN studio_project_graph project ON project.id=artifact."projectId" WHERE artifact.id=$1`, [artifactId])).rows[0];
  if (!meta) return fail("not-found");
  if (meta.workId !== workId || meta.kind !== "asset" || canonicalJson(meta.scope) !== canonicalJson({ projectId: meta.projectId })) return fail("unavailable");
  const rows = (await client.query<EventRow>(`SELECT operation.*, revision."rootGraphHash",revision.kind AS "revisionKind",revision."deviceId" AS "revisionDevice",
      revision."createdBy",revision."createdAt",revision."operationFirst",revision."operationLast",
      (SELECT "parentRevisionId" FROM studio_revision_parent WHERE "revisionId"=revision.id AND ordinal=0) AS "parentRevisionId",
      (SELECT COUNT(*)::text FROM studio_revision_parent WHERE "revisionId"=revision.id) AS "parentCount",
      receipt.response,receipt."requestHash",receipt."actorUserId" AS "receiptActor"
    FROM studio_operation operation JOIN studio_revision revision ON revision.id=operation."resultRevisionId" AND revision."artifactId"=operation."artifactId"
    LEFT JOIN studio_mutation_receipt receipt ON receipt."artifactId"=operation."artifactId" AND receipt."resultRevisionId"=operation."resultRevisionId"
      AND receipt."actorUserId"=operation."actorUserId" AND receipt."idempotencyKeyHash"=operation.operation->>'idempotencyKeyHash'
    WHERE operation."artifactId"=$1 ORDER BY operation.sequence ASC LIMIT 130`, [artifactId])).rows;
  if (!rows.length || rows.length > 129 || rows.at(-1)!.resultRevisionId !== meta.headRevisionId) return fail("unavailable");
  let state: StudioWorkSession | null = null, previousRevision: string | null = null;
  const receipts: StudioWorkSessionReceipt[] = [];
  for (const [index, row] of rows.entries()) {
    const event = eventSchema.parse(row.operation), receipt = studioWorkSessionReceiptSchema.parse(row.response);
    if (canonicalJson(row.scope) !== canonicalJson({ projectId: meta.projectId }) || Number(row.sequence) !== index + 1 || event.workId !== workId || event.sessionId !== sessionId || event.actor.userId !== row.actorUserId
      || row.receiptActor !== row.actorUserId || row.createdBy !== row.actorUserId || row.deviceId !== DEVICE || row.revisionDevice !== DEVICE || row.revisionKind !== "checkpoint"
      || row.commandType !== `studio.work-session.${event.type}` || event.at !== row.createdAt.toISOString() || event.at !== row.issuedAt.toISOString()
      || Number(row.operationFirst) !== index + 1 || Number(row.operationLast) !== index + 1 || row.parentCount !== "1" || row.parentRevisionId !== row.baseRevisionId
      || (previousRevision !== null && previousRevision !== row.baseRevisionId)
      || event.idempotencyKeyHash !== keyFor(workId, sessionId, event.actor.userId, event.input.operationId)
      || row.payloadHash !== hash(event.input) || row.requestHash !== hash({ workId, sessionId, input: event.input }) || receipt.requestHash !== row.requestHash
      || receipt.actorUserId !== event.actor.userId || receipt.operationId !== event.input.operationId || receipt.workId !== workId || receipt.sessionId !== sessionId
      || receipt.previousVersion !== index || receipt.resultVersion !== index + 1) return fail("unavailable");
    if (index === 0) {
      if (event.type !== "create" || event.input.id !== sessionId) return fail("unavailable");
      state = createStudioWorkSession(event.input, event.actor, event.at);
    } else {
      if (event.type !== "command" || !state) return fail("unavailable");
      state = reduceStudioWorkSession(state, event.input, event.actor, event.at);
    }
    if (state.workId !== workId || state.input.projectId !== meta.projectId || hash(state) !== row.rootGraphHash || hash(state) !== receipt.stateHash) return fail("unavailable");
    receipts.push(receipt); previousRevision = row.resultRevisionId;
  }
  if (!state) return fail("unavailable");
  return { session: state, meta, receipts };
}
function view(session: StudioWorkSession, actor: StudioWorkSessionActor): StudioWorkSessionView {
  if (session.createdBy !== actor.userId && !session.invitedUserIds.includes(actor.userId)) return fail("forbidden");
  return { session, capabilities: { edit: actor.canEdit && session.createdBy === actor.userId, comment: actor.canComment } };
}
async function verifyResult(client: PoolClient, actor: string, workId: string, result: StudioWorkSessionResult) {
  if (result.type === "review") return verifyPin(client, workId, result.subject);
  if (result.type === "task") {
    const found = await client.query(`SELECT item->>'id' AS id FROM creator_work_production_workspace workspace,
      LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(workspace.document->'tasks')='array' THEN workspace.document->'tasks' ELSE '[]'::jsonb END) item
      WHERE workspace."workId"=$1 AND item->>'id'=$2`, [workId, result.id]);
    if (found.rows.length !== 1) return fail("invalid-target");
    return;
  }
  const found = await client.query(`SELECT receipt."resultRevisionId" FROM studio_mutation_receipt receipt
    JOIN studio_artifact artifact ON artifact.id=receipt."artifactId" JOIN studio_project_graph project ON project.id=artifact."projectId"
    WHERE project."workId"=$1 AND receipt.response->>'contract'='studio-handoff-envelope-v1'
      AND receipt.response->'envelope'->>'workId'=$1 AND receipt.response->'envelope'->>'id'=$2
      AND (receipt.response->'envelope'->>'senderUserId'=$3 OR receipt.response->'envelope'->'recipient'->>'userId'=$3)`, [workId, result.id, actor]);
  if (found.rows.length !== 1) return fail("invalid-target");
}
async function append(client: PoolClient, session: StudioWorkSession, baseRevisionId: string, event: Event): Promise<StudioWorkSessionReceipt> {
  const artifactId = artifactFor(session.workId, session.id), revisionId = `work-session-revision-${randomUUID()}`;
  const receipt: StudioWorkSessionReceipt = { contract: "studio-work-session-receipt-v1", actorUserId: event.actor.userId,
    operationId: event.input.operationId, workId: session.workId, sessionId: session.id,
    previousVersion: session.version - 1, resultVersion: session.version, requestHash: hash({ workId: session.workId, sessionId: session.id, input: event.input }), stateHash: hash(session) };
  await client.query(`INSERT INTO studio_revision (id,"artifactId",kind,"rootGraphHash","operationFirst","operationLast","createdBy","deviceId","createdAt")
    VALUES ($1,$2,'checkpoint',$3,$4,$4,$5,$6,$7)`, [revisionId, artifactId, receipt.stateHash, session.version, event.actor.userId, DEVICE, event.at]);
  await client.query('INSERT INTO studio_revision_parent ("revisionId","parentRevisionId",ordinal) VALUES ($1,$2,0)', [revisionId, baseRevisionId]);
  await client.query(`INSERT INTO studio_operation ("artifactId",sequence,"commandId","baseRevisionId","resultRevisionId","actorUserId","deviceId","commandType",scope,"payloadHash",operation,"issuedAt")
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11::jsonb,$12)`, [artifactId, session.version, `work-session-command-${randomUUID()}`, baseRevisionId,
    revisionId, event.actor.userId, DEVICE, `studio.work-session.${event.type}`, JSON.stringify({ projectId: session.input.projectId }), hash(event.input), JSON.stringify(event), event.at]);
  await client.query(`INSERT INTO studio_mutation_receipt ("artifactId","actorUserId","idempotencyKeyHash","requestHash","resultRevisionId",response)
    VALUES ($1,$2,$3,$4,$5,$6::jsonb)`, [artifactId, event.actor.userId, event.idempotencyKeyHash,
    hash({ workId: session.workId, sessionId: session.id, input: event.input }), revisionId, JSON.stringify(receipt)]);
  await client.query('UPDATE studio_artifact SET "headRevisionId"=$2,"updatedAt"=now() WHERE id=$1', [artifactId, revisionId]);
  await client.query('UPDATE studio_project_graph SET "updatedAt"=now() WHERE id=$1', [session.input.projectId]);
  return receipt;
}
async function prior(client: PoolClient, actor: string, workId: string, sessionId: string, input: StudioWorkSessionCreate | StudioWorkSessionCommand) {
  const row = (await client.query<{ requestHash: string; response: unknown }>(`SELECT "requestHash",response FROM studio_mutation_receipt
    WHERE "artifactId"=$1 AND "actorUserId"=$2 AND "idempotencyKeyHash"=$3`, [artifactFor(workId, sessionId), actor, keyFor(workId, sessionId, actor, input.operationId)])).rows[0];
  if (!row) return null;
  if (row.requestHash !== hash({ workId, sessionId, input })) return fail("idempotency");
  const current = await load(client, workId, sessionId);
  const receipt = current.receipts.find((item) => item.actorUserId === actor && item.operationId === input.operationId);
  if (!receipt || canonicalJson(receipt) !== canonicalJson(row.response)) return fail("unavailable");
  return { current, receipt };
}

@Injectable()
export class StudioWorkSessionRepository {
  current(actorId: string, workId: string, sessionId: string) {
    return transaction(async (client) => {
      const { actor } = await access(client, actorId, workId);
      const { session } = await load(client, workId, sessionId);
      await verifyPin(client, workId, session.input);
      return view(session, actor);
    });
  }
  list(actorId: string, workId: string, cursor: string | null) {
    return transaction(async (client) => {
      const { actor } = await access(client, actorId, workId);
      const rows = (await client.query<{ sessionId: string }>(`SELECT operation.operation->>'sessionId' AS "sessionId"
        FROM studio_artifact artifact JOIN studio_project_graph project ON project.id=artifact."projectId"
        JOIN studio_operation operation ON operation."artifactId"=artifact.id AND operation.sequence=1
        WHERE project."workId"=$1 AND starts_with(artifact.id,$2) AND operation."commandType"='studio.work-session.create'
          AND (operation.operation->'actor'->>'userId'=$4 OR operation.operation->'input'->'invitedUserIds' @> $5::jsonb)
          AND ($3::text IS NULL OR operation.operation->>'sessionId'>$3)
        ORDER BY operation.operation->>'sessionId' ASC LIMIT 26`, [workId, STUDIO_WORK_SESSION_ARTIFACT_PREFIX, cursor, actorId, JSON.stringify([actorId])])).rows;
      const items: StudioWorkSessionView[] = [];
      for (const row of rows.slice(0, 25)) {
        const { session } = await load(client, workId, row.sessionId);
        await verifyPin(client, workId, session.input); items.push(view(session, actor));
      }
      return { items, nextCursor: rows.length > 25 ? rows[24]!.sessionId : null };
    });
  }
  receipt(actorId: string, workId: string, sessionId: string, operationId: string) {
    return transaction(async (client) => {
      const { actor } = await access(client, actorId, workId), { session, receipts } = await load(client, workId, sessionId);
      await verifyPin(client, workId, session.input);
      const receipt = receipts.find((item) => item.actorUserId === actorId && item.operationId === operationId) ?? null;
      return { view: view(session, actor), receipt };
    });
  }
  create(actorId: string, workId: string, raw: StudioWorkSessionCreate) {
    const input = studioWorkSessionCreateSchema.parse(raw);
    return transaction(async (client) => {
      const { actor, ownerUserId } = await access(client, actorId, workId, true);
      if (!actor.canEdit) return fail("forbidden");
      await verifyPin(client, workId, input.input);
      const previous = await prior(client, actorId, workId, input.id, input);
      if (previous) return { view: view(previous.current.session, actor), receipt: previous.receipt };
      await verifyInvitees(client, workId, ownerUserId, input.invitedUserIds);
      const artifactId = artifactFor(workId, input.id);
      if ((await client.query('SELECT id FROM studio_artifact WHERE id=$1', [artifactId])).rows.length) return fail("idempotency");
      const count = (await client.query<{ total: string }>(`SELECT COUNT(*)::text AS total FROM studio_artifact artifact
        JOIN studio_project_graph project ON project.id=artifact."projectId" WHERE project."workId"=$1 AND starts_with(artifact.id,$2)`,
      [workId, STUDIO_WORK_SESSION_ARTIFACT_PREFIX])).rows[0];
      if (Number(count?.total ?? 0) >= 1_000) return fail("capacity");
      const at = new Date().toISOString(), state = createStudioWorkSession(input, actor, at), origin = `work-session-origin-${randomUUID()}`;
      await client.query(`INSERT INTO studio_artifact (id,"projectId",kind,title,scope,"headRevisionId","ownerWorkspaceId")
        VALUES ($1,$2,'asset',$3,$4::jsonb,$5,$6)`, [artifactId, state.input.projectId, state.title, JSON.stringify({ projectId: state.input.projectId }), origin, `work-session-workspace-${randomUUID()}`]);
      await client.query(`INSERT INTO studio_revision (id,"artifactId",kind,"rootGraphHash","createdBy","deviceId","createdAt")
        VALUES ($1,$2,'checkpoint',$3,$4,$5,$6)`, [origin, artifactId, hash({ contract: "studio-work-session-origin-v1", workId, sessionId: state.id }), actorId, DEVICE, at]);
      const event: Event = { contract: EVENT, type: "create", workId, sessionId: state.id, actor, at, input,
        idempotencyKeyHash: keyFor(workId, state.id, actorId, input.operationId) };
      return { view: view(state, actor), receipt: await append(client, state, origin, event) };
    });
  }
  command(actorId: string, workId: string, sessionId: string, raw: StudioWorkSessionCommand) {
    const input = studioWorkSessionCommandSchema.parse(raw);
    return transaction(async (client) => {
      const { actor } = await access(client, actorId, workId, true);
      const current = await load(client, workId, sessionId);
      await verifyPin(client, workId, current.session.input);
      const replay = await prior(client, actorId, workId, sessionId, input);
      if (replay) return { view: view(replay.current.session, actor), receipt: replay.receipt };
      const at = new Date().toISOString(), state = reduceStudioWorkSession(current.session, input, actor, at);
      if (input.action === "attach-result") await verifyResult(client, actorId, workId, input.result);
      const event: Event = { contract: EVENT, type: "command", workId, sessionId, actor, at, input,
        idempotencyKeyHash: keyFor(workId, sessionId, actorId, input.operationId) };
      return { view: view(state, actor), receipt: await append(client, state, current.meta.headRevisionId, event) };
    });
  }
}
