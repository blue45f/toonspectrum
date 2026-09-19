import { createHash } from "node:crypto";
import { Image, encodePng } from "image-js";
import { describe, expect, it, vi } from "vitest";
import { StudioProjectForbiddenError, StudioRepositoryInvariantError } from "./studio-project-graph.repository";
import { StudioReviewPreviewProducerService } from "./studio-review-preview-producer.service";
import { studioReviewPreviewCompleteSchema, type StudioReviewPreviewIntent } from "./studio-review-preview-producer.contract";
import type { StudioReviewPreviewProducerRepository } from "./studio-review-preview-producer.repository";
import type { StudioWorkAssetService, StudioWorkAssetUploadFile } from "../creator/studio-work-asset.service";
import { StudioReviewPreviewProducerController } from "./studio-review-preview-producer.controller";
import { StudioWorkAssetUploadGuard } from "../creator/studio-asset-upload.guard";

const intent: StudioReviewPreviewIntent = { intentId: "intent-1", workId: "work-1", sourceServerRevision: 4,
  sourceContentDigest: "a".repeat(64), pageCount: 1, title: "Review", deviceId: "device-1", createdAt: "2026-09-20T00:00:00.000Z",
  projectId: "graph-1", artifactId: "artifact-1", expectedHeadRevisionId: "head-1", expectedHeadRootGraphHash: "b".repeat(64) };
function file(): StudioWorkAssetUploadFile { const buffer = Buffer.from(encodePng(new Image(2, 1, { data: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), colorModel: "RGBA" }))); return { buffer, size: buffer.length, mimetype: "image/png" }; }
function fixture() {
  const repository = { prepare: vi.fn(), assertPending: vi.fn().mockResolvedValue(undefined), registerPage: vi.fn().mockResolvedValue(undefined),
    complete: vi.fn(), status: vi.fn(), cancel: vi.fn(), listCaptureAssets: vi.fn(), findPrepared: vi.fn() };
  const uploaded: Buffer[] = [];
  const assets = { assertAdmissionEnabled: vi.fn(), upload: vi.fn().mockImplementation(async (_actor, _work, _asset, _type, _descriptor, upload: StudioWorkAssetUploadFile) => { uploaded.push(Buffer.from(upload.buffer)); }),
    uploadGeneratedObject: vi.fn().mockImplementation(async (_actor, workId, sourceAssetId, purpose, referenceId, _type, upload: StudioWorkAssetUploadFile) => {
      const hash = createHash("sha256").update(upload.buffer).digest("hex");
      return { workId, sourceAssetId, referenceId, object: { contractVersion: "toonspectrum.private-object-storage.v2", providerId: "cloudflare-r2",
        purpose, digest: `sha256:${hash}`, objectPath: `sha256/${hash.slice(0, 2)}/${hash}`, contentType: "image/png", byteLength: upload.size } };
    }), deleteGeneratedObject: vi.fn().mockResolvedValue({ deleted: true }), deleteUnreferencedUpload: vi.fn().mockResolvedValue(true) };
  const service = new StudioReviewPreviewProducerService(repository as unknown as StudioReviewPreviewProducerRepository, assets as unknown as StudioWorkAssetService);
  return { service, repository, assets, uploaded };
}

