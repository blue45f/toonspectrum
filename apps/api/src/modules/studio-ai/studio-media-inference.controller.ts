import {
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  ServiceUnavailableException,
} from "@nestjs/common";

const PERSONAL_RUNTIME_REQUIRED = Object.freeze({
  code: "PERSONAL_CREATOR_RUNTIME_REQUIRED",
  message: "운영측 미디어 추론은 비활성화되어 있습니다. 통합 AI 설정에서 관리형 클라우드 Creator Runtime을 연결하세요.",
  settingsHref: "/settings/ai",
  directBrowserConnection: true,
  operatorFunded: false,
});

@Controller("studio-ai/media")
export class StudioMediaInferenceController {
  private disabled(): never {
    throw new ServiceUnavailableException(PERSONAL_RUNTIME_REQUIRED);
  }

  @Get("status")
  @Header("Cache-Control", "no-store")
  status() {
    return {
      configured: false,
      provider: "personal-creator-runtime",
      capabilities: [],
      externalPaidFallback: false,
      directBrowserConnection: true,
      operatorFunded: false,
      settingsHref: PERSONAL_RUNTIME_REQUIRED.settingsHref,
    };
  }

  @Get("jobs") list(): never { return this.disabled(); }
  @Get("jobs/:id") get(): never { return this.disabled(); }
  @Post("jobs") @HttpCode(HttpStatus.SERVICE_UNAVAILABLE) create(): never { return this.disabled(); }
  @Post("jobs/:id/cancel") @HttpCode(HttpStatus.SERVICE_UNAVAILABLE) cancel(): never { return this.disabled(); }
  @Get("jobs/:id/artifacts/:index") artifact(): never { return this.disabled(); }
}
