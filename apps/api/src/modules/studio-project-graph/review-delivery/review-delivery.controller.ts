import { applyDecorators, Body, Controller, Get, Header, Headers, HttpCode, Inject, Param, Post, Req, StreamableFile } from "@nestjs/common";
import { createZodDto } from "nestjs-zod";
import type { Request } from "express";
import { z } from "zod";
import { reviewDeliveryAcceptSchema, reviewDeliveryActionSchema, reviewDeliveryId, reviewDeliveryPrepareSchema } from "@toonspectrum/studio-project-model/review-delivery";
import { studioWorkSessionId } from "@toonspectrum/studio-project-model/work-session";

import { ZodValidationPipe } from "../../../platform/http/zod-validation.pipe";
import { authenticatedStudioUserId } from "../studio-project-graph.controller";
import { StudioReviewDeliveryService } from "./review-delivery.service";

const privateResponse = () => applyDecorators(Header("Cache-Control", "private, no-store, max-age=0"), Header("Referrer-Policy", "no-referrer"), Header("X-Content-Type-Options", "nosniff"), Header("X-Robots-Tag", "noindex, nofollow"));
class WorkParams extends createZodDto(z.object({ workId: studioWorkSessionId }).strict()) {}
class DeliveryParams extends createZodDto(z.object({ workId: studioWorkSessionId, deliveryId: reviewDeliveryId }).strict()) {}
class PrepareBody extends createZodDto(reviewDeliveryPrepareSchema) {}
class ActionBody extends createZodDto(reviewDeliveryActionSchema) {}
class AcceptBody extends createZodDto(reviewDeliveryAcceptSchema) {}

@Controller("/creator/works/:workId/review-deliveries")
export class StudioReviewDeliveryController {
  constructor(@Inject(StudioReviewDeliveryService) private readonly service: StudioReviewDeliveryService) {}
  @Get() @privateResponse()
  list(@Param(new ZodValidationPipe(WorkParams)) p: WorkParams, @Headers("x-user-id") actor?: string) {
    return this.service.run(() => this.service.list(authenticatedStudioUserId(actor), p.workId));
  }
  @Post() @HttpCode(200) @privateResponse()
  prepare(@Param(new ZodValidationPipe(WorkParams)) p: WorkParams, @Body(new ZodValidationPipe(PrepareBody)) body: PrepareBody, @Headers("x-user-id") actor?: string) {
    return this.service.run(() => this.service.prepare(authenticatedStudioUserId(actor), p.workId, body));
  }
  @Post(":deliveryId/issue") @HttpCode(200) @privateResponse()
  issue(@Param(new ZodValidationPipe(DeliveryParams)) p: DeliveryParams, @Body(new ZodValidationPipe(ActionBody)) body: ActionBody, @Headers("x-user-id") actor?: string) {
    return this.service.run(() => this.service.issue(authenticatedStudioUserId(actor), p.workId, p.deliveryId, body));
  }
  @Post(":deliveryId/cancel") @HttpCode(200) @privateResponse()
  cancel(@Param(new ZodValidationPipe(DeliveryParams)) p: DeliveryParams, @Body(new ZodValidationPipe(ActionBody)) body: ActionBody, @Headers("x-user-id") actor?: string) {
    return this.service.run(() => this.service.cancel(authenticatedStudioUserId(actor), p.workId, p.deliveryId, body));
  }
  @Post(":deliveryId/accept") @HttpCode(200) @privateResponse()
  accept(@Param(new ZodValidationPipe(DeliveryParams)) p: DeliveryParams, @Body(new ZodValidationPipe(AcceptBody)) body: AcceptBody, @Headers("x-user-id") actor?: string) {
    return this.service.run(() => this.service.accept(authenticatedStudioUserId(actor), p.workId, p.deliveryId, body));
  }
  @Post(":deliveryId/download") @HttpCode(200) @privateResponse()
  async download(@Param(new ZodValidationPipe(DeliveryParams)) p: DeliveryParams, @Body(new ZodValidationPipe(ActionBody)) body: ActionBody,
    @Headers("x-user-id") actor: string | undefined, @Req() request: Request) {
    const abort = new AbortController(), stop = () => abort.abort(); request.once("aborted", stop);
    try {
      const result = await this.service.run(() => this.service.download(authenticatedStudioUserId(actor), p.workId, p.deliveryId, body, abort.signal));
      return new StreamableFile(result.bytes, { type: "application/zip", length: result.bytes.length,
        disposition: `attachment; filename="${result.fileName}"` });
    } finally { request.off("aborted", stop); }
  }
}
