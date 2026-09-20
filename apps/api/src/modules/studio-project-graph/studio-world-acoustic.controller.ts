import { Body, Controller, Get, Header, Headers, HttpCode, Inject, Param, Post, Req, UnauthorizedException } from "@nestjs/common";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { studioAcousticDoorChangeSchema, studioAcousticSessionOpenSchema, studioAcousticSessionReadSchema, studioAcousticSessionRenewSchema, studioEntityIdSchema } from "@toonspectrum/studio-project-model";
import type { Request } from "express";
import { getSessionAuthenticationPrincipal, getSessionAuthenticationSource } from "../../session-middleware";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { StudioWorkParamsDto } from "./studio-project-graph.dto";
import { requireStudioIdempotencyKey } from "./studio-project-graph.controller";
import { StudioWorldAcousticService } from "./studio-world-acoustic.service";

export class StudioAcousticDoorDto extends createZodDto(studioAcousticDoorChangeSchema) {}
export class StudioAcousticOpenDto extends createZodDto(studioAcousticSessionOpenSchema) {}
export class StudioAcousticReadDto extends createZodDto(studioAcousticSessionReadSchema) {}
export class StudioAcousticRenewDto extends createZodDto(studioAcousticSessionRenewSchema) {}
export class StudioAcousticZoneParamsDto extends createZodDto(z.object({workId:studioEntityIdSchema,zoneId:studioEntityIdSchema}).strict()) {}
function principal(request:Request) {
  const value=getSessionAuthenticationPrincipal(request);
  if (getSessionAuthenticationSource(request)!=="cookie" || !value) throw new UnauthorizedException("로그인이 필요해요.");
  return value;
}
@Controller("/studio-project-graph/works/:workId/acoustic")
export class StudioWorldAcousticController {
  constructor(@Inject(StudioWorldAcousticService) private readonly service:StudioWorldAcousticService) {}
  @Get("/zones/:zoneId/door") @Header("Cache-Control","private, no-store, max-age=0")
  door(@Req() req:Request,@Param(new ZodValidationPipe(StudioAcousticZoneParamsDto)) params:StudioAcousticZoneParamsDto) {return this.service.door(principal(req),params.workId,params.zoneId);}
  @Post("/door") @HttpCode(200) @Header("Cache-Control","private, no-store, max-age=0")
  changeDoor(@Req() req:Request,@Param(new ZodValidationPipe(StudioWorkParamsDto)) params:StudioWorkParamsDto,@Body(new ZodValidationPipe(StudioAcousticDoorDto)) body:StudioAcousticDoorDto,@Headers("idempotency-key") key?:string) {return this.service.changeDoor(principal(req),params.workId,body,requireStudioIdempotencyKey(key));}
  @Post("/sessions/open") @HttpCode(200) @Header("Cache-Control","private, no-store, max-age=0")
  open(@Req() req:Request,@Param(new ZodValidationPipe(StudioWorkParamsDto)) params:StudioWorkParamsDto,@Body(new ZodValidationPipe(StudioAcousticOpenDto)) body:StudioAcousticOpenDto,@Headers("idempotency-key") key?:string) {return this.service.open(principal(req),params.workId,body,requireStudioIdempotencyKey(key));}
  @Post("/sessions/read-open-intent") @HttpCode(200) @Header("Cache-Control","private, no-store, max-age=0")
  readOpenIntent(@Req() req:Request,@Param(new ZodValidationPipe(StudioWorkParamsDto)) params:StudioWorkParamsDto,@Body(new ZodValidationPipe(StudioAcousticOpenDto)) body:StudioAcousticOpenDto,@Headers("idempotency-key") key?:string) {return this.service.readOpenIntent(principal(req),params.workId,body,requireStudioIdempotencyKey(key));}
  @Post("/sessions/read") @HttpCode(200) @Header("Cache-Control","private, no-store, max-age=0")
  current(@Req() req:Request,@Param(new ZodValidationPipe(StudioWorkParamsDto)) params:StudioWorkParamsDto,@Body(new ZodValidationPipe(StudioAcousticReadDto)) body:StudioAcousticReadDto) {return this.service.current(principal(req),params.workId,body.sessionEpoch);}
  @Post("/sessions/renew") @HttpCode(200) @Header("Cache-Control","private, no-store, max-age=0")
  renew(@Req() req:Request,@Param(new ZodValidationPipe(StudioWorkParamsDto)) params:StudioWorkParamsDto,@Body(new ZodValidationPipe(StudioAcousticRenewDto)) body:StudioAcousticRenewDto) {return this.service.renew(principal(req),params.workId,body);}
  @Post("/sessions/close") @HttpCode(200) @Header("Cache-Control","private, no-store, max-age=0")
  revoke(@Req() req:Request,@Param(new ZodValidationPipe(StudioWorkParamsDto)) params:StudioWorkParamsDto,@Body(new ZodValidationPipe(StudioAcousticReadDto)) body:StudioAcousticReadDto) {return this.service.revoke(principal(req),params.workId,body.sessionEpoch);}
}
