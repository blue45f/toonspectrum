import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UnauthorizedException,
  UseInterceptors,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from "@nestjs/common";
import type { Observable } from "rxjs";

import { StudioAiComicDirectorService } from "./studio-ai-comic-director.service";

class NoStoreInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context
      .switchToHttp()
      .getResponse<{ setHeader(name: string, value: string): void }>();
    response.setHeader("Cache-Control", "no-store, max-age=0");
    return next.handle();
  }
}

function authenticatedUserId(value: string | undefined): string {
  const userId = value?.trim();
  if (!userId) {
    throw new UnauthorizedException(
      "AI 코믹 디렉터 세션을 저장하려면 로그인이 필요해요.",
    );
  }
  return userId;
}

@Controller("studio-ai/comic-director")
@UseInterceptors(new NoStoreInterceptor())
export class StudioAiComicDirectorController {
  constructor(
    @Inject(StudioAiComicDirectorService)
    private readonly service: StudioAiComicDirectorService,
  ) {}

  @Get("sessions")
  listSessions(
    @Headers("x-user-id") rawUserId: string | undefined,
    @Query("limit") limit: string | undefined,
  ) {
    return this.service.listSessions(authenticatedUserId(rawUserId), limit);
  }

  @Post("sessions")
  @HttpCode(HttpStatus.CREATED)
  createSession(
    @Headers("x-user-id") rawUserId: string | undefined,
    @Body() body: unknown,
  ) {
    return this.service.createSession(authenticatedUserId(rawUserId), body);
  }

  @Get("sessions/:sessionId")
  getSession(
    @Headers("x-user-id") rawUserId: string | undefined,
    @Param("sessionId") sessionId: string,
  ) {
    return this.service.getSessionBundle(
      authenticatedUserId(rawUserId),
      sessionId,
    );
  }

  @Patch("sessions/:sessionId")
  updateSession(
    @Headers("x-user-id") rawUserId: string | undefined,
    @Param("sessionId") sessionId: string,
    @Body() body: unknown,
  ) {
    return this.service.updateSession(
      authenticatedUserId(rawUserId),
      sessionId,
      body,
    );
  }

  @Get("sessions/:sessionId/visual-bible")
  listVisualBibleRevisions(
    @Headers("x-user-id") rawUserId: string | undefined,
    @Param("sessionId") sessionId: string,
  ) {
    return this.service.listVisualBibleRevisions(
      authenticatedUserId(rawUserId),
      sessionId,
    );
  }

  @Post("sessions/:sessionId/visual-bible")
  @HttpCode(HttpStatus.CREATED)
  appendVisualBibleRevision(
    @Headers("x-user-id") rawUserId: string | undefined,
    @Param("sessionId") sessionId: string,
    @Body() body: unknown,
  ) {
    return this.service.appendVisualBibleRevision(
      authenticatedUserId(rawUserId),
      sessionId,
      body,
    );
  }

  @Get("sessions/:sessionId/jobs")
  listJobs(
    @Headers("x-user-id") rawUserId: string | undefined,
    @Param("sessionId") sessionId: string,
  ) {
    return this.service.listJobs(authenticatedUserId(rawUserId), sessionId);
  }

  @Post("sessions/:sessionId/jobs")
  @HttpCode(HttpStatus.CREATED)
  createJob(
    @Headers("x-user-id") rawUserId: string | undefined,
    @Param("sessionId") sessionId: string,
    @Body() body: unknown,
  ) {
    return this.service.createJob(
      authenticatedUserId(rawUserId),
      sessionId,
      body,
    );
  }

  @Patch("sessions/:sessionId/jobs/:jobId")
  updateJob(
    @Headers("x-user-id") rawUserId: string | undefined,
    @Param("sessionId") sessionId: string,
    @Param("jobId") jobId: string,
    @Body() body: unknown,
  ) {
    return this.service.updateJob(
      authenticatedUserId(rawUserId),
      sessionId,
      jobId,
      body,
    );
  }

  @Get("sessions/:sessionId/job-events")
  listJobEvents(
    @Headers("x-user-id") rawUserId: string | undefined,
    @Param("sessionId") sessionId: string,
    @Query("after") after: string | undefined,
  ) {
    return this.service.listJobEvents(
      authenticatedUserId(rawUserId),
      sessionId,
      after,
    );
  }

  @Get("sessions/:sessionId/artifacts")
  listArtifacts(
    @Headers("x-user-id") rawUserId: string | undefined,
    @Param("sessionId") sessionId: string,
  ) {
    return this.service.listArtifacts(
      authenticatedUserId(rawUserId),
      sessionId,
    );
  }

  @Post("sessions/:sessionId/artifacts")
  @HttpCode(HttpStatus.CREATED)
  createArtifact(
    @Headers("x-user-id") rawUserId: string | undefined,
    @Param("sessionId") sessionId: string,
    @Body() body: unknown,
  ) {
    return this.service.createArtifact(
      authenticatedUserId(rawUserId),
      sessionId,
      body,
    );
  }

  @Get("sessions/:sessionId/approval")
  currentApproval(
    @Headers("x-user-id") rawUserId: string | undefined,
    @Param("sessionId") sessionId: string,
  ) {
    return this.service.currentApproval(
      authenticatedUserId(rawUserId),
      sessionId,
    );
  }

  @Post("sessions/:sessionId/approval")
  @HttpCode(HttpStatus.CREATED)
  createApproval(
    @Headers("x-user-id") rawUserId: string | undefined,
    @Param("sessionId") sessionId: string,
    @Body() body: unknown,
  ) {
    return this.service.createApproval(
      authenticatedUserId(rawUserId),
      sessionId,
      body,
    );
  }
}
