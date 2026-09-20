import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { canonicalJson } from "@toonspectrum/studio-project-model";
import { STUDIO_WORLD_ARTIFACT_PREFIX, type StudioWorldPublication } from "@toonspectrum/studio-project-model/world-publication";
import { STUDIO_ACOUSTIC_MAX_SESSIONS, STUDIO_ACOUSTIC_RESOURCE_PREFIX as PREFIX, STUDIO_ACOUSTIC_SESSION_MS, studioAcousticCoreBindingSchema, studioAcousticDoorChangeSchema, studioAcousticSessionOpenSchema, studioAcousticSessionLeaseSchema, type StudioAcousticCoreBinding, type StudioAcousticDoorChange, type StudioAcousticSessionOpen, type StudioAcousticSessionLease, type StudioAcousticWorldPin } from "@toonspectrum/studio-project-model/world-acoustic";
import type { PoolClient } from "pg";
import { dbPool } from "../../db";
import type { VerifiedSessionToken } from "../../server/session";
import { assertAccess, projectAccess, studioRequestHash as hash, StudioIdempotencyConflictError, StudioProjectNotFoundError, StudioProjectForbiddenError } from "./studio-project-graph.repository";
import { loadStudioWorldPublication } from "./studio-world-publication.repository";

const COMMAND = "studio.world.acoustic-door";
const DEVICE = "studio-acoustic-authority-v1";
const ADVISORY = "toonspectrum:creator-work-live-lock:v1:";
const doorSchema = z.object({ contract: z.literal("studio-acoustic-door-v1"), input: studioAcousticDoorChangeSchema,
  epoch: z.uuid(), doorId: z.string(), actor: z.string(), revisionId: z.string(), sequence: z.number().int().positive(), createdAt: z.string().datetime() }).strict();
type Door = z.infer<typeof doorSchema>;
const descriptorSchema = z.object({ contract: z.literal("studio-acoustic-session-v1"), input: studioAcousticSessionOpenSchema,
  actor: z.string(), sessionVersion: z.number().int().positive(), binding: studioAcousticCoreBindingSchema, sessionEpoch: z.uuid(),
  resourceId: z.string(), doorId: z.string(), workId: z.string(), requestHash: z.string().regex(/^[a-f0-9]{64}$/u) }).strict();
type Descriptor = z.infer<typeof descriptorSchema>;
type Row = { resourceId: string; leaseId: string; acquisitionId: string; ownerConnectionId: string; revision: string; expiresAt: Date;
  response: unknown; requestHash: string; receiptActor: string; resultRevisionId: string; live: boolean };
