import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException,
  ServiceUnavailableException, UnprocessableEntityException } from "@nestjs/common";

import { LocatedPrivateObjectReferenceSchema } from "../../platform/adapters/private-object-storage/private-object-storage.contract";
import { StudioWorkAssetService, type StudioWorkAssetUploadFile } from "../creator/studio-work-asset.service";
import { StudioIdempotencyConflictError, StudioProjectForbiddenError, StudioProjectNotFoundError, StudioRepositoryInvariantError } from "./studio-project-graph.repository";
import { canonicalizeStudioReviewPreview, StudioReviewPreviewValidationError } from "./studio-review-preview-canonicalizer";
import { studioReviewPreviewCaptureSchema, studioReviewPreviewCompleteSchema, studioReviewPreviewDigest,
  studioReviewPreviewIntentKey, studioReviewPreviewIntentSchema, studioReviewPreviewPageAsset,
  type StudioReviewPreviewCapture, type StudioReviewPreviewComplete, type StudioReviewPreviewIntent } from "./studio-review-preview-producer.contract";
import { StudioReviewPreviewProducerRepository, type StudioReviewPreviewCaptureStatus } from "./studio-review-preview-producer.repository";

function publicStatus(result: StudioReviewPreviewCaptureStatus): StudioReviewPreviewCaptureStatus {
  return result.status === "completed" ? { status: "completed", subject: result.subject } : { status: result.status };
}

@Injectable()
export class StudioReviewPreviewProducerService {
  constructor(@Inject(StudioReviewPreviewProducerRepository) private readonly repository: StudioReviewPreviewProducerRepository,
    @Inject(StudioWorkAssetService) private readonly assets: StudioWorkAssetService) {}

  private async run<T>(operation: () => Promise<T>): Promise<T> {
    try { return await operation(); }
    catch (error) {
      if (error instanceof StudioProjectForbiddenError) throw new ForbiddenException({ code: "preview-access-denied" });
      if (error instanceof StudioProjectNotFoundError) throw new NotFoundException({ code: "preview-source-unavailable" });
      if (error instanceof StudioIdempotencyConflictError) throw new ConflictException({ code: "preview-idempotency-conflict" });
      if (error instanceof StudioRepositoryInvariantError) throw new ConflictException({ code: error.causeCode });
      if (error instanceof StudioReviewPreviewValidationError) {
        if (["preview-validator-busy", "preview-decoder-unavailable", "preview-decode-timeout"].includes(error.code)) throw new ServiceUnavailableException({ code: error.code });
        throw new UnprocessableEntityException({ code: error.code });
      }
      throw error;
    }
  }

  prepare(actor: string, input: StudioReviewPreviewCapture): Promise<StudioReviewPreviewIntent> {
    this.assets.assertAdmissionEnabled();
    return this.run(() => this.repository.prepare(actor, studioReviewPreviewCaptureSchema.parse(input)));
  }
  status(actor: string, intent: StudioReviewPreviewIntent): Promise<StudioReviewPreviewCaptureStatus> {
    return this.run(async () => publicStatus(await this.repository.status(actor, studioReviewPreviewIntentSchema.parse(intent))));
  }

