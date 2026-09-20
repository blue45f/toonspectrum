import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { canonicalJson, STUDIO_WORLD_ARTIFACT_PREFIX, studioWorldPublicationSchema, studioWorldPublishSchema,
  type StudioWorldPublication, type StudioWorldPublish, type StudioWorldPublishResult } from "@toonspectrum/studio-project-model";
import type { PoolClient } from "pg";
import { dbPool } from "../../db";
import { assertAccess, projectAccess, studioRequestHash, StudioIdempotencyConflictError, StudioProjectNotFoundError, StudioRepositoryInvariantError } from "./studio-project-graph.repository";

const COMMAND = "studio.world.publish";
const DEVICE = "studio-world-authority-v1";
const artifactFor = (workId: string) => `${STUDIO_WORLD_ARTIFACT_PREFIX}${studioRequestHash(workId)}`;
const keyFor = (key: string) => studioRequestHash({ contract: "studio-world-publish-key-v1", key });
const invariant = (): never => { throw new StudioRepositoryInvariantError("world_publication_invalid", "The authoritative world publication cannot be verified"); };
export class StudioWorldPublicationConflictError extends Error {
  constructor(readonly currentPublishedRevisionId: string | null) { super("studio_world_publication_conflict"); }
}

async function transaction<T>(action: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await dbPool.connect();
  try { await client.query("BEGIN"); const value = await action(client); await client.query("COMMIT"); return value; }
  catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

async function access(client: PoolClient, actor: string, workId: string, mode: "view" | "manage") {
  // The same work lock serializes membership changes. A fresh subsequent statement sees
  // membership revoked while this request waited, including on idempotent replay.
  await client.query(`SELECT id FROM creator_work WHERE id=$1 FOR ${mode === "manage" ? "UPDATE" : "SHARE"}`, [workId]);
  const result = await client.query<{ projectId: string; workId: string; ownerUserId: string; membershipRole: string | null; membershipStatus: string | null }>(
    `SELECT ''::text AS "projectId", work.id AS "workId", work."userId" AS "ownerUserId", membership.role AS "membershipRole", membership.status AS "membershipStatus"
     FROM creator_work work LEFT JOIN creator_work_collaborator membership ON membership."workId"=work.id AND membership."userId"=$2 WHERE work.id=$1`, [workId, actor]);
  const row = result.rows[0];
  if (!row) throw new StudioProjectNotFoundError("work");
  assertAccess(projectAccess(actor, row), mode);
  return row;
}

type PublicationRow = {
  sequence: string; commandId: string; baseRevisionId: string; resultRevisionId: string; actorUserId: string | null;
  deviceId: string; commandType: string; scope: unknown; payloadHash: string; operation: unknown; issuedAt: Date;
  projectId: string; workId: string; kind: string; artifactScope: unknown; revisionKind: string; rootGraphHash: string;
  operationFirst: string | null; operationLast: string | null; createdBy: string | null; revisionDevice: string; createdAt: Date;
  parents: string[]; requestHash: string | null; receiptActor: string | null; receiptKey: string | null; response: unknown;
};

function verified(row: PublicationRow, workId: string): StudioWorldPublication {
  const receipt = row.response && typeof row.response === "object" && !Array.isArray(row.response) ? row.response as Record<string, unknown> : null;
  const result = studioWorldPublicationSchema.safeParse(receipt?.publication);
  if (!result.success) return invariant();
  const publication = result.data;
  const operation = row.operation && typeof row.operation === "object" && !Array.isArray(row.operation) ? row.operation as Record<string, unknown> : null;
  const payload = { expectedPublishedRevisionId: publication.previousPublishedRevisionId, manifest: publication.manifest };
  const expectedOperation = { contract: "studio-world-operation-v1", commandId: row.commandId, type: COMMAND,
    idempotencyKeyHash: row.receiptKey, payload, publication };
  if (receipt?.contract !== "studio-world-receipt-v1" || receipt.replayed !== false || publication.workId !== workId
    || publication.artifactId !== artifactFor(workId) || publication.projectId !== row.projectId || row.workId !== workId
    || row.kind !== "asset" || row.revisionKind !== "checkpoint" || row.commandType !== COMMAND
    || row.deviceId !== DEVICE || row.revisionDevice !== DEVICE || publication.revisionId !== row.resultRevisionId
    || publication.publishedBy !== row.actorUserId || row.createdBy !== row.actorUserId || row.receiptActor !== row.actorUserId
    || publication.sequence !== Number(row.sequence) || Number(row.operationFirst) !== publication.sequence || Number(row.operationLast) !== publication.sequence
    || publication.publishedAt !== row.createdAt.toISOString() || publication.publishedAt !== row.issuedAt.toISOString()
    || publication.contentHash !== studioRequestHash(publication.manifest) || publication.contentHash !== row.rootGraphHash
    || row.payloadHash !== studioRequestHash(payload) || row.requestHash !== studioRequestHash({ workId, input: payload })
    || canonicalJson(row.scope) !== canonicalJson({ projectId: publication.projectId }) || canonicalJson(row.artifactScope) !== canonicalJson(row.scope)
    || canonicalJson(operation) !== canonicalJson(expectedOperation) || row.parents.length !== 1 || row.parents[0] !== row.baseRevisionId
    || (publication.previousPublishedRevisionId !== null && publication.previousPublishedRevisionId !== row.baseRevisionId)) return invariant();
  return publication;
}

async function publicationRow(client: PoolClient, workId: string, revisionId?: string): Promise<PublicationRow | null> {
  // Select the newest server operation before joining its receipt. A missing receipt MUST
  // fail closed, never silently resurrect an older public layout after user/receipt removal.
  const result = await client.query<PublicationRow>(
    `SELECT operation.*, artifact."projectId", artifact.kind, artifact.scope AS "artifactScope", project."workId",
       revision.kind AS "revisionKind", revision."rootGraphHash", revision."operationFirst", revision."operationLast",
       revision."createdBy", revision."deviceId" AS "revisionDevice", revision."createdAt",
       ARRAY(SELECT "parentRevisionId" FROM studio_revision_parent WHERE "revisionId"=revision.id ORDER BY ordinal) AS parents,
       receipt."requestHash", receipt."actorUserId" AS "receiptActor", receipt."idempotencyKeyHash" AS "receiptKey", receipt.response
     FROM studio_operation operation JOIN studio_artifact artifact ON artifact.id=operation."artifactId"
     JOIN studio_project_graph project ON project.id=artifact."projectId"
     JOIN studio_revision revision ON revision.id=operation."resultRevisionId" AND revision."artifactId"=artifact.id
     LEFT JOIN studio_mutation_receipt receipt ON receipt."artifactId"=artifact.id AND receipt."resultRevisionId"=revision.id
       AND receipt."actorUserId"=operation."actorUserId" AND receipt."idempotencyKeyHash"=operation.operation->>'idempotencyKeyHash'
     WHERE artifact.id=$1 AND operation."commandType"=$2 ${revisionId ? 'AND revision.id=$3' : ''}
     ORDER BY operation.sequence DESC LIMIT 1`, revisionId ? [artifactFor(workId), COMMAND, revisionId] : [artifactFor(workId), COMMAND]);
  return result.rows[0] ?? null;
}

@Injectable()
export class StudioWorldPublicationRepository {
  async current(actor: string, workId: string): Promise<StudioWorldPublication | null> {
    return transaction(async (client) => {
      await access(client, actor, workId, "view");
      const row = await publicationRow(client, workId);
      return row ? verified(row, workId) : null;
    });
  }

  async publish(actor: string, workId: string, raw: StudioWorldPublish, idempotencyKey: string): Promise<StudioWorldPublishResult> {
    const input = studioWorldPublishSchema.parse(raw);
    const artifactId = artifactFor(workId), key = keyFor(idempotencyKey), requestHash = studioRequestHash({ workId, input });
    return transaction(async (client) => {
      const work = await access(client, actor, workId, "manage");
      const existing = await client.query<{ projectId: string; headRevisionId: string }>('SELECT "projectId","headRevisionId" FROM studio_artifact WHERE id=$1 FOR UPDATE', [artifactId]);
      const prior = await client.query<{ requestHash: string; resultRevisionId: string }>(
        'SELECT "requestHash","resultRevisionId" FROM studio_mutation_receipt WHERE "artifactId"=$1 AND "actorUserId"=$2 AND "idempotencyKeyHash"=$3', [artifactId, actor, key]);
      if (prior.rows[0]) {
        if (prior.rows[0].requestHash !== requestHash) throw new StudioIdempotencyConflictError();
        const row = await publicationRow(client, workId, prior.rows[0].resultRevisionId);
        if (!row) return invariant();
        return { publication: verified(row, workId), replayed: true };
      }
      const previousRow = await publicationRow(client, workId);
      const previous = previousRow ? verified(previousRow, workId) : null;
      if ((previous?.revisionId ?? null) !== input.expectedPublishedRevisionId) throw new StudioWorldPublicationConflictError(previous?.revisionId ?? null);
      // A preexisting generic artifact is never adopted as server authority.
      if (existing.rows[0] && !previous) return invariant();
      let projectId = existing.rows[0]?.projectId;
      let baseRevisionId = previous?.revisionId;
      const now = new Date().toISOString();
      if (!projectId) {
        const project = await client.query<{ id: string }>('SELECT id FROM studio_project_graph WHERE "workId"=$1', [workId]);
        projectId = project.rows[0]?.id ?? `world-project-${randomUUID()}`;
        if (!project.rows[0]) await client.query(`INSERT INTO studio_project_graph (id,"workId","schemaVersion","authorityVersion","ownerUserId") VALUES ($1,$2,3,'project-graph-v3',$3)`, [projectId, workId, work.ownerUserId]);
        baseRevisionId = `world-origin-${randomUUID()}`;
        await client.query(`INSERT INTO studio_artifact (id,"projectId",kind,title,scope,"headRevisionId","ownerWorkspaceId") VALUES ($1,$2,'asset','Published virtual studio world',$3::jsonb,$4,$5)`, [artifactId, projectId, JSON.stringify({ projectId }), baseRevisionId, `world-workspace-${randomUUID()}`]);
        await client.query(`INSERT INTO studio_revision (id,"artifactId",kind,"rootGraphHash","createdBy","deviceId","createdAt") VALUES ($1,$2,'checkpoint',$3,$4,$5,$6)`, [baseRevisionId, artifactId, studioRequestHash({ contract: "studio-world-origin-v1", workId }), actor, DEVICE, now]);
      }
      if (!baseRevisionId) return invariant();
      const sequenceResult = await client.query<{ next: string }>('SELECT COALESCE(MAX(sequence),0)+1 AS next FROM studio_operation WHERE "artifactId"=$1', [artifactId]);
      const sequence = Number(sequenceResult.rows[0]?.next);
      if (!Number.isSafeInteger(sequence) || sequence < 1) return invariant();
      const revisionId = `world-publication-${randomUUID()}`, commandId = `world-publish-${randomUUID()}`;
      const publication: StudioWorldPublication = { contract: "studio-world-publication-v1", workId, projectId, artifactId, revisionId,
        previousPublishedRevisionId: previous?.revisionId ?? null, contentHash: studioRequestHash(input.manifest), sequence, publishedBy: actor, publishedAt: now, manifest: input.manifest };
      await client.query(`INSERT INTO studio_revision (id,"artifactId",kind,"rootGraphHash","operationFirst","operationLast","createdBy","deviceId","createdAt") VALUES ($1,$2,'checkpoint',$3,$4,$4,$5,$6,$7)`, [revisionId, artifactId, publication.contentHash, sequence, actor, DEVICE, now]);
      await client.query('INSERT INTO studio_revision_parent ("revisionId","parentRevisionId",ordinal) VALUES ($1,$2,0)', [revisionId, baseRevisionId]);
      const operation = { contract: "studio-world-operation-v1", commandId, type: COMMAND, idempotencyKeyHash: key, payload: input, publication };
      await client.query(`INSERT INTO studio_operation ("artifactId",sequence,"commandId","baseRevisionId","resultRevisionId","actorUserId","deviceId","commandType",scope,"payloadHash",operation,"issuedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11::jsonb,$12)`,
        [artifactId, sequence, commandId, baseRevisionId, revisionId, actor, DEVICE, COMMAND, JSON.stringify({ projectId }), studioRequestHash(input), JSON.stringify(operation), now]);
      await client.query(`INSERT INTO studio_mutation_receipt ("artifactId","actorUserId","idempotencyKeyHash","requestHash","resultRevisionId",response) VALUES ($1,$2,$3,$4,$5,$6::jsonb)`, [artifactId, actor, key, requestHash, revisionId, JSON.stringify({ contract: "studio-world-receipt-v1", publication, replayed: false })]);
      await client.query('UPDATE studio_artifact SET "headRevisionId"=$2,"updatedAt"=now() WHERE id=$1', [artifactId, revisionId]);
      await client.query('UPDATE studio_project_graph SET "updatedAt"=now() WHERE id=$1', [projectId]);
      return { publication, replayed: false };
    });
  }
}
