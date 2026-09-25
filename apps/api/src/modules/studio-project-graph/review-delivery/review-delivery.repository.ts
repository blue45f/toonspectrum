import { createHash } from "node:crypto";
import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Pool, PoolClient } from "pg";
import { canonicalJson } from "@toonspectrum/studio-project-model";
import {
  createReviewDeliveryManifest,
  reviewDeliveryActionSchema,
  reviewDeliveryAcceptSchema,
  reviewDeliveryJobSchema,
  reviewDeliveryManifestSchema,
  reviewDeliveryPrepareSchema,
  reviewDeliveryProfileSchema,
  reviewDeliveryRightsSchema,
  reviewDeliverySourceSchema,
  type ReviewDeliveryAction,
  type ReviewDeliveryAccept,
  type ReviewDeliveryJob,
  type ReviewDeliveryPrepare,
  type ReviewDeliverySource,
} from "@toonspectrum/studio-project-model/review-delivery";
import { resolveOperationPolicy } from "@toonspectrum/contracts/operation-policy";

import { resolveCreatorCollaborationAccess } from "../../creator/creator-collaboration.policy";
import { loadOperationPolicy, runtimeLicenseFingerprint } from "../../operation-policy/operation-policy.repository";
import type { LocatedPrivateObjectReference } from "../../../platform/private-object-storage/private-object-storage.contract";
import { PinnedShareError, pinnedShareCapture, pinnedShareImages, requireShareManager, shareHash } from "../pinned-share/pinned-share-storage";

export const STUDIO_REVIEW_DELIVERY_POOL = Symbol("STUDIO_REVIEW_DELIVERY_POOL");
interface DeliveryRow {
  id: string; workId: string; reviewId: string; createdBy: string; recipientUserId: string;
  operationId: string; requestHash: string; source: unknown; sourceHash: string; profile: unknown; profileHash: string;
  rights: unknown; manifest: unknown; manifestHash: string; recipientBindingHash: string;
  state: "prepared" | "issued" | "delivered" | "accepted" | "cancelled"; version: number;
  archiveSha256: string | null; archiveByteLength: number | null;
  createdAt: Date; updatedAt: Date; issuedAt: Date | null; deliveredAt: Date | null; acceptedAt: Date | null; cancelledAt: Date | null;
}
interface EventRow { deliveryId: string; requestHash: string; response: unknown }
interface RecipientBinding { readonly userId: string; readonly displayName: string; readonly digest: string }
interface DeliveryAccess { readonly manager: boolean; readonly recipient: boolean; readonly currentRecipient: boolean }
export interface ReviewDeliveryDownloadSource {
  readonly row: DeliveryRow; readonly pages: ReviewDeliverySource["pages"];
  readonly objects: readonly LocatedPrivateObjectReference[]; readonly actorIsRecipient: boolean;
}

