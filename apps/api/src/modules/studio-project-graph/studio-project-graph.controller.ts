import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
} from "@nestjs/common";

import { studioEntityIdSchema } from "@toonspectrum/studio-project-model";

import { ZodValidationPipe } from "../../common/zod-validation.pipe";

import {
  CommitStudioRevisionDto,
  CreateCompatibilityReportDto,
  CreateStudioProjectGraphDto,
  CreateStudioArtifactDto,
  DecideStudioReviewDto,
  ResolveStudioReviewCommentDto,
  CreateStudioReviewCommentDto,
  CreateStudioReviewDto,
  RegisterStudioBlobDto,
  RestoreStudioRevisionDto,
  StudioArtifactParamsDto,
  StudioRevisionParamsDto,
  StudioProjectParamsDto,
  StudioReportParamsDto,
  StudioReviewParamsDto,
  StudioReviewCommentParamsDto,
  StudioWorkParamsDto,
} from "./studio-project-graph.dto";
import { StudioProjectGraphService } from "./studio-project-graph.service";

export function authenticatedStudioUserId(userId: string | undefined): string {
  const value = userId?.trim() ?? "";
  if (value.length === 0) throw new ForbiddenException("로그인이 필요해요.");
  return value;
}

export function requireStudioIdempotencyKey(value: string | undefined): string {
  const key = value?.trim() ?? "";
  if (key.length < 8 || key.length > 240) {
    throw new BadRequestException({
      code: "studio_idempotency_key_required",
      message: "Idempotency-Key must contain 8 to 240 characters.",
    });
  }
  return key;
}

export function parseStudioIfMatch(value: string | undefined): string {
  const raw = value?.trim() ?? "";
  if (raw.length === 0) {
    throw new HttpException(
      {
        code: "studio_if_match_required",
        message: "If-Match must identify the current artifact head revision.",
      },
      HttpStatus.PRECONDITION_REQUIRED,
    );
  }
  if (raw === "*" || raw.startsWith("W/") || raw.includes(",")) {
    throw new BadRequestException({
      code: "studio_if_match_invalid",
      message: "A single strong revision identifier is required.",
    });
  }
  const quoted = raw.startsWith('"') || raw.endsWith('"');
  if (quoted && !(raw.startsWith('"') && raw.endsWith('"') && raw.length >= 3)) {
    throw new BadRequestException({
      code: "studio_if_match_invalid",
      message: "If-Match quotes must be balanced.",
    });
  }
  const unquoted = quoted ? raw.slice(1, -1) : raw;
  const parsed = studioEntityIdSchema.safeParse(unquoted);
  if (!parsed.success) {
    throw new BadRequestException({
      code: "studio_if_match_invalid",
      message: "If-Match is not a valid Studio revision identifier.",
    });
  }
  return parsed.data;
}

@Controller("/studio-project-graph")
export class StudioProjectGraphController {
  constructor(private readonly service: StudioProjectGraphService) {}

  @Post("/projects")
  @HttpCode(HttpStatus.CREATED)
  @Header("Cache-Control", "private, no-store, max-age=0")
  createProject(
    @Body(new ZodValidationPipe(CreateStudioProjectGraphDto))
    body: CreateStudioProjectGraphDto,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.createProject(
      authenticatedStudioUserId(userId),
      body,
      requireStudioIdempotencyKey(idempotencyKey),
    );
  }

  @Post("/projects/:projectId/artifacts")
  @HttpCode(HttpStatus.CREATED)
  @Header("Cache-Control", "private, no-store, max-age=0")
  createArtifact(
    @Param(new ZodValidationPipe(StudioProjectParamsDto))
    params: StudioProjectParamsDto,
    @Body(new ZodValidationPipe(CreateStudioArtifactDto))
    body: CreateStudioArtifactDto,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.createArtifact(
      authenticatedStudioUserId(userId),
      params.projectId,
      body,
      requireStudioIdempotencyKey(idempotencyKey),
    );
  }

  @Get("/projects/:projectId")
  @Header("Cache-Control", "private, no-store, max-age=0")
  getProject(
    @Param(new ZodValidationPipe(StudioProjectParamsDto))
    params: StudioProjectParamsDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.getProject(
      authenticatedStudioUserId(userId),
      params.projectId,
    );
  }

  @Get("/works/:workId/project")
  @Header("Cache-Control", "private, no-store, max-age=0")
  getProjectByWork(
    @Param(new ZodValidationPipe(StudioWorkParamsDto))
    params: StudioWorkParamsDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.getProjectByWork(
      authenticatedStudioUserId(userId),
      params.workId,
    );
  }

  @Post("/projects/:projectId/blobs")
  @HttpCode(HttpStatus.CREATED)
  @Header("Cache-Control", "private, no-store, max-age=0")
  registerBlob(
    @Param(new ZodValidationPipe(StudioProjectParamsDto))
    params: StudioProjectParamsDto,
    @Body(new ZodValidationPipe(RegisterStudioBlobDto))
    body: RegisterStudioBlobDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.registerBlob(
      authenticatedStudioUserId(userId),
      params.projectId,
      body,
    );
  }

  @Get("/projects/:projectId/compatibility-reports")
  @Header("Cache-Control", "private, no-store, max-age=0")
  listCompatibilityReports(
    @Param(new ZodValidationPipe(StudioProjectParamsDto))
    params: StudioProjectParamsDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.listCompatibilityReports(
      authenticatedStudioUserId(userId),
      params.projectId,
    );
  }

