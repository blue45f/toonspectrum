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
  Res,
  UnauthorizedException,
} from "@nestjs/common";

import { PrivateObjectStorageModule } from "../../platform/adapters/private-object-storage/private-object-storage.module";
import { UpstashCoordinationModule } from "../../platform/adapters/upstash-coordination/upstash-coordination.module";
import { UPSTASH_COORDINATION_PORT } from "../../platform/adapters/upstash-coordination/upstash-coordination.port";
import {
  studioRemoteReferenceDnsResolverProvider,
  studioRemoteReferenceHttpRequesterProvider,
} from "../creator/studio-remote-reference-image.network";
import {
  CreatorIntelligenceInputError,
  createCreatorIntelligenceCore,
} from "./creator-intelligence-core";
import {
  CreatorIntelligenceAdmissionError,
  CreatorIntelligencePaidAdmission,
  type CreatorIntelligencePaidOperation,
} from "./creator-intelligence-paid-admission";
import { CreatorIntelligenceMeshArtifactService } from "./creator-intelligence-mesh-artifact.service";
import {
  signCreatorIntelligenceMeshJobToken,
  verifyCreatorIntelligenceMeshArtifactToken,
  verifyCreatorIntelligenceMeshJobToken,
} from "./creator-intelligence-mesh-job-token";

import type { Request, Response } from "express";
import type { CreatorIntelligenceCore } from "./creator-intelligence-core";

const CREATOR_INTELLIGENCE_CORE = Symbol("CREATOR_INTELLIGENCE_CORE");
const coordinationModule = UpstashCoordinationModule.fromEnvironment(process.env);
const privateObjectStorageModule = PrivateObjectStorageModule.fromEnvironment(process.env);

function authenticatedUserId(value: string | undefined): string {
  const userId = value?.trim();
  if (!userId) {
    throw new UnauthorizedException("이 클라우드 AI 기능을 사용하려면 로그인하세요.");
  }
  return userId;
}