function at(value: Date | null): string | null { return value?.toISOString() ?? null; }
function deliveryHash(value: unknown): string { return createHash("sha256").update(canonicalJson(value)).digest("hex"); }
function requestHash(value: unknown): string { return deliveryHash(value); }
function parseRow(row: DeliveryRow) {
  return { source: reviewDeliverySourceSchema.parse(row.source), profile: reviewDeliveryProfileSchema.parse(row.profile),
    rights: reviewDeliveryRightsSchema.parse(row.rights), manifest: reviewDeliveryManifestSchema.parse(row.manifest) };
}
async function transaction<T>(pool: Pool, action: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try { await client.query("BEGIN"); const value = await action(client); await client.query("COMMIT"); return value; }
  catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
async function timestamp(client: PoolClient): Promise<Date> {
  return (await client.query<{ at: Date }>("SELECT clock_timestamp() AS at")).rows[0]!.at;
}
async function lockOperation(client: PoolClient, actor: string, operationId: string): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))", [actor, operationId]);
}
async function isManager(client: PoolClient, actor: string, workId: string): Promise<boolean> {
  try { await requireShareManager(client, actor, workId); return true; }
  catch (error) { if (error instanceof PinnedShareError && error.code === "forbidden") return false; throw error; }
}
async function recipientBinding(client: PoolClient, workId: string, userId: string): Promise<RecipientBinding | null> {
  const work = (await client.query<{ ownerId: string }>('SELECT "userId" AS "ownerId" FROM creator_work WHERE id=$1 FOR SHARE', [workId])).rows[0];
  const user = (await client.query<{ id: string; name: string | null; status: string; sessionVersion: number }>(
    'SELECT id,name,status,"sessionVersion" FROM "user" WHERE id=$1 FOR SHARE', [userId])).rows[0];
  if (!work || !user || user.status !== "active") return null;
  if (work.ownerId === userId) return { userId, displayName: user.name?.trim() || "Owner",
    digest: shareHash({ workId, userId, owner: true, sessionVersion: user.sessionVersion }) };
  const membership = (await client.query<{ userId: string; role: string; status: string; invitationId: string; updatedAt: string }>(
    'SELECT "userId",role,status,"invitationId","updatedAt"::text AS "updatedAt" FROM creator_work_collaborator WHERE "workId"=$1 AND "userId"=$2 FOR SHARE',
    [workId, userId])).rows[0];
  const access = resolveCreatorCollaborationAccess({ actorUserId: userId, ownerUserId: work.ownerId, membership });
  if (!membership || membership.status !== "active" || !access.view) return null;
  return { userId, displayName: user.name?.trim() || userId,
    digest: shareHash({ workId, userId, sessionVersion: user.sessionVersion, invitationId: membership.invitationId,
      role: membership.role, status: membership.status, updatedAt: membership.updatedAt }) };
}
async function accessFor(client: PoolClient, actor: string, row: DeliveryRow): Promise<DeliveryAccess> {
  const manager = await isManager(client, actor, row.workId);
  const recipient = actor === row.recipientUserId;
  const binding = recipient ? await recipientBinding(client, row.workId, actor) : null;
  return { manager, recipient, currentRecipient: recipient && binding?.digest === row.recipientBindingHash };
}
async function readRow(client: PoolClient, workId: string, deliveryId: string, lock: "share" | "update" = "share"): Promise<DeliveryRow> {
  const row = (await client.query<DeliveryRow>(`SELECT id,"workId","reviewId","createdBy","recipientUserId","operationId","requestHash",source,"sourceHash",profile,"profileHash",rights,manifest,"manifestHash","recipientBindingHash",state,version,"archiveSha256","archiveByteLength","createdAt","updatedAt","issuedAt","deliveredAt","acceptedAt","cancelledAt" FROM studio_review_delivery WHERE id=$1 AND "workId"=$2 FOR ${lock === "update" ? "UPDATE" : "SHARE"}`, [deliveryId, workId])).rows[0];
  if (!row) throw new NotFoundException({ code: "studio_review_delivery_not_found" });
  return row;
}
async function view(client: PoolClient, actor: string, row: DeliveryRow): Promise<ReviewDeliveryJob> {
  const parsed = parseRow(row), access = await accessFor(client, actor, row);
  if (!access.manager && !access.recipient) throw new ForbiddenException({ code: "studio_review_delivery_forbidden" });
  const recipient = await client.query<{ name: string | null }>('SELECT name FROM "user" WHERE id=$1', [row.recipientUserId]);
  const active = row.state !== "cancelled";
  return reviewDeliveryJobSchema.parse({ contract: "studio-review-delivery-job-v1", id: row.id, workId: row.workId,
    subject: parsed.source.subject, title: parsed.manifest.title, sourceDigest: row.sourceHash,
    profile: parsed.profile, profileDigest: row.profileHash, rights: parsed.rights,
    manifest: parsed.manifest, manifestDigest: row.manifestHash,
    recipient: { userId: row.recipientUserId, displayName: recipient.rows[0]?.name?.trim() || row.recipientUserId },
    state: row.state, version: row.version, createdBy: row.createdBy, createdAt: row.createdAt.toISOString(),
    issuedAt: at(row.issuedAt), deliveredAt: at(row.deliveredAt), acceptedAt: at(row.acceptedAt), cancelledAt: at(row.cancelledAt),
    archiveSha256: row.archiveSha256, archiveByteLength: row.archiveByteLength,
    currentRecipientBinding: access.currentRecipient,
    canIssue: access.manager && row.state === "prepared", canDownload: active && (access.manager || (access.currentRecipient && ["issued","delivered","accepted"].includes(row.state))),
    canAccept: access.currentRecipient && row.state === "delivered", canCancel: access.manager && ["prepared","issued","delivered"].includes(row.state) });
}
async function replayEvent(client: PoolClient, actor: string, deliveryId: string, operationId: string, request: unknown): Promise<boolean> {
  const prior = (await client.query<EventRow>('SELECT "deliveryId","requestHash",response FROM studio_review_delivery_event WHERE "actorUserId"=$1 AND "operationId"=$2', [actor, operationId])).rows[0];
  if (!prior) return false;
  if (prior.deliveryId !== deliveryId || prior.requestHash !== requestHash(request)) {
    throw new ConflictException({ code: "studio_review_delivery_operation_conflict" });
  }
  return true;
}
async function saveEvent(client: PoolClient, deliveryId: string, actor: string, operationId: string, action: string, request: unknown, response: unknown, createdAt: Date): Promise<void> {
  await client.query('INSERT INTO studio_review_delivery_event("deliveryId","actorUserId","operationId","requestHash",action,response,"createdAt") VALUES($1,$2,$3,$4,$5,$6::jsonb,$7)',
    [deliveryId, actor, operationId, requestHash(request), action, JSON.stringify(response), createdAt]);
}

