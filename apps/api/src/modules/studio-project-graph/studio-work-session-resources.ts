import { z } from "zod";
import type { PoolClient } from "pg";
import { canonicalJson, validateStudioReviewSpatialAnchor, type StudioReviewSourceReference } from "@toonspectrum/studio-project-model";
import { studioSessionResourcesSchema, type StudioSessionResources, type StudioSessionMaterialAsset, type StudioWorkSession,
  type StudioWorkSessionCommand } from "@toonspectrum/studio-project-model/work-session";

import { loadStudioReviewResolutionCaptures } from "./studio-review-capture-attestation";
import { studioReviewMappingsFromOperation, studioReviewPageRasterSchema } from "./studio-review-source-map";

type Failure = (code: "invalid-target" | "unavailable") => never;
const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown> : null;

/** Only the exact saved capture supplies agenda identities. Never use current work.doc. */
async function capturedSource(client: PoolClient, session: StudioWorkSession) {
  const { input } = session;
  const proven = await loadStudioReviewResolutionCaptures(client, input.artifactId, [input.reviewId]);
  if (proven.length !== 1 || !proven[0] || canonicalJson(proven[0].subject) !== canonicalJson(input)) return null;
  const result = await client.query<{ operation: unknown; receipt: unknown }>(
    `SELECT operation.operation, to_jsonb(receipt) AS receipt FROM studio_operation operation
     JOIN studio_mutation_receipt receipt ON receipt."artifactId"=operation."artifactId"
       AND receipt."resultRevisionId"=operation."resultRevisionId"
       AND receipt."actorUserId"=operation."actorUserId" AND receipt.response->>'status'='completed'
       AND receipt.response->'subject'->>'reviewId'=$3
     WHERE operation."artifactId"=$1 AND operation."resultRevisionId"=$2
       AND operation."commandType"='review.snapshot-create' LIMIT 2`, [input.artifactId, input.revisionId, input.reviewId]);
  if (result.rows.length !== 1) return null;
  const row = result.rows[0]!;
  const rasters = z.array(studioReviewPageRasterSchema).min(1).max(100_000)
    .safeParse(record(record(row.operation)?.payload)?.pageRasters);
  return rasters.success ? { ...row, rasters: rasters.data } : null;
}

export async function verifyStudioSessionAgendaSource(client: PoolClient, session: StudioWorkSession,
  source: StudioReviewSourceReference, fail: Failure): Promise<void> {
  const capture = await capturedSource(client, session);
  if (!capture) return fail("invalid-target");
  const raster = capture.rasters.find((item) => item.ordinal === source.pageOrdinal);
  if (!raster) return fail("invalid-target");
  const mapping = studioReviewMappingsFromOperation(capture.operation, session.input,
    [{ ordinal: raster.ordinal, hash: raster.sha256 }], capture.receipt)[source.pageOrdinal];
  const anchor = { kind: source.frameId ? "panel" : source.elementId ? "object" : "page", source,
    ...(source.elementId ? { objectId: source.elementId } : {}) };
  if (!mapping || !validateStudioReviewSpatialAnchor(mapping, anchor)) return fail("invalid-target");
}

export async function verifyStudioSessionMaterial(client: PoolClient, workId: string, asset: StudioSessionMaterialAsset, fail: Failure): Promise<void> {
  const result = await client.query<{ sha256: string; elementType: string }>(
    'SELECT sha256,"elementType" FROM creator_work_asset WHERE "workId"=$1 AND "assetId"=$2 FOR SHARE', [workId, asset.assetId]);
  if (result.rows.length !== 1 || result.rows[0]!.sha256 !== asset.sha256 || result.rows[0]!.elementType !== asset.elementType) return fail("invalid-target");
}

export async function readStudioSessionResources(client: PoolClient, session: StudioWorkSession, offset: number): Promise<StudioSessionResources> {
  const capture = await capturedSource(client, session);
  const pageRasters = capture?.rasters.slice(offset, offset + 25) ?? [];
  const mappings = capture ? studioReviewMappingsFromOperation(capture.operation, session.input,
    pageRasters.map((item) => ({ ordinal: item.ordinal, hash: item.sha256 })), capture.receipt) : {};
  const pages: StudioSessionResources["pages"] = [];
  for (const raster of pageRasters) {
    const mapping = mappings[raster.ordinal];
    if (!mapping || mapping.status !== "mapped" || mapping.page.frames.length > 1000) continue;
    const previous = capture?.rasters[raster.ordinal - 1];
    pages.push({ source: { version: 1, sourceServerRevision: mapping.sourceServerRevision,
      sourceContentDigest: mapping.sourceContentDigest, pageOrdinal: mapping.page.ordinal, pageId: mapping.page.id },
      title: `Page ${raster.ordinal + 1}`, frameIds: mapping.page.frames.map((frame) => frame.id),
      previewCursor: previous ? `${previous.ordinal}.${previous.sha256}` : null });
  }
  const assets = (await client.query<{ assetId: string; elementType: string; sha256: string; title: string }>(
    `SELECT "assetId","elementType",sha256,
      LEFT(COALESCE(NULLIF(BTRIM(descriptor->'element'->>'name'),''),"assetId"),160) AS title
     FROM creator_work_asset WHERE "workId"=$1 ORDER BY "createdAt","assetId" LIMIT 250`, [session.workId])).rows;
  return studioSessionResourcesSchema.parse({ workId: session.workId, sessionId: session.id,
    inputDigest: session.input.rootGraphHash, expiresAt: new Date(Date.now() + 15_000).toISOString(),
    sourceStatus: capture ? "mapped" : "unavailable", pages,
    nextPageOffset: capture && offset + 25 < capture.rasters.length ? offset + 25 : null, assets });
}

/** ACL is already locked by the caller. Votes and selections recheck the bytes. */
export async function verifyStudioSessionWorkflowTarget(client: PoolClient, current: StudioWorkSession,
  command: StudioWorkSessionCommand, fail: Failure): Promise<void> {
  if (command.action === "agenda-add") await verifyStudioSessionAgendaSource(client, current, command.item.source, fail);
  if (command.action === "material-propose") await verifyStudioSessionMaterial(client, current.workId, command.candidate.asset, fail);
  if ((command.action === "material-vote" || command.action === "material-decide") && command.candidateId) {
    const candidate = current.workflow?.materialCandidates.find((item) => item.id === command.candidateId);
    if (!candidate) return fail("invalid-target");
    await verifyStudioSessionMaterial(client, current.workId, candidate.asset, fail);
  }
  const assigned = command.action === "agenda-add" ? command.item.assignedUserId
    : command.action === "agenda-edit" ? command.assignedUserId
      : command.action === "agenda-focus" ? current.workflow?.agenda.find((item) => item.id === command.itemId)?.assignedUserId
        : command.action === "reader" ? command.userId : null;
  if (assigned) {
    const found = await client.query(`SELECT u.id FROM "user" u JOIN creator_work work ON work.id=$1
      LEFT JOIN creator_work_collaborator member ON member."workId"=work.id AND member."userId"=u.id
      WHERE u.id=$2 AND u.status='active' AND (work."userId"=u.id OR member.status='active') FOR SHARE OF u,work`, [current.workId, assigned]);
    if (found.rows.length !== 1) return fail("invalid-target");
  }
}
