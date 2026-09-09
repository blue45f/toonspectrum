import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UnauthorizedException,
} from "@nestjs/common";

import { StudioAiComicDirectorService } from "./studio-ai-comic-director.service";

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
export class StudioAiComicDirectorController {
  constructor(
    @Inject(StudioAiComicDirectorService)
    private readonly service: StudioAiComicDirectorService,
  ) {}

  @Get("sessions")
  @Header("Cache-Control", "no-store, max-age=0")
  listSessions(
    @Headers("x-user-id") rawUserId: string | undefined,
    @Query("limit") limit: string | undefined,
  ) {
    return this.service.listSessions(authenticatedUserId(rawUserId), limit);
  }

  @Post("sessions")
  @Header("Cache-Control", "no-store, max-age=0")
  @HttpCode(HttpStatus.CREATED)
  createSession(
    @Headers("x-user-id") rawUserId: string | undefined,
    @Body() body: unknown,
  ) {
    return this.service.createSession(authenticatedUserId(rawUserId), body);
  }

  @Get("sessions/:sessionId")
  @Header("Cache-Control", "no-store, max-age=0")
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
  @Header("Cache-Control", "no-store, max-age=0")
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
  @Header("Cache-Control", "no-store, max-age=0")
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
  @Header("Cache-Control", "no-store, max-age=0")
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
  @Header("Cache-Control", "no-store, max-age=0")
  listJobs(
    @Headers("x-user-id") rawUserId: string | undefined,
    @Param("sessionId") sessionId: string,
  ) {
    return this.service.listJobs(authenticatedUserId(rawUserId), sessionId);
  }

  @Post("sessions/:sessionId/jobs")
  @Header("Cache-Control", "no-store, max-age=0")
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
  @Header("Cache-Control", "no-store, max-age=0")
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
  @Header("Cache-Control", "no-store, max-age=0")
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
  @Header("Cache-Control", "no-store, max-age=0")
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
  @Header("Cache-Control", "no-store, max-age=0")
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
  @Header("Cache-Control", "no-store, max-age=0")
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
  @Header("Cache-Control", "no-store, max-age=0")
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