@Injectable()
export class StudioReviewDeliveryRepository {
  constructor(@Inject(STUDIO_REVIEW_DELIVERY_POOL) private readonly pool: Pool) {}

  async list(actor: string, workId: string) {
    return transaction(this.pool, async (client) => {
      const manager = await isManager(client, actor, workId);
      const rows = (await client.query<DeliveryRow>(`SELECT id,"workId","reviewId","createdBy","recipientUserId","operationId","requestHash",source,"sourceHash",profile,"profileHash",rights,manifest,"manifestHash","recipientBindingHash",state,version,"archiveSha256","archiveByteLength","createdAt","updatedAt","issuedAt","deliveredAt","acceptedAt","cancelledAt" FROM studio_review_delivery WHERE "workId"=$1 AND ($2::boolean OR "recipientUserId"=$3) ORDER BY "createdAt" DESC,id LIMIT 100`, [workId, manager, actor])).rows;
      if (!manager && rows.length === 0) throw new ForbiddenException({ code: "studio_review_delivery_forbidden" });
      const recipients: { userId: string; displayName: string }[] = [];
      if (manager) {
        const ids = (await client.query<{ id: string }>(`SELECT "userId" AS id FROM creator_work WHERE id=$1 UNION SELECT "userId" AS id FROM creator_work_collaborator WHERE "workId"=$1 AND status='active' ORDER BY id LIMIT 1001`, [workId])).rows;
        if (ids.length > 1000) throw new ConflictException({ code: "studio_review_delivery_recipient_limit" });
        for (const candidate of ids) { const binding = await recipientBinding(client, workId, candidate.id); if (binding && candidate.id !== actor) recipients.push({ userId: binding.userId, displayName: binding.displayName }); }
      }
      const policy = resolveOperationPolicy(await loadOperationPolicy(client), runtimeLicenseFingerprint(), new Date());
      return { items: await Promise.all(rows.map((row) => view(client, actor, row))), recipients, canPrepare: manager, mode: policy.mode };
    });
  }

