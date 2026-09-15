import { createHash, randomUUID } from "node:crypto";

import { dbPool } from "../../db";

import type { Pool, PoolClient, QueryResultRow } from "pg";
import type {
  CreateMessageRequestInput,
  GetMessagingThreadQuery,
  ListMessagingThreadsQuery,
  MessagingBlockedUser,
  MessagingContext,
  MessagingMessage,
  MessagingPreferences,
  MessagingReceiveFrom,
  MessagingThreadDetail,
  MessagingThreadSummary,
  MessagingUser,
  ReportMessageInput,
  SendMessageInput,
  UpdateMessagingPreferencesInput,
} from "./messaging.dto";

export const MESSAGING_REPOSITORY = Symbol("MESSAGING_REPOSITORY");

const REQUEST_WINDOW_MS = 24 * 60 * 60_000;
const NEW_ACCOUNT_AGE_MS = 7 * 24 * 60 * 60_000;
const SEND_WINDOW_MS = 10 * 60_000;
const MAX_MUTE_MS = 365 * 24 * 60 * 60_000;

export class MessagingNotFoundError extends Error {
  constructor(readonly target: "user" | "thread" | "message" | "context") {
    super(`messaging_${target}_not_found`);
    this.name = "MessagingNotFoundError";
  }
}

export class MessagingForbiddenError extends Error {
  constructor(
    readonly reason:
      | "membership"
      | "request_recipient"
      | "blocked"
      | "inactive_user"
      | "report_own_message"
      | "context_access"
  ) {
    super(`messaging_forbidden_${reason}`);
    this.name = "MessagingForbiddenError";
  }
}

export class MessagingConflictError extends Error {
  constructor(readonly reason: "self" | "thread_exists" | "state" | "already_reported") {
    super(`messaging_conflict_${reason}`);
    this.name = "MessagingConflictError";
  }
}

export class MessagingRateLimitError extends Error {
  constructor(
    readonly reason: "new_threads" | "thread_messages" | "global_messages" | "duplicate",
    readonly retryAfterSeconds: number
  ) {
    super(`messaging_rate_limit_${reason}`);
    this.name = "MessagingRateLimitError";
  }
}

export class MessagingVerificationError extends Error {
  constructor() {
    super("messaging_verification_required");
    this.name = "MessagingVerificationError";
  }
}

export class MessagingPreferenceError extends Error {
  constructor(readonly receiveFrom: MessagingReceiveFrom) {
    super(`messaging_preference_${receiveFrom}`);
    this.name = "MessagingPreferenceError";
  }
}

export class MessagingSchemaUnavailableError extends Error {
  constructor(options?: ErrorOptions) {
    super("messaging_schema_unavailable", options);
    this.name = "MessagingSchemaUnavailableError";
  }
}

type Queryable = Pick<PoolClient, "query">;

interface UserRow extends QueryResultRow {
  id: string;
  name: string | null;
  image: string | null;
  avatar: string | null;
  status: string;
  emailVerified: Date | string | null;
  createdAt: Date | string | null;
  hasOAuthAccount: boolean;
}

interface ThreadSummaryRow extends QueryResultRow {
  id: string;
  state: string;
  requestCategory: string;
  contextType: string;
  contextId: string | null;
  contextLabel: string;
  createdBy: string;
  requestRecipientId: string;
  memberAId: string;
  memberBId: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  lastMessageAt: Date | string;
  archivedAt: Date | string | null;
  mutedUntil: Date | string | null;
  otherUserId: string;
  otherName: string | null;
  otherImage: string | null;
  otherAvatar: string | null;
  otherStatus: string;
  unreadCount: string | number;
  blocked: boolean;
  lastMessageId: string | null;
  lastSenderId: string | null;
  lastType: string | null;
  lastBody: string | null;
  lastCreatedAt: Date | string | null;
  lastDeletedAt: Date | string | null;
}

interface MessageRow extends QueryResultRow {
  id: string;
  threadId: string;
  senderId: string | null;
  type: string;
  body: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date | string;
  deletedAt: Date | string | null;
  otherLastReadAt?: Date | string | null;
  otherReadReceipt?: boolean | null;
}

interface ContextProjection {
  type: CreateMessageRequestInput["contextType"];
  id: string | null;
  label: string;
  href: string | null;
}

export interface MessagingRepository {
  listThreads(actorUserId: string, query: ListMessagingThreadsQuery): Promise<{ items: MessagingThreadSummary[] }>;
  getThread(actorUserId: string, threadId: string, query: GetMessagingThreadQuery): Promise<MessagingThreadDetail>;
  createRequest(actorUserId: string, input: CreateMessageRequestInput): Promise<MessagingThreadDetail>;
  acceptRequest(actorUserId: string, threadId: string): Promise<MessagingThreadDetail>;
  declineRequest(actorUserId: string, threadId: string): Promise<{ ok: true; threadId: string }>;
  sendMessage(actorUserId: string, threadId: string, input: SendMessageInput): Promise<MessagingMessage>;
  markRead(actorUserId: string, threadId: string, messageId?: string): Promise<{ threadId: string; messageId: string | null; readAt: string }>;
  archiveThread(actorUserId: string, threadId: string, archived: boolean): Promise<{ threadId: string; archivedAt: string | null }>;
  muteThread(actorUserId: string, threadId: string, until: string | null): Promise<{ threadId: string; mutedUntil: string | null }>;
  unreadCount(actorUserId: string): Promise<{ messages: number; requests: number; total: number }>;
  getPreferences(actorUserId: string): Promise<MessagingPreferences>;
  updatePreferences(actorUserId: string, input: UpdateMessagingPreferencesInput): Promise<MessagingPreferences>;
  listBlocks(actorUserId: string): Promise<{ items: MessagingBlockedUser[] }>;
  blockUser(actorUserId: string, targetUserId: string): Promise<{ blocked: true; userId: string }>;
  unblockUser(actorUserId: string, targetUserId: string): Promise<{ blocked: false; userId: string }>;
  reportMessage(actorUserId: string, messageId: string, input: ReportMessageInput): Promise<{ id: string; status: "open" }>;
}

