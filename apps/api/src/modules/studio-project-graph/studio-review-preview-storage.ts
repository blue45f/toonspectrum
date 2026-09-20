import { canonicalJson } from "@toonspectrum/studio-project-model";
import type { PoolClient } from "pg";
import { LocatedPrivateObjectReferenceSchema, type LocatedPrivateObjectReference } from "../../infrastructure/private-object-storage/private-object-storage.contract";

/** Same object-row lock as generated-object deletion, acquired in hash order by batch callers. */
export async function lockStudioReviewPreviewStorage(
  client: PoolClient, workId: string, hash: string,
  expected?: { readonly object?: LocatedPrivateObjectReference; readonly sourceAssetId: string; readonly referenceId: string },
): Promise<LocatedPrivateObjectReference> {
  const result = await client.query<Record<string, unknown>>(
    `SELECT "contractVersion", "providerId", purpose, digest, "objectPath", "byteLength", "contentType", state, "deleteToken"
     FROM creator_asset_storage_object WHERE purpose = 'derived' AND digest = $1 FOR UPDATE`, [`sha256:${hash}`]);
  const row = result.rows[0];
  if (!row || row.state !== "active" || row.deleteToken !== null) throw new Error("preview-storage-unavailable");
  const { state: _state, deleteToken: _deleteToken, ...metadata } = row;
  const object = LocatedPrivateObjectReferenceSchema.parse({ ...metadata, byteLength: Number(metadata.byteLength) });
  if (object.digest !== `sha256:${hash}` || object.objectPath !== `sha256/${hash.slice(0, 2)}/${hash}`
    || !["image/png", "image/jpeg", "image/webp"].includes(object.contentType)
    || (expected?.object && canonicalJson(object) !== canonicalJson(expected.object))) throw new Error("preview-storage-mismatch");
  const owned = await client.query(
    `SELECT 1 FROM creator_work_asset_storage_reference reference
     JOIN creator_work_asset asset ON asset."workId" = reference."workId" AND asset."assetId" = reference."sourceAssetId"
     WHERE reference."workId" = $1 AND reference.purpose = 'derived' AND reference."objectDigest" = $2
       AND reference.state = 'active' AND reference."deleteToken" IS NULL
       AND ($3::text IS NULL OR reference."sourceAssetId" = $3)
       AND ($4::text IS NULL OR reference."referenceId" = $4) LIMIT 1`,
    [workId, object.digest, expected?.sourceAssetId ?? null, expected?.referenceId ?? null]);
  if (owned.rows.length !== 1) throw new Error("preview-storage-unowned");
  return object;
}
