import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";

import { StudioAiChatDto } from "./studio-ai.dto";
import { StudioAiService } from "./studio-ai.service";

import type { Request, Response } from "express";

@Controller("studio-ai")
export class StudioAiController {
  // `tsx watch` does not emit Nest's design:paramtypes metadata, so use an
  // explicit token to keep development and compiled production behavior equal.
  constructor(@Inject(StudioAiService) private readonly studioAiService: StudioAiService) {}

  @Get("status")
  @Header("Cache-Control", "no-store, max-age=0")
  status() {
    return this.studioAiService.status();
  }

  @Post("chat")
  @HttpCode(HttpStatus.OK)
  async chat(
    @Headers("x-user-id") userId: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: StudioAiChatDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ) {
    if (!userId) throw new UnauthorizedException("서버 AI를 사용하려면 로그인이 필요해요.");

    const clientController = new AbortController();
    const abortForClientDisconnect = () => {
      if (!clientController.signal.aborted) clientController.abort();
    };
    const abortForResponseClose = () => {
      // A normal response can emit `close` after it has been fully written. Only
      // an early close means the caller went away while the upstream request was active.
      if (!response.writableEnded) abortForClientDisconnect();
    };

    request.once("aborted", abortForClientDisconnect);
    response.once("close", abortForResponseClose);
    if (request.aborted || response.destroyed) abortForClientDisconnect();

    try {
      return await this.studioAiService.complete(
        userId,
        body,
        idempotencyKey,
        clientController.signal
      );
    } finally {
      request.off("aborted", abortForClientDisconnect);
      response.off("close", abortForResponseClose);
    }
  }
}
