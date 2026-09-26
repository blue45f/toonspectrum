import { Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";
import {
  studioReviewVoiceNoteCreateSchema,
  studioReviewVoiceNoteDeleteSchema,
  studioReviewVoiceNoteSchema,
  studioReviewVoiceNoteSubjectSchema,
  type StudioReviewVoiceNote,
  type StudioReviewVoiceNoteCreate,
  type StudioReviewVoiceNoteDelete,
  type StudioReviewVoiceNoteSubject,
  type StudioReviewVoiceNoteView,
} from "@toonspectrum/studio-project-model/review-voice-note";
import {
  LocatedPrivateObjectReferenceSchema,
  type LocatedPrivateObjectReference,
} from "../../platform/adapters/private-object-storage/private-object-storage.contract";
import { dbPool } from "../../platform/database";
import { resolveCreatorCollaborationAccess } from "../creator/creator-collaboration.policy";
import { pinnedShareCapture, shareHash } from "./pinned-share/pinned-share-storage";

export class StudioReviewVoiceNoteRepositoryError extends Error {
  constructor(readonly code: "forbidden" | "not-found" | "invalid-source" | "idempotency" | "conflict" | "unavailable") {
    super(`studio_review_voice_note_${code}`);
  }
}
const fail = (code: StudioReviewVoiceNoteRepositoryError["code"]): never => { throw new StudioReviewVoiceNoteRepositoryError(code); };

type Authority = { view: boolean; comment: boolean; edit: boolean; manageMembers: boolean };
type StoredRow = {
  id: string;
  workId: string;
  subject: unknown;
  authorUserId: string;
  title: string;
  transcript: string;
  durationMs: number;
  contentType: string;
  byteLength: number;
  sha256: string;
  objectReference: unknown;
  requestHash: string;
  operationId: string;
  createdAt: Date;
  expiresAt: Date;
  deletedAt: Date | null;
  deleteOperationId: string | null;
};

async function transaction<T>(action: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await dbPool.connect();
  try { await client.query("BEGIN"); const result = await action(client); await client.query("COMMIT"); return result; }
  catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

async function access(client: PoolClient, actor: string, workId: string, write = false): Promise<Authority> {
  const work = (await client.query<{ userId: string }>(`SELECT "userId" FROM creator_work WHERE id=$1 FOR ${write ? "UPDATE" : "SHARE"}`, [workId])).rows[0];
  const user = (await client.query<{ status: string }>('SELECT status FROM "user" WHERE id=$1 FOR SHARE', [actor])).rows[0];
  if (!work || user?.status !== "active") return fail("forbidden");
  const membership = (await client.query<{ userId: string; role: string; status: string }>(
    'SELECT "userId",role,status FROM creator_work_collaborator WHERE "workId"=$1 AND "userId"=$2 FOR SHARE', [workId, actor],
  )).rows[0];
  const authority = resolveCreatorCollaborationAccess({ actorUserId: actor, ownerUserId: work.userId, membership });
  if (!authority.view) return fail("forbidden");
  return authority;
}

function noteFrom(row: StoredRow): StudioReviewVoiceNote {
  return studioReviewVoiceNoteSchema.parse({
    contract: "studio-review-voice-note-v1",
    id: row.id,
    subject: studioReviewVoiceNoteSubjectSchema.parse(row.subject),
    authorUserId: row.authorUserId,
    title: row.title,
    transcript: row.transcript,
    durationMs: row.durationMs,
    contentType: row.contentType,
    byteLength: Number(row.byteLength),
    sha256: row.sha256,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  });
}
function view(row: StoredRow, actor: string, authority: Authority): StudioReviewVoiceNoteView {
  return { note: noteFrom(row), canDelete: row.authorUserId === actor || authority.manageMembers };
}
function objectFrom(row: StoredRow): LocatedPrivateObjectReference {
  return LocatedPrivateObjectReferenceSchema.parse(row.objectReference);
}
async function exactSubject(client: PoolClient, workId: string, subjectValue: StudioReviewVoiceNoteSubject): Promise<void> {
  const subject = studioReviewVoiceNoteSubjectSchema.parse(subjectValue);
  if (subject.workId !== workId) return fail("invalid-source");
  try { await pinnedShareCapture(client, subject); }
  catch { return fail("invalid-source"); }
}
async function load(client: PoolClient, workId: string, noteId: string, lock = false): Promise<StoredRow> {
  const row = (await client.query<StoredRow>(`SELECT id,"workId",subject,"authorUserId",title,transcript,"durationMs","contentType","byteLength",sha256,
    "objectReference","requestHash","operationId","createdAt","expiresAt","deletedAt","deleteOperationId"
    FROM studio_review_voice_note WHERE id=$1 AND "workId"=$2${lock ? " FOR UPDATE" : ""}`, [noteId, workId])).rows[0];
  if (!row) return fail("not-found");
  return row;
}
async function activeReferenceCount(client: PoolClient, object: LocatedPrivateObjectReference): Promise<number> {
  const result = await client.query<{ count: number }>(`SELECT count(*)::int AS count FROM studio_review_voice_note
    WHERE "deletedAt" IS NULL AND "expiresAt">statement_timestamp() AND "objectReference"->>'providerId'=$1
      AND "objectReference"->>'purpose'=$2 AND "objectReference"->>'digest'=$3 AND "objectReference"->>'objectPath'=$4`,
  [object.providerId, object.purpose, object.digest, object.objectPath]);
  return result.rows[0]?.count ?? 0;
}

@Injectable()
export class StudioReviewVoiceNoteRepository {
  authorizeCreate(actor: string, workId: string, rawSubject: StudioReviewVoiceNoteSubject): Promise<void> {
    const subject = studioReviewVoiceNoteSubjectSchema.parse(rawSubject);
    return transaction(async (client) => {
      const authority = await access(client, actor, workId);
      if (!authority.comment) return fail("forbidden");
      await exactSubject(client, workId, subject);
    });
  }

  create(actor: string, workId: string, raw: StudioReviewVoiceNoteCreate, file: {
    contentType: string; byteLength: number; sha256: string; object: LocatedPrivateObjectReference;
  }): Promise<{ view: StudioReviewVoiceNoteView; replayed: boolean }> {
    const input = studioReviewVoiceNoteCreateSchema.parse(raw);
    const object = LocatedPrivateObjectReferenceSchema.parse(file.object);
    const requestHash = shareHash({ workId, input, contentType: file.contentType, byteLength: file.byteLength, sha256: file.sha256, object });
    return transaction(async (client) => {
      const authority = await access(client, actor, workId, true);
      if (!authority.comment) return fail("forbidden");
      await exactSubject(client, workId, input.subject);
      const prior = (await client.query<StoredRow>(`SELECT id,"workId",subject,"authorUserId",title,transcript,"durationMs","contentType","byteLength",sha256,
        "objectReference","requestHash","operationId","createdAt","expiresAt","deletedAt","deleteOperationId"
        FROM studio_review_voice_note WHERE "authorUserId"=$1 AND "operationId"=$2 FOR UPDATE`, [actor, input.operationId])).rows[0];
      if (prior) {
        if (prior.requestHash !== requestHash) return fail("idempotency");
        return { view: view(prior, actor, authority), replayed: true };
      }
      const conflicting = (await client.query<{ id: string }>('SELECT id FROM studio_review_voice_note WHERE id=$1 FOR UPDATE', [input.noteId])).rows[0];
      if (conflicting) return fail("conflict");
      const createdAt = new Date();
      const expiresAt = new Date(createdAt.getTime() + input.retentionDays * 86_400_000);
      await client.query(`INSERT INTO studio_review_voice_note (id,"workId","reviewId","revisionId","rootGraphHash",subject,"authorUserId",title,transcript,
        "durationMs","contentType","byteLength",sha256,"objectReference","requestHash","operationId","createdAt","expiresAt")
        VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,$17,$18)`, [
        input.noteId, workId, input.subject.reviewId, input.subject.revisionId, input.subject.rootGraphHash, JSON.stringify(input.subject), actor, input.title, input.transcript,
        input.durationMs, file.contentType, file.byteLength, file.sha256, JSON.stringify(object), requestHash, input.operationId, createdAt, expiresAt,
      ]);
      return { view: view(await load(client, workId, input.noteId), actor, authority), replayed: false };
    });
  }

  list(actor: string, workId: string, rawSubject: StudioReviewVoiceNoteSubject): Promise<{ items: StudioReviewVoiceNoteView[] }> {
    const subject = studioReviewVoiceNoteSubjectSchema.parse(rawSubject);
    return transaction(async (client) => {
      const authority = await access(client, actor, workId);
      await exactSubject(client, workId, subject);
      const rows = (await client.query<StoredRow>(`SELECT id,"workId",subject,"authorUserId",title,transcript,"durationMs","contentType","byteLength",sha256,
        "objectReference","requestHash","operationId","createdAt","expiresAt","deletedAt","deleteOperationId"
        FROM studio_review_voice_note WHERE "workId"=$1 AND "reviewId"=$2 AND "revisionId"=$3 AND "rootGraphHash"=$4
          AND "deletedAt" IS NULL AND "expiresAt">statement_timestamp() ORDER BY "createdAt" DESC LIMIT 100`,
      [workId, subject.reviewId, subject.revisionId, subject.rootGraphHash])).rows;
      return { items: rows.map((row) => view(row, actor, authority)) };
    });
  }

  read(actor: string, workId: string, noteId: string): Promise<{ view: StudioReviewVoiceNoteView; object: LocatedPrivateObjectReference }> {
    return transaction(async (client) => {
      const authority = await access(client, actor, workId);
      const row = await load(client, workId, noteId);
      if (row.deletedAt || row.expiresAt.getTime() <= Date.now()) return fail("not-found");
      await exactSubject(client, workId, studioReviewVoiceNoteSubjectSchema.parse(row.subject));
      return { view: view(row, actor, authority), object: objectFrom(row) };
    });
  }

  delete(actor: string, workId: string, noteId: string, raw: StudioReviewVoiceNoteDelete): Promise<{
    view: StudioReviewVoiceNoteView; object: LocatedPrivateObjectReference; deleteObject: boolean; replayed: boolean;
  }> {
    const input = studioReviewVoiceNoteDeleteSchema.parse(raw);
    return transaction(async (client) => {
      const authority = await access(client, actor, workId, true);
      const row = await load(client, workId, noteId, true);
      if (row.authorUserId !== actor && !authority.manageMembers) return fail("forbidden");
      if (row.sha256 !== input.expectedSha256) return fail("conflict");
      const object = objectFrom(row);
      if (row.deletedAt) {
        if (row.deleteOperationId !== input.operationId) return fail("conflict");
        return { view: view(row, actor, authority), object, deleteObject: (await activeReferenceCount(client, object)) === 0, replayed: true };
      }
      await client.query(`UPDATE studio_review_voice_note SET "deletedAt"=statement_timestamp(),"deleteOperationId"=$3
        WHERE id=$1 AND "workId"=$2`, [noteId, workId, input.operationId]);
      const updated = await load(client, workId, noteId);
      return { view: view(updated, actor, authority), object, deleteObject: (await activeReferenceCount(client, object)) === 0, replayed: false };
    });
  }

  claimExpired(limit = 20): Promise<readonly { object: LocatedPrivateObjectReference; deleteObject: boolean }[]> {
    return transaction(async (client) => {
      const rows = (await client.query<StoredRow>(`SELECT id,"workId",subject,"authorUserId",title,transcript,"durationMs","contentType","byteLength",sha256,
        "objectReference","requestHash","operationId","createdAt","expiresAt","deletedAt","deleteOperationId"
        FROM studio_review_voice_note WHERE "deletedAt" IS NULL AND "expiresAt"<=statement_timestamp()
        ORDER BY "expiresAt" ASC FOR UPDATE SKIP LOCKED LIMIT $1`, [Math.max(1, Math.min(100, limit))])).rows;
      const result: { object: LocatedPrivateObjectReference; deleteObject: boolean }[] = [];
      for (const row of rows) {
        await client.query(`UPDATE studio_review_voice_note SET "deletedAt"=statement_timestamp(),"deleteOperationId"=$2 WHERE id=$1`, [row.id, `retention:${row.id}`]);
        const object = objectFrom(row);
        result.push({ object, deleteObject: (await activeReferenceCount(client, object)) === 0 });
      }
      return result;
    });
  }

  async objectReferenced(objectValue: LocatedPrivateObjectReference): Promise<boolean> {
    const object = LocatedPrivateObjectReferenceSchema.parse(objectValue);
    return transaction(async (client) => (await activeReferenceCount(client, object)) > 0);
  }
}
