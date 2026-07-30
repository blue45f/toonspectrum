import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ZodValidationPipe } from "../../common/zod-validation.pipe";

import { StudioWorkAssetController } from "./studio-work-asset.controller";
import {
  DeleteStudioWorkAssetQueryDto,
  StudioWorkAssetParamsDto,
  StudioWorkAssetTypeQueryDto,
  StudioWorkAssetWorkParamsDto,
  UploadStudioWorkAssetLayerLiftBatchDto,
  UploadStudioWorkAssetDto,
} from "./studio-work-asset.dto";
import { StudioWorkAssetService } from "./studio-work-asset.service";

const service = {
  upload: vi.fn(),
  uploadLayerLiftBatch: vi.fn(),
  getManifest: vi.fn(),
  getContent: vi.fn(),
  deleteUnreferencedUpload: vi.fn(),
};

function controller(): StudioWorkAssetController {
  return new StudioWorkAssetController(service as unknown as StudioWorkAssetService);
}

describe("StudioWorkAssetController", () => {
  beforeEach(() => {
    service.upload.mockReset();
    service.uploadLayerLiftBatch.mockReset();
    service.getManifest.mockReset();
    service.getContent.mockReset();
    service.deleteUnreferencedUpload.mockReset();
  });

  it("validates strict path, type query, and multipart fields without decorator metadata", () => {
    const paramsPipe = new ZodValidationPipe(StudioWorkAssetParamsDto);
    const queryPipe = new ZodValidationPipe(StudioWorkAssetTypeQueryDto);
    const bodyPipe = new ZodValidationPipe(UploadStudioWorkAssetDto);
    const workParamsPipe = new ZodValidationPipe(StudioWorkAssetWorkParamsDto);
    const layerLiftBodyPipe = new ZodValidationPipe(UploadStudioWorkAssetLayerLiftBatchDto);
    const deletePipe = new ZodValidationPipe(DeleteStudioWorkAssetQueryDto);
    expect(paramsPipe.transform(
      { id: " work-1 ", assetId: "asset-1" },
      { type: "param", metatype: undefined, data: undefined }
    )).toEqual({ id: "work-1", assetId: "asset-1" });
    expect(queryPipe.transform(
      { elementType: "vrm" },
      { type: "query", metatype: undefined, data: undefined }
    )).toEqual({ elementType: "vrm" });
    expect(bodyPipe.transform(
      { elementType: "image", descriptor: "{}" },
      { type: "body", metatype: undefined, data: undefined }
    )).toEqual({ elementType: "image", descriptor: "{}" });
    expect(workParamsPipe.transform(
      { id: " work-1 " },
      { type: "param", metatype: undefined, data: undefined }
    )).toEqual({ id: "work-1" });
    expect(layerLiftBodyPipe.transform(
      { metadata: "{}" },
      { type: "body", metatype: undefined, data: undefined }
    )).toEqual({ metadata: "{}" });
    expect(() => layerLiftBodyPipe.transform(
      { metadata: "{}", extra: true },
      { type: "body", metatype: undefined, data: undefined }
    )).toThrow(BadRequestException);
    expect(deletePipe.transform(
      { elementType: "image", expectedSha256: "a".repeat(64) },
      { type: "query", metatype: undefined, data: undefined }
    )).toEqual({ elementType: "image", expectedSha256: "a".repeat(64) });
    expect(() => deletePipe.transform(
      { elementType: "image", expectedSha256: "A".repeat(64) },
      { type: "query", metatype: undefined, data: undefined }
    )).toThrow(BadRequestException);
    expect(() => paramsPipe.transform(
      { id: "work-1", assetId: "asset-1\n" },
      { type: "param", metatype: undefined, data: undefined }
    )).toThrow(BadRequestException);
    expect(() => queryPipe.transform(
      { elementType: "svg", extra: true },
      { type: "query", metatype: undefined, data: undefined }
    )).toThrow(BadRequestException);
  });

  it("passes authenticated work scope and exact ID/type to the service", async () => {
    const manifest = { assetId: "asset-1", elementType: "image" };
    const file = { buffer: Buffer.from([1]), size: 1, mimetype: "image/png" };
    service.upload.mockResolvedValue(manifest);
    await expect(controller().upload(
      { id: "work-1", assetId: "asset-1" },
      { elementType: "image", descriptor: "{}" },
      file,
      "editor"
    )).resolves.toBe(manifest);
    expect(service.upload).toHaveBeenCalledWith(
      "editor", "work-1", "asset-1", "image", "{}", file
    );
  });

  it("passes one role-bound background/foreground multipart pair to the batch service", async () => {
    const receipt = {
      batchId: "11111111-1111-4111-8111-111111111111",
      assets: [],
    };
    const background = { buffer: Buffer.from([1]), size: 1, mimetype: "image/png" };
    const foreground = { buffer: Buffer.from([2]), size: 1, mimetype: "image/png" };
    const files = {
      background: [background],
      foreground: [foreground],
    };
    service.uploadLayerLiftBatch.mockResolvedValue(receipt);

    await expect(controller().uploadLayerLiftBatch(
      { id: "work-1" },
      { metadata: "{\"version\":1}" },
      files,
      "editor"
    )).resolves.toBe(receipt);
    expect(service.uploadLayerLiftBatch).toHaveBeenCalledWith(
      "editor",
      "work-1",
      "{\"version\":1}",
      files
    );
  });

  it("streams private bytes with nosniff and an immutable digest tag", async () => {
    service.getContent.mockResolvedValue({
      manifest: {
        mimeType: "image/png",
        byteSize: 3,
        sha256: "a".repeat(64),
      },
      payload: Uint8Array.of(1, 2, 3),
    });
    const headers = new Map<string, string>();
    const response = {
      setHeader(name: string, value: string) {
        headers.set(name, value);
      },
    };
    const file = await controller().content(
      { id: "work-1", assetId: "asset-1" },
      { elementType: "image" },
      "viewer",
      response as never
    );
    expect(service.getContent).toHaveBeenCalledWith("viewer", "work-1", "asset-1", "image");
    expect(headers).toEqual(new Map([
      ["Cache-Control", "private, no-store, max-age=0"],
      ["X-Content-Type-Options", "nosniff"],
      ["ETag", `"${"a".repeat(64)}"`],
    ]));
    expect(file.getHeaders()).toMatchObject({
      type: "image/png",
      length: 3,
      disposition: "inline",
    });
  });

  it("rejects unauthenticated reads and writes before service access", async () => {
    await expect(controller().manifest(
      { id: "work-1", assetId: "asset-1" },
      { elementType: "image" }
    )).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller().upload(
      { id: "work-1", assetId: "asset-1" },
      { elementType: "image", descriptor: "{}" },
      undefined
    )).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller().uploadLayerLiftBatch(
      { id: "work-1" },
      { metadata: "{}" },
      undefined
    )).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller().deleteUnreferencedUpload(
      { id: "work-1", assetId: "asset-1" },
      { elementType: "image", expectedSha256: "a".repeat(64) }
    )).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.getManifest).not.toHaveBeenCalled();
    expect(service.upload).not.toHaveBeenCalled();
    expect(service.uploadLayerLiftBatch).not.toHaveBeenCalled();
    expect(service.deleteUnreferencedUpload).not.toHaveBeenCalled();
  });

  it("exposes only receipt-bound unreferenced upload cleanup", async () => {
    service.deleteUnreferencedUpload.mockResolvedValue(true);
    await expect(controller().deleteUnreferencedUpload(
      { id: "work-1", assetId: "asset-1" },
      { elementType: "image", expectedSha256: "a".repeat(64) },
      "editor"
    )).resolves.toEqual({ deleted: true });
    expect(service.deleteUnreferencedUpload).toHaveBeenCalledWith(
      "editor",
      "work-1",
      "asset-1",
      "image",
      "a".repeat(64)
    );
  });
});
