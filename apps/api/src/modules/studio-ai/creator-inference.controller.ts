import {
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Injectable,
  Inject,
  Post,
  Put,
  ServiceUnavailableException,
} from "@nestjs/common";

const PERSONAL_RUNTIME_REQUIRED = Object.freeze({
  code: "PERSONAL_CREATOR_RUNTIME_REQUIRED",
  message: "운영측 GPU 추론 경로는 비활성화되어 있습니다. 통합 AI 설정에서 관리형 클라우드 Creator Runtime을 연결하세요.",
  settingsHref: "/settings/ai",
  directBrowserConnection: true,
  operatorFunded: false,
});

@Injectable()
export class CreatorInferenceGateway {
  status() {
    return {
      enabled: false,
      engines: {},
      reason: PERSONAL_RUNTIME_REQUIRED.message,
      settingsHref: PERSONAL_RUNTIME_REQUIRED.settingsHref,
      directBrowserConnection: true,
      operatorFunded: false,
    };
  }
  disabled(): never {
    throw new ServiceUnavailableException(PERSONAL_RUNTIME_REQUIRED);
  }
}

@Controller("studio-ai/inference")
export class CreatorInferenceController {
  constructor(
    @Inject(CreatorInferenceGateway)
    private readonly gateway: CreatorInferenceGateway,
  ) {}

  @Get("status")
  @Header("Cache-Control", "no-store")
  status() { return this.gateway.status(); }

  @Get("jobs") list(): never { return this.gateway.disabled(); }
  @Post("uploads") upload(): never { return this.gateway.disabled(); }
  @Put("uploads/:id/chunks/:index") chunk(): never { return this.gateway.disabled(); }
  @Post("uploads/cleanup") cleanupUploads(): never { return this.gateway.disabled(); }
  @Post("uploads/:id/complete") complete(): never { return this.gateway.disabled(); }
  @Delete("uploads/:id") deleteUpload(): never { return this.gateway.disabled(); }
  @Post("jobs") @HttpCode(HttpStatus.SERVICE_UNAVAILABLE) submit(): never { return this.gateway.disabled(); }
  @Get("jobs/:id") job(): never { return this.gateway.disabled(); }
  @Post("jobs/:id/cancel") cancel(): never { return this.gateway.disabled(); }
  @Delete("jobs/:id") remove(): never { return this.gateway.disabled(); }
  @Get("jobs/:id/artifacts/:name/chunks/:index") artifact(): never { return this.gateway.disabled(); }
}