  @Post("/projects/:projectId/compatibility-reports")
  @HttpCode(HttpStatus.CREATED)
  @Header("Cache-Control", "private, no-store, max-age=0")
  createCompatibilityReport(
    @Param(new ZodValidationPipe(StudioProjectParamsDto))
    params: StudioProjectParamsDto,
    @Body(new ZodValidationPipe(CreateCompatibilityReportDto))
    body: CreateCompatibilityReportDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.createCompatibilityReport(
      authenticatedStudioUserId(userId),
      params.projectId,
      body,
    );
  }

  @Post("/compatibility-reports/:reportId/approve")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "private, no-store, max-age=0")
  approveCompatibilityReport(
    @Param(new ZodValidationPipe(StudioReportParamsDto))
    params: StudioReportParamsDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.approveCompatibilityReport(
      authenticatedStudioUserId(userId),
      params.reportId,
    );
  }

  @Get("/artifacts/:artifactId/revisions")
  @Header("Cache-Control", "private, no-store, max-age=0")
  listRevisions(
    @Param(new ZodValidationPipe(StudioArtifactParamsDto))
    params: StudioArtifactParamsDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.listRevisions(
      authenticatedStudioUserId(userId),
      params.artifactId,
    );
  }

  @Post("/artifacts/:artifactId/revisions")
  @HttpCode(HttpStatus.CREATED)
  @Header("Cache-Control", "private, no-store, max-age=0")
  commitRevision(
    @Param(new ZodValidationPipe(StudioArtifactParamsDto))
    params: StudioArtifactParamsDto,
    @Body(new ZodValidationPipe(CommitStudioRevisionDto))
    body: CommitStudioRevisionDto,
    @Headers("if-match") ifMatch: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.commitRevision(
      authenticatedStudioUserId(userId),
      params.artifactId,
      parseStudioIfMatch(ifMatch),
      requireStudioIdempotencyKey(idempotencyKey),
      body,
    );
  }
  @Post("/artifacts/:artifactId/revisions/:revisionId/restore")
  @HttpCode(HttpStatus.CREATED)
  @Header("Cache-Control", "private, no-store, max-age=0")
  restoreRevision(
    @Param(new ZodValidationPipe(StudioRevisionParamsDto))
    params: StudioRevisionParamsDto,
    @Body(new ZodValidationPipe(RestoreStudioRevisionDto))
    body: RestoreStudioRevisionDto,
    @Headers("if-match") ifMatch: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.restoreRevision(
      authenticatedStudioUserId(userId),
      params.artifactId,
      params.revisionId,
      parseStudioIfMatch(ifMatch),
      requireStudioIdempotencyKey(idempotencyKey),
      body,
    );
  }

  @Get("/artifacts/:artifactId/reviews")
  @Header("Cache-Control", "private, no-store, max-age=0")
  listReviews(
    @Param(new ZodValidationPipe(StudioArtifactParamsDto))
    params: StudioArtifactParamsDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.listReviews(
      authenticatedStudioUserId(userId),
      params.artifactId,
    );
  }

  @Get("/reviews/:reviewId")
  @Header("Cache-Control", "private, no-store, max-age=0")
  getReview(
    @Param(new ZodValidationPipe(StudioReviewParamsDto))
    params: StudioReviewParamsDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.getReview(
      authenticatedStudioUserId(userId),
      params.reviewId,
    );
  }

  @Post("/reviews/:reviewId/decision")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "private, no-store, max-age=0")
  decideReview(
    @Param(new ZodValidationPipe(StudioReviewParamsDto))
    params: StudioReviewParamsDto,
    @Body(new ZodValidationPipe(DecideStudioReviewDto))
    body: DecideStudioReviewDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.decideReview(
      authenticatedStudioUserId(userId),
      params.reviewId,
      body,
    );
  }

  @Post("/review-comments/:commentId/resolve")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "private, no-store, max-age=0")
  resolveReviewComment(
    @Param(new ZodValidationPipe(StudioReviewCommentParamsDto))
    params: StudioReviewCommentParamsDto,
    @Body(new ZodValidationPipe(ResolveStudioReviewCommentDto))
    body: ResolveStudioReviewCommentDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.resolveReviewComment(
      authenticatedStudioUserId(userId),
      params.commentId,
      body,
    );
  }

  @Post("/review-comments/:commentId/reopen")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "private, no-store, max-age=0")
  reopenReviewComment(
    @Param(new ZodValidationPipe(StudioReviewCommentParamsDto))
    params: StudioReviewCommentParamsDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.reopenReviewComment(
      authenticatedStudioUserId(userId),
      params.commentId,
    );
  }

  @Post("/artifacts/:artifactId/reviews")
  @HttpCode(HttpStatus.CREATED)
  @Header("Cache-Control", "private, no-store, max-age=0")
  createReview(
    @Param(new ZodValidationPipe(StudioArtifactParamsDto))
    params: StudioArtifactParamsDto,
    @Body(new ZodValidationPipe(CreateStudioReviewDto))
    body: CreateStudioReviewDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.createReview(
      authenticatedStudioUserId(userId),
      params.artifactId,
      body,
    );
  }

  @Post("/reviews/:reviewId/comments")
  @HttpCode(HttpStatus.CREATED)
  @Header("Cache-Control", "private, no-store, max-age=0")
  createReviewComment(
    @Param(new ZodValidationPipe(StudioReviewParamsDto))
    params: StudioReviewParamsDto,
    @Body(new ZodValidationPipe(CreateStudioReviewCommentDto))
    body: CreateStudioReviewCommentDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.createReviewComment(
      authenticatedStudioUserId(userId),
      params.reviewId,
      body,
    );
  }
}
