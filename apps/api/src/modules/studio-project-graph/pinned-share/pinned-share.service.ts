import { createHash } from "node:crypto";
import { BadRequestException, ConflictException, ForbiddenException, GoneException, HttpException, Inject, Injectable, NotFoundException, Optional, ServiceUnavailableException } from "@nestjs/common";
import { canonicalJson } from "@toonspectrum/studio-project-model";
import type { PinnedShareAccess, PinnedShareCreate } from "@toonspectrum/studio-project-model/pinned-review-share";

import { PRIVATE_OBJECT_STORAGE_PORT, type PrivateObjectStoragePort } from "../../../infrastructure/private-object-storage/private-object-storage.port";
import { PrivateSignedReadUrlSchema } from "../../../infrastructure/private-object-storage/private-object-storage.contract";
import { PinnedReviewShareRepository } from "./pinned-share.repository";
import { failShare, PinnedShareError } from "./pinned-share-storage";

export const PINNED_SHARE_FETCH = Symbol("PINNED_SHARE_FETCH");
@Injectable()
export class PinnedReviewShareService {
  constructor(@Inject(PinnedReviewShareRepository) readonly repository: PinnedReviewShareRepository,
    @Optional() @Inject(PRIVATE_OBJECT_STORAGE_PORT) private readonly storage?: PrivateObjectStoragePort,
    @Optional() @Inject(PINNED_SHARE_FETCH) private readonly fetcher: typeof fetch = globalThis.fetch) {}
  async run<T>(operation: () => Promise<T>): Promise<T> {
    try { return await operation(); } catch (error) {
      if (error instanceof HttpException) throw error;
      const code = error instanceof PinnedShareError ? error.code : "unavailable";
      const body = { code: `studio_pinned_share_${code}`, message: "고정 공유본의 현재 권한·기한·원본을 확인할 수 없습니다." };
      if (code === "forbidden") throw new ForbiddenException(body);
      if (code === "not-found") throw new NotFoundException(body);
      if (code === "expired" || code === "revoked") throw new GoneException(body);
      if (code === "conflict") throw new ConflictException(body);
      if (code === "quota") throw new HttpException(body, 429);
      if (code === "invalid-source") throw new BadRequestException(body);
      throw new ServiceUnavailableException(body);
    }
  }
  async sources(actor: string, subject: PinnedShareCreate["subject"], offset: number) {
    const result = await this.repository.sources(actor, subject, offset);
    if (!this.storage) return failShare("unavailable");
    if ((await this.storage.verifyPrivatePurposeBuckets(undefined, ["derived"])).ready !== true) return failShare("unavailable");
    return result;
  }
  async create(actor: string, workId: string, input: PinnedShareCreate) {
    if (input.subject.workId !== workId) return failShare("invalid-source");
    // Verify authorization before checking the private provider. Creation is an explicit action.
    await this.sources(actor, input.subject, 0);
    return this.repository.create(actor, workId, input);
  }
  async image(access: PinnedShareAccess, ordinal: number, signal?: AbortSignal) {
    const original = await this.repository.image(access, ordinal);
    if (!this.storage) return failShare("unavailable");
    if ((await this.storage.verifyPrivatePurposeBuckets(undefined, ["derived"])).ready !== true) return failShare("unavailable");
    const signed = PrivateSignedReadUrlSchema.parse(await this.storage.createSignedReadUrl({ object: original.object, expiresInSeconds: 30 }));
    const url = new URL(signed.url), now = Date.now();
    if (url.protocol !== "https:" || url.username || url.password || url.hash || signed.url.length > 8192
      || signed.expiresAtEpochMs <= now || signed.expiresAtEpochMs > now + 30_000) return failShare("unavailable");
    const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000);
    const response = await this.fetcher(signed.url, { signal: requestSignal, redirect: "error", credentials: "omit", cache: "no-store" });
    const length = response.headers.get("content-length"), mime = response.headers.get("content-type")?.split(";", 1)[0]?.trim();
    if (response.status !== 200 || !response.body || mime !== original.page.mediaType
      || (length !== null && (!/^[0-9]+$/u.test(length) || Number(length) !== original.page.byteLength))) { await response.body?.cancel(); return failShare("unavailable"); }
    const reader = response.body.getReader(), chunks: Uint8Array[] = []; let received = 0;
    try {
      while (true) {
        const next = await reader.read(); if (next.done) break;
        received += next.value.byteLength;
        if (received > original.page.byteLength) return failShare("unavailable");
        chunks.push(next.value);
      }
    } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
    if (received !== original.page.byteLength || requestSignal.aborted) return failShare("unavailable");
    const bytes = Buffer.concat(chunks);
    if (createHash("sha256").update(bytes).digest("hex") !== original.page.sha256) return failShare("unavailable");
    // No signed URL or bytes escape before a second current ACL/revoke/approval check.
    const current = await this.repository.image(access, ordinal);
    if (current.shareId !== original.shareId || canonicalJson(current.page) !== canonicalJson(original.page)
      || canonicalJson(current.object) !== canonicalJson(original.object) || current.expiresAt <= Date.now()) return failShare("unavailable");
    return { bytes, page: current.page };
  }
}
