import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
} from "@nestjs/common";

import { studioEntityIdSchema } from "@toonspectrum/studio-project-model";

import {
  CommitStudioRevisionDto,
  CreateCompatibilityReportDto,
  CreateStudioExternalFileBindingDto,
  CreateStudioProjectGraphDto,
  CreateStudioReviewCommentDto,
  CreateStudioReviewDto,
  RegisterStudioBlobDto,
  StudioArtifactParamsDto,
  StudioExternalBindingParamsDto,
  StudioProjectParamsDto,
  StudioReportParamsDto,
  StudioReviewParamsDto,
  StudioWorkParamsDto,
  UpdateStudioExternalFileBindingDto,
} from "./studio-project-graph.dto";
import { StudioProjectGraphService } from "./studio-project-graph.service";

function authenticatedStudioUserId(userId: string | undefined): string {
  const normalized = userId?.trim() ?? "";
  if (!normalized) throw new ForbiddenException("로그인이 필요해요.");
  return normalized;
}

function requireIdempotencyKey(value: string | undefined): string {
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
  const unquoted = raw.startsWith('"') && raw.endsWith('"')
    ? raw.slice(1, -1)
    : raw;
  const parsed = studioEntityIdSchema.safeParse(unquoted);
  if (!parsed.success) {
    throw new BadRequestException({
      code: "studio_if_match_invalid",
      message: "If-Match is not a valid Studio revision identifier.",
    });
  }
  return parsed.data;
}

@Controller("studio-project-graph")
export class StudioProjectGraphController {
  constructor(private readonly service: StudioProjectGraphService) {}

  @Post("projects")
  @HttpCode(HttpStatus.CREATED)
  createProject(
    @Headers("x-user-id") userId: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: CreateStudioProjectGraphDto,
  ) {
    return this.service.createProject(
      authenticatedStudioUserId(userId),
      body,
      requireIdempotencyKey(idempotencyKey),
    );
  }

  @Get("projects/:projectId")
  getProject(
    @Headers("x-user-id") userId: string | undefined,
    @Param() params: StudioProjectParamsDto,
  ) {
    return this.service.getProject(authenticatedStudioUserId(userId), params.projectId);
  }

  @Get("works/:workId/project")
  getProjectByWork(
    @Headers("x-user-id") userId: string | undefined,
    @Param() params: StudioWorkParamsDto,
  ) {
    return this.service.getProjectByWork(authenticatedStudioUserId(userId), params.workId);
  }

  @Post("projects/:projectId/blobs")
  @HttpCode(HttpStatus.CREATED)
  registerBlob(
    @Headers("x-user-id") userId: string | undefined,
    @Param() params: StudioProjectParamsDto,
    @Body() body: RegisterStudioBlobDto,
  ) {
    return this.service.registerBlob(authenticatedStudioUserId(userId), params.projectId, body);
  }

  @Post("projects/:projectId/compatibility-reports")
  @HttpCode(HttpStatus.CREATED)
  createCompatibilityReport(
    @Headers("x-user-id") userId: string | undefined,
    @Param() params: StudioProjectParamsDto,
    @Body() body: CreateCompatibilityReportDto,
  ) {
    return this.service.createCompatibilityReport(authenticatedStudioUserId(userId), params.projectId, body);
  }

  @Post("compatibility-reports/:reportId/approve")
  @HttpCode(HttpStatus.OK)
  approveCompatibilityReport(
    @Headers("x-user-id") userId: string | undefined,
    @Param() params: StudioReportParamsDto,
  ) {
    return this.service.approveCompatibilityReport(authenticatedStudioUserId(userId), params.reportId);
  }

  @Get("artifacts/:artifactId/revisions")
  listRevisions(
    @Headers("x-user-id") userId: string | undefined,
    @Param() params: StudioArtifactParamsDto,
  ) {
    return this.service.listRevisions(authenticatedStudioUserId(userId), params.artifactId);
  }

  @Post("artifacts/:artifactId/revisions")
  @HttpCode(HttpStatus.CREATED)
  commitRevision(
    @Headers("x-user-id") userId: string | undefined,
    @Param() params: StudioArtifactParamsDto,
    @Headers("if-match") ifMatch: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: CommitStudioRevisionDto,
  ) {
    return this.service.commitRevision(
      authenticatedStudioUserId(userId),
      params.artifactId,
      parseStudioIfMatch(ifMatch),
      requireIdempotencyKey(idempotencyKey),
      body,
    );
  }

  @Get("artifacts/:artifactId/external-bindings")
  listExternalFileBindings(
    @Headers("x-user-id") userId: string | undefined,
    @Param() params: StudioArtifactParamsDto,
  ) {
    return this.service.listExternalFileBindings(
      authenticatedStudioUserId(userId),
      params.artifactId,
    );
  }

  @Post("artifacts/:artifactId/external-bindings")
  @HttpCode(HttpStatus.CREATED)
  createExternalFileBinding(
    @Headers("x-user-id") userId: string | undefined,
    @Param() params: StudioArtifactParamsDto,
    @Body() body: CreateStudioExternalFileBindingDto,
  ) {
    return this.service.createExternalFileBinding(
      authenticatedStudioUserId(userId),
      params.artifactId,
      body,
    );
  }

  @Patch("external-bindings/:bindingId")
  updateExternalFileBinding(
    @Headers("x-user-id") userId: string | undefined,
    @Param() params: StudioExternalBindingParamsDto,
    @Body() body: UpdateStudioExternalFileBindingDto,
  ) {
    return this.service.updateExternalFileBinding(
      authenticatedStudioUserId(userId),
      params.bindingId,
      body,
    );
  }

  @Delete("external-bindings/:bindingId")
  @HttpCode(HttpStatus.NO_CONTENT)
  removeExternalFileBinding(
    @Headers("x-user-id") userId: string | undefined,
    @Param() params: StudioExternalBindingParamsDto,
  ) {
    return this.service.removeExternalFileBinding(
      authenticatedStudioUserId(userId),
      params.bindingId,
    );
  }

  @Post("artifacts/:artifactId/reviews")
  @HttpCode(HttpStatus.CREATED)
  createReview(
    @Headers("x-user-id") userId: string | undefined,
    @Param() params: StudioArtifactParamsDto,
    @Body() body: CreateStudioReviewDto,
  ) {
    return this.service.createReview(authenticatedStudioUserId(userId), params.artifactId, body);
  }

  @Post("reviews/:reviewId/comments")
  @HttpCode(HttpStatus.CREATED)
  createReviewComment(
    @Headers("x-user-id") userId: string | undefined,
    @Param() params: StudioReviewParamsDto,
    @Body() body: CreateStudioReviewCommentDto,
  ) {
    return this.service.createReviewComment(authenticatedStudioUserId(userId), params.reviewId, body);
  }
}