  async prepare(actor: string, workId: string, inputValue: ReviewDeliveryPrepare): Promise<ReviewDeliveryJob> {
    const input = reviewDeliveryPrepareSchema.parse(inputValue);
    return transaction(this.pool, async (client) => {
      await lockOperation(client, actor, input.operationId);
      const existing = (await client.query<DeliveryRow>('SELECT id,"workId","reviewId","createdBy","recipientUserId","operationId","requestHash",source,"sourceHash",profile,"profileHash",rights,manifest,"manifestHash","recipientBindingHash",state,version,"archiveSha256","archiveByteLength","createdAt","updatedAt","issuedAt","deliveredAt","acceptedAt","cancelledAt" FROM studio_review_delivery WHERE "createdBy"=$1 AND "operationId"=$2 FOR SHARE', [actor, input.operationId])).rows[0];
      if (existing) {
        if (existing.requestHash !== requestHash(input)) throw new ConflictException({ code: "studio_review_delivery_operation_conflict" });
        return view(client, actor, existing);
      }
      await requireShareManager(client, actor, workId);
      if (input.subject.workId !== workId || input.recipientUserId === actor) throw new ConflictException({ code: "studio_review_delivery_scope_invalid" });
      const effective = resolveOperationPolicy(await loadOperationPolicy(client, "share"), runtimeLicenseFingerprint(), new Date());
      if (input.rights.mode !== effective.mode) throw new ConflictException({ code: "studio_review_delivery_mode_changed", mode: effective.mode });
      const recipient = await recipientBinding(client, workId, input.recipientUserId);
      if (!recipient) throw new ConflictException({ code: "studio_review_delivery_recipient_unavailable" });
      const expectedRightsDigest = deliveryHash({ subject: input.subject, recipient: input.recipientUserId,
        mode: effective.mode, statement: input.rights.statement, profile: input.profile });
      if (input.rights.rightsGraphDigest !== expectedRightsDigest) {
        throw new ConflictException({ code: "studio_review_delivery_rights_digest_invalid" });
      }
      const capture = await pinnedShareCapture(client, input.subject);
      if (!capture.approvalDigest || !capture.decidedAt || capture.rasters.length > 100) throw new ConflictException({ code: "studio_review_delivery_approval_required" });
      const ordinals = capture.rasters.map((_, index) => index);
      const images = await pinnedShareImages(client, input.subject, capture, ordinals);
      const source = reviewDeliverySourceSchema.parse({ subject: input.subject, approvalDigest: capture.approvalDigest,
        decidedAt: capture.decidedAt, pages: images.pages });
      const createdAt = await timestamp(client);
      const manifest = createReviewDeliveryManifest({ id: input.id, title: input.title, preparedAt: createdAt.toISOString(), source, sourceDigest: deliveryHash(source), profile: input.profile, rights: input.rights });
      const hashes = { request: requestHash(input), source: deliveryHash(source), profile: deliveryHash(input.profile), manifest: deliveryHash(manifest) };
      await client.query(`INSERT INTO studio_review_delivery(id,"workId","reviewId","createdBy","recipientUserId","operationId","requestHash",source,"sourceHash",profile,"profileHash",rights,manifest,"manifestHash","recipientBindingHash",state,version,"createdAt","updatedAt") VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10::jsonb,$11,$12::jsonb,$13::jsonb,$14,$15,'prepared',0,$16,$16)`,
        [input.id, workId, input.subject.reviewId, actor, input.recipientUserId, input.operationId, hashes.request,
          JSON.stringify(source), hashes.source, JSON.stringify(input.profile), hashes.profile, JSON.stringify(input.rights), JSON.stringify(manifest), hashes.manifest, recipient.digest, createdAt]);
      await saveEvent(client, input.id, actor, input.operationId, "prepare", input, { state: "prepared", version: 0, manifestDigest: hashes.manifest }, createdAt);
      return view(client, actor, await readRow(client, workId, input.id));
    });
  }

