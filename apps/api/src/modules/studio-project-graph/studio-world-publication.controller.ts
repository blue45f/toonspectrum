import { Body, Controller, Get, Header, Headers, HttpCode, HttpStatus, Inject, Param, Post } from "@nestjs/common";
import { createZodDto } from "nestjs-zod";
import { studioWorldPublishSchema } from "@toonspectrum/studio-project-model/world-publication";
import { ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { authenticatedStudioUserId, requireStudioIdempotencyKey } from "./studio-project-graph.controller";
import { StudioWorkParamsDto } from "./studio-project-graph.dto";
import { StudioWorldPublicationService } from "./studio-world-publication.service";

export class StudioWorldPublishDto extends createZodDto(studioWorldPublishSchema) {}

@Controller("/studio-project-graph/works/:workId/world")
export class StudioWorldPublicationController {
  constructor(@Inject(StudioWorldPublicationService) private readonly service: StudioWorldPublicationService) {}

  @Get()
  @Header("Cache-Control", "private, no-store, max-age=0")
  current(@Param(new ZodValidationPipe(StudioWorkParamsDto)) params: StudioWorkParamsDto, @Headers("x-user-id") actor?: string) {
    return this.service.current(authenticatedStudioUserId(actor), params.workId);
  }

  @Post("/publish")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "private, no-store, max-age=0")
  publish(@Param(new ZodValidationPipe(StudioWorkParamsDto)) params: StudioWorkParamsDto,
    @Body(new ZodValidationPipe(StudioWorldPublishDto)) body: StudioWorldPublishDto,
    @Headers("idempotency-key") key: string | undefined, @Headers("x-user-id") actor?: string) {
    return this.service.publish(authenticatedStudioUserId(actor), params.workId, body, requireStudioIdempotencyKey(key));
  }
}