export function buildDirectMessageKey(firstUserId: string, secondUserId: string): string {
  const [memberAId, memberBId] = orderedPair(firstUserId, secondUserId);
  return createHash("sha256")
    .update(`${memberAId.length}:${memberAId}${memberBId.length}:${memberBId}`, "utf8")
    .digest("hex");
}

function orderedPair(firstUserId: string, secondUserId: string): [string, string] {
  return firstUserId < secondUserId
    ? [firstUserId, secondUserId]
    : [secondUserId, firstUserId];
}

function iso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString();
}

function isoOrNull(value: Date | string | null | undefined): string | null {
  return value == null ? null : iso(value);
}

function displayName(name: string | null, userId: string, status: string): string {
  if (status === "deleted") return "탈퇴한 사용자";
  const normalized = name?.trim();
  return normalized ? normalized.slice(0, 160) : userId.slice(0, 160);
}

function contextHref(type: string, id: string | null, otherUserId: string): string | null {
  if (type === "profile") return `/u/${encodeURIComponent(otherUserId)}`;
  if (type === "work" && id) return `/showcase/work/${encodeURIComponent(id)}`;
  if (type === "project" && id) return `/studio/work/${encodeURIComponent(id)}`;
  return null;
}

function projectUser(row: {
  otherUserId: string;
  otherName: string | null;
  otherImage: string | null;
  otherAvatar: string | null;
  otherStatus: string;
}): MessagingUser {
  return {
    id: row.otherUserId,
    name: displayName(row.otherName, row.otherUserId, row.otherStatus),
    image: row.otherStatus === "deleted" ? null : row.otherImage,
    avatar: row.otherStatus === "deleted" ? null : row.otherAvatar,
  };
}

function projectSummary(row: ThreadSummaryRow, actorUserId: string): MessagingThreadSummary {
  const lastMessage = row.lastMessageId && row.lastType && row.lastBody && row.lastCreatedAt
    ? {
        id: row.lastMessageId,
        senderId: row.lastSenderId,
        type: row.lastType as "text" | "work_card" | "project_card" | "system",
        body: row.lastBody,
        createdAt: iso(row.lastCreatedAt),
        deletedAt: isoOrNull(row.lastDeletedAt),
      }
    : null;
  return {
    id: row.id,
    state: row.state as MessagingThreadSummary["state"],
    category: row.requestCategory as MessagingThreadSummary["category"],
    context: {
      type: row.contextType as MessagingContext["type"],
      id: row.contextId,
      label: row.contextLabel,
      href: contextHref(row.contextType, row.contextId, row.otherUserId),
    },
    otherUser: projectUser(row),
    createdByMe: row.createdBy === actorUserId,
    incomingRequest: row.state === "pending" && row.requestRecipientId === actorUserId,
    canReply: row.state === "active" && !row.blocked,
    blocked: row.blocked,
    archivedAt: isoOrNull(row.archivedAt),
    mutedUntil: isoOrNull(row.mutedUntil),
    unreadCount: Number(row.unreadCount ?? 0),
    lastMessage,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    lastMessageAt: iso(row.lastMessageAt),
  };
}

function projectMessage(
  row: MessageRow,
  actorUserId: string,
  includeReceipt = true
): MessagingMessage {
  const mine = row.senderId === actorUserId;
  const otherLastReadAt = isoOrNull(row.otherLastReadAt);
  const createdAt = iso(row.createdAt);
  return {
    id: row.id,
    threadId: row.threadId,
    senderId: row.senderId,
    type: row.type as MessagingMessage["type"],
    body: row.deletedAt ? "삭제된 메시지입니다." : row.body,
    metadata: row.deletedAt ? {} : (row.metadata ?? {}),
    createdAt,
    deletedAt: isoOrNull(row.deletedAt),
    mine,
    readByOther:
      includeReceipt &&
      mine &&
      row.otherReadReceipt !== false &&
      otherLastReadAt !== null &&
      Date.parse(otherLastReadAt) >= Date.parse(createdAt),
  };
}

function isMissingMessagingSchema(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code) : "";
  return code === "42P01" || code === "42703" || code === "42501";
}

function secondsUntil(windowStart: Date, windowMs: number): number {
  return Math.max(1, Math.ceil((windowStart.getTime() + windowMs - Date.now()) / 1000));
}

export class PostgresMessagingRepository implements MessagingRepository {
  constructor(private readonly pool: Pool = dbPool) {}

  async listThreads(
    actorUserId: string,
    query: ListMessagingThreadsQuery
  ): Promise<{ items: MessagingThreadSummary[] }> {
    return this.boundary(async () => {
      await this.requireActiveUser(this.pool, actorUserId);
      const result = await this.pool.query<ThreadSummaryRow>(
        this.threadSummarySql(query.tab),
        [actorUserId, query.limit]
      );
      return { items: result.rows.map((row) => projectSummary(row, actorUserId)) };
    });
  }

  async getThread(
    actorUserId: string,
    threadId: string,
    query: GetMessagingThreadQuery
  ): Promise<MessagingThreadDetail> {
    return this.boundary(async () => {
      await this.requireActiveUser(this.pool, actorUserId);
      return this.loadThreadDetail(this.pool, actorUserId, threadId, query);
    });
  }

