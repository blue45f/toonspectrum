import {
  Body,
  Controller,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import { ZodSerializerDto } from "nestjs-zod";

import {
  getSessionAuthenticationPrincipal,
  getSessionAuthenticationSource,
} from "../../session-middleware";

import {
  IssueStudioRealtimeTicketDto,
  StudioRealtimeTicketResponseDto,
} from "./studio-realtime-ticket.dto";
import { StudioRealtimeTicketService } from "./studio-realtime-ticket.service";

import type { Request } from "express";

@Controller("studio-realtime")
export class StudioRealtimeTicketController {
  constructor(
    @Inject(StudioRealtimeTicketService)
    private readonly service: StudioRealtimeTicketService,
  ) {}

  @Post("tickets")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "private, no-store, max-age=0")
  @Header("Pragma", "no-cache")
  @Header("Referrer-Policy", "no-referrer")
  @Header("Vary", "Origin")
  @ZodSerializerDto(StudioRealtimeTicketResponseDto)
  issue(
    @Req() request: Request,
    @Headers("origin") origin: string | undefined,
    @Body() body: IssueStudioRealtimeTicketDto,
  ): Promise<StudioRealtimeTicketResponseDto> {
    if (getSessionAuthenticationSource(request) !== "cookie") {
      throw new UnauthorizedException("로그인이 필요해요.");
    }
    const principal = getSessionAuthenticationPrincipal(request);
    if (!principal) throw new UnauthorizedException("로그인이 필요해요.");
    return this.service.issue(principal, origin, body);
  }
}
