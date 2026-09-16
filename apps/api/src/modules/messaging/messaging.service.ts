import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";

import {
  CreateMessageRequestSchema,
  GetMessagingThreadQuerySchema,
  ListMessagingThreadsQuerySchema,
  MessagingMessageSchema,
  MessagingPreferencesSchema,
  MessagingThreadDetailSchema,
  MessagingThreadSummarySchema,
  ReportMessageSchema,
  SendMessageSchema,
  UpdateMessagingPreferencesSchema,
} from "./messaging.dto";
import {
  MESSAGING_REPOSITORY,
  MessagingConflictError,
  MessagingForbiddenError,
  MessagingNotFoundError,
  MessagingPreferenceError,
  MessagingRateLimitError,
  MessagingSchemaUnavailableError,
  MessagingVerificationError,
} from "./messaging.repository";

import type {
  CreateMessageRequestInput,
  GetMessagingThreadQuery,
  ListMessagingThreadsQuery,
  ReportMessageInput,
  SendMessageInput,
  UpdateMessagingPreferencesInput,
} from "./messaging.dto";
import type { MessagingRepository } from "./messaging.repository";

function notFoundMessage(target: MessagingNotFoundError["target"]): string {
  if (target === "user") return "회원을 찾을 수 없습니다.";
  if (target === "message") return "메시지를 찾을 수 없습니다.";
  if (target === "context") return "연결할 작품이나 프로젝트를 찾을 수 없습니다.";
  return "대화를 찾을 수 없습니다.";
}

function forbiddenMessage(reason: MessagingForbiddenError["reason"]): string {
  if (reason === "blocked") return "차단 관계에서는 메시지를 주고받을 수 없습니다.";
  if (reason === "inactive_user") return "현재 메시지를 사용할 수 없는 계정입니다.";
  if (reason === "request_recipient") return "받은 메시지 요청만 처리할 수 있습니다.";
  if (reason === "report_own_message") return "본인이 보낸 메시지는 신고할 수 없습니다.";
  if (reason === "context_access") return "이 작품 또는 프로젝트를 공유할 권한이 없습니다.";
  return "이 대화에 접근할 수 없습니다.";
}

function conflictMessage(reason: MessagingConflictError["reason"]): string {
  if (reason === "self") return "자신에게 메시지를 보낼 수 없습니다.";
  if (reason === "thread_exists") return "이미 이 회원과의 메시지 요청 또는 대화가 있습니다.";
  if (reason === "already_reported") return "이미 신고한 메시지입니다.";
  return "현재 대화 상태에서는 이 작업을 할 수 없습니다.";
}

function preferenceMessage(receiveFrom: MessagingPreferenceError["receiveFrom"]): string {
  if (receiveFrom === "followers") return "상대방은 팔로워의 메시지 요청만 받고 있습니다.";
  if (receiveFrom === "mutuals") return "상대방은 서로 팔로우한 회원의 요청만 받고 있습니다.";
  return "상대방이 새 메시지 요청을 받지 않고 있습니다.";
}

async function messagingBoundary<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof MessagingNotFoundError) {
      throw new NotFoundException(notFoundMessage(error.target));
    }
    if (error instanceof MessagingForbiddenError) {
      throw new ForbiddenException(forbiddenMessage(error.reason));
    }
    if (error instanceof MessagingConflictError) {
      throw new ConflictException(conflictMessage(error.reason));
    }
    if (error instanceof MessagingVerificationError) {
      throw new ForbiddenException("이메일 인증 또는 소셜 로그인을 완료한 뒤 메시지를 보낼 수 있습니다.");
    }
    if (error instanceof MessagingPreferenceError) {
      throw new ForbiddenException(preferenceMessage(error.receiveFrom));
    }
    if (error instanceof MessagingRateLimitError) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: "메시지 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
          retryAfterSeconds: error.retryAfterSeconds,
          reason: error.reason,
        },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }
    if (error instanceof MessagingSchemaUnavailableError) {
      throw new ServiceUnavailableException("메시지 저장소를 준비하는 중입니다. 잠시 후 다시 시도해 주세요.");
    }
    throw error;
  }
}