export class StudioAcousticAuthorityError extends Error {
  constructor(readonly reason: "stale" | "closed" | "binding" | "limit" | "proof" | "session") { super(`studio_acoustic_${reason}`); }
}
const fail = (reason: StudioAcousticAuthorityError["reason"]): never => { throw new StudioAcousticAuthorityError(reason); };
const pin = (world: StudioWorldPublication): StudioAcousticWorldPin => ({ worldId: world.manifest.id, revisionId: world.revisionId, contentHash: world.contentHash });
const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
async function transaction<T>(action: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await dbPool.connect();
  try { await client.query("BEGIN"); const value = await action(client); await client.query("COMMIT"); return value; }
  catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
async function workLock(client: PoolClient, workId: string): Promise<void> {
  // NO KEY UPDATE still serializes membership's work UPDATE, but permits the FK KEY SHARE
  // taken by existing generic lease writers before they release the shared advisory lock.
  await client.query('SELECT id FROM creator_work WHERE id=$1 FOR NO KEY UPDATE', [workId]);
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [ADVISORY + workId]);
}
async function access(client: PoolClient, principal: VerifiedSessionToken, workId: string, mode: "view" | "manage") {
  const result = await client.query<{ projectId: string; workId: string; ownerUserId: string; membershipRole: string | null; membershipStatus: string | null; membershipInvitationId:string|null; membershipUpdatedAt: string | null; sessionVersion: number; status: string; now: Date }>(
    `SELECT '' AS "projectId", work.id AS "workId", work."userId" AS "ownerUserId", member.role AS "membershipRole", member.status AS "membershipStatus", member."invitationId" AS "membershipInvitationId", member."updatedAt"::text AS "membershipUpdatedAt", actor."sessionVersion", actor.status, statement_timestamp() AS now
     FROM creator_work work JOIN "user" actor ON actor.id=$2 LEFT JOIN creator_work_collaborator member ON member."workId"=work.id AND member."userId"=$2 WHERE work.id=$1`, [workId, principal.userId]);
  const row = result.rows[0];
  if (!row) throw new StudioProjectNotFoundError("work");
  if (row.status !== "active" || row.sessionVersion !== principal.sessionVersion || principal.expiresAt <= row.now.getTime()) return fail("session");
  assertAccess(projectAccess(principal.userId, row), mode); return row;
}
async function currentWorld(client: PoolClient, workId: string, expected?: StudioAcousticWorldPin) {
  const world = await loadStudioWorldPublication(client, workId);
  if (!world || (expected && !same(pin(world), expected))) return fail("stale");
  return world;
}
function zoneDoor(world: StudioWorldPublication, zoneId: string) {
  const zone = world.manifest.acousticZones?.find((item) => item.id === zoneId);
  // Only an explicitly authored door can acquire server door authority in this slice.
  if (!zone?.doorId || world.manifest.acousticZones!.filter((item) => item.doorId === zone.doorId).length !== 1) return fail("closed"); return zone.doorId;
}
async function clock(client: PoolClient, workId: string): Promise<string> {
  const result = await client.query<{ revision: string }>(`INSERT INTO creator_work_live_lock_clock ("workId",revision) VALUES ($1,1) ON CONFLICT ("workId") DO UPDATE SET revision=creator_work_live_lock_clock.revision+1,"updatedAt"=statement_timestamp() RETURNING revision::text`, [workId]);
  return result.rows[0]!.revision;
}
async function loadDoor(client: PoolClient, world: StudioWorldPublication, zoneId: string): Promise<Door | null> {
  const result = await client.query<{ state: unknown; payload: unknown; requestHash: string; receiptActor: string; actor: string; rootHash: string; parent: string; revisionId: string; sequence: string; payloadHash: string; device: string; receiptRevision: string; kind: string; parents: string[]; revisionActor: string; revisionDevice: string; revisionArtifact: string; first: string; last: string; scope: unknown; createdAt: Date }>(
    `SELECT operation.operation->'state' AS state, operation.operation->'payload' AS payload, operation."payloadHash", operation."actorUserId" AS actor,
      operation."deviceId" AS device, operation.sequence::text, operation."resultRevisionId" AS "revisionId", operation."baseRevisionId" AS parent,
      revision."rootGraphHash" AS "rootHash", revision.kind, revision."createdBy" AS "revisionActor", revision."deviceId" AS "revisionDevice", revision."artifactId" AS "revisionArtifact",
      revision."operationFirst"::text AS first, revision."operationLast"::text AS last, revision."createdAt", operation.scope,
      ARRAY(SELECT "parentRevisionId" FROM studio_revision_parent WHERE "revisionId"=revision.id ORDER BY ordinal) AS parents,
      receipt."requestHash", receipt."actorUserId" AS "receiptActor", receipt."resultRevisionId" AS "receiptRevision"
     FROM studio_operation operation JOIN studio_revision revision ON revision.id=operation."resultRevisionId"
     LEFT JOIN studio_mutation_receipt receipt ON receipt."artifactId"=operation."artifactId" AND receipt."actorUserId"=operation."actorUserId"
       AND receipt."idempotencyKeyHash"=operation.operation->>'receiptKey' AND receipt.response=operation.operation->'state'
     WHERE operation."artifactId"=$1 AND operation."commandType"=$2 AND operation.operation->'state'->'input'->>'zoneId'=$3
       AND operation.operation->'state'->'input'->'world'->>'revisionId'=$4 ORDER BY operation.sequence DESC LIMIT 1`, [world.artifactId, COMMAND, zoneId, world.revisionId]);
  const row = result.rows[0]; if (!row) return null;
  const parsed = doorSchema.safeParse(row.state); if (!parsed.success) return fail("proof"); const state = parsed.data;
  if (!same(state.input.world, pin(world)) || state.doorId !== zoneDoor(world, zoneId) || row.actor !== state.actor || row.receiptActor !== state.actor
    || row.revisionId !== state.revisionId || row.receiptRevision !== state.revisionId || row.kind !== "checkpoint" || row.device !== DEVICE
    || row.parent !== world.revisionId || row.parents.length!==1 || row.parents[0]!==world.revisionId || row.revisionActor!==state.actor || row.revisionDevice!==DEVICE
    || row.revisionArtifact!==world.artifactId || row.first!==row.sequence || row.last!==row.sequence || !same(row.scope,{projectId:world.projectId}) || row.createdAt.toISOString()!==state.createdAt
    || Number(row.sequence) !== state.sequence || row.rootHash !== hash(state)
    || !same(row.payload, state.input) || row.payloadHash !== hash(state.input) || row.requestHash !== hash({ workId: world.workId, input: state.input })) return fail("proof");
  return state;
}
async function sessionRow(client: PoolClient, workId: string, epoch: string): Promise<Row | null> {
  const result = await client.query<Row>(`SELECT lease."resourceId",lease."leaseId",lease."acquisitionId",lease."ownerConnectionId",lease.revision::text,lease."expiresAt",
    lease."expiresAt">statement_timestamp() AS live, receipt.response,receipt."requestHash",receipt."actorUserId" AS "receiptActor",receipt."resultRevisionId"
    FROM creator_work_live_lock lease LEFT JOIN studio_mutation_receipt receipt ON receipt."idempotencyKeyHash"=lease."acquisitionId"
      AND receipt.response->>'resourceId'=lease."resourceId" AND receipt.response->>'workId'=lease."workId" AND receipt."artifactId"=$4
    WHERE lease."workId"=$1 AND lease."leaseId"=$2 AND lease."resourceId" LIKE $3 LIMIT 1`, [workId, epoch, PREFIX + "%", STUDIO_WORLD_ARTIFACT_PREFIX + hash(workId)]);
  return result.rows[0] ?? null;
}
function descriptor(row: Row, actor: string, workId: string): Descriptor {
  const parsed = descriptorSchema.safeParse(row.response); if (!parsed.success) return fail("proof"); const value = parsed.data;
  if (value.actor !== actor || row.receiptActor !== actor) throw new StudioProjectForbiddenError("view");
  if (value.workId !== workId || value.resourceId !== row.resourceId || value.sessionEpoch !== row.leaseId || value.binding.connectionId !== row.ownerConnectionId
    || value.requestHash !== row.requestHash || value.requestHash !== hash({ workId, input: value.input }) || row.resultRevisionId !== value.input.world.revisionId
    || value.binding.connectionId !== value.input.connectionId || value.binding.clientInstanceId !== value.input.clientInstanceId
    || value.resourceId !== PREFIX + "session:" + hash({ actor, clientInstanceId: value.input.clientInstanceId })) return fail("proof");
  return value;
}
function lease(row: Row, value: Descriptor): StudioAcousticSessionLease {
  return studioAcousticSessionLeaseSchema.parse({ kind: "acoustic-session-lease-only", world: value.input.world, zoneId: value.input.zoneId,
    doorId: value.doorId, doorEpoch: value.input.doorEpoch, sessionEpoch: value.sessionEpoch, leaseRevision: row.revision, expiresAt: row.expiresAt.toISOString(), binding: value.binding });
}

