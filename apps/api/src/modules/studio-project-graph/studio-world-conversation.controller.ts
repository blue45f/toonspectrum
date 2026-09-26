import { Body, Controller, Header, Headers, HttpCode, Inject, Param, Post, Req, UnauthorizedException } from "@nestjs/common";
import { createZodDto } from "nestjs-zod";
import { studioConversationChangeSchema, studioConversationProposeSchema, studioConversationReadSchema, studioConversationRenewSchema } from "@toonspectrum/studio-project-model/world-conversation";
import type { Request } from "express";
import { getSessionAuthenticationPrincipal, getSessionAuthenticationSource } from "../../session-middleware";
import { ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { StudioWorkParamsDto } from "./studio-project-graph.dto";
import { requireStudioIdempotencyKey } from "./studio-project-graph.controller";
import { StudioWorldConversationService } from "./studio-world-conversation.service";

export class StudioConversationProposeDto extends createZodDto(studioConversationProposeSchema){}
export class StudioConversationReadDto extends createZodDto(studioConversationReadSchema){}
export class StudioConversationChangeDto extends createZodDto(studioConversationChangeSchema){}
export class StudioConversationRenewDto extends createZodDto(studioConversationRenewSchema){}
function principal(req:Request){const value=getSessionAuthenticationPrincipal(req);if(getSessionAuthenticationSource(req)!=="cookie"||!value)throw new UnauthorizedException("로그인이 필요해요.");return value;}
@Controller("/studio-project-graph/works/:workId/acoustic/conversations")
export class StudioWorldConversationController {
  constructor(@Inject(StudioWorldConversationService)private readonly service:StudioWorldConversationService){}
  @Post("/propose") @HttpCode(200) @Header("Cache-Control","private, no-store, max-age=0")
  propose(@Req()req:Request,@Param(new ZodValidationPipe(StudioWorkParamsDto))params:StudioWorkParamsDto,@Body(new ZodValidationPipe(StudioConversationProposeDto))body:StudioConversationProposeDto,@Headers("idempotency-key")key?:string){return this.service.propose(principal(req),params.workId,body,requireStudioIdempotencyKey(key));}
  @Post("/read") @HttpCode(200) @Header("Cache-Control","private, no-store, max-age=0")
  current(@Req()req:Request,@Param(new ZodValidationPipe(StudioWorkParamsDto))params:StudioWorkParamsDto,@Body(new ZodValidationPipe(StudioConversationReadDto))body:StudioConversationReadDto){return this.service.current(principal(req),params.workId,body);}
  @Post("/change") @HttpCode(200) @Header("Cache-Control","private, no-store, max-age=0")
  change(@Req()req:Request,@Param(new ZodValidationPipe(StudioWorkParamsDto))params:StudioWorkParamsDto,@Body(new ZodValidationPipe(StudioConversationChangeDto))body:StudioConversationChangeDto,@Headers("idempotency-key")key?:string){return this.service.change(principal(req),params.workId,body,requireStudioIdempotencyKey(key));}
  @Post("/renew") @HttpCode(200) @Header("Cache-Control","private, no-store, max-age=0")
  renew(@Req()req:Request,@Param(new ZodValidationPipe(StudioWorkParamsDto))params:StudioWorkParamsDto,@Body(new ZodValidationPipe(StudioConversationRenewDto))body:StudioConversationRenewDto){return this.service.renew(principal(req),params.workId,body);}
}
