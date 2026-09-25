import { createHash } from "node:crypto";
import { ConflictException, ForbiddenException, HttpException, Inject, Injectable, NotFoundException, Optional, ServiceUnavailableException } from "@nestjs/common";
import { canonicalJson } from "@toonspectrum/studio-project-model";
import { reviewDeliveryManifestSchema, type ReviewDeliveryAction, type ReviewDeliveryAccept, type ReviewDeliveryPrepare } from "@toonspectrum/studio-project-model/review-delivery";

import { PrivateSignedReadUrlSchema, type LocatedPrivateObjectReference } from "../../../platform/private-object-storage/private-object-storage.contract";
import { PRIVATE_OBJECT_STORAGE_PORT, type PrivateObjectStoragePort } from "../../../platform/private-object-storage/private-object-storage.port";
import { PinnedShareError } from "../pinned-share/pinned-share-storage";
import { StudioReviewDeliveryRepository } from "./review-delivery.repository";
import { buildReviewDeliveryZip } from "./review-delivery-zip";

export const REVIEW_DELIVERY_FETCH = Symbol("REVIEW_DELIVERY_FETCH");
const TOTAL_BYTES = 128 * 1024 * 1024;
function unavailable(): never { throw new ServiceUnavailableException({ code: "studio_review_delivery_unavailable" }); }
async function readObject(storage: PrivateObjectStoragePort, fetcher: typeof fetch, object: LocatedPrivateObjectReference,
  expected: { readonly sha256: string; readonly byteLength: number; readonly mediaType: string }, signal?: AbortSignal): Promise<Buffer> {
  const signed = PrivateSignedReadUrlSchema.parse(await storage.createSignedReadUrl({ object, expiresInSeconds: 30 }, { signal }));
  const url = new URL(signed.url), now = Date.now();
  if (url.protocol !== "https:" || url.username || url.password || url.hash || signed.url.length > 8_192
    || signed.expiresAtEpochMs <= now || signed.expiresAtEpochMs > now + 30_000) return unavailable();
  const timeout = AbortSignal.timeout(15_000), requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const response = await fetcher(signed.url, { signal: requestSignal, redirect: "error", credentials: "omit", cache: "no-store" });
  const mime = response.headers.get("content-type")?.split(";", 1)[0]?.trim(), length = response.headers.get("content-length");
  if (response.status !== 200 || !response.body || mime !== expected.mediaType
    || (length !== null && (!/^[0-9]+$/u.test(length) || Number(length) !== expected.byteLength))) {
    await response.body?.cancel(); return unavailable();
  }
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let received = 0;
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      received += next.value.byteLength;
      if (received > expected.byteLength || received > TOTAL_BYTES) return unavailable();
      chunks.push(next.value);
    }
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
  if (received !== expected.byteLength || requestSignal.aborted) return unavailable();
  const bytes = Buffer.concat(chunks);
  if (createHash("sha256").update(bytes).digest("hex") !== expected.sha256) return unavailable();
  return bytes;
}

@Injectable()
export class StudioReviewDeliveryService {
  constructor(
    @Inject(StudioReviewDeliveryRepository) readonly repository: StudioReviewDeliveryRepository,
    @Optional() @Inject(PRIVATE_OBJECT_STORAGE_PORT) private readonly storage?: PrivateObjectStoragePort,
    @Optional() @Inject(REVIEW_DELIVERY_FETCH) private readonly fetcher: typeof fetch = globalThis.fetch,
  ) {}
  async run<T>(action: () => Promise<T>): Promise<T> {
    try { return await action(); } catch (error) {
      if (error instanceof HttpException) throw error;
      if (error instanceof PinnedShareError) {
        if (error.code === "forbidden") throw new ForbiddenException({ code: "studio_review_delivery_forbidden" });
        if (error.code === "not-found") throw new NotFoundException({ code: "studio_review_delivery_not_found" });
        if (["invalid-source", "conflict", "expired", "revoked"].includes(error.code)) throw new ConflictException({ code: "studio_review_delivery_source_changed" });
      }
      throw new ServiceUnavailableException({ code: "studio_review_delivery_unavailable" });
    }
  }
  list(actor: string, workId: string) { return this.repository.list(actor, workId); }
  prepare(actor: string, workId: string, input: ReviewDeliveryPrepare) { return this.repository.prepare(actor, workId, input); }
  issue(actor: string, workId: string, id: string, input: ReviewDeliveryAction) { return this.repository.issue(actor, workId, id, input); }
  cancel(actor: string, workId: string, id: string, input: ReviewDeliveryAction) { return this.repository.cancel(actor, workId, id, input); }
  accept(actor: string, workId: string, id: string, input: ReviewDeliveryAccept) { return this.repository.accept(actor, workId, id, input); }
  async download(actor: string, workId: string, id: string, input: ReviewDeliveryAction, signal?: AbortSignal) {
    const source = await this.repository.downloadSource(actor, workId, id, input);
    if (!this.storage || (await this.storage.verifyPrivatePurposeBuckets({ signal }, ["derived"])).ready !== true) return unavailable();
    const parsedManifest = reviewDeliveryManifestSchema.safeParse(source.row.manifest);
    if (!parsedManifest.success) return unavailable();
    const manifest = parsedManifest.data;
    if (source.pages.length !== source.objects.length || source.pages.length !== manifest.pages.length) return unavailable();
    const pageBytes: Buffer[] = []; let total = 0;
    for (let index = 0; index < source.pages.length; index += 1) {
      signal?.throwIfAborted(); const page = source.pages[index]!, object = source.objects[index]!;
      const bytes = await readObject(this.storage, this.fetcher, object, page, signal); total += bytes.length;
      if (total > TOTAL_BYTES) return unavailable(); pageBytes.push(bytes);
    }
    const entries = [
      { path: "manifest.json", bytes: Buffer.from(`${canonicalJson(manifest)}\n`, "utf8") },
      { path: "README.txt", bytes: Buffer.from("ToonStudio approved review delivery\nOriginal approved review image bytes with SHA-256 checksums.\nThis receipt is not publication, editable source, DRM, or legal certification.\n", "utf8") },
      ...source.pages.map((page, index) => ({ path: manifest.pages[index].path as string, bytes: pageBytes[index]! })),
    ];
    const archive = buildReviewDeliveryZip(entries);
    const job = await this.repository.confirmDownload(actor, workId, id, input, { sha256: archive.sha256, byteLength: archive.bytes.length });
    return { bytes: archive.bytes, job, fileName: `toonstudio-approved-delivery-${id}.zip` };
  }
}
