import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Put,
} from "@nestjs/common";

import { ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import {
  CreateStudioReviewFeedbackDto,
  CreateStudioReviewLinkDto,
  StudioProductionWorkParamsDto,
  StudioReviewLinkParamsDto,
  StudioReviewTokenParamsDto,
  UpdateStudioPersonalKitDto,
  UpdateStudioProductionWorkspaceDto,
} from "./studio-production.dto";
import { StudioProductionService } from "./studio-production.service";

function authenticatedStudioUserId(userId: string | undefined): string {
  if (!userId) throw new ForbiddenException("로그인이 필요해요.");
  return userId;
}

@Controller()
export class StudioProductionController {
  constructor(
    @Inject(StudioProductionService)
    private readonly service: StudioProductionService,
  ) {}
  @Get("/creator/works/:id/production")
  @Header("Cache-Control", "private, no-store, max-age=0")
  getWorkspace(
    @Param(new ZodValidationPipe(StudioProductionWorkParamsDto))
    params: StudioProductionWorkParamsDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.getWorkspace(authenticatedStudioUserId(userId), params.id);
  }

  @Put("/creator/works/:id/production")
  @Header("Cache-Control", "private, no-store, max-age=0")
  saveWorkspace(
    @Param(new ZodValidationPipe(StudioProductionWorkParamsDto))
    params: StudioProductionWorkParamsDto,
    @Body(new ZodValidationPipe(UpdateStudioProductionWorkspaceDto))
    body: UpdateStudioProductionWorkspaceDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.saveWorkspace(
      authenticatedStudioUserId(userId),
      params.id,
      body.baseRevision,
      body.document,
    );
  }

  @Get("/creator/studio/personal-kit")
  @Header("Cache-Control", "private, no-store, max-age=0")
  getPersonalKit(@Headers("x-user-id") userId?: string) {
    return this.service.getPersonalKit(authenticatedStudioUserId(userId));
  }
  @Put("/creator/studio/personal-kit")
  @Header("Cache-Control", "private, no-store, max-age=0")
  savePersonalKit(
    @Body(new ZodValidationPipe(UpdateStudioPersonalKitDto))
    body: UpdateStudioPersonalKitDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.savePersonalKit(
      authenticatedStudioUserId(userId),
      body.baseRevision,
      body.document,
    );
  }

  @Get("/creator/works/:id/review-links")
  @Header("Cache-Control", "private, no-store, max-age=0")
  listReviewLinks(
    @Param(new ZodValidationPipe(StudioProductionWorkParamsDto))
    params: StudioProductionWorkParamsDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.listReviewLinks(authenticatedStudioUserId(userId), params.id);
  }

  @Post("/creator/works/:id/review-links")
  @Header("Cache-Control", "private, no-store, max-age=0")
  createReviewLink(
    @Param(new ZodValidationPipe(StudioProductionWorkParamsDto))
    params: StudioProductionWorkParamsDto,
    @Body(new ZodValidationPipe(CreateStudioReviewLinkDto))
    body: CreateStudioReviewLinkDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.createReviewLink(
      authenticatedStudioUserId(userId),
      params.id,
      body,
    );
  }

  @Post("/creator/works/:id/review-links/:linkId/revoke")
  @Header("Cache-Control", "private, no-store, max-age=0")
  @HttpCode(HttpStatus.OK)
  revokeReviewLink(
    @Param(new ZodValidationPipe(StudioReviewLinkParamsDto))
    params: StudioReviewLinkParamsDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.revokeReviewLink(
      authenticatedStudioUserId(userId),
      params.id,
      params.linkId,
    );
  }

  @Get("/creator/review/:token")
  @Header("Cache-Control", "private, no-store, max-age=0")
  getExternalReview(
    @Param(new ZodValidationPipe(StudioReviewTokenParamsDto))
    params: StudioReviewTokenParamsDto,
  ) {
    return this.service.getExternalReview(params.token);
  }

  @Post("/creator/review/:token/feedback")
  @Header("Cache-Control", "private, no-store, max-age=0")
  @HttpCode(HttpStatus.CREATED)
  addExternalReviewFeedback(
    @Param(new ZodValidationPipe(StudioReviewTokenParamsDto))
    params: StudioReviewTokenParamsDto,
    @Body(new ZodValidationPipe(CreateStudioReviewFeedbackDto))
    body: CreateStudioReviewFeedbackDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.addExternalReviewFeedback(
      params.token,
      body,
      userId,
    );
  }
}