  async upload(actor: string, rawIntent: StudioReviewPreviewIntent, ordinal: number, file: StudioWorkAssetUploadFile | undefined,
    options: { readonly signal?: AbortSignal } = {}): Promise<{ ordinal: number; sha256: string; width: number; height: number }> {
    this.assets.assertAdmissionEnabled();
    const intent = studioReviewPreviewIntentSchema.parse(rawIntent);
    if (!Number.isInteger(ordinal) || ordinal < 0 || ordinal >= intent.pageCount || !file || !Buffer.isBuffer(file.buffer)
      || file.size !== file.buffer.byteLength || file.mimetype !== "image/png") throw new BadRequestException({ code: "preview-page-invalid" });
    return this.run(async () => {
      await this.repository.assertPending(actor, intent);
      const canonical = await canonicalizeStudioReviewPreview(file.buffer, `${studioReviewPreviewDigest(intent)}:${ordinal}`, options);
      const key = studioReviewPreviewIntentKey(actor, intent);
      const assetId = studioReviewPreviewPageAsset(key, ordinal);
      let sourceStored = false, generatedStored = false;
      const abort = () => { if (options.signal?.aborted) throw new StudioReviewPreviewValidationError("preview-cancelled"); };
      try {
        abort();
        await this.repository.assertPending(actor, intent);
        const upload = { buffer: canonical.bytes, size: canonical.bytes.byteLength, mimetype: "image/png" };
        // The same reconstructed PNG becomes the source of this derived preview. Original input
        // bytes are never registered as clean, saved to source storage, or made readable.
        await this.assets.upload(actor, intent.workId, assetId, "image", JSON.stringify({ version: 1,
          element: { id: assetId, type: "image", x: 0, y: 0, width: canonical.width, height: canonical.height, rotation: 0 } }), upload);
        sourceStored = true;
        abort();
        const reference = await this.assets.uploadGeneratedObject(actor, intent.workId, assetId, "derived", assetId, "image", upload);
        generatedStored = true;
        abort();
        const object = LocatedPrivateObjectReferenceSchema.parse(reference.object);
        if (reference.workId !== intent.workId || reference.sourceAssetId !== assetId || reference.referenceId !== assetId) throw new Error("preview-storage-mismatch");
        await this.repository.registerPage(actor, intent, ordinal, canonical, object);
        return { ordinal, sha256: canonical.sha256, width: canonical.width, height: canonical.height };
      } catch (error) {
        // Exact-hash, uploader-owned compensation uses the existing lifecycle. A simultaneous
        // completed review pin blocks this cleanup under the shared storage-object lock.
        if (generatedStored) await this.assets.deleteGeneratedObject(actor, intent.workId, assetId, "derived", assetId, `sha256:${canonical.sha256}`).catch(() => undefined);
        if (sourceStored) await this.assets.deleteUnreferencedUpload(actor, intent.workId, assetId, "image", canonical.sha256).catch(() => undefined);
        throw error;
      } finally { canonical.bytes.fill(0); }
    });
  }

  complete(actor: string, input: StudioReviewPreviewComplete): Promise<StudioReviewPreviewCaptureStatus> {
    this.assets.assertAdmissionEnabled();
    return this.run(async () => publicStatus(await this.repository.complete(actor, studioReviewPreviewCompleteSchema.parse(input))));
  }

  async cancel(actor: string, input: StudioReviewPreviewIntent | StudioReviewPreviewCapture): Promise<StudioReviewPreviewCaptureStatus & { readonly cleanupPending?: boolean }> {
    return this.run(async () => {
      const parsed = studioReviewPreviewIntentSchema.safeParse(input);
      const intent = parsed.success ? parsed.data : await this.repository.findPrepared(actor, studioReviewPreviewCaptureSchema.parse(input));
      // Before prepare has persisted an intent no page upload can pass assertPrepared. The UI
      // must ignore any late prepare response after closing; it must never capture on that path.
      if (!intent) return { status: "cancelled", cleanupPending: false };
      const result = publicStatus(await this.repository.cancel(actor, intent));
      if (result.status === "completed") return result;
      let cleanupPending = false;
      const assets = await this.repository.listCaptureAssets(actor, intent);
      for (const asset of assets) {
        try {
          if (asset.generated) await this.assets.deleteGeneratedObject(actor, intent.workId, asset.assetId, "derived", asset.assetId, `sha256:${asset.sha256}`);
          await this.assets.deleteUnreferencedUpload(actor, intent.workId, asset.assetId, "image", asset.sha256);
        } catch { cleanupPending = true; }
      }
      return { ...result, cleanupPending };
    });
  }
}