  async createRequest(
    actorUserId: string,
    input: CreateMessageRequestInput
  ): Promise<MessagingThreadDetail> {
    if (actorUserId === input.recipientId) throw new MessagingConflictError("self");
    return this.transaction(async (client) => {
      const [actor] = await Promise.all([
        this.requireActiveUser(client, actorUserId),
        this.requireActiveUser(client, input.recipientId),
      ]);
      await this.lockActorRateLimit(client, actorUserId);
      if (!actor.emailVerified && !actor.hasOAuthAccount) {
        throw new MessagingVerificationError();
      }
      await this.requireUnblocked(client, actorUserId, input.recipientId);
      await this.requireRecipientAllows(client, actorUserId, input.recipientId);
      const context = await this.resolveContext(
        client,
        actorUserId,
        input.recipientId,
        input.contextType,
        input.contextId
      );
      await this.enforceNewThreadRateLimits(client, actor, input.text);

      const [memberAId, memberBId] = orderedPair(actorUserId, input.recipientId);
      const dmKey = buildDirectMessageKey(actorUserId, input.recipientId);
      const existing = await client.query<{ id: string }>(
        `SELECT "id" FROM public."member_message_thread" WHERE "dmKey" = $1 FOR UPDATE`,
        [dmKey]
      );
      if (existing.rows[0]) throw new MessagingConflictError("thread_exists");

      const now = new Date();
      const threadId = randomUUID();
      const messageId = randomUUID();
      await client.query(
        `
          INSERT INTO public."member_message_thread" (
            "id", "dmKey", "memberAId", "memberBId", "createdBy",
            "requestRecipientId", "state", "requestCategory", "contextType",
            "contextId", "contextLabel", "lastMessageAt", "createdAt", "updatedAt"
          ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $9, $10, $11, $11, $11)
        `,
        [
          threadId,
          dmKey,
          memberAId,
          memberBId,
          actorUserId,
          input.recipientId,
          input.category,
          context.type,
          context.id,
          context.label,
          now,
        ]
      );
      await client.query(
        `
          INSERT INTO public."member_message_participant" (
            "threadId", "userId", "lastReadMessageId", "lastReadAt", "joinedAt"
          ) VALUES
            ($1, $2, $4, $5, $5),
            ($1, $3, NULL, NULL, $5)
        `,
        [threadId, actorUserId, input.recipientId, messageId, now]
      );
      await client.query(
        `
          INSERT INTO public."member_message" (
            "id", "threadId", "senderId", "type", "body", "metadata", "createdAt"
          ) VALUES ($1, $2, $3, 'text', $4, $5::jsonb, $6)
        `,
        [
          messageId,
          threadId,
          actorUserId,
          input.text,
          JSON.stringify({ context }),
          now,
        ]
      );
      return this.loadThreadDetail(client, actorUserId, threadId, { limit: 50 });
    });
  }

  async acceptRequest(actorUserId: string, threadId: string): Promise<MessagingThreadDetail> {
    return this.transaction(async (client) => {
      await this.requireActiveUser(client, actorUserId);
      const thread = await this.lockThread(client, actorUserId, threadId);
      if (thread.state !== "pending") throw new MessagingConflictError("state");
      if (thread.requestRecipientId !== actorUserId) {
        throw new MessagingForbiddenError("request_recipient");
      }
      const otherUserId = thread.memberAId === actorUserId ? thread.memberBId : thread.memberAId;
      await this.requireActiveUser(client, otherUserId);
      await this.requireUnblocked(client, actorUserId, otherUserId);
      const now = new Date();
      await client.query(
        `
          UPDATE public."member_message_thread"
          SET "state" = 'active', "acceptedAt" = $2, "declinedAt" = NULL,
              "updatedAt" = $2
          WHERE "id" = $1
        `,
        [threadId, now]
      );
      await client.query(
        `UPDATE public."member_message_participant" SET "archivedAt" = NULL WHERE "threadId" = $1`,
        [threadId]
      );
      return this.loadThreadDetail(client, actorUserId, threadId, { limit: 50 });
    });
  }

  async declineRequest(
    actorUserId: string,
    threadId: string
  ): Promise<{ ok: true; threadId: string }> {
    return this.transaction(async (client) => {
      await this.requireActiveUser(client, actorUserId);
      const thread = await this.lockThread(client, actorUserId, threadId);
      if (thread.state !== "pending") throw new MessagingConflictError("state");
      if (thread.requestRecipientId !== actorUserId) {
        throw new MessagingForbiddenError("request_recipient");
      }
      const now = new Date();
      await client.query(
        `
          UPDATE public."member_message_thread"
          SET "state" = 'declined', "declinedAt" = $2, "updatedAt" = $2
          WHERE "id" = $1
        `,
        [threadId, now]
      );
      await client.query(
        `
          UPDATE public."member_message_participant"
          SET "archivedAt" = $3
          WHERE "threadId" = $1 AND "userId" = $2
        `,
        [threadId, actorUserId, now]
      );
      return { ok: true, threadId };
    });
  }

  async sendMessage(
    actorUserId: string,
    threadId: string,
    input: SendMessageInput
  ): Promise<MessagingMessage> {
    return this.transaction(async (client) => {
      await this.requireActiveUser(client, actorUserId);
      await this.lockActorRateLimit(client, actorUserId);
      const thread = await this.lockThread(client, actorUserId, threadId);
      if (thread.state !== "active") throw new MessagingConflictError("state");
      const otherUserId = thread.memberAId === actorUserId ? thread.memberBId : thread.memberAId;
      await this.requireActiveUser(client, otherUserId);
      await this.requireUnblocked(client, actorUserId, otherUserId);
      await this.enforceMessageRateLimits(client, actorUserId, threadId, input.text);

      let context: ContextProjection | null = null;
      if (input.type !== "text") {
        context = await this.resolveContext(
          client,
          actorUserId,
          otherUserId,
          input.type === "work_card" ? "work" : "project",
          input.contextId
        );
      }
      const now = new Date();
      const messageId = randomUUID();
      const metadata = context ? { context } : {};
      const inserted = await client.query<MessageRow>(
        `
          INSERT INTO public."member_message" (
            "id", "threadId", "senderId", "type", "body", "metadata", "createdAt"
          ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
          RETURNING "id", "threadId", "senderId", "type", "body", "metadata",
                    "createdAt", "deletedAt"
        `,
        [messageId, threadId, actorUserId, input.type, input.text, JSON.stringify(metadata), now]
      );
      await client.query(
        `
          UPDATE public."member_message_thread"
          SET "lastMessageAt" = $2, "updatedAt" = $2
          WHERE "id" = $1
        `,
        [threadId, now]
      );
      await client.query(
        `
          UPDATE public."member_message_participant"
          SET "archivedAt" = NULL,
              "lastReadMessageId" = CASE WHEN "userId" = $2 THEN $3 ELSE "lastReadMessageId" END,
              "lastReadAt" = CASE WHEN "userId" = $2 THEN $4 ELSE "lastReadAt" END
          WHERE "threadId" = $1
        `,
        [threadId, actorUserId, messageId, now]
      );
      const row = inserted.rows[0];
      if (!row) throw new MessagingNotFoundError("message");
      return projectMessage(row, actorUserId, false);
    });
  }

