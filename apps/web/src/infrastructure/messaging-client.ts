import { api } from "@/infrastructure/api";

export type MessagingThreadState = "pending" | "active" | "declined" | "closed";
export type MessagingRequestCategory = "feedback" | "collaboration" | "business" | "general";
export type MessagingContextType = "profile" | "work" | "project" | "general";
export type MessagingReceiveFrom = "everyone" | "followers" | "mutuals" | "nobody";
export type MessagingReportReason =
  | "harassment"
  | "spam"
  | "scam"
  | "sexual"
  | "threat"
  | "copyright"
  | "other";

export interface MessagingContext {
  type: MessagingContextType;
  id: string | null;
  label: string;
  href: string | null;
}

export interface MessagingUser {
  id: string;
  name: string;
  image: string | null;
  avatar: string | null;
}

export interface MessagingMessage {
  id: string;
  threadId: string;
  senderId: string | null;
  type: "text" | "work_card" | "project_card" | "system";
  body: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  deletedAt: string | null;
  mine: boolean;
  readByOther: boolean;
}

export interface MessagingThreadSummary {
  id: string;
  state: MessagingThreadState;
  category: MessagingRequestCategory;
  context: MessagingContext;
  otherUser: MessagingUser;
  createdByMe: boolean;
  incomingRequest: boolean;
  canReply: boolean;
  blocked: boolean;
  archivedAt: string | null;
  mutedUntil: string | null;
  unreadCount: number;
  lastMessage: Pick<
    MessagingMessage,
    "id" | "senderId" | "type" | "body" | "createdAt" | "deletedAt"
  > | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
}

export interface MessagingThreadDetail {
  thread: MessagingThreadSummary;
  messages: MessagingMessage[];
  nextBefore: string | null;
}

export interface MessagingPreferences {
  receiveFrom: MessagingReceiveFrom;
  emailNotification: boolean;
  readReceipt: boolean;
  updatedAt: string | null;
}

export interface MessagingBlockedUser {
  user: MessagingUser;
  blockedAt: string;
}

export interface CreateMessagingRequestInput {
  recipientId: string;
  category: MessagingRequestCategory;
  text: string;
  contextType?: MessagingContextType;
  contextId?: string;
  contextLabel?: string;
}

export interface SendMessagingMessageInput {
  text: string;
  type?: "text" | "work_card" | "project_card";
  contextId?: string;
  contextLabel?: string;
}

export const messagingClient = {
  listThreads(tab: "active" | "requests" | "archived" | "all" = "active", limit = 30) {
    return api.get<{ items: MessagingThreadSummary[] }>("/messages/threads", {
      params: { tab, limit },
    });
  },
  getThread(threadId: string, before?: string, limit = 50) {
    return api.get<MessagingThreadDetail>(
      `/messages/threads/${encodeURIComponent(threadId)}`,
      { params: { before, limit } }
    );
  },
  createRequest(input: CreateMessagingRequestInput) {
    return api.post<MessagingThreadDetail>("/messages/requests", input);
  },
  acceptRequest(threadId: string) {
    return api.post<MessagingThreadDetail>(
      `/messages/requests/${encodeURIComponent(threadId)}/accept`,
      {}
    );
  },
  declineRequest(threadId: string) {
    return api.post<{ ok: true; threadId: string }>(
      `/messages/requests/${encodeURIComponent(threadId)}/decline`,
      {}
    );
  },
  sendMessage(threadId: string, input: SendMessagingMessageInput) {
    return api.post<MessagingMessage>(
      `/messages/threads/${encodeURIComponent(threadId)}/messages`,
      input
    );
  },
  markRead(threadId: string, messageId?: string) {
    return api.post<{ threadId: string; messageId: string | null; readAt: string }>(
      `/messages/threads/${encodeURIComponent(threadId)}/read`,
      messageId ? { messageId } : {}
    );
  },
  archiveThread(threadId: string, archived = true) {
    return api.post<{ threadId: string; archivedAt: string | null }>(
      `/messages/threads/${encodeURIComponent(threadId)}/archive`,
      { archived }
    );
  },
  muteThread(threadId: string, until: string | null) {
    return api.post<{ threadId: string; mutedUntil: string | null }>(
      `/messages/threads/${encodeURIComponent(threadId)}/mute`,
      { until }
    );
  },
  unreadCount() {
    return api.get<{ messages: number; requests: number; total: number }>(
      "/messages/unread-count"
    );
  },
  getPreferences() {
    return api.get<MessagingPreferences>("/messages/preferences");
  },
  updatePreferences(input: Partial<Omit<MessagingPreferences, "updatedAt">>) {
    return api.patch<MessagingPreferences>("/messages/preferences", input);
  },
  listBlocks() {
    return api.get<{ items: MessagingBlockedUser[] }>("/messages/blocks");
  },
  blockUser(userId: string) {
    return api.post<{ blocked: true; userId: string }>(
      `/messages/blocks/${encodeURIComponent(userId)}`,
      {}
    );
  },
  unblockUser(userId: string) {
    return api.delete<{ blocked: false; userId: string }>(
      `/messages/blocks/${encodeURIComponent(userId)}`
    );
  },
  reportMessage(messageId: string, reason: MessagingReportReason, details = "") {
    return api.post<{ id: string; status: "open" }>(
      `/messages/${encodeURIComponent(messageId)}/report`,
      { reason, details }
    );
  },
};
