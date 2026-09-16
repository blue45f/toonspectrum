import {
  BadRequestException,
  Body,
  Controller,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";

import {
  KakaoWebhookAuthenticationError,
  KakaoWebhookConfigurationError,
  KakaoWebhookPayloadError,
  parseKakaoUnlinkWebhook,
  processKakaoUnlink,
} from "./kakao-unlink-webhook";

@Controller("webhooks/kakao")
export class KakaoUnlinkWebhookController {
  private readonly logger = new Logger(KakaoUnlinkWebhookController.name);

  @Post("unlink")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  async unlink(
    @Headers("authorization") authorization: string | undefined,
    @Body() payload: unknown,
  ): Promise<{ ok: true }> {
    let event;
    try {
      event = parseKakaoUnlinkWebhook(
        authorization,
        payload,
      );
    } catch (error) {
      if (error instanceof KakaoWebhookConfigurationError) {
        throw new ServiceUnavailableException({
          error: "Kakao unlink webhook is not configured.",
        });
      }
      if (error instanceof KakaoWebhookAuthenticationError) {
        throw new UnauthorizedException({
          error: "Invalid Kakao webhook authority.",
        });
      }
      if (error instanceof KakaoWebhookPayloadError) {
        throw new BadRequestException({
          error: "Invalid Kakao unlink webhook payload.",
        });
      }
      throw error;
    }

    try {
      await processKakaoUnlink(event);
    } catch {
      // Kakao requires a 200 response even when internal cleanup fails. Keep
      // provider identifiers and credentials out of logs; operations can use
      // the structured controller context to investigate without exposing PII.
      this.logger.error("Kakao unlink webhook processing failed");
    }
    return { ok: true };
  }
}
