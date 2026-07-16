import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ZodValidationPipe } from "../../common/zod-validation.pipe";

import { StudioRasterAssetController } from "./studio-raster-asset.controller";
import {
  DeleteStudioRasterAssetQueryDto,
  StudioRasterAssetParamsDto,
} from "./studio-raster-asset.dto";
import { StudioRasterAssetService } from "./studio-raster-asset.service";

const sha256 = "a".repeat(64);
const service = {
  deleteUnreferencedUpload: vi.fn(),
  upload: vi.fn(),
  getManifest: vi.fn(),
  getContent: vi.fn(),
};

function controller(): StudioRasterAssetController {
  return new StudioRasterAssetController(service as unknown as StudioRasterAssetService);
}

describe("StudioRasterAssetController", () => {
  beforeEach(() => {
    service.upload.mockReset();
    service.getManifest.mockReset();
    service.getContent.mockReset();
    service.deleteUnreferencedUpload.mockReset();
  });

  it("validates a trimmed work ID and exact lowercase SHA-256 path ID", () => {
    const pipe = new ZodValidationPipe(StudioRasterAssetParamsDto);
    expect(pipe.transform(
      { id: " work-1 ", assetId: sha256 },
      { type: "param", metatype: undefined, data: undefined }
    )).toEqual({ id: "work-1", assetId: sha256 });
    expect(() => pipe.transform(
      { id: "work-1", assetId: sha256.toUpperCase() },
      { type: "param", metatype: undefined, data: undefined }
    )).toThrow(BadRequestException);
    expect(() => pipe.transform(
      { id: "work-1", assetId: sha256, extra: true },
      { type: "param", metatype: undefined, data: undefined }
    )).toThrow(BadRequestException);
  });

  it("passes the authenticated work scope and exact content address to upload", async () => {
    const file = { buffer: Buffer.from([1]), size: 1, mimetype: "image/png" };
    service.upload.mockResolvedValue({ assetId: sha256 });
    await expect(controller().upload(
      { id: "work-1", assetId: sha256 },
      file,
      "editor"
    )).resolves.toEqual({ assetId: sha256 });
    expect(service.upload).toHaveBeenCalledWith("editor", "work-1", sha256, file);
  });

  it("validates and forwards an exact immutable cleanup receipt", async () => {
    const pipe = new ZodValidationPipe(DeleteStudioRasterAssetQueryDto);
    const query = pipe.transform(
      {
        expectedSha256: sha256,
        mediaType: "image/png",
        byteLength: "1024",
        width: "32",
        height: "16",
      },
      { type: "query", metatype: undefined, data: undefined }
    );
    expect(query).toEqual({
      expectedSha256: sha256,
      mediaType: "image/png",
      byteLength: 1024,
      width: 32,
      height: 16,
    });
    service.deleteUnreferencedUpload.mockResolvedValue(true);

    await expect(controller().deleteUnreferencedUpload(
      { id: "work-1", assetId: sha256 },
      query,
      "editor"
    )).resolves.toEqual({ deleted: true });
    expect(service.deleteUnreferencedUpload).toHaveBeenCalledWith("editor", {
      workId: "work-1",
      assetId: sha256,
      sha256,
      mediaType: "image/png",
      byteLength: 1024,
      width: 32,
      height: 16,
    });
  });

  it("streams immutable private bytes with nosniff and a digest ETag", async () => {
    service.getContent.mockResolvedValue({
      manifest: {
        mediaType: "image/png",
        byteLength: 3,
        sha256,
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
      { id: "work-1", assetId: sha256 },
      "viewer",
      response as never
    );
    expect(service.getContent).toHaveBeenCalledWith("viewer", "work-1", sha256);
    expect(headers).toEqual(new Map([
      ["Cache-Control", "private, no-store, max-age=0"],
      ["X-Content-Type-Options", "nosniff"],
      ["ETag", `"${sha256}"`],
    ]));
    expect(file.getHeaders()).toMatchObject({
      type: "image/png",
      length: 3,
      disposition: "inline",
    });
  });

  it("rejects unauthenticated reads and writes before service access", async () => {
    await expect(controller().manifest({ id: "work-1", assetId: sha256 }))
      .rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller().upload(
      { id: "work-1", assetId: sha256 },
      undefined
    )).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller().deleteUnreferencedUpload(
      { id: "work-1", assetId: sha256 },
      {
        expectedSha256: sha256,
        mediaType: "image/png",
        byteLength: 1,
        width: 1,
        height: 1,
      }
    )).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.getManifest).not.toHaveBeenCalled();
    expect(service.upload).not.toHaveBeenCalled();
    expect(service.deleteUnreferencedUpload).not.toHaveBeenCalled();
  });

  it("does not expose physical deletion", () => {
    expect(Object.getOwnPropertyNames(StudioRasterAssetController.prototype))
      .not.toContain("delete");
  });
});
