import { ForbiddenException, Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import type { StudioReviewPageMapping } from "@toonspectrum/studio-project-model";

import { PrivateSignedReadUrlSchema } from "../../platform/private-object-storage/private-object-storage.contract";
import { PRIVATE_OBJECT_STORAGE_PORT, type PrivateObjectStoragePort } from "../../platform/private-object-storage/private-object-storage.port";
import { StudioProjectForbiddenError, StudioProjectGraphRepository, StudioProjectNotFoundError, StudioRepositoryInvariantError } from "./studio-project-graph.repository";
import {
  STUDIO_REVIEW_PREVIEW_URL_SECONDS, studioReviewPreviewObject,
  studioReviewPreviewSubjectSchema, studioReviewPreviewCursorSchema, type StudioReviewPreviewSubject,
} from "./studio-review-preview";

export interface StudioReviewPreviewRead {
  readonly sha256: string;
  readonly ordinal: number;
  readonly mediaType: "image/png" | "image/jpeg" | "image/webp";
  readonly byteLength: number;
  readonly url: string;
  readonly expiresAt: number;
  readonly mapping: StudioReviewPageMapping;
}
type PreviewFailure = { readonly ok: false; readonly reason: "preview-unavailable" | "closed" | "version-mismatch" };
export type StudioReviewPreviewResult = PreviewFailure | {
  readonly ok: true;
  readonly subject: StudioReviewPreviewSubject;
  readonly previews: readonly StudioReviewPreviewRead[];
  readonly nextCursor: string | null;
};

@Injectable()
export class StudioReviewPreviewService {
  constructor(
    @Inject(StudioProjectGraphRepository) private readonly repository: StudioProjectGraphRepository,
    @Optional() @Inject(PRIVATE_OBJECT_STORAGE_PORT) private readonly storage?: PrivateObjectStoragePort,
  ) {}

  async read(actorUserId: string, subject: StudioReviewPreviewSubject, cursor: string | null): Promise<StudioReviewPreviewResult> {
    const unavailable: PreviewFailure = { ok: false, reason: "preview-unavailable" };
    if (!studioReviewPreviewSubjectSchema.safeParse(subject).success
      || (cursor !== null && !studioReviewPreviewCursorSchema.safeParse(cursor).success)) return { ok: false, reason: "version-mismatch" };
    try {
      // ACL is checked even when storage is unavailable; no cached or peer-provided permissions.
      const source = await this.repository.getReviewPreviewSource(actorUserId, subject, cursor);
      if (!this.storage || source.blobs.length === 0) return unavailable;
      const objects = source.blobs.map(studioReviewPreviewObject);
      if (objects.some((object) => object === null)) return unavailable;
      const readiness = await this.storage.verifyPrivatePurposeBuckets(undefined, ["derived"]);
      if (readiness.ready !== true) return unavailable;
      const previews: StudioReviewPreviewRead[] = [];
      for (let offset = 0; offset < objects.length; offset += 4) {
        const batch = await Promise.all(objects.slice(offset, offset + 4).map(async (object, index) => {
          const signed = PrivateSignedReadUrlSchema.parse(await this.storage!.createSignedReadUrl({
            object: object!, expiresInSeconds: STUDIO_REVIEW_PREVIEW_URL_SECONDS,
          }));
          const now = Date.now();
          const url = new URL(signed.url);
          if (url.username || url.password || signed.url.length > 8_192
            || signed.expiresAtEpochMs <= now || signed.expiresAtEpochMs > now + STUDIO_REVIEW_PREVIEW_URL_SECONDS * 1_000) {
            throw new Error("Invalid preview read expiry");
          }
          const blob = source.blobs[offset + index]!;
          return { sha256: blob.hash, ordinal: blob.ordinal,
            mediaType: blob.mediaType as StudioReviewPreviewRead["mediaType"], byteLength: Number(blob.size),
            url: signed.url, expiresAt: signed.expiresAtEpochMs,
            mapping: source.pageMappings?.[blob.ordinal] ?? { status: "unmapped" as const, reason: "legacy-review" as const } };
        }));
        previews.push(...batch);
      }
      if (previews.some((preview) => preview.expiresAt <= Date.now())) return unavailable;
      return { ok: true, subject: source.subject, previews, nextCursor: source.nextCursor };
    } catch (error) {
      if (error instanceof StudioProjectForbiddenError) throw new ForbiddenException({ code: "studio_project_forbidden" });
      if (error instanceof StudioProjectNotFoundError) throw new NotFoundException({ code: "studio_review_preview_not_found" });
      if (error instanceof StudioRepositoryInvariantError) {
        return { ok: false, reason: error.causeCode === "review_closed" ? "closed" : "version-mismatch" };
      }
      // Keep bucket names, object paths, provider errors and credentials out of application output.
      return unavailable;
    }
  }
}
