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
  Query,
} from "@nestjs/common";

import { ZodValidationPipe } from "../../common/zod-validation.pipe";

import {
  AddStudioTeamCommentReplyDto,
  CreateStudioTeamCommentThreadDto,
  ListStudioTeamCommentsQueryDto,
  StudioTeamCommentThreadParamsDto,
  StudioTeamCommentWorkParamsDto,
} from "./studio-team-comment.dto";
import { StudioTeamCommentService } from "./studio-team-comment.service";

function authenticatedStudioCommentUserId(userId: string | undefined): string {
  if (!userId) throw new ForbiddenException("로그인이 필요해요.");
  return userId;
}

@Controller()
export class StudioTeamCommentController {
  constructor(
    @Inject(StudioTeamCommentService)
    private readonly service: StudioTeamCommentService
  ) {}

  @Get("/creator/works/:id/team/comments")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async list(
    @Param(new ZodValidationPipe(StudioTeamCommentWorkParamsDto))
    params: StudioTeamCommentWorkParamsDto,
    @Query(new ZodValidationPipe(ListStudioTeamCommentsQueryDto))
    query: ListStudioTeamCommentsQueryDto,
    @Headers("x-user-id") userId?: string
  ) {
    return this.service.list(authenticatedStudioCommentUserId(userId), params.id, query);
  }

  @Post("/creator/works/:id/team/comments")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async createThread(
    @Param(new ZodValidationPipe(StudioTeamCommentWorkParamsDto))
    params: StudioTeamCommentWorkParamsDto,
    @Body(new ZodValidationPipe(CreateStudioTeamCommentThreadDto))
    body: CreateStudioTeamCommentThreadDto,
    @Headers("x-user-id") userId?: string
  ) {
    return this.service.createThread(
      authenticatedStudioCommentUserId(userId),
      params.id,
      body
    );
  }

  @Post("/creator/works/:id/team/comments/read")
  @Header("Cache-Control", "private, no-store, max-age=0")
  @HttpCode(HttpStatus.OK)
  async markAllRead(
    @Param(new ZodValidationPipe(StudioTeamCommentWorkParamsDto))
    params: StudioTeamCommentWorkParamsDto,
    @Headers("x-user-id") userId?: string
  ) {
    return this.service.markAllRead(
      authenticatedStudioCommentUserId(userId),
      params.id
    );
  }

  @Post("/creator/works/:id/team/comments/:threadId/replies")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async addReply(
    @Param(new ZodValidationPipe(StudioTeamCommentThreadParamsDto))
    params: StudioTeamCommentThreadParamsDto,
    @Body(new ZodValidationPipe(AddStudioTeamCommentReplyDto))
    body: AddStudioTeamCommentReplyDto,
    @Headers("x-user-id") userId?: string
  ) {
    return this.service.addReply(
      authenticatedStudioCommentUserId(userId),
      params.id,
      params.threadId,
      body
    );
  }

  @Post("/creator/works/:id/team/comments/:threadId/resolve")
  @Header("Cache-Control", "private, no-store, max-age=0")
  @HttpCode(HttpStatus.OK)
  async resolve(
    @Param(new ZodValidationPipe(StudioTeamCommentThreadParamsDto))
    params: StudioTeamCommentThreadParamsDto,
    @Headers("x-user-id") userId?: string
  ) {
    return this.service.resolve(
      authenticatedStudioCommentUserId(userId),
      params.id,
      params.threadId
    );
  }

  @Post("/creator/works/:id/team/comments/:threadId/reopen")
  @Header("Cache-Control", "private, no-store, max-age=0")
  @HttpCode(HttpStatus.OK)
  async reopen(
    @Param(new ZodValidationPipe(StudioTeamCommentThreadParamsDto))
    params: StudioTeamCommentThreadParamsDto,
    @Headers("x-user-id") userId?: string
  ) {
    return this.service.reopen(
      authenticatedStudioCommentUserId(userId),
      params.id,
      params.threadId
    );
  }

  @Post("/creator/works/:id/team/comments/:threadId/read")
  @Header("Cache-Control", "private, no-store, max-age=0")
  @HttpCode(HttpStatus.OK)
  async markRead(
    @Param(new ZodValidationPipe(StudioTeamCommentThreadParamsDto))
    params: StudioTeamCommentThreadParamsDto,
    @Headers("x-user-id") userId?: string
  ) {
    return this.service.markRead(
      authenticatedStudioCommentUserId(userId),
      params.id,
      params.threadId
    );
  }
}