  private async assertCurrentSource(client: PoolClient, row: DeliveryRow): Promise<{ pages: ReviewDeliverySource["pages"]; objects: LocatedPrivateObjectReference[] }> {
    const stored = reviewDeliverySourceSchema.parse(row.source), capture = await pinnedShareCapture(client, stored.subject);
    if (!capture.approvalDigest || !capture.decidedAt || capture.approvalDigest !== stored.approvalDigest || capture.decidedAt !== stored.decidedAt) {
      throw new ConflictException({ code: "studio_review_delivery_source_changed" });
    }
    const images = await pinnedShareImages(client, stored.subject, capture, stored.pages.map((page) => page.ordinal));
    if (canonicalJson(images.pages) !== canonicalJson(stored.pages) || deliveryHash(stored) !== row.sourceHash) {
      throw new ConflictException({ code: "studio_review_delivery_source_changed" });
    }
    return { pages: images.pages, objects: images.objects };
  }

  async issue(actor: string, workId: string, deliveryId: string, inputValue: ReviewDeliveryAction): Promise<ReviewDeliveryJob> {
    const input = reviewDeliveryActionSchema.parse(inputValue);
    return transaction(this.pool, async (client) => {
      await lockOperation(client, actor, input.operationId);
      if (await replayEvent(client, actor, deliveryId, input.operationId, input)) return view(client, actor, await readRow(client, workId, deliveryId));
      const row = await readRow(client, workId, deliveryId, "update"); await requireShareManager(client, actor, workId);
      if (row.state !== "prepared" || row.version !== input.expectedVersion || row.manifestHash !== input.manifestDigest) throw new ConflictException({ code: "studio_review_delivery_conflict" });
      const parsed = parseRow(row);
      const currentMode = resolveOperationPolicy(await loadOperationPolicy(client, "share"), runtimeLicenseFingerprint(), new Date()).mode;
      if (parsed.rights.mode !== currentMode) throw new ConflictException({ code: "studio_review_delivery_mode_changed", mode: currentMode });
      await this.assertCurrentSource(client, row); const now = await timestamp(client);
      const updated = (await client.query<DeliveryRow>("UPDATE studio_review_delivery SET state='issued',version=version+1,\"issuedAt\"=$2,\"updatedAt\"=$2 WHERE id=$1 RETURNING *", [row.id, now])).rows[0]!;
      await saveEvent(client, row.id, actor, input.operationId, "issue", input, { state: updated.state, version: updated.version }, now);
      return view(client, actor, updated);
    });
  }

  async cancel(actor: string, workId: string, deliveryId: string, inputValue: ReviewDeliveryAction): Promise<ReviewDeliveryJob> {
    const input = reviewDeliveryActionSchema.parse(inputValue);
    return transaction(this.pool, async (client) => {
      await lockOperation(client, actor, input.operationId);
      if (await replayEvent(client, actor, deliveryId, input.operationId, input)) return view(client, actor, await readRow(client, workId, deliveryId));
      const row = await readRow(client, workId, deliveryId, "update"); await requireShareManager(client, actor, workId);
      if (!["prepared","issued","delivered"].includes(row.state) || row.version !== input.expectedVersion || row.manifestHash !== input.manifestDigest) throw new ConflictException({ code: "studio_review_delivery_conflict" });
      const now = await timestamp(client);
      const updated = (await client.query<DeliveryRow>("UPDATE studio_review_delivery SET state='cancelled',version=version+1,\"cancelledAt\"=$2,\"updatedAt\"=$2 WHERE id=$1 RETURNING *", [row.id, now])).rows[0]!;
      await saveEvent(client, row.id, actor, input.operationId, "cancel", input, { state: updated.state, version: updated.version }, now);
      return view(client, actor, updated);
    });
  }

