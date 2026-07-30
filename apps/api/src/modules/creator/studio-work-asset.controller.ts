import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  Headers,
  Inject,
  Param,
  Put,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileFieldsInterceptor, FileInterceptor } from "@nestjs/platform-express";

import { ZodValidationPipe } from "../../common/zod-validation.pipe";

import { StudioWorkAssetUploadGuard } from "./studio-asset-upload.guard";
import {
  DeleteStudioWorkAssetQueryDto,
  StudioWorkAssetParamsDto,
  StudioWorkAssetTypeQueryDto,
  StudioWorkAssetWorkParamsDto,
  UploadStudioWorkAssetLayerLiftBatchDto,
  UploadStudioWorkAssetDto,
} from "./studio-work-asset.dto";
import { StudioWorkAssetService } from "./studio-work-asset.service";

import type {
  StudioWorkAssetLayerLiftUploadFiles,
  StudioWorkAssetUploadFile,
} from "./studio-work-asset.service";
import type { Response } from "express";

const MAX_MULTIPART_ASSET_BYTES = 12 * 1024 * 1024;
const MAX_MULTIPART_LAYER_LIFT_IMAGE_BYTES = 8 * 1024 * 1024;

function authenticatedUserId(userId: string | undefined): string {
  if (!userId) throw new ForbiddenException("로그인이 필요해요.");
  return userId;
}

@Controller()
export class StudioWorkAssetController {
  constructor(
    @Inject(StudioWorkAssetService)
    private readonly service: StudioWorkAssetService
  ) {}

  @Put("/creator/works/:id/asset-batches/layer-lift")
  @UseGuards(StudioWorkAssetUploadGuard)
  @UseInterceptors(FileFieldsInterceptor([
    { name: "background", maxCount: 1 },
    { name: "foreground", maxCount: 1 },
  ], {
    limits: {
      fileSize: MAX_MULTIPART_LAYER_LIFT_IMAGE_BYTES,
      files: 2,
      fields: 1,
      fieldNameSize: 64,
      fieldSize: 12_288,
      parts: 3,
    },
  }))
  async uploadLayerLiftBatch(
    @Param(new ZodValidationPipe(StudioWorkAssetWorkParamsDto))
    params: StudioWorkAssetWorkParamsDto,
    @Body(new ZodValidationPipe(UploadStudioWorkAssetLayerLiftBatchDto))
    body: UploadStudioWorkAssetLayerLiftBatchDto,
    @UploadedFiles() files: StudioWorkAssetLayerLiftUploadFiles | undefined,
    @Headers("x-user-id") userId?: string
  ) {
    return this.service.uploadLayerLiftBatch(
      authenticatedUserId(userId),
      params.id,
      body.metadata,
      files
    );
  }

  @Put("/creator/works/:id/assets/:assetId")
  @UseGuards(StudioWorkAssetUploadGuard)
  @UseInterceptors(FileInterceptor("file", {
    limits: {
      fileSize: MAX_MULTIPART_ASSET_BYTES,
      files: 1,
      fields: 2,
      fieldNameSize: 64,
      fieldSize: 4_096,
      parts: 3,
    },
  }))
  async upload(
    @Param(new ZodValidationPipe(StudioWorkAssetParamsDto)) params: StudioWorkAssetParamsDto,
    @Body(new ZodValidationPipe(UploadStudioWorkAssetDto)) body: UploadStudioWorkAssetDto,
    @UploadedFile() file: StudioWorkAssetUploadFile | undefined,
    @Headers("x-user-id") userId?: string
  ) {
    return this.service.upload(
      authenticatedUserId(userId),
      params.id,
      params.assetId,
      body.elementType,
      body.descriptor,
      file
    );
  }

  @Get("/creator/works/:id/assets/:assetId")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async manifest(
    @Param(new ZodValidationPipe(StudioWorkAssetParamsDto)) params: StudioWorkAssetParamsDto,
    @Query(new ZodValidationPipe(StudioWorkAssetTypeQueryDto)) query: StudioWorkAssetTypeQueryDto,
    @Headers("x-user-id") userId?: string
  ) {
    return this.service.getManifest(
      authenticatedUserId(userId),
      params.id,
      params.assetId,
      query.elementType
    );
  }

  @Get("/creator/works/:id/assets/:assetId/content")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async content(
    @Param(new ZodValidationPipe(StudioWorkAssetParamsDto)) params: StudioWorkAssetParamsDto,
    @Query(new ZodValidationPipe(StudioWorkAssetTypeQueryDto)) query: StudioWorkAssetTypeQueryDto,
    @Headers("x-user-id") userId: string | undefined,
    @Res({ passthrough: true }) response: Response
  ) {
    const content = await this.service.getContent(
      authenticatedUserId(userId),
      params.id,
      params.assetId,
      query.elementType
    );
    response.setHeader("Cache-Control", "private, no-store, max-age=0");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("ETag", `"${content.manifest.sha256}"`);
    return new StreamableFile(Buffer.from(content.payload), {
      type: content.manifest.mimeType,
      length: content.manifest.byteSize,
      disposition: "inline",
    });
  }

  /**
   * Narrow upload-race compensation only. The service/repository retain the payload when another
   * uploader owns it or when the identity ever materialized in the durable CRDT frontier.
   */
  @Delete("/creator/works/:id/assets/:assetId")
  async deleteUnreferencedUpload(
    @Param(new ZodValidationPipe(StudioWorkAssetParamsDto)) params: StudioWorkAssetParamsDto,
    @Query(new ZodValidationPipe(DeleteStudioWorkAssetQueryDto)) query: DeleteStudioWorkAssetQueryDto,
    @Headers("x-user-id") userId?: string
  ) {
    return {
      deleted: await this.service.deleteUnreferencedUpload(
        authenticatedUserId(userId),
        params.id,
        params.assetId,
        query.elementType,
        query.expectedSha256
      ),
    };
  }
}
