import { Body, Controller, Header, Headers, Inject, Param, Post, Put, Req, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { StudioWorkAssetUploadGuard } from "../creator/studio-asset-upload.guard";
import type { StudioWorkAssetUploadFile } from "../creator/studio-work-asset.service";
import { authenticatedStudioUserId } from "./studio-project-graph.controller";
import { STUDIO_REVIEW_PREVIEW_MAX_BYTES } from "./studio-review-preview-canonicalizer";
import { studioReviewPreviewCaptureSchema, studioReviewPreviewCompleteSchema, studioReviewPreviewIntentSchema } from "./studio-review-preview-producer.contract";
import { StudioReviewPreviewProducerService } from "./studio-review-preview-producer.service";
import type { Request } from "express";

export class StudioReviewCaptureDto extends createZodDto(studioReviewPreviewCaptureSchema) {}
export class StudioReviewCaptureIntentDto extends createZodDto(studioReviewPreviewIntentSchema) {}
export class StudioReviewCaptureCompleteDto extends createZodDto(studioReviewPreviewCompleteSchema) {}
export class StudioReviewCaptureCancelDto extends createZodDto(z.object({
  intent: z.union([studioReviewPreviewIntentSchema, studioReviewPreviewCaptureSchema]),
}).strict()) {}
export class StudioReviewCapturePageParamsDto extends createZodDto(z.object({ ordinal: z.string().regex(/^(0|[1-9][0-9]{0,4})$/u) }).strict()) {}
export class StudioReviewCapturePageBodyDto extends createZodDto(z.object({
  intent: z.string().max(8192).transform((text, ctx) => {
    try { return studioReviewPreviewIntentSchema.parse(JSON.parse(text)); }
    catch { ctx.addIssue({ code: "custom", message: "Invalid capture intent" }); return z.NEVER; }
  }),
}).strict()) {}

@Controller("/studio-project-graph/review-captures")
export class StudioReviewPreviewProducerController {
  constructor(@Inject(StudioReviewPreviewProducerService) private readonly service: StudioReviewPreviewProducerService) {}

  @Post("/prepare")
  @UseGuards(StudioWorkAssetUploadGuard)
  @Header("Cache-Control", "private, no-store, max-age=0")
  prepare(@Body(new ZodValidationPipe(StudioReviewCaptureDto)) body: StudioReviewCaptureDto, @Headers("x-user-id") userId?: string) {
    return this.service.prepare(authenticatedStudioUserId(userId), body);
  }

  @Post("/status")
  @Header("Cache-Control", "private, no-store, max-age=0")
  status(@Body(new ZodValidationPipe(StudioReviewCaptureIntentDto)) body: StudioReviewCaptureIntentDto, @Headers("x-user-id") userId?: string) {
    return this.service.status(authenticatedStudioUserId(userId), body);
  }

  @Put("/pages/:ordinal")
  @UseGuards(StudioWorkAssetUploadGuard)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: STUDIO_REVIEW_PREVIEW_MAX_BYTES, files: 1, fields: 1, fieldSize: 8192, fieldNameSize: 64, parts: 2 } }))
  @Header("Cache-Control", "private, no-store, max-age=0")
  async upload(@Param(new ZodValidationPipe(StudioReviewCapturePageParamsDto)) params: StudioReviewCapturePageParamsDto,
    @Body(new ZodValidationPipe(StudioReviewCapturePageBodyDto)) body: StudioReviewCapturePageBodyDto,
    @UploadedFile() file: StudioWorkAssetUploadFile | undefined, @Req() request: Request, @Headers("x-user-id") userId?: string) {
    const abort = new AbortController();
    const aborted = () => abort.abort();
    request.once("aborted", aborted);
    try { return await this.service.upload(authenticatedStudioUserId(userId), body.intent, Number(params.ordinal), file, { signal: abort.signal }); }
    finally { request.off("aborted", aborted); }
  }

  @Post("/complete")
  @UseGuards(StudioWorkAssetUploadGuard)
  @Header("Cache-Control", "private, no-store, max-age=0")
  complete(@Body(new ZodValidationPipe(StudioReviewCaptureCompleteDto)) body: StudioReviewCaptureCompleteDto, @Headers("x-user-id") userId?: string) {
    return this.service.complete(authenticatedStudioUserId(userId), body);
  }

  @Post("/cancel")
  @Header("Cache-Control", "private, no-store, max-age=0")
  cancel(@Body(new ZodValidationPipe(StudioReviewCaptureCancelDto)) body: StudioReviewCaptureCancelDto, @Headers("x-user-id") userId?: string) {
    return this.service.cancel(authenticatedStudioUserId(userId), body.intent);
  }
}
