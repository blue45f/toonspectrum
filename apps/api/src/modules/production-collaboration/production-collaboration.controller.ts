import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Headers,
  Inject,
  NotFoundException,
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
  ProductionRiskParamsDto,
  ProductionRiskQueryDto,
  SubmitProductionExternalReviewDto,
} from "./production-collaboration.dto";
import { ProductionCollaborationService } from "./production-collaboration.service";

function authenticatedProductionUserId(userId: string | undefined): string {
  if (!userId) throw new ForbiddenException("로그인이 필요해요.");
  return userId;
}

const EXTERNAL_REVIEW_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,512}$/u;
const BEARER_SCHEME = "bearer";

function isHttpWhitespace(characterCode: number): boolean {
  return characterCode === 0x20 || characterCode === 0x09;
}

function bearerExternalReviewToken(authorization: string | undefined): string | undefined {
  if (!authorization || authorization.length <= BEARER_SCHEME.length) return undefined;
  if (authorization.slice(0, BEARER_SCHEME.length).toLowerCase() !== BEARER_SCHEME) {
    return undefined;
  }
  if (!isHttpWhitespace(authorization.charCodeAt(BEARER_SCHEME.length))) return undefined;

  let tokenStart = BEARER_SCHEME.length + 1;
  while (
    tokenStart < authorization.length &&
    isHttpWhitespace(authorization.charCodeAt(tokenStart))
  ) {
    tokenStart += 1;
  }
  return authorization.slice(tokenStart).trim();
}

function externalReviewToken(authorization: string | undefined, fallback: string | undefined): string {
  const bearer = bearerExternalReviewToken(authorization);
  const token = bearer || fallback?.trim() || "";
  if (!EXTERNAL_REVIEW_TOKEN_PATTERN.test(token)) {
    throw new NotFoundException("유효한 외부 검수 링크를 찾을 수 없습니다.");
  }
  return token;
}

@Controller("/production")
export class ProductionCollaborationController {
  constructor(
    @Inject(ProductionCollaborationService)
    private readonly service: ProductionCollaborationService,
  ) {}

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

  @Get("/projects/:projectId/risks")
  @Header("Cache-Control", "private, no-store, max-age=0")
  getRisks(
    @Param(new ZodValidationPipe(ProductionProjectParamsDto))
    params: ProductionProjectParamsDto,
    @Query(new ZodValidationPipe(ProductionRiskQueryDto))
    query: ProductionRiskQueryDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.getRisks(authenticatedProductionUserId(userId), params.projectId, query);
  }

  @Get("/projects/:projectId/risks/:riskId")
  @Header("Cache-Control", "private, no-store, max-age=0")
  getRisk(
    @Param(new ZodValidationPipe(ProductionRiskParamsDto))
    params: ProductionRiskParamsDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.getRisk(authenticatedProductionUserId(userId), params.projectId, params.riskId);
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
  @Header("Referrer-Policy", "no-referrer")
  @Header("X-Robots-Tag", "noindex, nofollow, noarchive")
  getExternalReview(
    @Param(new ZodValidationPipe(ProductionExternalReviewParamsDto))
    params: ProductionExternalReviewParamsDto,
    @Query(new ZodValidationPipe(ProductionExternalReviewQueryDto))
    query: ProductionExternalReviewQueryDto,
    @Headers("authorization") authorization?: string,
  ) {
    return this.service.getExternalReview(
      params.projectId,
      params.reviewId,
      externalReviewToken(authorization, query.token),
    );
  }

  @Post("/public-reviews/:projectId/:reviewId/responses")
  @Header("Cache-Control", "private, no-store, max-age=0")
  @Header("Referrer-Policy", "no-referrer")
  @Header("X-Robots-Tag", "noindex, nofollow, noarchive")
  submitExternalReview(
    @Param(new ZodValidationPipe(ProductionExternalReviewParamsDto))
    params: ProductionExternalReviewParamsDto,
    @Body(new ZodValidationPipe(SubmitProductionExternalReviewDto))
    body: SubmitProductionExternalReviewDto,
    @Headers("authorization") authorization?: string,
  ) {
    return this.service.submitExternalReview(
      params.projectId,
      params.reviewId,
      externalReviewToken(authorization, body.token),
      body,
    );
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
