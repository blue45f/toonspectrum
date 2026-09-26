import { randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { z } from "zod";
import type { PoolClient } from "pg";
import { canonicalJson } from "@toonspectrum/studio-project-model";
import { pinnedShareAccessSchema, pinnedShareCreateSchema, pinnedShareCreatedSchema, pinnedShareFeedbackInputSchema,
  pinnedShareFeedbackSchema, pinnedShareOwnerViewSchema, pinnedShareSnapshotSchema, pinnedShareSourcesSchema, pinnedShareViewSchema,
  pinnedSharePublicListSchema, type PinnedShareAccess, type PinnedShareCreate, type PinnedShareFeedbackInput, type PinnedShareOwnerView,
  type PinnedShareSnapshot } from "@toonspectrum/studio-project-model/pinned-review-share";

import { dbPool } from "../../../platform/database";
import { PinnedShareError, failShare, pinnedShareCapture, pinnedShareImages, requireShareManager, shareHash, tokenHash } from "./pinned-share-storage";

async function transact<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await dbPool.connect();
  try { await client.query("BEGIN"); const result = await run(client); await client.query("COMMIT"); return result; }
  catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
type Row = { id: string; workId: string; reviewId: string; createdBy: string; operationId: string; requestHash: string;
  tokenHash: string; snapshot: unknown; snapshotHash: string; createdAt: Date; expiresAt: Date; revokedAt: Date | null };
function readSnapshot(row: Row): PinnedShareSnapshot {
  const parsed = pinnedShareSnapshotSchema.safeParse(row.snapshot);
  if (!parsed.success) return failShare("unavailable");
  const value = parsed.data;
  if (shareHash(value) !== row.snapshotHash || shareHash(value.input) !== row.requestHash
    || value.createdBy !== row.createdBy || value.input.id !== row.id || value.input.operationId !== row.operationId
    || value.input.subject.workId !== row.workId || value.input.subject.reviewId !== row.reviewId
    || value.createdAt !== row.createdAt.toISOString() || value.expiresAt !== row.expiresAt.toISOString()) return failShare("unavailable");
  return value;
}
async function feedback(client: PoolClient, shareId: string) {
  const rows = (await client.query<{ content: unknown; createdAt: Date; requestHash: string; id: string }>(
    'SELECT content,"createdAt","requestHash",id FROM studio_pinned_review_feedback WHERE "shareId"=$1 ORDER BY "createdAt",id LIMIT 101', [shareId])).rows;
  if (rows.length > 100) return failShare("unavailable");
  return rows.map((row) => {
    const parsed = pinnedShareFeedbackInputSchema.safeParse(row.content);
    if (!parsed.success || parsed.data.id !== row.id || shareHash(parsed.data) !== row.requestHash) return failShare("unavailable");
    return pinnedShareFeedbackSchema.parse({ ...parsed.data, createdAt: row.createdAt.toISOString() });
  });
}
async function ownerView(client: PoolClient, row: Row): Promise<PinnedShareOwnerView> {
  const snapshot = readSnapshot(row);
  return pinnedShareOwnerViewSchema.parse({ id: row.id, input: snapshot.input, createdAt: snapshot.createdAt,
    expiresAt: snapshot.expiresAt, revokedAt: row.revokedAt?.toISOString() ?? null, feedback: await feedback(client, row.id) });
}
async function accessShare(client: PoolClient, raw: PinnedShareAccess, write = false) {
  const access = pinnedShareAccessSchema.parse(raw);
  const clause = "token" in access ? '"tokenHash"=$1' : "id=$1";
  const value = "token" in access ? tokenHash(access.token) : access.publicId;
  const hint = (await client.query<Pick<Row, "id" | "workId" | "createdBy">>(`SELECT id,"workId","createdBy" FROM studio_pinned_review_share WHERE ${clause}`, [value])).rows[0];
  if (!hint) return failShare("not-found");
  const managerDigest = await requireShareManager(client, hint.createdBy, hint.workId);
  const row = (await client.query<Row>(`SELECT * FROM studio_pinned_review_share WHERE ${clause} FOR ${write ? "UPDATE" : "SHARE"}`, [value])).rows[0];
  if (!row || row.id !== hint.id || row.workId !== hint.workId || row.createdBy !== hint.createdBy) return failShare("not-found");
  if (row.revokedAt) return failShare("revoked");
  if (row.expiresAt.getTime() <= Date.now()) return failShare("expired");
  const snapshot = readSnapshot(row);
  if (snapshot.managerDigest !== managerDigest) return failShare("revoked");
  if ("publicId" in access && snapshot.input.purpose !== "showcase") return failShare("not-found");
  const capture = await pinnedShareCapture(client, snapshot.input.subject);
  if (snapshot.input.purpose === "showcase" && (!capture.approvalDigest || capture.approvalDigest !== snapshot.approvalDigest)) return failShare("revoked");
  return { row, snapshot, capture };
}
@Injectable()
export class PinnedReviewShareRepository {
  sources(actor: string, input: PinnedShareCreate["subject"], offset: number) {
    return transact(async (client) => {
      await requireShareManager(client, actor, input.workId);
      const capture = await pinnedShareCapture(client, input);
      const ordinals = capture.rasters.slice(offset, offset + 32).map((page) => page.ordinal);
      const { pages } = await pinnedShareImages(client, input, capture, ordinals);
      return pinnedShareSourcesSchema.parse({ subject: input, pages, nextOffset: offset + 32 < capture.rasters.length ? offset + 32 : null,
        approved: capture.approvalDigest !== null, expiresAt: new Date(Date.now() + 15_000).toISOString() });
    });
  }
  create(actor: string, workId: string, raw: PinnedShareCreate) {
    const input = pinnedShareCreateSchema.parse(raw);
    if (input.subject.workId !== workId) return Promise.reject(new PinnedShareError("invalid-source"));
    return transact(async (client) => {
      const managerDigest = await requireShareManager(client, actor, workId, true);
      const previous = (await client.query<Row>('SELECT * FROM studio_pinned_review_share WHERE "createdBy"=$1 AND "operationId"=$2', [actor, input.operationId])).rows[0];
      if (previous) {
        if (previous.workId !== workId || previous.requestHash !== shareHash(input)) return failShare("conflict");
        return pinnedShareCreatedSchema.parse({ share: await ownerView(client, previous), token: null, replayed: true });
      }
      if ((await client.query('SELECT id FROM studio_pinned_review_share WHERE id=$1', [input.id])).rows.length) return failShare("conflict");
      const count = (await client.query<{ total: string; active: string }>(`SELECT COUNT(*)::text AS total,
        COUNT(*) FILTER (WHERE "revokedAt" IS NULL AND "expiresAt">now())::text AS active FROM studio_pinned_review_share WHERE "workId"=$1`, [workId])).rows[0]!;
      if (Number(count.total) >= 1000 || Number(count.active) >= 50) return failShare("quota");
      const capture = await pinnedShareCapture(client, input.subject);
      if (input.purpose === "showcase" && !capture.approvalDigest) return failShare("invalid-source");
      const { pages } = await pinnedShareImages(client, input.subject, capture, input.pageOrdinals);
      const createdAt = new Date(), expiresAt = new Date(createdAt.getTime() + input.expiresInHours * 3600_000);
      const snapshot = pinnedShareSnapshotSchema.parse({ contract: "studio-pinned-review-share-v1", input, pages, createdBy: actor,
        managerDigest, createdAt: createdAt.toISOString(), expiresAt: expiresAt.toISOString(), approvalDigest: input.purpose === "showcase" ? capture.approvalDigest : null });
      const token = randomBytes(32).toString("base64url");
      const row: Row = { id: input.id, workId, reviewId: input.subject.reviewId, createdBy: actor, operationId: input.operationId,
        requestHash: shareHash(input), tokenHash: tokenHash(token), snapshot, snapshotHash: shareHash(snapshot), createdAt, expiresAt, revokedAt: null };
      await client.query(`INSERT INTO studio_pinned_review_share (id,"workId","reviewId","createdBy","operationId","requestHash","tokenHash",snapshot,"snapshotHash","createdAt","expiresAt")
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11)`, [row.id, workId, row.reviewId, actor, row.operationId, row.requestHash, row.tokenHash, JSON.stringify(snapshot), row.snapshotHash, createdAt, expiresAt]);
      return pinnedShareCreatedSchema.parse({ share: await ownerView(client, row), token: input.purpose === "showcase" ? null : token, replayed: false });
    });
  }
  list(actor: string, workId: string, cursor: string | null) {
    return transact(async (client) => {
      await requireShareManager(client, actor, workId);
      const rows = (await client.query<Row>('SELECT * FROM studio_pinned_review_share WHERE "workId"=$1 AND ($2::text IS NULL OR id>$2) ORDER BY id LIMIT 26', [workId, cursor])).rows;
      const items: PinnedShareOwnerView[] = []; for (const row of rows.slice(0, 25)) items.push(await ownerView(client, row));
      return { items, nextCursor: rows.length > 25 ? rows[24]!.id : null };
    });
  }
  current(actor: string, workId: string, shareId: string) {
    return transact(async (client) => {
      await requireShareManager(client, actor, workId);
      const row = (await client.query<Row>('SELECT * FROM studio_pinned_review_share WHERE id=$1 AND "workId"=$2', [shareId, workId])).rows[0];
      if (!row) return failShare("not-found");
      return ownerView(client, row);
    });
  }
  revoke(actor: string, workId: string, shareId: string) {
    return transact(async (client) => {
      await requireShareManager(client, actor, workId, true);
      const row = (await client.query<Row>('SELECT * FROM studio_pinned_review_share WHERE id=$1 AND "workId"=$2 FOR UPDATE', [shareId, workId])).rows[0];
      if (!row) return failShare("not-found");
      if (!row.revokedAt) {
        const updated = await client.query<{ revokedAt: Date }>('UPDATE studio_pinned_review_share SET "revokedAt"=GREATEST(statement_timestamp(),"createdAt") WHERE id=$1 AND "revokedAt" IS NULL RETURNING "revokedAt"', [shareId]);
        row.revokedAt = updated.rows[0]!.revokedAt;
      }
      return ownerView(client, row);
    });
  }
  view(access: PinnedShareAccess) {
    return transact(async (client) => {
      const { row, snapshot } = await accessShare(client, access);
      return pinnedShareViewSchema.parse({ id: row.id, title: snapshot.input.title, instructions: snapshot.input.instructions,
        purpose: snapshot.input.purpose, role: snapshot.input.role, watermark: snapshot.input.watermark, rightsStatement: snapshot.input.rightsStatement,
        revisionFingerprint: snapshot.input.subject.rootGraphHash, expiresAt: snapshot.expiresAt,
        leaseExpiresAt: new Date(Math.min(row.expiresAt.getTime(), Date.now() + 15_000)).toISOString(),
        pages: snapshot.pages, feedback: snapshot.input.purpose === "showcase" ? [] : await feedback(client, row.id) });
    });
  }
  image(access: PinnedShareAccess, ordinal: number) {
    return transact(async (client) => {
      const { row, snapshot, capture } = await accessShare(client, access);
      const expected = snapshot.pages.find((page) => page.ordinal === ordinal);
      if (!expected) return failShare("forbidden");
      const { pages, objects } = await pinnedShareImages(client, snapshot.input.subject, capture, [ordinal]);
      if (canonicalJson(pages[0]) !== canonicalJson(expected)) return failShare("unavailable");
      return { shareId: row.id, page: expected, object: objects[0]!, expiresAt: row.expiresAt.getTime() };
    });
  }
  comment(access: PinnedShareAccess, raw: PinnedShareFeedbackInput) {
    const input = pinnedShareFeedbackInputSchema.parse(raw);
    return transact(async (client) => {
      const { row, snapshot } = await accessShare(client, access, true);
      if (snapshot.input.role !== "commenter" || snapshot.input.purpose === "showcase" || !snapshot.pages.some((page) => page.ordinal === input.pageOrdinal)) return failShare("forbidden");
      const previous = (await client.query<{ content: unknown; requestHash: string; createdAt: Date }>('SELECT content,"requestHash","createdAt" FROM studio_pinned_review_feedback WHERE "shareId"=$1 AND id=$2', [row.id, input.id])).rows[0];
      if (previous) {
        if (previous.requestHash !== shareHash(input) || canonicalJson(previous.content) !== canonicalJson(input)) return failShare("conflict");
        return pinnedShareFeedbackSchema.parse({ ...input, createdAt: previous.createdAt.toISOString() });
      }
      const count = (await client.query<{ total: string; recent: string }>(`SELECT COUNT(*)::text AS total,
        COUNT(*) FILTER (WHERE "createdAt">=statement_timestamp()-interval '1 minute')::text AS recent FROM studio_pinned_review_feedback WHERE "shareId"=$1`, [row.id])).rows[0]!;
      if (Number(count.total) >= 100 || Number(count.recent) >= 10) return failShare("quota");
      const createdAt = new Date();
      await client.query('INSERT INTO studio_pinned_review_feedback ("shareId",id,"requestHash",content,"createdAt") VALUES ($1,$2,$3,$4::jsonb,$5)', [row.id, input.id, shareHash(input), JSON.stringify(input), createdAt]);
      return pinnedShareFeedbackSchema.parse({ ...input, createdAt: createdAt.toISOString() });
    });
  }
  async publicList(cursor: string | null) {
    const rows = await transact(async (client) => (await client.query<{ id: string }>(`SELECT id FROM studio_pinned_review_share
      WHERE snapshot->'input'->>'purpose'='showcase' AND "revokedAt" IS NULL AND "expiresAt">now()
        AND ($1::text IS NULL OR id>$1) ORDER BY id LIMIT 11`, [cursor])).rows);
    const items: z.infer<typeof pinnedSharePublicListSchema>["items"] = [];
    for (const row of rows.slice(0, 10)) {
      try { const view = await this.view({ publicId: row.id }); items.push({ id: row.id, title: view.title, pageCount: view.pages.length, expiresAt: view.expiresAt }); }
      catch (error) {
        if (!(error instanceof PinnedShareError) || !["forbidden", "not-found", "expired", "revoked", "invalid-source"].includes(error.code)) throw error;
      }
    }
    return pinnedSharePublicListSchema.parse({ items, nextCursor: rows.length > 10 ? rows[9]!.id : null });
  }
}
