import {
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  ServiceUnavailableException,
} from "@nestjs/common";

const USER_AI_REQUIRED = Object.freeze({
  code: "USER_AI_CONNECTION_REQUIRED",
  message: "운영측 텍스트 AI는 비활성화되어 있습니다. 통합 AI 설정에서 본인 키를 연결하세요.",
  settingsHref: "/studio/ai-settings",
  operatorFunded: false,
});

@Controller("studio-ai")
export class StudioAiController {
  @Get("status")
  @Header("Cache-Control", "no-store, max-age=0")
  status() {
    return {
      configured: false,
      provider: "none",
      model: "",
      providers: [],
      selection: { default: "auto", order: [], fallback: false },
      capabilities: [],
      requiresAuth: false,
      operatorFunded: false,
      settingsHref: USER_AI_REQUIRED.settingsHref,
    };
  }

  @Post("chat")
  @HttpCode(HttpStatus.SERVICE_UNAVAILABLE)
  chat(): never {
    throw new ServiceUnavailableException(USER_AI_REQUIRED);
  }
}
