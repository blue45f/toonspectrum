import {
  BadRequestException,
  ForbiddenException,
  RequestMethod,
} from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ZodValidationPipe } from "../../common/zod-validation.pipe";

import { StudioWorkAssetController } from "./studio-work-asset.controller";
import {
  DeleteStudioWorkAssetGeneratedObjectQueryDto,
  DeleteStudioWorkAssetQueryDto,
  StudioWorkAssetGeneratedParamsDto,
  StudioWorkAssetParamsDto,
  StudioWorkAssetSignedReadQueryDto,
  StudioWorkAssetSourceSignedReadQueryDto,
  StudioWorkAssetTypeQueryDto,
  StudioWorkAssetWorkParamsDto,
  UploadStudioWorkAssetGeneratedObjectDto,
  UploadStudioWorkAssetLayerLiftBatchDto,
  UploadStudioWorkAssetDto,
} from "./studio-work-asset.dto";
import { StudioWorkAssetService } from "./studio-work-asset.service";

const service = {
  upload: vi.fn(),
  uploadGeneratedObject: vi.fn(),
  uploadLayerLiftBatch: vi.fn(),
  getManifest: vi.fn(),
  getContent: vi.fn(),
  getSourceStorageReference: vi.fn(),
  getGeneratedStorageReference: vi.fn(),
  createSourceSignedReadUrl: vi.fn(),
  createGeneratedSignedReadUrl: vi.fn(),
  deleteGeneratedObject: vi.fn(),
  deleteUnreferencedUpload: vi.fn(),
};

function controller(): StudioWorkAssetController {
  return new StudioWorkAssetController(service as unknown as StudioWorkAssetService);
}

