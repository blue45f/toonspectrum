import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpException,
  Inject,
  Module,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";

import {
  CreatorIntelligenceInputError,
  createCreatorIntelligenceCore,
} from "./creator-intelligence-core";
import { CreatorIntelligenceAdmissionGuard } from "./creator-intelligence-admission";

import type { Request } from "express";
import type { CreatorIntelligenceCore } from "./creator-intelligence-core";

const CREATOR_INTELLIGENCE_CORE = Symbol("CREATOR_INTELLIGENCE_CORE");

@Controller("creator-intelligence")
export class CreatorIntelligenceController {
  constructor(
    @Inject(CREATOR_INTELLIGENCE_CORE)
    private readonly core: CreatorIntelligenceCore,
    private readonly admission: CreatorIntelligenceAdmissionGuard,
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
    const current = this.core.describe();
    const admission = this.admission.describe();
    if (admission.paidRoutesEnabled) return { ...current, admission };

    const disabled = {
      status: "disabled",
      reason: "operator paid-route admission gate is disabled",
    } as const;
    return {
      ...current,
      translation: { deepl: disabled, libretranslate: disabled },
      voice: { gemini: disabled, deepgram: disabled },
      soundEffects: disabled,
      meshy: disabled,
      safeSearch: disabled,
      admission,
    };
  }

  @Get("references")
  @Header("Cache-Control", "private, no-store")
  references(
    @Query("provider") provider: string,
    @Query("q") query: string,
    @Query("page") page?: string,
    @Query("media") media?: string,
  ) {
    return this.execute(() => this.core.searchReferences(
      provider,
      query,
      page,
      media,
    ));
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
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: Record<string, unknown>,
    @Req() request: Request,
  ) {
    this.admission.admit("voice-synthesize", userId, idempotencyKey);
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
  soundGenerate(
    @Headers("x-user-id") userId: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    this.admission.admit("sound-generate", userId, idempotencyKey);
    return this.execute(() => this.core.generateSoundEffect(body));
  }

  @Post("translate")
  @Header("Cache-Control", "private, no-store")
  translate(
    @Headers("x-user-id") userId: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    this.admission.admit("translate", userId, idempotencyKey);
    return this.execute(() => this.core.translate(body.provider, body));
  }

  @Post("mesh/jobs")
  @Header("Cache-Control", "private, no-store")
  async meshCreate(
    @Headers("x-user-id") userId: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    const actorId = this.admission.admit(
      "mesh-create",
      userId,
      idempotencyKey,
    );
    const result = await this.execute(() => this.core.createMeshyJob(body));
    return result.status === "ready" && typeof result.jobId === "string"
      ? {
        ...result,
        jobId: this.admission.wrapMeshJob(actorId, result.jobId),
      }
      : result;
  }

  @Get("mesh/jobs/:jobId")
  @Header("Cache-Control", "private, no-store")
  meshStatus(
    @Headers("x-user-id") userId: string | undefined,
    @Param("jobId") jobId: string,
  ) {
    const actorId = this.admission.admit("mesh-status", userId);
    const providerJobId = this.admission.unwrapMeshJob(actorId, jobId);
    return this.execute(() => this.core.getMeshyJob(providerJobId));
  }

  @Post("preflight/safe-search")
  @Header("Cache-Control", "private, no-store")
  safeSearch(
    @Headers("x-user-id") userId: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    this.admission.admit("safe-search", userId, idempotencyKey);
    return this.execute(() => this.core.safeSearch(body));
  }
}

@Module({
  controllers: [CreatorIntelligenceController],
  providers: [
    {
      provide: CreatorIntelligenceAdmissionGuard,
      useFactory: () => new CreatorIntelligenceAdmissionGuard(),
    },
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
