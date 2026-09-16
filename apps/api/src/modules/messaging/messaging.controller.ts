import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UnauthorizedException,
} from "@nestjs/common";

import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import {
  ArchiveMessageThreadDto,
  CreateMessageRequestDto,
  GetMessagingThreadQueryDto,
  ListMessagingThreadsQueryDto,
  MarkMessageReadDto,
  MessagingMessageParamsDto,
  MessagingThreadParamsDto,
  MessagingUserParamsDto,
  MuteMessageThreadDto,
  ReportMessageDto,
  SendMessageDto,
  UpdateMessagingPreferencesDto,
} from "./messaging.dto";
import { MessagingService } from "./messaging.service";

function requireMessagingUserId(userId: string | undefined): string {
  if (!userId) throw new UnauthorizedException("로그인이 필요해요.");
  return userId;
}

@Controller("messages")
export class MessagingController {
  constructor(private readonly service: MessagingService) {}

  @Get("threads")
  listThreads(
    @Headers("x-user-id") userId: string | undefined,
    @Query(new ZodValidationPipe(ListMessagingThreadsQueryDto)) query: ListMessagingThreadsQueryDto
  ) {
    return this.service.listThreads(requireMessagingUserId(userId), query);
  }

  @Get("threads/:threadId")
  getThread(
    @Headers("x-user-id") userId: string | undefined,
    @Param(new ZodValidationPipe(MessagingThreadParamsDto)) params: MessagingThreadParamsDto,
    @Query(new ZodValidationPipe(GetMessagingThreadQueryDto)) query: GetMessagingThreadQueryDto
  ) {
    return this.service.getThread(requireMessagingUserId(userId), params.threadId, query);
  }

  @Post("requests")
  createRequest(
    @Headers("x-user-id") userId: string | undefined,
    @Body(new ZodValidationPipe(CreateMessageRequestDto)) body: CreateMessageRequestDto
  ) {
    return this.service.createRequest(requireMessagingUserId(userId), body);
  }

  @Post("requests/:threadId/accept")
  @HttpCode(HttpStatus.OK)
  acceptRequest(
    @Headers("x-user-id") userId: string | undefined,
    @Param(new ZodValidationPipe(MessagingThreadParamsDto)) params: MessagingThreadParamsDto
  ) {
    return this.service.acceptRequest(requireMessagingUserId(userId), params.threadId);
  }

  @Post("requests/:threadId/decline")
  @HttpCode(HttpStatus.OK)
  declineRequest(
    @Headers("x-user-id") userId: string | undefined,
    @Param(new ZodValidationPipe(MessagingThreadParamsDto)) params: MessagingThreadParamsDto
  ) {
    return this.service.declineRequest(requireMessagingUserId(userId), params.threadId);
  }

  @Post("threads/:threadId/messages")
  sendMessage(
    @Headers("x-user-id") userId: string | undefined,
    @Param(new ZodValidationPipe(MessagingThreadParamsDto)) params: MessagingThreadParamsDto,
    @Body(new ZodValidationPipe(SendMessageDto)) body: SendMessageDto
  ) {
    return this.service.sendMessage(requireMessagingUserId(userId), params.threadId, body);
  }

  @Post("threads/:threadId/read")
  @HttpCode(HttpStatus.OK)
  markRead(
    @Headers("x-user-id") userId: string | undefined,
    @Param(new ZodValidationPipe(MessagingThreadParamsDto)) params: MessagingThreadParamsDto,
    @Body(new ZodValidationPipe(MarkMessageReadDto)) body: MarkMessageReadDto
  ) {
    return this.service.markRead(requireMessagingUserId(userId), params.threadId, body.messageId);
  }

  @Post("threads/:threadId/archive")
  @HttpCode(HttpStatus.OK)
  archiveThread(
    @Headers("x-user-id") userId: string | undefined,
    @Param(new ZodValidationPipe(MessagingThreadParamsDto)) params: MessagingThreadParamsDto,
    @Body(new ZodValidationPipe(ArchiveMessageThreadDto)) body: ArchiveMessageThreadDto
  ) {
    return this.service.archiveThread(requireMessagingUserId(userId), params.threadId, body.archived);
  }

  @Post("threads/:threadId/mute")
  @HttpCode(HttpStatus.OK)
  muteThread(
    @Headers("x-user-id") userId: string | undefined,
    @Param(new ZodValidationPipe(MessagingThreadParamsDto)) params: MessagingThreadParamsDto,
    @Body(new ZodValidationPipe(MuteMessageThreadDto)) body: MuteMessageThreadDto
  ) {
    return this.service.muteThread(requireMessagingUserId(userId), params.threadId, body.until);
  }

  @Get("unread-count")
  unreadCount(@Headers("x-user-id") userId: string | undefined) {
    return this.service.unreadCount(requireMessagingUserId(userId));
  }

  @Get("preferences")
  getPreferences(@Headers("x-user-id") userId: string | undefined) {
    return this.service.getPreferences(requireMessagingUserId(userId));
  }

  @Patch("preferences")
  updatePreferences(
    @Headers("x-user-id") userId: string | undefined,
    @Body(new ZodValidationPipe(UpdateMessagingPreferencesDto)) body: UpdateMessagingPreferencesDto
  ) {
    return this.service.updatePreferences(requireMessagingUserId(userId), body);
  }

  @Get("blocks")
  listBlocks(@Headers("x-user-id") userId: string | undefined) {
    return this.service.listBlocks(requireMessagingUserId(userId));
  }

  @Post("blocks/:userId")
  @HttpCode(HttpStatus.OK)
  blockUser(
    @Headers("x-user-id") userId: string | undefined,
    @Param(new ZodValidationPipe(MessagingUserParamsDto)) params: MessagingUserParamsDto
  ) {
    return this.service.blockUser(requireMessagingUserId(userId), params.userId);
  }

  @Delete("blocks/:userId")
  unblockUser(
    @Headers("x-user-id") userId: string | undefined,
    @Param(new ZodValidationPipe(MessagingUserParamsDto)) params: MessagingUserParamsDto
  ) {
    return this.service.unblockUser(requireMessagingUserId(userId), params.userId);
  }

  @Post(":messageId/report")
  reportMessage(
    @Headers("x-user-id") userId: string | undefined,
    @Param(new ZodValidationPipe(MessagingMessageParamsDto)) params: MessagingMessageParamsDto,
    @Body(new ZodValidationPipe(ReportMessageDto)) body: ReportMessageDto
  ) {
    return this.service.reportMessage(requireMessagingUserId(userId), params.messageId, body);
  }
}
