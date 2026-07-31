import {
  Body,
  Controller,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { ZodSerializerDto } from "nestjs-zod";

import {
  IssueStudioRealtimeTicketDto,
  StudioRealtimeTicketResponseDto,
} from "./studio-realtime-ticket.dto";
import { StudioRealtimeTicketService } from "./studio-realtime-ticket.service";

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
    @Headers("x-user-id") userId: string | undefined,
    @Headers("origin") origin: string | undefined,
    @Body() body: IssueStudioRealtimeTicketDto,
  ): Promise<StudioRealtimeTicketResponseDto> {
    if (!userId) {
      throw new UnauthorizedException("로그인이 필요해요.");
    }
    return this.service.issue(userId, origin, body);
  }
}
