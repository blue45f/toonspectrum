import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpException,
  HttpStatus,
  Inject,
  Module,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from "@nestjs/common";

import {
  CreatorIntelligenceInputError,
  createCreatorIntelligenceCore,
} from "./creator-intelligence-core";

import type { Request } from "express";
import { LocalAuthRateLimiter } from "../auth/auth-rate-limit";
import type { CreatorIntelligenceCore } from "./creator-intelligence-core";

const CREATOR_INTELLIGENCE_CORE = Symbol("CREATOR_INTELLIGENCE_CORE");
const voiceRateLimiter = new LocalAuthRateLimiter({ maximumIdentities: 20_000 });

@Controller("creator-intelligence")
export class CreatorIntelligenceController {
  constructor(
    @Inject(CREATOR_INTELLIGENCE_CORE)
    private readonly core: CreatorIntelligenceCore,
  ) {}

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof CreatorIntelligenceInputError) {
        throw new BadRequestException(error.message);
      }
      throw new HttpException(
        "외부 창작 도구 제공처의 응답을 확인하지 못했습니다. 잠시 후 다시 시도하세요.",
        502,
      );
    }
  }

  @Get("status")
  @Header("Cache-Control", "private, no-store")
  status() {
    return this.core.describe();
  }

  @Get("references")
  @Header("Cache-Control", "private, no-store")
  references(
    @Query("provider") provider: string,
    @Query("q") query: string,
    @Query("page") page?: string,
  ) {
    return this.execute(() => this.core.searchReferences(provider, query, page));
  }

  @Get("scene")
  @Header("Cache-Control", "private, no-store")
  scene(@Query("place") place: string, @Query("date") date: string) {
    return this.execute(() => this.core.sceneReference(place, date));
  }

  @Get("anilist")
  @Header("Cache-Control", "private, no-store")
  anilist(@Query("q") query: string, @Query("type") type?: string) {
    return this.execute(() => this.core.searchAniList(query, type));
  }

  @Get("sfx/search")
  @Header("Cache-Control", "private, no-store")
  soundSearch(@Query("q") query: string, @Query("page") page?: string) {
    return this.execute(() => this.core.searchSoundEffects(query, page));
  }

  @Post("voice/synthesize")
  @Header("Cache-Control", "private, no-store")
  async voiceSynthesize(
    @Headers("x-user-id") userId: string | undefined,
    @Body() body: Record<string, unknown>,
    @Req() request: Request,
  ) {
    if (!userId?.trim()) {
      throw new UnauthorizedException("클라우드 AI 음성을 사용하려면 로그인하세요.");
    }
    const subject = userId.trim();
    const shortWindow = voiceRateLimiter.consume(
      `creator-intelligence-voice-short:${subject}`,
      60,
      10 * 60_000,
    );
    const dailyWindow = voiceRateLimiter.consume(
      `creator-intelligence-voice-daily:${subject}`,
      120,
      24 * 60 * 60_000,
    );
    if (shortWindow.status !== "accepted" || dailyWindow.status !== "accepted") {
      throw new HttpException({
        code: "creator_intelligence_voice_rate_limited",
        message: "무료 AI 음성 생성 한도에 도달했어요. 잠시 후 다시 시도하거나 로컬 시스템 음성을 사용해 주세요.",
      }, HttpStatus.TOO_MANY_REQUESTS);
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    request.once("aborted", abort);
    if (request.aborted) abort();
    try {
      return await this.execute(() => this.core.synthesizeVoice(
        body.provider,
        body,
        controller.signal,
      ));
    } finally {
      request.off("aborted", abort);
    }
  }

  @Post("sfx/generate")
  @Header("Cache-Control", "private, no-store")
  soundGenerate(@Body() body: Record<string, unknown>) {
    return this.execute(() => this.core.generateSoundEffect(body));
  }

  @Post("translate")
  @Header("Cache-Control", "private, no-store")
  translate(@Body() body: Record<string, unknown>) {
    return this.execute(() => this.core.translate(body.provider, body));
  }

  @Post("mesh/jobs")
  @Header("Cache-Control", "private, no-store")
  meshCreate(@Body() body: Record<string, unknown>) {
    return this.execute(() => this.core.createMeshyJob(body));
  }

  @Get("mesh/jobs/:jobId")
  @Header("Cache-Control", "private, no-store")
  meshStatus(@Param("jobId") jobId: string) {
    return this.execute(() => this.core.getMeshyJob(jobId));
  }

  @Post("preflight/safe-search")
  @Header("Cache-Control", "private, no-store")
  safeSearch(@Body() body: Record<string, unknown>) {
    return this.execute(() => this.core.safeSearch(body));
  }
}

@Module({
  controllers: [CreatorIntelligenceController],
  providers: [
    {
      provide: CREATOR_INTELLIGENCE_CORE,
      useFactory: () => createCreatorIntelligenceCore({
        fetch: (url, init) => fetch(url, init),
        env: () => process.env,
      }),
    },
  ],
})
export class CreatorIntelligenceModule {}