@Injectable()
export class StudioWorldAcousticRepository {
  async door(principal: VerifiedSessionToken, workId: string, zoneId: string) {
    return transaction(async (client) => {
      await workLock(client, workId); const permissions = await access(client, principal, workId, "view");
      const world = await currentWorld(client, workId), doorId = zoneDoor(world, zoneId), current = await loadDoor(client, world, zoneId);
      return { world: pin(world), zoneId, doorId, epoch: current?.epoch ?? null, open: current?.input.open ?? false,
        permitted: Boolean(current?.input.open && current.input.allowedUserIds.includes(principal.userId)),
        ...(projectAccess(principal.userId, permissions).manageMembers ? { allowedUserIds: current?.input.allowedUserIds ?? [] } : {}) };
    });
  }
  async changeDoor(principal: VerifiedSessionToken, workId: string, raw: StudioAcousticDoorChange, key: string) {
    const input = studioAcousticDoorChangeSchema.parse(raw); input.allowedUserIds.sort();
    return transaction(async (client) => {
      await workLock(client, workId); await access(client, principal, workId, "manage");
      const world = await currentWorld(client, workId, input.world), doorId = zoneDoor(world, input.zoneId);
      await client.query('SELECT id FROM studio_artifact WHERE id=$1 FOR UPDATE', [world.artifactId]);
      const requestHash = hash({ workId, input }), receiptKey = hash({ phase: "acoustic-door", key });
      const prior = await client.query<{ requestHash: string; response: unknown }>('SELECT "requestHash",response FROM studio_mutation_receipt WHERE "artifactId"=$1 AND "actorUserId"=$2 AND "idempotencyKeyHash"=$3', [world.artifactId, principal.userId, receiptKey]);
      if (prior.rows[0]) { if (prior.rows[0].requestHash !== requestHash) throw new StudioIdempotencyConflictError(); return { door: doorSchema.parse(prior.rows[0].response), replayed: true }; }
      const previous = await loadDoor(client, world, input.zoneId);
      if ((previous?.epoch ?? null) !== input.expectedDoorEpoch) return fail("stale");
      for (const actor of input.allowedUserIds) {
        const member = await client.query(`SELECT 1 FROM "user" actor JOIN creator_work work ON work.id=$1 LEFT JOIN creator_work_collaborator member ON member."workId"=work.id AND member."userId"=actor.id WHERE actor.id=$2 AND actor.status='active' AND (work."userId"=actor.id OR (member.status='active' AND member.role IN ('admin','editor','commenter','viewer')))`, [workId, actor]);
        if (!member.rowCount) throw new StudioProjectForbiddenError("manage");
      }
      const seq = await client.query<{ next: string }>('SELECT COALESCE(MAX(sequence),0)+1 AS next FROM studio_operation WHERE "artifactId"=$1', [world.artifactId]);
      const state: Door = { contract: "studio-acoustic-door-v1", input, epoch: randomUUID(), doorId, actor: principal.userId, revisionId: `acoustic-door-${randomUUID()}`, sequence: Number(seq.rows[0]!.next), createdAt: new Date().toISOString() };
      await client.query(`INSERT INTO studio_revision (id,"artifactId",kind,"rootGraphHash","operationFirst","operationLast","createdBy","deviceId","createdAt") VALUES ($1,$2,'checkpoint',$3,$4,$4,$5,$6,$7)`, [state.revisionId, world.artifactId, hash(state), state.sequence, principal.userId, DEVICE, state.createdAt]);
      await client.query('INSERT INTO studio_revision_parent ("revisionId","parentRevisionId",ordinal) VALUES ($1,$2,0)', [state.revisionId, world.revisionId]);
      await client.query(`INSERT INTO studio_operation ("artifactId",sequence,"commandId","baseRevisionId","resultRevisionId","actorUserId","deviceId","commandType",scope,"payloadHash",operation,"issuedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11::jsonb,$12)`, [world.artifactId,state.sequence,randomUUID(),world.revisionId,state.revisionId,principal.userId,DEVICE,COMMAND,JSON.stringify({projectId:world.projectId}),hash(input),JSON.stringify({payload:input,state,receiptKey}),state.createdAt]);
      await client.query(`INSERT INTO studio_mutation_receipt ("artifactId","actorUserId","idempotencyKeyHash","requestHash","resultRevisionId",response) VALUES ($1,$2,$3,$4,$5,$6::jsonb)`, [world.artifactId,principal.userId,receiptKey,requestHash,state.revisionId,JSON.stringify(state)]);
      const removed = await client.query<{response:unknown}>(`DELETE FROM creator_work_live_lock lease USING studio_mutation_receipt receipt WHERE lease."workId"=$1 AND lease."resourceId" LIKE $2 AND receipt."artifactId"=$4 AND receipt."idempotencyKeyHash"=lease."acquisitionId" AND receipt.response->>'workId'=$1
        AND (receipt.response->>'resourceId'=lease."resourceId" OR $5||(receipt.response->>'conversationId')=lease."resourceId")
        AND COALESCE(receipt.response->'input'->>'zoneId',receipt.response->>'zoneId')=$3 RETURNING receipt.response`, [workId, PREFIX + "%", input.zoneId,world.artifactId,PREFIX+"conversation:"]);
      if (removed.rowCount) await clock(client, workId);
      return { door: state, replayed: false, invalidatedConversations: removed.rows.map(row=>row.response) };
    });
  }
  async open(principal: VerifiedSessionToken, workId: string, raw: StudioAcousticSessionOpen, binding: StudioAcousticCoreBinding, key: string): Promise<StudioAcousticSessionLease> {
    const input = studioAcousticSessionOpenSchema.parse(raw);
    return transaction(async (client) => {
      await workLock(client, workId); await access(client, principal, workId, "view");
      const world = await currentWorld(client, workId, input.world), door = await loadDoor(client, world, input.zoneId);
      if (!door?.input.open || door.epoch !== input.doorEpoch || !door.input.allowedUserIds.includes(principal.userId)) return fail("closed");
      if (binding.connectionId !== input.connectionId || binding.clientInstanceId !== input.clientInstanceId) return fail("binding");
      const requestHash = hash({ workId, input }), receiptKey = hash({ phase: "acoustic-session", key });
      const prior = await client.query<{ requestHash: string; response: unknown }>('SELECT "requestHash",response FROM studio_mutation_receipt WHERE "artifactId"=$1 AND "actorUserId"=$2 AND "idempotencyKeyHash"=$3', [world.artifactId,principal.userId,receiptKey]);
      if (prior.rows[0]) {
        if (prior.rows[0].requestHash !== requestHash) throw new StudioIdempotencyConflictError();
        const stored = descriptorSchema.parse(prior.rows[0].response), row = await sessionRow(client, workId, stored.sessionEpoch);
        if (!row?.live || !same(stored.binding,binding) || stored.sessionVersion !== principal.sessionVersion) return fail("stale");
        return lease(row, descriptor(row,principal.userId,workId));
      }
      const resourceId = PREFIX + "session:" + hash({ actor: principal.userId, clientInstanceId: input.clientInstanceId });
      const existing = await client.query<{ leaseId: string }>('SELECT "leaseId" FROM creator_work_live_lock WHERE "workId"=$1 AND "resourceId"=$2 AND "expiresAt">statement_timestamp()', [workId,resourceId]);
      if ((existing.rows[0]?.leaseId ?? null) !== input.expectedSessionEpoch) return fail("stale");
      const count = await client.query<{ count: number }>('SELECT count(*)::int AS count FROM creator_work_live_lock WHERE "workId"=$1 AND "resourceId" LIKE $2 AND "expiresAt">statement_timestamp() AND "resourceId"<>$3', [workId,PREFIX + "session:%",resourceId]);
      if (count.rows[0]!.count >= STUDIO_ACOUSTIC_MAX_SESSIONS) return fail("limit");
      const stored: Descriptor = {contract:"studio-acoustic-session-v1",input,actor:principal.userId,sessionVersion:principal.sessionVersion,binding,sessionEpoch:randomUUID(),resourceId,doorId:door.doorId,workId,requestHash};
      await client.query(`INSERT INTO studio_mutation_receipt ("artifactId","actorUserId","idempotencyKeyHash","requestHash","resultRevisionId",response) VALUES ($1,$2,$3,$4,$5,$6::jsonb)`, [world.artifactId,principal.userId,receiptKey,requestHash,world.revisionId,JSON.stringify(stored)]);
      await client.query('DELETE FROM creator_work_live_lock WHERE "workId"=$1 AND "resourceId"=$2', [workId,resourceId]);
      await client.query(`INSERT INTO creator_work_live_lock ("workId","resourceId","leaseId","acquisitionId","ownerConnectionId","ownerName",revision,"expiresAt") VALUES ($1,$2,$3,$4,$5,'Acoustic session',$6,LEAST(statement_timestamp()+($7*interval '1 millisecond'),to_timestamp($8/1000.0)))`, [workId,resourceId,stored.sessionEpoch,receiptKey,binding.connectionId,await clock(client,workId),STUDIO_ACOUSTIC_SESSION_MS,principal.expiresAt]);
      return lease((await sessionRow(client,workId,stored.sessionEpoch))!,stored);
    });
  }
  /** Read-only reconciliation of an open response lost in transit. Never allocates or renews. */
  async readOpenIntent(principal: VerifiedSessionToken, workId: string, raw: StudioAcousticSessionOpen, key: string): Promise<StudioAcousticSessionLease | null> {
    const input = studioAcousticSessionOpenSchema.parse(raw);
    return transaction(async client => {
      await workLock(client, workId); await access(client, principal, workId, "view");
      const world = await currentWorld(client, workId, input.world), door = await loadDoor(client, world, input.zoneId);
      if (!door?.input.open || door.epoch !== input.doorEpoch || !door.input.allowedUserIds.includes(principal.userId)) return fail("closed");
      const prior = await client.query<{ requestHash:string; response:unknown }>('SELECT "requestHash",response FROM studio_mutation_receipt WHERE "artifactId"=$1 AND "actorUserId"=$2 AND "idempotencyKeyHash"=$3', [world.artifactId,principal.userId,hash({phase:"acoustic-session",key})]);
      if (!prior.rows[0]) return null;
      if (prior.rows[0].requestHash !== hash({workId,input})) throw new StudioIdempotencyConflictError();
      const stored = descriptorSchema.parse(prior.rows[0].response), row = await sessionRow(client,workId,stored.sessionEpoch);
      if (!row?.live || stored.sessionVersion !== principal.sessionVersion) return fail("stale");
      const verified = descriptor(row,principal.userId,workId);
      if (!same(verified,stored) || !same(stored.input,input)) return fail("proof");
      return lease(row,verified);
    });
  }
  async current(principal: VerifiedSessionToken, workId: string, epoch: string, renewRevision?: string): Promise<StudioAcousticSessionLease> {
    return transaction(async (client) => {
      await workLock(client,workId); await access(client,principal,workId,"view");
      const row=await sessionRow(client,workId,epoch); if (!row?.live) return fail("stale");
      const stored=descriptor(row,principal.userId,workId); if (stored.sessionVersion!==principal.sessionVersion) return fail("session");
      const world=await currentWorld(client,workId,stored.input.world), door=await loadDoor(client,world,stored.input.zoneId);
      if (!door?.input.open || door.epoch!==stored.input.doorEpoch || !door.input.allowedUserIds.includes(principal.userId)) return fail("closed");
      if (renewRevision!==undefined) {
        if (row.revision!==renewRevision) return fail("stale");
        await client.query(`UPDATE creator_work_live_lock SET revision=$3,"expiresAt"=LEAST(statement_timestamp()+($4*interval '1 millisecond'),to_timestamp($5/1000.0)),"updatedAt"=statement_timestamp() WHERE "workId"=$1 AND "leaseId"=$2`, [workId,epoch,await clock(client,workId),STUDIO_ACOUSTIC_SESSION_MS,principal.expiresAt]);
        return lease((await sessionRow(client,workId,epoch))!,stored);
      }
      return lease(row,stored);
    });
  }
  async revoke(actor: string,workId: string,epoch: string): Promise<void> {
    await transaction(async (client)=>{
      await workLock(client,workId); const row=await sessionRow(client,workId,epoch); if (!row) return;
      descriptor(row,actor,workId);
      await client.query('DELETE FROM creator_work_live_lock WHERE "workId"=$1 AND "leaseId"=$2 AND "resourceId"=$3',[workId,epoch,row.resourceId]); await clock(client,workId);
    });
  }
}