function parseInput<T>(schema: { safeParse: (value: unknown) => { success: boolean; data?: T } }, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success || parsed.data === undefined) {
    throw new BadRequestException("메시지 요청 내용을 확인해 주세요.");
  }
  return parsed.data;
}

@Injectable()
export class MessagingService {
  constructor(
    @Inject(MESSAGING_REPOSITORY)
    private readonly repository: MessagingRepository
  ) {}

  async listThreads(actorUserId: string, input: ListMessagingThreadsQuery) {
    const query = parseInput(ListMessagingThreadsQuerySchema, input);
    return messagingBoundary(async () => {
      const response = await this.repository.listThreads(actorUserId, query);
      return { items: response.items.map((item) => MessagingThreadSummarySchema.parse(item)) };
    });
  }

  async getThread(actorUserId: string, threadId: string, input: GetMessagingThreadQuery) {
    const query = parseInput(GetMessagingThreadQuerySchema, input);
    return messagingBoundary(async () =>
      MessagingThreadDetailSchema.parse(
        await this.repository.getThread(actorUserId, threadId, query)
      )
    );
  }

  async createRequest(actorUserId: string, input: CreateMessageRequestInput) {
    const body = parseInput(CreateMessageRequestSchema, input);
    return messagingBoundary(async () =>
      MessagingThreadDetailSchema.parse(
        await this.repository.createRequest(actorUserId, body)
      )
    );
  }

  async acceptRequest(actorUserId: string, threadId: string) {
    return messagingBoundary(async () =>
      MessagingThreadDetailSchema.parse(
        await this.repository.acceptRequest(actorUserId, threadId)
      )
    );
  }

  async declineRequest(actorUserId: string, threadId: string) {
    return messagingBoundary(() => this.repository.declineRequest(actorUserId, threadId));
  }

  async sendMessage(actorUserId: string, threadId: string, input: SendMessageInput) {
    const body = parseInput(SendMessageSchema, input);
    return messagingBoundary(async () =>
      MessagingMessageSchema.parse(
        await this.repository.sendMessage(actorUserId, threadId, body)
      )
    );
  }

  async markRead(actorUserId: string, threadId: string, messageId?: string) {
    return messagingBoundary(() => this.repository.markRead(actorUserId, threadId, messageId));
  }

  async archiveThread(actorUserId: string, threadId: string, archived: boolean) {
    return messagingBoundary(() => this.repository.archiveThread(actorUserId, threadId, archived));
  }

  async muteThread(actorUserId: string, threadId: string, until: string | null) {
    return messagingBoundary(() => this.repository.muteThread(actorUserId, threadId, until));
  }

  async unreadCount(actorUserId: string) {
    return messagingBoundary(() => this.repository.unreadCount(actorUserId));
  }

  async getPreferences(actorUserId: string) {
    return messagingBoundary(async () =>
      MessagingPreferencesSchema.parse(
        await this.repository.getPreferences(actorUserId)
      )
    );
  }

  async updatePreferences(actorUserId: string, input: UpdateMessagingPreferencesInput) {
    const body = parseInput(UpdateMessagingPreferencesSchema, input);
    return messagingBoundary(async () =>
      MessagingPreferencesSchema.parse(
        await this.repository.updatePreferences(actorUserId, body)
      )
    );
  }

  async listBlocks(actorUserId: string) {
    return messagingBoundary(() => this.repository.listBlocks(actorUserId));
  }

  async blockUser(actorUserId: string, targetUserId: string) {
    return messagingBoundary(() => this.repository.blockUser(actorUserId, targetUserId));
  }

  async unblockUser(actorUserId: string, targetUserId: string) {
    return messagingBoundary(() => this.repository.unblockUser(actorUserId, targetUserId));
  }

  async reportMessage(actorUserId: string, messageId: string, input: ReportMessageInput) {
    const body = parseInput(ReportMessageSchema, input);
    return messagingBoundary(() => this.repository.reportMessage(actorUserId, messageId, body));
  }
}
