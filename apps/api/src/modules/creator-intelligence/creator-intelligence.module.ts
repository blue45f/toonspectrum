import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpException,
  Inject,
  Module,
  Param,
  Post,
  Query,
} from "@nestjs/common";

import {
  CreatorIntelligenceInputError,
  createCreatorIntelligenceCore,
} from "./creator-intelligence-core";

import type { CreatorIntelligenceCore } from "./creator-intelligence-core";

const CREATOR_INTELLIGENCE_CORE = Symbol("CREATOR_INTELLIGENCE_CORE");

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