function requestSignal(request: Request): {
  readonly signal: AbortSignal;
  readonly dispose: () => void;
} {
  const controller = new AbortController();
  const abort = () => controller.abort();
  request.once("aborted", abort);
  if (request.aborted) abort();
  return {
    signal: controller.signal,
    dispose: () => request.off("aborted", abort),
  };
}
@Controller("creator-intelligence")
export class CreatorIntelligenceController {
  constructor(
    @Inject(CREATOR_INTELLIGENCE_CORE)
    private readonly core: CreatorIntelligenceCore,
    @Inject(CreatorIntelligencePaidAdmission)
    private readonly admission: CreatorIntelligencePaidAdmission,
    @Inject(CreatorIntelligenceMeshArtifactService)
    private readonly meshArtifacts: CreatorIntelligenceMeshArtifactService,
  ) {}

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof CreatorIntelligenceInputError) {
        throw new BadRequestException(error.message);
      }
      if (error instanceof CreatorIntelligenceAdmissionError) {
        throw new HttpException({
          code: error.code,
          message: error.message,
          retryAfterMs: error.retryAfterMs,
        }, error.status);
      }
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        "외부 창작 도구 제공처의 응답을 확인하지 못했습니다. 잠시 후 다시 시도하세요.",
        502,
      );
    }
  }

  private async executePaid<T>(input: {
    readonly operation: CreatorIntelligencePaidOperation;
    readonly userId: string | undefined;
    readonly idempotencyKey: string | undefined;
    readonly body: unknown;
    readonly request: Request;
    readonly run: (signal: AbortSignal) => Promise<T>;
  }): Promise<T> {
    const client = requestSignal(input.request);
    try {
      return await this.execute(() => this.admission.execute({
        operation: input.operation,
        userId: authenticatedUserId(input.userId),
        idempotencyKey: input.idempotencyKey,
        request: input.body,
        signal: client.signal,
        run: () => input.run(client.signal),
      }));
    } finally {
      client.dispose();
    }
  }

  @Get("status")
  @Header("Cache-Control", "private, no-store")
  status() {
    return {
      ...this.core.describe(),
      paidExecution: this.admission.status(),
      meshArtifacts: this.meshArtifacts.status(),
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
    return this.execute(() => this.core.searchReferences(provider, query, page, media));
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
  voiceSynthesize(
    @Headers("x-user-id") userId: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: Record<string, unknown>,
    @Req() request: Request,
  ) {
    return this.executePaid({
      operation: "voice",
      userId,
      idempotencyKey,
      body,
      request,
      run: (signal) => this.core.synthesizeVoice(body.provider, body, signal),
    });
  }

  @Post("sfx/generate")
  @Header("Cache-Control", "private, no-store")
  soundGenerate(
    @Headers("x-user-id") userId: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: Record<string, unknown>,
    @Req() request: Request,
  ) {
    return this.executePaid({
      operation: "sound-effect",
      userId,
      idempotencyKey,
      body,
      request,
      run: () => this.core.generateSoundEffect(body),
    });
  }

  @Post("translate")
  @Header("Cache-Control", "private, no-store")
  translate(
    @Headers("x-user-id") userId: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: Record<string, unknown>,
    @Req() request: Request,
  ) {
    return this.executePaid({
      operation: "translation",
      userId,
      idempotencyKey,
      body,
      request,
      run: () => this.core.translate(body.provider, body),
    });
  }

  @Post("mesh/jobs")
  @Header("Cache-Control", "private, no-store")
  async meshCreate(
    @Headers("x-user-id") userId: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: Record<string, unknown>,
    @Req() request: Request,
  ) {
    const authenticated = authenticatedUserId(userId);
    this.meshArtifacts.assertCreateReady();
    const result = await this.executePaid({
      operation: "mesh-create",
      userId: authenticated,
      idempotencyKey,
      body,
      request,
      run: () => this.core.createMeshyJob(body),
    });
    return result.status === "ready" && typeof result.jobId === "string"
      ? { ...result, jobId: signCreatorIntelligenceMeshJobToken(authenticated, result.jobId) }
      : result;
  }

  @Get("mesh/jobs/:jobId")
  @Header("Cache-Control", "private, no-store")
  async meshStatus(
    @Headers("x-user-id") userId: string | undefined,
    @Param("jobId") jobToken: string,
    @Req() request: Request,
  ) {
    const authenticated = authenticatedUserId(userId);
    const providerJobId = verifyCreatorIntelligenceMeshJobToken(
      jobToken,
      authenticated,
    );
    if (!providerJobId) {
      throw new BadRequestException("3D 작업 식별자가 만료됐거나 현재 계정과 일치하지 않아요.");
    }
    const client = requestSignal(request);
    try {
      const result = await this.execute(() => this.core.getMeshyJob(providerJobId));
      const internalized = await this.execute(() => this.meshArtifacts.internalize(
        authenticated,
        providerJobId,
        result,
        client.signal,
      ));
      return internalized.status === "ready" && typeof internalized.jobId === "string"
        ? { ...internalized, jobId: jobToken }
        : internalized;
    } finally {
      client.dispose();
    }
  }

  @Get("mesh/artifacts/:artifactToken")
  @Header("Cache-Control", "private, no-store")
  async meshArtifact(
    @Headers("x-user-id") userId: string | undefined,
    @Param("artifactToken") artifactToken: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const authenticated = authenticatedUserId(userId);
    const artifact = verifyCreatorIntelligenceMeshArtifactToken(
      artifactToken,
      authenticated,
    );
    if (!artifact) {
      throw new BadRequestException("3D 결과 링크가 만료됐거나 현재 계정과 일치하지 않아요.");
    }
    const client = requestSignal(request);
    try {
      const signed = await this.execute(() => this.meshArtifacts.signedRead(
        artifact,
        client.signal,
      ));
      response.setHeader("Cache-Control", "private, no-store");
      response.setHeader("Content-Disposition", `inline; filename="${signed.filename}"`);
      response.setHeader("X-Content-Type-Options", "nosniff");
      response.redirect(307, signed.url);
    } finally {
      client.dispose();
    }
  }

  @Post("preflight/safe-search")
  @Header("Cache-Control", "private, no-store")
  safeSearch(
    @Headers("x-user-id") userId: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: Record<string, unknown>,
    @Req() request: Request,
  ) {
    return this.executePaid({
      operation: "safe-search",
      userId,
      idempotencyKey,
      body,
      request,
      run: () => this.core.safeSearch(body),
    });
  }
}

@Module({
  imports: [
    ...(coordinationModule ? [coordinationModule] : []),
    ...(privateObjectStorageModule ? [privateObjectStorageModule] : []),
  ],
  controllers: [CreatorIntelligenceController],
  providers: [
    ...(
      coordinationModule
        ? []
        : [{ provide: UPSTASH_COORDINATION_PORT, useValue: null }]
    ),
    CreatorIntelligencePaidAdmission,
    CreatorIntelligenceMeshArtifactService,
    studioRemoteReferenceDnsResolverProvider,
    studioRemoteReferenceHttpRequesterProvider,
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