  async markRead(
    actorUserId: string,
    threadId: string,
    messageId?: string
  ): Promise<{ threadId: string; messageId: string | null; readAt: string }> {
    return this.transaction(async (client) => {
      await this.requireActiveUser(client, actorUserId);
      await this.requireParticipant(client, actorUserId, threadId);
      const target = messageId
        ? await client.query<{ id: string; createdAt: Date | string }>(
            `
              SELECT "id", "createdAt"
              FROM public."member_message"
              WHERE "threadId" = $1 AND "id" = $2
              LIMIT 1
            `,
            [threadId, messageId]
          )
        : await client.query<{ id: string; createdAt: Date | string }>(
            `
              SELECT "id", "createdAt"
              FROM public."member_message"
              WHERE "threadId" = $1
              ORDER BY "createdAt" DESC, "id" DESC
              LIMIT 1
            `,
            [threadId]
          );
      const latest = target.rows[0];
      if (messageId && !latest) throw new MessagingNotFoundError("message");
      const readAt = latest ? new Date(latest.createdAt) : new Date();
      await client.query(
        `
          UPDATE public."member_message_participant"
          SET "lastReadMessageId" = CASE
                WHEN "lastReadAt" IS NULL OR "lastReadAt" <= $3 THEN $2
                ELSE "lastReadMessageId"
              END,
              "lastReadAt" = GREATEST(COALESCE("lastReadAt", '-infinity'::timestamptz), $3)
          WHERE "threadId" = $1 AND "userId" = $4
        `,
        [threadId, latest?.id ?? null, readAt, actorUserId]
      );
      return { threadId, messageId: latest?.id ?? null, readAt: readAt.toISOString() };
    });
  }

  async archiveThread(
    actorUserId: string,
    threadId: string,
    archived: boolean
  ): Promise<{ threadId: string; archivedAt: string | null }> {
    return this.boundary(async () => {
      await this.requireActiveUser(this.pool, actorUserId);
      await this.requireParticipant(this.pool, actorUserId, threadId);
      const archivedAt = archived ? new Date() : null;
      await this.pool.query(
        `
          UPDATE public."member_message_participant"
          SET "archivedAt" = $3
          WHERE "threadId" = $1 AND "userId" = $2
        `,
        [threadId, actorUserId, archivedAt]
      );
      return { threadId, archivedAt: archivedAt?.toISOString() ?? null };
    });
  }

  async muteThread(
    actorUserId: string,
    threadId: string,
    until: string | null
  ): Promise<{ threadId: string; mutedUntil: string | null }> {
    return this.boundary(async () => {
      await this.requireActiveUser(this.pool, actorUserId);
      await this.requireParticipant(this.pool, actorUserId, threadId);
      const mutedUntil = until ? new Date(until) : null;
      if (
        mutedUntil &&
        (mutedUntil.getTime() <= Date.now() || mutedUntil.getTime() > Date.now() + MAX_MUTE_MS)
      ) {
        throw new MessagingConflictError("state");
      }
      await this.pool.query(
        `
          UPDATE public."member_message_participant"
          SET "mutedUntil" = $3
          WHERE "threadId" = $1 AND "userId" = $2
        `,
        [threadId, actorUserId, mutedUntil]
      );
      return { threadId, mutedUntil: mutedUntil?.toISOString() ?? null };
    });
  }

  async unreadCount(
    actorUserId: string
  ): Promise<{ messages: number; requests: number; total: number }> {
    return this.boundary(async () => {
      await this.requireActiveUser(this.pool, actorUserId);
      const result = await this.pool.query<{ messages: string | number; requests: string | number }>(
        `
          SELECT
            count(DISTINCT message."id") FILTER (
              WHERE thread."state" = 'active'
                AND message."senderId" IS DISTINCT FROM $1
                AND message."deletedAt" IS NULL
                AND (participant."lastReadAt" IS NULL OR message."createdAt" > participant."lastReadAt")
            ) AS "messages",
            count(DISTINCT thread."id") FILTER (
              WHERE thread."state" = 'pending'
                AND thread."requestRecipientId" = $1
            ) AS "requests"
          FROM public."member_message_participant" AS participant
          JOIN public."member_message_thread" AS thread
            ON thread."id" = participant."threadId"
          LEFT JOIN public."member_message" AS message
            ON message."threadId" = thread."id"
          WHERE participant."userId" = $1
            AND participant."archivedAt" IS NULL
        `,
        [actorUserId]
      );
      const messages = Number(result.rows[0]?.messages ?? 0);
      const requests = Number(result.rows[0]?.requests ?? 0);
      return { messages, requests, total: messages + requests };
    });
  }

  async getPreferences(actorUserId: string): Promise<MessagingPreferences> {
    return this.boundary(() => this.loadPreferences(this.pool, actorUserId));
  }

  async updatePreferences(
    actorUserId: string,
    input: UpdateMessagingPreferencesInput
  ): Promise<MessagingPreferences> {
    return this.boundary(async () => {
      await this.requireActiveUser(this.pool, actorUserId);
      const current = await this.loadPreferences(this.pool, actorUserId);
      const next = {
        receiveFrom: input.receiveFrom ?? current.receiveFrom,
        emailNotification: input.emailNotification ?? current.emailNotification,
        readReceipt: input.readReceipt ?? current.readReceipt,
      };
      const now = new Date();
      await this.pool.query(
        `
          INSERT INTO public."member_message_preference" (
            "userId", "receiveFrom", "emailNotification", "readReceipt", "updatedAt"
          ) VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT ("userId") DO UPDATE SET
            "receiveFrom" = EXCLUDED."receiveFrom",
            "emailNotification" = EXCLUDED."emailNotification",
            "readReceipt" = EXCLUDED."readReceipt",
            "updatedAt" = EXCLUDED."updatedAt"
        `,
        [actorUserId, next.receiveFrom, next.emailNotification, next.readReceipt, now]
      );
      return { ...next, updatedAt: now.toISOString() };
    });
  }

