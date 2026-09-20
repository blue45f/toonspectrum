import { Controller, Get, Header, Headers, Inject, Param, Query } from "@nestjs/common";
import { studioEntityIdSchema } from "@toonspectrum/studio-project-model";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { authenticatedStudioUserId } from "./studio-project-graph.controller";
import { studioReviewPreviewCursorSchema, studioReviewPreviewSubjectSchema } from "./studio-review-preview";
import { StudioReviewPreviewService } from "./studio-review-preview.service";

export class StudioReviewPreviewParamsDto extends createZodDto(z.object({ reviewId: studioEntityIdSchema }).strict()) {}
export class StudioReviewPreviewQueryDto extends createZodDto(studioReviewPreviewSubjectSchema.omit({ schemaVersion: true, reviewId: true })
  .extend({ cursor: studioReviewPreviewCursorSchema.optional() }).strict()) {}

@Controller("/studio-project-graph")
export class StudioReviewPreviewController {
  constructor(@Inject(StudioReviewPreviewService) private readonly service: StudioReviewPreviewService) {}

  @Get("/reviews/:reviewId/previews")
  @Header("Cache-Control", "private, no-store, max-age=0")
  @Header("Referrer-Policy", "no-referrer")
  getPreviews(
    @Param(new ZodValidationPipe(StudioReviewPreviewParamsDto)) params: StudioReviewPreviewParamsDto,
    @Query(new ZodValidationPipe(StudioReviewPreviewQueryDto)) query: StudioReviewPreviewQueryDto,
    @Headers("x-user-id") userId?: string,
  ) {
    const { cursor, ...identity } = query;
    return this.service.read(authenticatedStudioUserId(userId),
      { schemaVersion: 1, ...identity, reviewId: params.reviewId }, cursor ?? null);
  }
}
