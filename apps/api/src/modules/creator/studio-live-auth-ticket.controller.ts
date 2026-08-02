import {
  Body,
  Controller,
  Header,
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
  StudioLiveAuthTicketRequestDto,
  StudioLiveAuthTicketResponseDto,
} from "./studio-live-auth-ticket.dto";
import { StudioLiveAuthTicketService } from "./studio-live-auth-ticket.service";

import type { Request } from "express";

@Controller("creator/studio-live")
export class StudioLiveAuthTicketController {
  constructor(
    @Inject(StudioLiveAuthTicketService)
    private readonly service: StudioLiveAuthTicketService,
  ) {}

  @Post("auth-ticket")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "private, no-store, max-age=0")
  @Header("Pragma", "no-cache")
  @Header("Referrer-Policy", "no-referrer")
  @ZodSerializerDto(StudioLiveAuthTicketResponseDto)
  issue(
    @Req() request: Request,
    @Body() body: StudioLiveAuthTicketRequestDto,
  ): StudioLiveAuthTicketResponseDto {
    if (getSessionAuthenticationSource(request) !== "cookie") {
      throw new UnauthorizedException("로그인이 필요해요.");
    }
    const principal = getSessionAuthenticationPrincipal(request);
    if (!principal) throw new UnauthorizedException("로그인이 필요해요.");
    return this.service.issue(principal, body);
  }
}