describe("review producer admission and compensation", () => {
  it("writes only actually reconstructed pixels through both existing admission services before registering a graph blob", async () => {
    const f = fixture(); const input = file();
    const result = await f.service.upload("owner", intent, 0, input);
    expect(result).toMatchObject({ ordinal: 0, width: 2, height: 1 });
    expect(f.repository.assertPending).toHaveBeenCalledTimes(2);
    expect(f.assets.upload).toHaveBeenCalledOnce(); expect(f.assets.uploadGeneratedObject).toHaveBeenCalledOnce();
    expect(f.repository.registerPage).toHaveBeenCalledOnce();
    expect(f.uploaded[0]!.equals(input.buffer)).toBe(false);
    expect(createHash("sha256").update(f.uploaded[0]!).digest("hex")).toBe(result.sha256);
    expect(f.repository.registerPage.mock.invocationCallOrder[0]).toBeGreaterThan(f.assets.uploadGeneratedObject.mock.invocationCallOrder[0]!);
    expect(f.assets.deleteGeneratedObject).not.toHaveBeenCalled();
  });

  it("checks current access before decoding or uploading and never promotes invalid image input", async () => {
    const denied = fixture(); denied.repository.assertPending.mockRejectedValue(new StudioProjectForbiddenError("edit"));
    await expect(denied.service.upload("viewer", intent, 0, file())).rejects.toMatchObject({ status: 403 });
    expect(denied.assets.upload).not.toHaveBeenCalled();
    const invalid = fixture();
    await expect(invalid.service.upload("owner", intent, 0, { buffer: Buffer.from("not PNG"), size: 7, mimetype: "image/png" })).rejects.toMatchObject({ status: 422 });
    expect(invalid.assets.upload).not.toHaveBeenCalled(); expect(invalid.repository.registerPage).not.toHaveBeenCalled();
  });

  it("reclaims acknowledged generated and source references when the final source/permission check fails", async () => {
    const f = fixture();
    f.repository.registerPage.mockRejectedValue(new StudioRepositoryInvariantError("preview-source-version-mismatch", "changed"));
    await expect(f.service.upload("owner", intent, 0, file())).rejects.toMatchObject({ status: 409 });
    expect(f.assets.deleteGeneratedObject).toHaveBeenCalledOnce(); expect(f.assets.deleteUnreferencedUpload).toHaveBeenCalledOnce();
    const hash = createHash("sha256").update(f.uploaded[0]!).digest("hex");
    expect(f.assets.deleteGeneratedObject.mock.calls[0]?.at(-1)).toBe(`sha256:${hash}`);
    expect(f.assets.deleteUnreferencedUpload.mock.calls[0]?.at(-1)).toBe(hash);
    expect(f.assets.deleteUnreferencedUpload.mock.invocationCallOrder[0]).toBeGreaterThan(f.assets.deleteGeneratedObject.mock.invocationCallOrder[0]!);
  });

  it("does not pretend that an ambiguous provider write was acknowledged or remove an earlier pinned asset", async () => {
    const f = fixture(); f.assets.uploadGeneratedObject.mockRejectedValue(new Error("provider response lost"));
    f.assets.deleteUnreferencedUpload.mockRejectedValue(new Error("reference still exists"));
    await expect(f.service.upload("owner", intent, 0, file())).rejects.toThrow("provider response lost");
    expect(f.repository.registerPage).not.toHaveBeenCalled();
    expect(f.assets.deleteGeneratedObject).not.toHaveBeenCalled();
    expect(f.assets.deleteUnreferencedUpload).toHaveBeenCalledOnce();
  });

  it("returns completed honestly on a cancel/complete race and reports recoverable cleanup failures", async () => {
    const done = fixture(); const subject = { ...intent, reviewId: "review-1" };
    done.repository.cancel.mockResolvedValue({ status: "completed", subject });
    await expect(done.service.cancel("owner", intent)).resolves.toEqual({ status: "completed", subject });
    expect(done.repository.listCaptureAssets).not.toHaveBeenCalled();
    const cancelled = fixture(); cancelled.repository.cancel.mockResolvedValue({ status: "cancelled" });
    cancelled.repository.listCaptureAssets.mockResolvedValue([{ assetId: "asset-1", sha256: "c".repeat(64), generated: true }]);
    cancelled.assets.deleteGeneratedObject.mockRejectedValue(new Error("provider unavailable"));
    await expect(cancelled.service.cancel("owner", intent)).resolves.toEqual({ status: "cancelled", cleanupPending: true });
    expect(cancelled.assets.deleteUnreferencedUpload).not.toHaveBeenCalled();
  });

  it("refuses missing/duplicate/reordered page receipts before committing any snapshot", () => {
    const full = { ...intent, pageCount: 2 };
    for (const pages of [[], [{ ordinal: 0, sha256: "c".repeat(64) }],
      [{ ordinal: 1, sha256: "c".repeat(64) }, { ordinal: 0, sha256: "d".repeat(64) }],
      [{ ordinal: 0, sha256: "c".repeat(64) }, { ordinal: 1, sha256: "c".repeat(64) }]]) {
      expect(studioReviewPreviewCompleteSchema.safeParse({ intent: full, pages }).success).toBe(false);
    }
  });

  it("keeps the pre-Multer existing admission guard on every producer write that admits image state", () => {
    for (const method of ["prepare", "upload", "complete"] as const) {
      expect(Reflect.getMetadata("__guards__", StudioReviewPreviewProducerController.prototype[method])).toContain(StudioWorkAssetUploadGuard);
    }
  });
});