describe("StudioWorkAssetController", () => {
  beforeEach(() => {
    service.upload.mockReset();
    service.uploadGeneratedObject.mockReset();
    service.uploadLayerLiftBatch.mockReset();
    service.getManifest.mockReset();
    service.getContent.mockReset();
    service.getSourceStorageReference.mockReset();
    service.getGeneratedStorageReference.mockReset();
    service.createSourceSignedReadUrl.mockReset();
    service.createGeneratedSignedReadUrl.mockReset();
    service.deleteGeneratedObject.mockReset();
    service.deleteUnreferencedUpload.mockReset();
  });

  it("publishes the source and generated object routes with exact HTTP methods", () => {
    const routes = [
      [
        "uploadGeneratedObject",
        RequestMethod.PUT,
        "/creator/works/:id/assets/:assetId/generated/:purpose/:referenceId",
      ],
      [
        "sourceStorageReference",
        RequestMethod.GET,
        "/creator/works/:id/assets/:assetId/storage-reference",
      ],
      [
        "sourceSignedReadUrl",
        RequestMethod.GET,
        "/creator/works/:id/assets/:assetId/content-url",
      ],
      [
        "generatedStorageReference",
        RequestMethod.GET,
        "/creator/works/:id/assets/:assetId/generated/:purpose/:referenceId",
      ],
      [
        "generatedSignedReadUrl",
        RequestMethod.GET,
        "/creator/works/:id/assets/:assetId/generated/:purpose/:referenceId/content-url",
      ],
      [
        "deleteGeneratedObject",
        RequestMethod.DELETE,
        "/creator/works/:id/assets/:assetId/generated/:purpose/:referenceId",
      ],
    ] as const;

    for (const [methodName, requestMethod, path] of routes) {
      const handler = StudioWorkAssetController.prototype[methodName];
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(requestMethod);
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
    }
  });

  it("validates strict path, type query, and multipart fields without decorator metadata", () => {
    const paramsPipe = new ZodValidationPipe(StudioWorkAssetParamsDto);
    const queryPipe = new ZodValidationPipe(StudioWorkAssetTypeQueryDto);
    const bodyPipe = new ZodValidationPipe(UploadStudioWorkAssetDto);
    const workParamsPipe = new ZodValidationPipe(StudioWorkAssetWorkParamsDto);
    const layerLiftBodyPipe = new ZodValidationPipe(UploadStudioWorkAssetLayerLiftBatchDto);
    const deletePipe = new ZodValidationPipe(DeleteStudioWorkAssetQueryDto);
    const generatedParamsPipe = new ZodValidationPipe(StudioWorkAssetGeneratedParamsDto);
    const generatedUploadPipe = new ZodValidationPipe(UploadStudioWorkAssetGeneratedObjectDto);
    const signedReadPipe = new ZodValidationPipe(StudioWorkAssetSignedReadQueryDto);
    const sourceSignedReadPipe = new ZodValidationPipe(StudioWorkAssetSourceSignedReadQueryDto);
    const generatedDeletePipe = new ZodValidationPipe(
      DeleteStudioWorkAssetGeneratedObjectQueryDto,
    );
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
    expect(generatedParamsPipe.transform(
      {
        id: " work-1 ",
        assetId: "asset-1",
        purpose: "derived",
        referenceId: "preview-1",
      },
      { type: "param", metatype: undefined, data: undefined },
    )).toEqual({
      id: "work-1",
      assetId: "asset-1",
      purpose: "derived",
      referenceId: "preview-1",
    });
    expect(() => generatedParamsPipe.transform(
      {
        id: "work-1",
        assetId: "asset-1",
        purpose: "source",
        referenceId: "asset-1",
      },
      { type: "param", metatype: undefined, data: undefined },
    )).toThrow(BadRequestException);
    expect(generatedUploadPipe.transform(
      { elementType: "background3d" },
      { type: "body", metatype: undefined, data: undefined },
    )).toEqual({ elementType: "background3d" });
    expect(signedReadPipe.transform(
      {},
      { type: "query", metatype: undefined, data: undefined },
    )).toEqual({ expiresInSeconds: 120 });
    expect(sourceSignedReadPipe.transform(
      { elementType: "image", expiresInSeconds: "300" },
      { type: "query", metatype: undefined, data: undefined },
    )).toEqual({ elementType: "image", expiresInSeconds: 300 });
    expect(() => signedReadPipe.transform(
      { expiresInSeconds: "301" },
      { type: "query", metatype: undefined, data: undefined },
    )).toThrow(BadRequestException);
    expect(generatedDeletePipe.transform(
      { expectedDigest: `sha256:${"a".repeat(64)}` },
      { type: "query", metatype: undefined, data: undefined },
    )).toEqual({ expectedDigest: `sha256:${"a".repeat(64)}` });
    expect(() => generatedDeletePipe.transform(
      { expectedDigest: "a".repeat(64) },
      { type: "query", metatype: undefined, data: undefined },
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

  it("passes generated upload, reference, signed-read, and delete identities unchanged", async () => {
    const params = {
      id: "work-1",
      assetId: "asset-1",
      purpose: "derived" as const,
      referenceId: "preview-1",
    };
    const file = { buffer: Buffer.from([1]), size: 1, mimetype: "image/png" };
    const reference = { referenceId: "preview-1" };
    const signed = { signedRead: { url: "https://example.test/signed" } };
    const deleted = { deleted: true, remoteObjectDeleted: true };
    service.uploadGeneratedObject.mockResolvedValue(reference);
    service.getSourceStorageReference.mockResolvedValue(reference);
    service.getGeneratedStorageReference.mockResolvedValue(reference);
    service.createSourceSignedReadUrl.mockResolvedValue(signed);
    service.createGeneratedSignedReadUrl.mockResolvedValue(signed);
    service.deleteGeneratedObject.mockResolvedValue(deleted);

    await expect(controller().uploadGeneratedObject(
      params,
      { elementType: "image" },
      file,
      "editor",
    )).resolves.toBe(reference);
    expect(service.uploadGeneratedObject).toHaveBeenCalledWith(
      "editor",
      "work-1",
      "asset-1",
      "derived",
      "preview-1",
      "image",
      file,
    );

    await expect(controller().sourceStorageReference(
      { id: "work-1", assetId: "asset-1" },
      { elementType: "image" },
      "viewer",
    )).resolves.toBe(reference);
    expect(service.getSourceStorageReference).toHaveBeenCalledWith(
      "viewer", "work-1", "asset-1", "image",
    );

    await expect(controller().sourceSignedReadUrl(
      { id: "work-1", assetId: "asset-1" },
      { elementType: "image", expiresInSeconds: 120 },
      "viewer",
    )).resolves.toBe(signed);
    expect(service.createSourceSignedReadUrl).toHaveBeenCalledWith(
      "viewer", "work-1", "asset-1", "image", 120,
    );

    await expect(controller().generatedStorageReference(
      params,
      "viewer",
    )).resolves.toBe(reference);
    expect(service.getGeneratedStorageReference).toHaveBeenCalledWith(
      "viewer", "work-1", "asset-1", "derived", "preview-1",
    );

    await expect(controller().generatedSignedReadUrl(
      params,
      { expiresInSeconds: 90 },
      "viewer",
    )).resolves.toBe(signed);
    expect(service.createGeneratedSignedReadUrl).toHaveBeenCalledWith(
      "viewer", "work-1", "asset-1", "derived", "preview-1", 90,
    );

    const expectedDigest = `sha256:${"a".repeat(64)}`;
    await expect(controller().deleteGeneratedObject(
      params,
      { expectedDigest },
      "editor",
    )).resolves.toBe(deleted);
    expect(service.deleteGeneratedObject).toHaveBeenCalledWith(
      "editor",
      "work-1",
      "asset-1",
      "derived",
      "preview-1",
      expectedDigest,
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
