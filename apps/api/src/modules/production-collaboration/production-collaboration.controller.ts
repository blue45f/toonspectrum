import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Headers,
  Param,
  Post,
  Query,
} from "@nestjs/common";

import { ZodValidationPipe } from "../../common/zod-validation.pipe";

import {
  CreateProductionProjectDto,
  ExecuteProductionCommandDto,
  ProductionExternalReviewParamsDto,
  ProductionExternalReviewQueryDto,
  ProductionProjectByWorkParamsDto,
  ProductionProjectParamsDto,
  SubmitProductionExternalReviewDto,
} from "./production-collaboration.dto";
import { ProductionCollaborationService } from "./production-collaboration.service";

function authenticatedProductionUserId(userId: string | undefined): string {
  if (!userId) throw new ForbiddenException("로그인이 필요해요.");
  return userId;
}

@Controller("/production")
export class ProductionCollaborationController {
  constructor(private readonly service: ProductionCollaborationService) {}

  @Post("/projects")
  @Header("Cache-Control", "private, no-store, max-age=0")
  createProject(
    @Body(new ZodValidationPipe(CreateProductionProjectDto))
    body: CreateProductionProjectDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.createProject(authenticatedProductionUserId(userId), body);
  }

  @Get("/projects")
  @Header("Cache-Control", "private, no-store, max-age=0")
  listProjects(@Headers("x-user-id") userId?: string) {
    return this.service.listProjects(authenticatedProductionUserId(userId));
  }

  @Get("/inbox")
  @Header("Cache-Control", "private, no-store, max-age=0")
  getPersonalInbox(@Headers("x-user-id") userId?: string) {
    return this.service.getPersonalInbox(authenticatedProductionUserId(userId));
  }

  @Get("/projects/:projectId")
  @Header("Cache-Control", "private, no-store, max-age=0")
  getProject(
    @Param(new ZodValidationPipe(ProductionProjectParamsDto))
    params: ProductionProjectParamsDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.getProject(
      authenticatedProductionUserId(userId),
      params.projectId,
    );
  }

  @Get("/works/:workId/project")
  @Header("Cache-Control", "private, no-store, max-age=0")
  getProjectByWork(
    @Param(new ZodValidationPipe(ProductionProjectByWorkParamsDto))
    params: ProductionProjectByWorkParamsDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.getProjectByWork(
      authenticatedProductionUserId(userId),
      params.workId,
    );
  }

  @Get("/public-reviews/:projectId/:reviewId")
  @Header("Cache-Control", "private, no-store, max-age=0")
  getExternalReview(
    @Param(new ZodValidationPipe(ProductionExternalReviewParamsDto))
    params: ProductionExternalReviewParamsDto,
    @Query(new ZodValidationPipe(ProductionExternalReviewQueryDto))
    query: ProductionExternalReviewQueryDto,
  ) {
    return this.service.getExternalReview(params.projectId, params.reviewId, query.token);
  }

  @Post("/public-reviews/:projectId/:reviewId/responses")
  @Header("Cache-Control", "private, no-store, max-age=0")
  submitExternalReview(
    @Param(new ZodValidationPipe(ProductionExternalReviewParamsDto))
    params: ProductionExternalReviewParamsDto,
    @Body(new ZodValidationPipe(SubmitProductionExternalReviewDto))
    body: SubmitProductionExternalReviewDto,
  ) {
    return this.service.submitExternalReview(params.projectId, params.reviewId, body);
  }

  @Post("/projects/:projectId/commands")
  @Header("Cache-Control", "private, no-store, max-age=0")
  executeCommand(
    @Param(new ZodValidationPipe(ProductionProjectParamsDto))
    params: ProductionProjectParamsDto,
    @Body(new ZodValidationPipe(ExecuteProductionCommandDto))
    body: ExecuteProductionCommandDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.executeCommand(
      authenticatedProductionUserId(userId),
      params.projectId,
      body,
    );
  }
}