/** Server-only helpers for a caller holding exactly one work/advisory transaction. */
export { transaction as studioAcousticTransaction, workLock as lockStudioAcousticWork, access as assertStudioAcousticAccess, clock as nextStudioAcousticClock };
export async function loadStudioAcousticParticipant(client:PoolClient,workId:string,epoch:string) {
  const row=await sessionRow(client,workId,epoch);if(!row?.live) return fail("stale");
  const stored=descriptor(row,row.receiptActor,workId);
  const principal={userId:stored.actor,sessionVersion:stored.sessionVersion,expiresAt:row.expiresAt.getTime()};
  const permissions=await access(client,principal,workId,"view");
  const world=await currentWorld(client,workId,stored.input.world),door=await loadDoor(client,world,stored.input.zoneId);
  if(!door?.input.open||door.epoch!==stored.input.doorEpoch||!door.input.allowedUserIds.includes(stored.actor))return fail("closed");
  const authorityFence=hash(permissions.ownerUserId===stored.actor?{owner:stored.actor}:{owner:permissions.ownerUserId,role:permissions.membershipRole,status:permissions.membershipStatus,invitationId:permissions.membershipInvitationId,updatedAt:permissions.membershipUpdatedAt});
  return {actor:stored.actor,sessionVersion:stored.sessionVersion,authorityFence,sessionEpoch:epoch,binding:stored.binding,
    world:stored.input.world,zoneId:stored.input.zoneId,doorId:stored.doorId,doorEpoch:stored.input.doorEpoch,expiresAt:row.expiresAt.toISOString(),publication:world};
}
export type StudioAcousticParticipant = Awaited<ReturnType<typeof loadStudioAcousticParticipant>>;
