import {
  BadRequestException,
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

import { StudioTeamCommentLivePublisher } from "./studio-team-comment-live.publisher";
import {
  AddStudioTeamCommentReplyDto,
  CreateStudioTeamCommentThreadDto,
  GetStudioTeamCommentThreadQueryDto,
  ListStudioTeamCommentsQueryDto,
  ReanchorStudioTeamCommentThreadDto,
  StudioTeamCommentMutationIdSchema,
  StudioTeamCommentThreadParamsDto,
  StudioTeamCommentWorkParamsDto,
} from "./studio-team-comment.dto";
import { StudioTeamCommentService } from "./studio-team-comment.service";

function authenticatedStudioCommentUserId(userId: string | undefined): string {
  if (!userId) throw new ForbiddenException("로그인이 필요해요.");
  return userId;
}

function resolveStudioCommentMutationId(
  bodyMutationId: string | undefined,
  headerMutationId: string | undefined
): string | undefined {
  if (!headerMutationId) return bodyMutationId;
  const parsed = StudioTeamCommentMutationIdSchema.safeParse(headerMutationId);
  if (!parsed.success) {
    throw new BadRequestException("댓글 요청 식별자가 올바르지 않습니다.");
  }
  if (bodyMutationId && bodyMutationId !== parsed.data) {
    throw new BadRequestException("댓글 요청 식별자 헤더와 본문이 일치하지 않습니다.");
  }
  return parsed.data;
}

function requiredStudioCommentMutationId(
  bodyMutationId: string | undefined,
  headerMutationId: string | undefined
): string {
  const mutationId = resolveStudioCommentMutationId(bodyMutationId, headerMutationId);
  if (!mutationId) {
    throw new BadRequestException("댓글 위치 변경 요청 식별자가 필요합니다.");
  }
  return mutationId;
}

@Controller()
export class StudioTeamCommentController {
  constructor(
    @Inject(StudioTeamCommentService)
    private readonly service: StudioTeamCommentService,
    @Inject(StudioTeamCommentLivePublisher)
    private readonly livePublisher: StudioTeamCommentLivePublisher
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

  @Get("/creator/works/:id/team/comments/:threadId")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async getThread(
    @Param(new ZodValidationPipe(StudioTeamCommentThreadParamsDto))
    params: StudioTeamCommentThreadParamsDto,
    @Query(new ZodValidationPipe(GetStudioTeamCommentThreadQueryDto))
    query: GetStudioTeamCommentThreadQueryDto,
    @Headers("x-user-id") userId?: string
  ) {
    return this.service.getThread(
      authenticatedStudioCommentUserId(userId),
      params.id,
      params.threadId,
      query.messageLimit
    );
  }

  @Post("/creator/works/:id/team/comments")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async createThread(
    @Param(new ZodValidationPipe(StudioTeamCommentWorkParamsDto))
    params: StudioTeamCommentWorkParamsDto,
    @Body(new ZodValidationPipe(CreateStudioTeamCommentThreadDto))
    body: CreateStudioTeamCommentThreadDto,
    @Headers("x-user-id") userId?: string,
    @Headers("idempotency-key") mutationIdHeader?: string
  ) {
    const mutationId = resolveStudioCommentMutationId(body.mutationId, mutationIdHeader);
    const thread = await this.service.createThread(
      authenticatedStudioCommentUserId(userId),
      params.id,
      { ...body, ...(mutationId ? { mutationId } : {}) }
    );
    this.livePublisher.publish({
      version: 1,
      workId: params.id,
      threadId: thread.id,
      activitySequence: thread.latestActivitySequence,
      kind: "created",
    });
    return thread;
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
    @Headers("x-user-id") userId?: string,
    @Headers("idempotency-key") mutationIdHeader?: string
  ) {
    const mutationId = resolveStudioCommentMutationId(body.mutationId, mutationIdHeader);
    const reply = await this.service.addReply(
      authenticatedStudioCommentUserId(userId),
      params.id,
      params.threadId,
      { ...body, ...(mutationId ? { mutationId } : {}) }
    );
    this.livePublisher.publish({
      version: 1,
      workId: params.id,
      threadId: reply.threadId,
      activitySequence: reply.latestActivitySequence,
      kind: "replied",
    });
    return reply;
  }

  @Post("/creator/works/:id/team/comments/:threadId/resolve")
  @Header("Cache-Control", "private, no-store, max-age=0")
  @HttpCode(HttpStatus.OK)
  async resolve(
    @Param(new ZodValidationPipe(StudioTeamCommentThreadParamsDto))
    params: StudioTeamCommentThreadParamsDto,
    @Headers("x-user-id") userId?: string
  ) {
    const transition = await this.service.resolve(
      authenticatedStudioCommentUserId(userId),
      params.id,
      params.threadId
    );
    this.livePublisher.publish({
      version: 1,
      workId: params.id,
      threadId: transition.threadId,
      activitySequence: transition.latestActivitySequence,
      kind: "resolved",
    });
    return transition;
  }

  @Post("/creator/works/:id/team/comments/:threadId/reopen")
  @Header("Cache-Control", "private, no-store, max-age=0")
  @HttpCode(HttpStatus.OK)
  async reopen(
    @Param(new ZodValidationPipe(StudioTeamCommentThreadParamsDto))
    params: StudioTeamCommentThreadParamsDto,
    @Headers("x-user-id") userId?: string
  ) {
    const transition = await this.service.reopen(
      authenticatedStudioCommentUserId(userId),
      params.id,
      params.threadId
    );
    this.livePublisher.publish({
      version: 1,
      workId: params.id,
      threadId: transition.threadId,
      activitySequence: transition.latestActivitySequence,
      kind: "reopened",
    });
    return transition;
  }

  @Post("/creator/works/:id/team/comments/:threadId/reanchor")
  @Header("Cache-Control", "private, no-store, max-age=0")
  @HttpCode(HttpStatus.OK)
  async reanchor(
    @Param(new ZodValidationPipe(StudioTeamCommentThreadParamsDto))
    params: StudioTeamCommentThreadParamsDto,
    @Body(new ZodValidationPipe(ReanchorStudioTeamCommentThreadDto))
    body: ReanchorStudioTeamCommentThreadDto,
    @Headers("x-user-id") userId?: string,
    @Headers("idempotency-key") mutationIdHeader?: string
  ) {
    const mutationId = requiredStudioCommentMutationId(body.mutationId, mutationIdHeader);
    const reanchored = await this.service.reanchor(
      authenticatedStudioCommentUserId(userId),
      params.id,
      params.threadId,
      { ...body, mutationId }
    );
    this.livePublisher.publish({
      version: 1,
      workId: params.id,
      threadId: reanchored.threadId,
      activitySequence: reanchored.latestActivitySequence,
      kind: "reanchored",
    });
    return reanchored;
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
