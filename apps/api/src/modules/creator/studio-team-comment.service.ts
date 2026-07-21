import { randomUUID } from "node:crypto";

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from "@nestjs/common";

import {
  AddStudioTeamCommentReplySchema,
  AddStudioTeamCommentReplyResponseSchema,
  CreateStudioTeamCommentThreadSchema,
  GetStudioTeamCommentThreadQuerySchema,
  ListStudioTeamCommentsQuerySchema,
  ListStudioTeamCommentsResponseSchema,
  ReadAllStudioTeamCommentsResponseSchema,
  ReadStudioTeamCommentResponseSchema,
  ReanchorStudioTeamCommentCommandSchema,
  ReanchorStudioTeamCommentResponseSchema,
  StudioTeamCommentThreadSchema,
  TransitionStudioTeamCommentResponseSchema,
} from "./studio-team-comment.dto";
import {
  STUDIO_TEAM_COMMENT_REPOSITORY,
  StudioTeamCommentActivityConflictError,
  StudioTeamCommentCursorError,
  StudioTeamCommentForbiddenError,
  StudioTeamCommentMutationConflictError,
  StudioTeamCommentNotFoundError,
  StudioTeamCommentQuotaError,
  StudioTeamCommentStateConflictError,
} from "./studio-team-comment.repository";

import type {
  AddStudioTeamCommentReplyDto,
  CreateStudioTeamCommentThreadDto,
  ListStudioTeamCommentsQueryDto,
  ReanchorStudioTeamCommentCommand,
  StudioTeamCommentListResponse,
  StudioTeamCommentReadAllResponse,
  StudioTeamCommentReadResponse,
  StudioTeamCommentReanchorResponse,
  StudioTeamCommentReplyResponse,
  StudioTeamCommentThread,
  StudioTeamCommentTransitionResponse,
} from "./studio-team-comment.dto";
import type { StudioTeamCommentRepository } from "./studio-team-comment.repository";

@Injectable()
export class StudioTeamCommentService {
  constructor(
    @Inject(STUDIO_TEAM_COMMENT_REPOSITORY)
    private readonly repository: StudioTeamCommentRepository
  ) {}

  async list(
    actorUserId: string,
    workId: string,
    query: ListStudioTeamCommentsQueryDto
  ): Promise<StudioTeamCommentListResponse> {
    const input = ListStudioTeamCommentsQuerySchema.parse(query);
    const response = await this.run(() => this.repository.list(actorUserId, workId, input));
    return ListStudioTeamCommentsResponseSchema.parse(response);
  }

  async getThread(
    actorUserId: string,
    workId: string,
    threadId: string,
    messageLimit: number
  ): Promise<StudioTeamCommentThread> {
    const query = GetStudioTeamCommentThreadQuerySchema.parse({ messageLimit });
    const response = await this.run(() => this.repository.getThread(
      actorUserId,
      workId,
      threadId,
      query.messageLimit
    ));
    return StudioTeamCommentThreadSchema.parse(response);
  }

  async createThread(
    actorUserId: string,
    workId: string,
    body: CreateStudioTeamCommentThreadDto
  ): Promise<StudioTeamCommentThread> {
    const input = CreateStudioTeamCommentThreadSchema.parse(body);
    const response = await this.run(() => this.repository.createThread(actorUserId, workId, {
      ...input,
      mutationId: input.mutationId ?? randomUUID(),
    }));
    return StudioTeamCommentThreadSchema.parse(response);
  }

  async addReply(
    actorUserId: string,
    workId: string,
    threadId: string,
    body: AddStudioTeamCommentReplyDto
  ): Promise<StudioTeamCommentReplyResponse> {
    const input = AddStudioTeamCommentReplySchema.parse(body);
    const response = await this.run(() => this.repository.addReply(
      actorUserId,
      workId,
      threadId,
      { ...input, mutationId: input.mutationId ?? randomUUID() }
    ));
    return AddStudioTeamCommentReplyResponseSchema.parse(response);
  }