  async listBlocks(actorUserId: string): Promise<{ items: MessagingBlockedUser[] }> {
    return this.boundary(async () => {
      await this.requireActiveUser(this.pool, actorUserId);
      const result = await this.pool.query<{
        userId: string;
        name: string | null;
        image: string | null;
        avatar: string | null;
        status: string;
        blockedAt: Date | string;
      }>(
        `
          SELECT
            blocked."id" AS "userId",
            blocked."name",
            blocked."image",
            blocked."avatar",
            blocked."status",
            block."createdAt" AS "blockedAt"
          FROM public."member_message_block" AS block
          JOIN public."user" AS blocked ON blocked."id" = block."blockedUserId"
          WHERE block."blockerId" = $1
          ORDER BY block."createdAt" DESC
        `,
        [actorUserId]
      );
      return {
        items: result.rows.map((row) => ({
          user: {
            id: row.userId,
            name: displayName(row.name, row.userId, row.status),
            image: row.status === "deleted" ? null : row.image,
            avatar: row.status === "deleted" ? null : row.avatar,
          },
          blockedAt: iso(row.blockedAt),
        })),
      };
    });
  }

  async blockUser(
    actorUserId: string,
    targetUserId: string
  ): Promise<{ blocked: true; userId: string }> {
    if (actorUserId === targetUserId) throw new MessagingConflictError("self");
    return this.transaction(async (client) => {
      await Promise.all([
        this.requireActiveUser(client, actorUserId),
        this.requireExistingUser(client, targetUserId),
      ]);
      await client.query(
        `
          INSERT INTO public."member_message_block" ("blockerId", "blockedUserId", "createdAt")
          VALUES ($1, $2, now())
          ON CONFLICT ("blockerId", "blockedUserId") DO NOTHING
        `,
        [actorUserId, targetUserId]
      );
      await client.query(
        `
          UPDATE public."member_message_participant" AS participant
          SET "archivedAt" = now()
          FROM public."member_message_thread" AS thread
          WHERE participant."threadId" = thread."id"
            AND participant."userId" = $1
            AND (
              (thread."memberAId" = $1 AND thread."memberBId" = $2)
              OR (thread."memberAId" = $2 AND thread."memberBId" = $1)
            )
        `,
        [actorUserId, targetUserId]
      );
      return { blocked: true, userId: targetUserId };
    });
  }

  async unblockUser(
    actorUserId: string,
    targetUserId: string
  ): Promise<{ blocked: false; userId: string }> {
    return this.boundary(async () => {
      await this.requireActiveUser(this.pool, actorUserId);
      await this.pool.query(
        `
          DELETE FROM public."member_message_block"
          WHERE "blockerId" = $1 AND "blockedUserId" = $2
        `,
        [actorUserId, targetUserId]
      );
      return { blocked: false, userId: targetUserId };
    });
  }