  async accept(actor: string, workId: string, deliveryId: string, inputValue: ReviewDeliveryAccept): Promise<ReviewDeliveryJob> {
    const input = reviewDeliveryAcceptSchema.parse(inputValue);
    return transaction(this.pool, async (client) => {
      await lockOperation(client, actor, input.operationId);
      if (await replayEvent(client, actor, deliveryId, input.operationId, input)) return view(client, actor, await readRow(client, workId, deliveryId));
      const row = await readRow(client, workId, deliveryId, "update"); const access = await accessFor(client, actor, row);
      if (!access.currentRecipient || row.state !== "delivered" || row.version !== input.expectedVersion || row.manifestHash !== input.manifestDigest) throw new ConflictException({ code: "studio_review_delivery_conflict" });
      await this.assertCurrentSource(client, row); const now = await timestamp(client);
      const updated = (await client.query<DeliveryRow>("UPDATE studio_review_delivery SET state='accepted',version=version+1,\"acceptedAt\"=$2,\"updatedAt\"=$2 WHERE id=$1 RETURNING *", [row.id, now])).rows[0]!;
      await saveEvent(client, row.id, actor, input.operationId, "accept", input, { state: updated.state, version: updated.version }, now);
      return view(client, actor, updated);
    });
  }

  async downloadSource(actor: string, workId: string, deliveryId: string, inputValue: ReviewDeliveryAction): Promise<ReviewDeliveryDownloadSource> {
    const input = reviewDeliveryActionSchema.parse(inputValue);
    return transaction(this.pool, async (client) => {
      const row = await readRow(client, workId, deliveryId); const access = await accessFor(client, actor, row);
      if (row.version !== input.expectedVersion || row.manifestHash !== input.manifestDigest || row.state === "cancelled"
        || (!access.manager && !(access.currentRecipient && ["issued","delivered","accepted"].includes(row.state)))) {
        throw new ConflictException({ code: "studio_review_delivery_conflict" });
      }
      const source = await this.assertCurrentSource(client, row);
      return { row, pages: source.pages, objects: source.objects, actorIsRecipient: access.currentRecipient };
    });
  }

  async confirmDownload(actor: string, workId: string, deliveryId: string, inputValue: ReviewDeliveryAction,
    archive: { readonly sha256: string; readonly byteLength: number }): Promise<ReviewDeliveryJob> {
    const input = reviewDeliveryActionSchema.parse(inputValue);
    return transaction(this.pool, async (client) => {
      await lockOperation(client, actor, input.operationId);
      if (await replayEvent(client, actor, deliveryId, input.operationId, input)) return view(client, actor, await readRow(client, workId, deliveryId));
      let row = await readRow(client, workId, deliveryId, "update"); const access = await accessFor(client, actor, row);
      if (row.version !== input.expectedVersion || row.manifestHash !== input.manifestDigest || row.state === "cancelled"
        || (!access.manager && !(access.currentRecipient && ["issued","delivered","accepted"].includes(row.state)))) throw new ConflictException({ code: "studio_review_delivery_conflict" });
      await this.assertCurrentSource(client, row); const now = await timestamp(client);
      if (row.archiveSha256 === null) {
        row = (await client.query<DeliveryRow>('UPDATE studio_review_delivery SET "archiveSha256"=$2,"archiveByteLength"=$3,"updatedAt"=$4 WHERE id=$1 RETURNING *', [row.id, archive.sha256, archive.byteLength, now])).rows[0]!;
      } else if (row.archiveSha256 !== archive.sha256 || row.archiveByteLength !== archive.byteLength) {
        throw new ConflictException({ code: "studio_review_delivery_archive_changed" });
      }
      if (access.currentRecipient && row.state === "issued") {
        row = (await client.query<DeliveryRow>("UPDATE studio_review_delivery SET state='delivered',version=version+1,\"deliveredAt\"=$2,\"updatedAt\"=$2 WHERE id=$1 RETURNING *", [row.id, now])).rows[0]!;
      }
      await saveEvent(client, row.id, actor, input.operationId, "download", input, { state: row.state, version: row.version,
        archiveSha256: archive.sha256, archiveByteLength: archive.byteLength }, now);
      return view(client, actor, row);
    });
  }
}