  async resolve(
    actorUserId: string,
    workId: string,
    threadId: string
  ): Promise<StudioTeamCommentTransitionResponse> {
    const response = await this.run(() => this.repository.resolve(actorUserId, workId, threadId));
    return TransitionStudioTeamCommentResponseSchema.parse(response);
  }

  async reopen(
    actorUserId: string,
    workId: string,
    threadId: string
  ): Promise<StudioTeamCommentTransitionResponse> {
    const response = await this.run(() => this.repository.reopen(actorUserId, workId, threadId));
    return TransitionStudioTeamCommentResponseSchema.parse(response);
  }

  async reanchor(
    actorUserId: string,
    workId: string,
    threadId: string,
    body: ReanchorStudioTeamCommentCommand
  ): Promise<StudioTeamCommentReanchorResponse> {
    const input = ReanchorStudioTeamCommentCommandSchema.parse(body);
    const response = await this.run(() => this.repository.reanchor(
      actorUserId,
      workId,
      threadId,
      input
    ));
    return ReanchorStudioTeamCommentResponseSchema.parse(response);
  }

  async markRead(
    actorUserId: string,
    workId: string,
    threadId: string
  ): Promise<StudioTeamCommentReadResponse> {
    const response = await this.run(() => this.repository.markRead(actorUserId, workId, threadId));
    return ReadStudioTeamCommentResponseSchema.parse(response);
  }

  async markAllRead(
    actorUserId: string,
    workId: string
  ): Promise<StudioTeamCommentReadAllResponse> {
    const response = await this.run(() => this.repository.markAllRead(actorUserId, workId));
    return ReadAllStudioTeamCommentsResponseSchema.parse(response);
  }

  private async run<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof StudioTeamCommentCursorError) {
        throw new BadRequestException("댓글 페이지 커서가 올바르지 않습니다.");
      }
      if (error instanceof StudioTeamCommentNotFoundError) {
        throw new NotFoundException(
          error.target === "work"
            ? "작품을 찾을 수 없습니다."
            : "팀 검수 댓글을 찾을 수 없습니다."
        );
      }
      if (error instanceof StudioTeamCommentForbiddenError) {
        const message = error.operation === "view"
          ? "이 작품의 팀 검수 댓글을 볼 권한이 없습니다."
          : error.operation === "comment"
            ? "이 작품에 팀 검수 댓글을 작성할 권한이 없습니다."
            : error.operation === "resolve"
              ? "이 작품의 팀 검수 댓글을 해결하거나 다시 열 권한이 없습니다."
              : "이 댓글의 위치를 변경할 권한이 없습니다.";
        throw new ForbiddenException(message);
      }
      if (error instanceof StudioTeamCommentActivityConflictError) {
        throw new ConflictException(
          "댓글이 다른 작업으로 변경되었습니다. 최신 댓글을 불러온 뒤 위치를 다시 옮겨 주세요."
        );
      }
      if (error instanceof StudioTeamCommentStateConflictError) {
        throw new ConflictException(
          "해결된 팀 검수 댓글에는 답글을 추가할 수 없습니다. 댓글을 다시 연 뒤 작성해 주세요."
        );
      }
      if (error instanceof StudioTeamCommentMutationConflictError) {
        throw new ConflictException(
          "같은 댓글 요청 식별자가 다른 내용에 이미 사용되었습니다. 새 요청으로 다시 시도해 주세요."
        );
      }
      if (error instanceof StudioTeamCommentQuotaError) {
        const message = error.quota === "threads"
          ? "한 작품에 저장할 수 있는 팀 검수 댓글 수를 초과했습니다."
          : error.quota === "thread_messages"
            ? "한 팀 검수 댓글에 추가할 수 있는 답글 수를 초과했습니다. 새 댓글로 검수를 이어가 주세요."
            : "이 작품에 저장할 수 있는 팀 검수 메시지 수를 초과했습니다.";
        throw new PayloadTooLargeException(
          message
        );
      }
      throw error;
    }
  }
}
