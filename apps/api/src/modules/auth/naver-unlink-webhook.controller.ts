import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Header,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  Logger,
  Post,
  ServiceUnavailableException,
} from "@nestjs/common";

import {
  NaverWebhookAuthenticationError,
  NaverWebhookConfigurationError,
  NaverWebhookPayloadError,
  parseNaverUnlinkWebhook,
  processNaverUnlink,
} from "./naver-unlink-webhook";

@Controller("webhooks/naver")
export class NaverUnlinkWebhookController {
  private readonly logger = new Logger(NaverUnlinkWebhookController.name);

  @Post("unlink")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header("Cache-Control", "no-store")
  async unlink(@Body() payload: unknown): Promise<void> {
    let event;
    try {
      event = parseNaverUnlinkWebhook(payload);
    } catch (error) {
      if (error instanceof NaverWebhookConfigurationError) {
        throw new ServiceUnavailableException({
          error: "Naver unlink webhook is not configured.",
        });
      }
      if (error instanceof NaverWebhookAuthenticationError) {
        throw new ForbiddenException({
          error: "Invalid Naver unlink webhook authority.",
        });
      }
      if (error instanceof NaverWebhookPayloadError) {
        throw new BadRequestException({
          error: "Invalid Naver unlink webhook payload.",
        });
      }
      throw error;
    }

    try {
      await processNaverUnlink(event);
    } catch {
      this.logger.error("Naver unlink webhook processing failed");
      throw new InternalServerErrorException({
        error: "Naver unlink cleanup failed.",
      });
    }
  }
}
