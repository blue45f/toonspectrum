import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  Headers,
  Inject,
  Param,
  Post,
  Put,
} from "@nestjs/common";

import { ZodValidationPipe } from "../../common/zod-validation.pipe";

import {
  CreateCreatorMarketplaceSocialCommentDto,
  CreatorMarketplaceSocialCommentParamsDto,
  CreatorMarketplaceSocialResourceParamsDto,
  CreatorMarketplaceSocialReviewParamsDto,
  UpsertCreatorMarketplaceSocialReviewDto,
} from "./creator-marketplace-social.dto";
import { CreatorMarketplaceSocialService } from "./creator-marketplace-social.service";

function requireUserId(userId: string | undefined): string {
  if (!userId) throw new ForbiddenException("로그인이 필요해요.");
  return userId;
}

@Controller("/creator/marketplace/resources")
export class CreatorMarketplaceSocialController {
  constructor(
    @Inject(CreatorMarketplaceSocialService)
    private readonly socialService: CreatorMarketplaceSocialService,
  ) {}

  @Get("/:id/social")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async page(
    @Param(new ZodValidationPipe(CreatorMarketplaceSocialResourceParamsDto))
    params: CreatorMarketplaceSocialResourceParamsDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.socialService.page(params.id, userId ?? null);
  }

  @Post("/:id/comments")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async createComment(
    @Param(new ZodValidationPipe(CreatorMarketplaceSocialResourceParamsDto))
    params: CreatorMarketplaceSocialResourceParamsDto,
    @Body(new ZodValidationPipe(CreateCreatorMarketplaceSocialCommentDto))
    body: CreateCreatorMarketplaceSocialCommentDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.socialService.createComment(
      params.id,
      requireUserId(userId),
      body,
    );
  }

  @Delete("/:id/comments/:commentId")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async deleteComment(
    @Param(new ZodValidationPipe(CreatorMarketplaceSocialCommentParamsDto))
    params: CreatorMarketplaceSocialCommentParamsDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.socialService.deleteComment(
      params.id,
      params.commentId,
      requireUserId(userId),
    );
  }

  @Post("/:id/comments/:commentId/like")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async toggleCommentLike(
    @Param(new ZodValidationPipe(CreatorMarketplaceSocialCommentParamsDto))
    params: CreatorMarketplaceSocialCommentParamsDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.socialService.toggleCommentLike(
      params.id,
      params.commentId,
      requireUserId(userId),
    );
  }

  @Put("/:id/review")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async upsertReview(
    @Param(new ZodValidationPipe(CreatorMarketplaceSocialResourceParamsDto))
    params: CreatorMarketplaceSocialResourceParamsDto,
    @Body(new ZodValidationPipe(UpsertCreatorMarketplaceSocialReviewDto))
    body: UpsertCreatorMarketplaceSocialReviewDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.socialService.upsertReview(
      params.id,
      requireUserId(userId),
      body,
    );
  }

  @Delete("/:id/review")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async deleteReview(
    @Param(new ZodValidationPipe(CreatorMarketplaceSocialResourceParamsDto))
    params: CreatorMarketplaceSocialResourceParamsDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.socialService.deleteReview(params.id, requireUserId(userId));
  }

  @Post("/:id/reviews/:reviewId/helpful")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async toggleReviewHelpful(
    @Param(new ZodValidationPipe(CreatorMarketplaceSocialReviewParamsDto))
    params: CreatorMarketplaceSocialReviewParamsDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.socialService.toggleReviewHelpful(
      params.id,
      params.reviewId,
      requireUserId(userId),
    );
  }
}