  async reportMessage(
    actorUserId: string,
    messageId: string,
    input: ReportMessageInput
  ): Promise<{ id: string; status: "open" }> {
    return this.transaction(async (client) => {
      await this.requireActiveUser(client, actorUserId);
      const messageResult = await client.query<{
        id: string;
        threadId: string;
        senderId: string | null;
        body: string;
        type: string;
        metadata: Record<string, unknown> | null;
        createdAt: Date | string;
      }>(
        `
          SELECT message."id", message."threadId", message."senderId", message."body",
                 message."type", message."metadata", message."createdAt"
          FROM public."member_message" AS message
          JOIN public."member_message_participant" AS participant
            ON participant."threadId" = message."threadId"
           AND participant."userId" = $1
          WHERE message."id" = $2
          LIMIT 1
        `,
        [actorUserId, messageId]
      );
      const message = messageResult.rows[0];
      if (!message) throw new MessagingNotFoundError("message");
      if (!message.senderId || message.senderId === actorUserId) {
        throw new MessagingForbiddenError("report_own_message");
      }
      const contextResult = await client.query<{
        id: string;
        senderId: string | null;
        type: string;
        body: string;
        metadata: Record<string, unknown> | null;
        createdAt: Date | string;
      }>(
        `
          SELECT "id", "senderId", "type", "body", "metadata", "createdAt"
          FROM public."member_message"
          WHERE "threadId" = $1
            AND "createdAt" BETWEEN $2::timestamptz - interval '24 hours'
                                AND $2::timestamptz + interval '24 hours'
          ORDER BY "createdAt", "id"
          LIMIT 21
        `,
        [message.threadId, message.createdAt]
      );
      const reportId = randomUUID();
      const evidenceSnapshot = {
        schemaVersion: 1,
        capturedAt: new Date().toISOString(),
        threadId: message.threadId,
        targetMessageId: message.id,
        messages: contextResult.rows.map((row) => ({
          id: row.id,
          senderId: row.senderId,
          type: row.type,
          body: row.body,
          metadata: row.metadata ?? {},
          createdAt: iso(row.createdAt),
        })),
      };
      try {
        await client.query(
          `
            INSERT INTO public."member_message_report" (
              "id", "reporterId", "reportedUserId", "messageId", "reason",
              "details", "evidenceSnapshot", "status", "createdAt"
            ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, 'open', now())
          `,
          [
            reportId,
            actorUserId,
            message.senderId,
            messageId,
            input.reason,
            input.details,
            JSON.stringify(evidenceSnapshot),
          ]
        );
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "23505") {
          throw new MessagingConflictError("already_reported");
        }
        throw error;
      }
      return { id: reportId, status: "open" as const };
    });
  }

  private async loadThreadDetail(
    queryable: Queryable,
    actorUserId: string,
    threadId: string,
    query: GetMessagingThreadQuery
  ): Promise<MessagingThreadDetail> {
    await this.requireParticipant(queryable, actorUserId, threadId);
    const summaryResult = await queryable.query<ThreadSummaryRow>(
      `${this.threadSummaryBaseSql()}
       WHERE participant."userId" = $1 AND thread."id" = $2
       LIMIT 1`,
      [actorUserId, threadId]
    );
    const summaryRow = summaryResult.rows[0];
    if (!summaryRow) throw new MessagingNotFoundError("thread");

    const values: unknown[] = [threadId, actorUserId, query.limit + 1];
    let cursorClause = "";
    if (query.before) {
      const cursor = await queryable.query(
        `SELECT 1 FROM public."member_message" WHERE "threadId" = $1 AND "id" = $2 LIMIT 1`,
        [threadId, query.before]
      );
      if (!cursor.rows[0]) throw new MessagingNotFoundError("message");
      values.push(query.before);
      cursorClause = `
        AND (message."createdAt", message."id") < (
          SELECT "createdAt", "id"
          FROM public."member_message"
          WHERE "threadId" = $1 AND "id" = $4
        )`;
    }
    const messagesResult = await queryable.query<MessageRow>(
      `
        SELECT
          message."id",
          message."threadId",
          message."senderId",
          message."type",
          message."body",
          message."metadata",
          message."createdAt",
          message."deletedAt",
          other_participant."lastReadAt" AS "otherLastReadAt",
          COALESCE(other_preference."readReceipt", true) AS "otherReadReceipt"
        FROM public."member_message" AS message
        LEFT JOIN public."member_message_participant" AS other_participant
          ON other_participant."threadId" = message."threadId"
         AND other_participant."userId" <> $2
        LEFT JOIN public."member_message_preference" AS other_preference
          ON other_preference."userId" = other_participant."userId"
        WHERE message."threadId" = $1
        ${cursorClause}
        ORDER BY message."createdAt" DESC, message."id" DESC
        LIMIT $3
      `,
      values
    );
    const hasMore = messagesResult.rows.length > query.limit;
    const page = messagesResult.rows.slice(0, query.limit);
    const messages = page.map((row) => projectMessage(row, actorUserId)).reverse();
    return {
      thread: projectSummary(summaryRow, actorUserId),
      messages,
      nextBefore: hasMore ? page.at(-1)?.id ?? null : null,
    };
  }

  private threadSummarySql(tab: ListMessagingThreadsQuery["tab"]): string {
    const filter = tab === "requests"
      ? `thread."state" = 'pending' AND thread."requestRecipientId" = $1 AND participant."archivedAt" IS NULL`
      : tab === "archived"
        ? `participant."archivedAt" IS NOT NULL`
        : tab === "all"
          ? "true"
          : `participant."archivedAt" IS NULL AND (
               thread."state" = 'active'
               OR (thread."state" = 'pending' AND thread."createdBy" = $1)
             )`;
    return `${this.threadSummaryBaseSql()}
      WHERE participant."userId" = $1 AND ${filter}
      ORDER BY thread."lastMessageAt" DESC, thread."id" DESC
      LIMIT $2`;
  }

  private threadSummaryBaseSql(): string {
    return `
      SELECT
        thread."id",
        thread."state",
        thread."requestCategory",
        thread."contextType",
        thread."contextId",
        thread."contextLabel",
        thread."createdBy",
        thread."requestRecipientId",
        thread."memberAId",
        thread."memberBId",
        thread."createdAt",
        thread."updatedAt",
        thread."lastMessageAt",
        participant."archivedAt",
        participant."mutedUntil",
        other_user."id" AS "otherUserId",
        other_user."name" AS "otherName",
        other_user."image" AS "otherImage",
        other_user."avatar" AS "otherAvatar",
        other_user."status" AS "otherStatus",
        (
          SELECT count(*)
          FROM public."member_message" AS unread_message
          WHERE unread_message."threadId" = thread."id"
            AND unread_message."senderId" IS DISTINCT FROM $1
            AND unread_message."deletedAt" IS NULL
            AND (
              participant."lastReadAt" IS NULL
              OR unread_message."createdAt" > participant."lastReadAt"
            )
        ) AS "unreadCount",
        EXISTS (
          SELECT 1
          FROM public."member_message_block" AS block
          WHERE (block."blockerId" = $1 AND block."blockedUserId" = other_user."id")
             OR (block."blockerId" = other_user."id" AND block."blockedUserId" = $1)
        ) AS "blocked",
        last_message."id" AS "lastMessageId",
        last_message."senderId" AS "lastSenderId",
        last_message."type" AS "lastType",
        last_message."body" AS "lastBody",
        last_message."createdAt" AS "lastCreatedAt",
        last_message."deletedAt" AS "lastDeletedAt"
      FROM public."member_message_thread" AS thread
      JOIN public."member_message_participant" AS participant
        ON participant."threadId" = thread."id"
      JOIN public."user" AS other_user
        ON other_user."id" = CASE
          WHEN thread."memberAId" = $1 THEN thread."memberBId"
          ELSE thread."memberAId"
        END
      LEFT JOIN LATERAL (
        SELECT message."id", message."senderId", message."type", message."body",
               message."createdAt", message."deletedAt"
        FROM public."member_message" AS message
        WHERE message."threadId" = thread."id"
        ORDER BY message."createdAt" DESC, message."id" DESC
        LIMIT 1
      ) AS last_message ON true`;
  }

  private async requireExistingUser(queryable: Queryable, userId: string): Promise<UserRow> {
    const result = await queryable.query<UserRow>(
      `
        SELECT
          member."id",
          member."name",
          member."image",
          member."avatar",
          member."status",
          member."emailVerified",
          member."createdAt",
          EXISTS (
            SELECT 1 FROM public.account WHERE account."userId" = member."id"
          ) AS "hasOAuthAccount"
        FROM public."user" AS member
        WHERE member."id" = $1
        LIMIT 1
      `,
      [userId]
    );
    const user = result.rows[0];
    if (!user) throw new MessagingNotFoundError("user");
    return user;
  }

  private async requireActiveUser(queryable: Queryable, userId: string): Promise<UserRow> {
    const user = await this.requireExistingUser(queryable, userId);
    if (user.status !== "active") throw new MessagingForbiddenError("inactive_user");
    return user;
  }

  private async requireParticipant(
    queryable: Queryable,
    actorUserId: string,
    threadId: string
  ): Promise<void> {
    const result = await queryable.query(
      `
        SELECT 1
        FROM public."member_message_participant"
        WHERE "threadId" = $1 AND "userId" = $2
        LIMIT 1
      `,
      [threadId, actorUserId]
    );
    if (!result.rows[0]) throw new MessagingForbiddenError("membership");
  }

  private async lockThread(
    client: Queryable,
    actorUserId: string,
    threadId: string
  ): Promise<{
    id: string;
    state: string;
    requestRecipientId: string;
    memberAId: string;
    memberBId: string;
  }> {
    const result = await client.query<{
      id: string;
      state: string;
      requestRecipientId: string;
      memberAId: string;
      memberBId: string;
    }>(
      `
        SELECT thread."id", thread."state", thread."requestRecipientId",
               thread."memberAId", thread."memberBId"
        FROM public."member_message_thread" AS thread
        JOIN public."member_message_participant" AS participant
          ON participant."threadId" = thread."id"
         AND participant."userId" = $2
        WHERE thread."id" = $1
        FOR UPDATE OF thread
      `,
      [threadId, actorUserId]
    );
    const thread = result.rows[0];
    if (!thread) throw new MessagingNotFoundError("thread");
    return thread;
  }

  private async requireUnblocked(
    queryable: Queryable,
    actorUserId: string,
    otherUserId: string
  ): Promise<void> {
    const result = await queryable.query(
      `
        SELECT 1
        FROM public."member_message_block"
        WHERE ("blockerId" = $1 AND "blockedUserId" = $2)
           OR ("blockerId" = $2 AND "blockedUserId" = $1)
        LIMIT 1
      `,
      [actorUserId, otherUserId]
    );
    if (result.rows[0]) throw new MessagingForbiddenError("blocked");
  }

  private async requireRecipientAllows(
    queryable: Queryable,
    actorUserId: string,
    recipientUserId: string
  ): Promise<void> {
    const preferenceResult = await queryable.query<{ receiveFrom: MessagingReceiveFrom }>(
      `
        SELECT COALESCE(preference."receiveFrom", 'everyone') AS "receiveFrom"
        FROM public."user" AS recipient
        LEFT JOIN public."member_message_preference" AS preference
          ON preference."userId" = recipient."id"
        WHERE recipient."id" = $1
      `,
      [recipientUserId]
    );
    const receiveFrom = preferenceResult.rows[0]?.receiveFrom ?? "everyone";
    if (receiveFrom === "everyone") return;
    if (receiveFrom === "nobody") throw new MessagingPreferenceError(receiveFrom);
    const followResult = await queryable.query<{ follows: boolean; followedBack: boolean }>(
      `
        SELECT
          EXISTS (
            SELECT 1 FROM public.creator_follow
            WHERE "followerId" = $1 AND "creatorId" = $2
          ) AS "follows",
          EXISTS (
            SELECT 1 FROM public.creator_follow
            WHERE "followerId" = $2 AND "creatorId" = $1
          ) AS "followedBack"
      `,
      [actorUserId, recipientUserId]
    );
    const relation = followResult.rows[0];
    const allowed = receiveFrom === "followers"
      ? Boolean(relation?.follows)
      : Boolean(relation?.follows && relation?.followedBack);
    if (!allowed) throw new MessagingPreferenceError(receiveFrom);
  }

  private async resolveContext(
    queryable: Queryable,
    actorUserId: string,
    recipientUserId: string,
    type: CreateMessageRequestInput["contextType"],
    contextId?: string
  ): Promise<ContextProjection> {
    if (type === "profile") {
      const target = await this.requireExistingUser(queryable, recipientUserId);
      return {
        type,
        id: recipientUserId,
        label: displayName(target.name, target.id, target.status),
        href: `/u/${encodeURIComponent(recipientUserId)}`,
      };
    }
    if (type === "general") {
      return { type, id: null, label: "일반 문의", href: null };
    }
    if (!contextId) throw new MessagingNotFoundError("context");
    const result = await queryable.query<{
      id: string;
      userId: string;
      title: string;
      status: string;
      hidden: boolean;
      actorCollaborator: boolean;
      recipientCollaborator: boolean;
    }>(
      `
        SELECT
          work."id",
          work."userId",
          work."title",
          work."status",
          work."hidden",
          EXISTS (
            SELECT 1 FROM public.creator_work_collaborator AS collaborator
            WHERE collaborator."workId" = work."id"
              AND collaborator."userId" = $2
              AND collaborator."status" = 'active'
          ) AS "actorCollaborator",
          EXISTS (
            SELECT 1 FROM public.creator_work_collaborator AS collaborator
            WHERE collaborator."workId" = work."id"
              AND collaborator."userId" = $3
              AND collaborator."status" = 'active'
          ) AS "recipientCollaborator"
        FROM public.creator_work AS work
        WHERE work."id" = $1
        LIMIT 1
      `,
      [contextId, actorUserId, recipientUserId]
    );
    const work = result.rows[0];
    if (!work) throw new MessagingNotFoundError("context");
    if (type === "work") {
      if (work.hidden || work.status !== "published") {
        throw new MessagingForbiddenError("context_access");
      }
      return {
        type,
        id: work.id,
        label: work.title,
        href: `/showcase/work/${encodeURIComponent(work.id)}`,
      };
    }
    const actorCanAccess = work.userId === actorUserId || work.actorCollaborator;
    const recipientCanAccess = work.userId === recipientUserId || work.recipientCollaborator;
    if (!actorCanAccess || !recipientCanAccess) {
      throw new MessagingForbiddenError("context_access");
    }
    return {
      type,
      id: work.id,
      label: work.title,
      href: `/studio/work/${encodeURIComponent(work.id)}`,
    };
  }

  private async lockActorRateLimit(
    queryable: Queryable,
    actorUserId: string
  ): Promise<void> {
    await queryable.query(
      `SELECT pg_advisory_xact_lock(hashtext('member-messaging-rate-limit'), hashtext($1))`,
      [actorUserId]
    );
  }

  private async enforceNewThreadRateLimits(
    queryable: Queryable,
    actor: UserRow,
    body: string
  ): Promise<void> {
    const createdAt = actor.createdAt ? new Date(actor.createdAt) : new Date();
    const limit = Date.now() - createdAt.getTime() < NEW_ACCOUNT_AGE_MS ? 3 : 10;
    const threadCount = await queryable.query<{
      count: string | number;
      oldest: Date | string | null;
    }>(
      `
        SELECT count(*) AS "count", min("createdAt") AS "oldest"
        FROM public."member_message_thread"
        WHERE "createdBy" = $1 AND "createdAt" >= now() - interval '24 hours'
      `,
      [actor.id]
    );
    if (Number(threadCount.rows[0]?.count ?? 0) >= limit) {
      const oldest = threadCount.rows[0]?.oldest
        ? new Date(threadCount.rows[0].oldest as Date | string)
        : new Date();
      throw new MessagingRateLimitError(
        "new_threads",
        secondsUntil(oldest, REQUEST_WINDOW_MS)
      );
    }
    const duplicate = await queryable.query<{
      count: string | number;
      oldest: Date | string | null;
    }>(
      `
        SELECT count(*) AS "count", min("createdAt") AS "oldest"
        FROM public."member_message"
        WHERE "senderId" = $1 AND "body" = $2
          AND "createdAt" >= now() - interval '24 hours'
      `,
      [actor.id, body]
    );
    if (Number(duplicate.rows[0]?.count ?? 0) >= 3) {
      const oldest = duplicate.rows[0]?.oldest
        ? new Date(duplicate.rows[0].oldest as Date | string)
        : new Date();
      throw new MessagingRateLimitError("duplicate", secondsUntil(oldest, REQUEST_WINDOW_MS));
    }
  }

  private async enforceMessageRateLimits(
    queryable: Queryable,
    actorUserId: string,
    threadId: string,
    body: string
  ): Promise<void> {
    const counts = await queryable.query<{
      threadCount: string | number;
      threadOldest: Date | string | null;
      globalCount: string | number;
      globalOldest: Date | string | null;
      duplicateCount: string | number;
      duplicateOldest: Date | string | null;
    }>(
      `
        SELECT
          count(*) FILTER (WHERE "threadId" = $2 AND "createdAt" >= now() - interval '10 minutes') AS "threadCount",
          min("createdAt") FILTER (WHERE "threadId" = $2 AND "createdAt" >= now() - interval '10 minutes') AS "threadOldest",
          count(*) FILTER (WHERE "createdAt" >= now() - interval '10 minutes') AS "globalCount",
          min("createdAt") FILTER (WHERE "createdAt" >= now() - interval '10 minutes') AS "globalOldest",
          count(*) FILTER (WHERE "body" = $3 AND "createdAt" >= now() - interval '24 hours') AS "duplicateCount",
          min("createdAt") FILTER (WHERE "body" = $3 AND "createdAt" >= now() - interval '24 hours') AS "duplicateOldest"
        FROM public."member_message"
        WHERE "senderId" = $1
          AND "createdAt" >= now() - interval '24 hours'
      `,
      [actorUserId, threadId, body]
    );
    const row = counts.rows[0];
    if (Number(row?.threadCount ?? 0) >= 30) {
      throw new MessagingRateLimitError(
        "thread_messages",
        secondsUntil(new Date(row?.threadOldest ?? Date.now()), SEND_WINDOW_MS)
      );
    }
    if (Number(row?.globalCount ?? 0) >= 100) {
      throw new MessagingRateLimitError(
        "global_messages",
        secondsUntil(new Date(row?.globalOldest ?? Date.now()), SEND_WINDOW_MS)
      );
    }
    if (Number(row?.duplicateCount ?? 0) >= 5) {
      throw new MessagingRateLimitError(
        "duplicate",
        secondsUntil(new Date(row?.duplicateOldest ?? Date.now()), REQUEST_WINDOW_MS)
      );
    }
  }

  private async loadPreferences(
    queryable: Queryable,
    actorUserId: string
  ): Promise<MessagingPreferences> {
    await this.requireActiveUser(queryable, actorUserId);
    const result = await queryable.query<{
      receiveFrom: MessagingReceiveFrom;
      emailNotification: boolean;
      readReceipt: boolean;
      updatedAt: Date | string | null;
    }>(
      `
        SELECT "receiveFrom", "emailNotification", "readReceipt", "updatedAt"
        FROM public."member_message_preference"
        WHERE "userId" = $1
        LIMIT 1
      `,
      [actorUserId]
    );
    const row = result.rows[0];
    return row
      ? {
          receiveFrom: row.receiveFrom,
          emailNotification: row.emailNotification,
          readReceipt: row.readReceipt,
          updatedAt: isoOrNull(row.updatedAt),
        }
      : {
          receiveFrom: "everyone",
          emailNotification: false,
          readReceipt: true,
          updatedAt: null,
        };
  }

  private async transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error && typeof error === "object" && "code" in error && error.code === "23505") {
        throw new MessagingConflictError("thread_exists");
      }
      if (isMissingMessagingSchema(error)) {
        throw new MessagingSchemaUnavailableError({ cause: error });
      }
      throw error;
    } finally {
      client.release();
    }
  }

  private async boundary<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (isMissingMessagingSchema(error)) {
        throw new MessagingSchemaUnavailableError({ cause: error });
      }
      throw error;
    }
  }
}

export const messagingRepositoryProvider = {
  provide: MESSAGING_REPOSITORY,
  useFactory: (): MessagingRepository => new PostgresMessagingRepository(),
};
