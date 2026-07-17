import { randomUUID } from "node:crypto";

import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import {
  creatorWorkCollaborators,
  creatorWorks,
  creatorWorkTeamCommentActivities,
  creatorWorkTeamCommentMessages,
  creatorWorkTeamCommentReads,
  creatorWorkTeamCommentThreads,
  db,
  users,
} from "../../../../../lib/db";

import { resolveCreatorCollaborationAccess } from "./creator-collaboration.policy";

import type {
  CreatorCollaborationMembershipLike,
} from "./creator-collaboration.policy";
import type {
  StudioTeamCommentAnchor,
  StudioTeamCommentListResponse,
  StudioTeamCommentMessage,
  StudioTeamCommentReadAllResponse,
  StudioTeamCommentReadResponse,
  StudioTeamCommentReplyResponse,
  StudioTeamCommentThread,
  StudioTeamCommentTransitionResponse,
} from "./studio-team-comment.dto";

export const STUDIO_TEAM_COMMENT_REPOSITORY = Symbol("STUDIO_TEAM_COMMENT_REPOSITORY");
export const STUDIO_TEAM_COMMENT_MAX_THREADS_PER_WORK = 200;
export const STUDIO_TEAM_COMMENT_MAX_MESSAGES_PER_THREAD = 51;
export const STUDIO_TEAM_COMMENT_MAX_MESSAGES_PER_WORK = 1_000;

const COMMENT_CURSOR_VERSION = 2;
const COMMENT_CURSOR_MAX_LENGTH = 512;
const COMMENT_CURSOR_PATTERN = /^[A-Za-z0-9_-]+$/u;
const DELETED_COMMENT_USER_NAME = "탈퇴한 사용자";
const UNKNOWN_COMMENT_USER_NAME = "알 수 없는 사용자";

type StudioTeamCommentTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type StudioTeamCommentStatusFilter = "all" | "open" | "resolved";
type StudioTeamCommentActivityAction =
  | "thread_created"
  | "reply_added"
  | "resolved"
  | "reopened";

export interface StudioTeamCommentAccess {
  view: boolean;
  comment: boolean;
  resolve: boolean;
}

export interface ListStudioTeamCommentsInput {
  status: StudioTeamCommentStatusFilter;
  limit: number;
  messageLimit: number;
  cursor?: string;
}

export interface CreateStudioTeamCommentThreadInput {
  anchor: StudioTeamCommentAnchor;
  body: string;
}

export interface StudioTeamCommentRepository {
  list(
    actorUserId: string,
    workId: string,
    input: ListStudioTeamCommentsInput
  ): Promise<StudioTeamCommentListResponse>;
  createThread(
    actorUserId: string,
    workId: string,
    input: CreateStudioTeamCommentThreadInput
  ): Promise<StudioTeamCommentThread>;
  addReply(
    actorUserId: string,
    workId: string,
    threadId: string,
    body: string
  ): Promise<StudioTeamCommentReplyResponse>;
  resolve(
    actorUserId: string,
    workId: string,
    threadId: string
  ): Promise<StudioTeamCommentTransitionResponse>;
  reopen(
    actorUserId: string,
    workId: string,
    threadId: string
  ): Promise<StudioTeamCommentTransitionResponse>;
  markRead(
    actorUserId: string,
    workId: string,
    threadId: string
  ): Promise<StudioTeamCommentReadResponse>;
  markAllRead(
    actorUserId: string,
    workId: string
  ): Promise<StudioTeamCommentReadAllResponse>;
}

export class StudioTeamCommentNotFoundError extends Error {
  constructor(readonly target: "work" | "thread") {
    super(`studio_team_comment_${target}_not_found`);
    this.name = "StudioTeamCommentNotFoundError";
  }
}

export class StudioTeamCommentForbiddenError extends Error {
  constructor(readonly operation: "view" | "comment" | "resolve") {
    super(`studio_team_comment_${operation}_forbidden`);
    this.name = "StudioTeamCommentForbiddenError";
  }
}

export class StudioTeamCommentStateConflictError extends Error {
  constructor(readonly state: "resolved") {
    super(`studio_team_comment_${state}_conflict`);
    this.name = "StudioTeamCommentStateConflictError";
  }
}

export class StudioTeamCommentCursorError extends Error {
  constructor() {
    super("studio_team_comment_invalid_cursor");
    this.name = "StudioTeamCommentCursorError";
  }
}

export class StudioTeamCommentQuotaError extends Error {
  constructor(readonly quota: "threads" | "thread_messages" | "work_messages") {
    super(`studio_team_comment_${quota}_quota`);
    this.name = "StudioTeamCommentQuotaError";
  }
}

interface StudioTeamCommentCursorKey {
  createdAt: Date;
  threadId: string;
}

interface StudioTeamCommentRepositoryOptions {
  now?: () => Date;
  createThreadId?: () => string;
  createMessageId?: () => string;
  createActivityId?: () => string;
}

interface StudioTeamCommentContext {
  access: StudioTeamCommentAccess;
}

const threadCreators = alias(users, "studio_team_comment_thread_creator");
const threadResolvers = alias(users, "studio_team_comment_thread_resolver");
const messageAuthors = alias(users, "studio_team_comment_message_author");
const workOwners = alias(users, "studio_team_comment_work_owner");

export function resolveStudioTeamCommentAccess(input: {
  actorUserId: string;
  ownerUserId: string;
  membership?: CreatorCollaborationMembershipLike | null;
}): StudioTeamCommentAccess {
  const access = resolveCreatorCollaborationAccess(input);
  return {
    view: access.view,
    comment: access.comment,
    // Resolving changes team review state. Keep commenter-only members able to discuss, while
    // owner/admin/editor retain the final review-decision capability through the existing edit bit.
    resolve: access.edit,
  };
}

export function encodeStudioTeamCommentCursor(key: StudioTeamCommentCursorKey): string {
  return Buffer.from(JSON.stringify({
    v: COMMENT_CURSOR_VERSION,
    c: key.createdAt.toISOString(),
    i: key.threadId,
  }), "utf8").toString("base64url");
}

export function decodeStudioTeamCommentCursor(value: string): StudioTeamCommentCursorKey {
  if (
    value.length < 1 ||
    value.length > COMMENT_CURSOR_MAX_LENGTH ||
    !COMMENT_CURSOR_PATTERN.test(value)
  ) {
    throw new StudioTeamCommentCursorError();
  }
  try {
    const bytes = Buffer.from(value, "base64url");
    if (bytes.toString("base64url") !== value) throw new Error("non-canonical cursor");
    const parsed: unknown = JSON.parse(bytes.toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("invalid cursor object");
    }
    const record = parsed as Record<string, unknown>;
    if (
      Object.keys(record).length !== 3 ||
      record.v !== COMMENT_CURSOR_VERSION ||
      typeof record.c !== "string" ||
      typeof record.i !== "string" ||
      record.i.length < 1 ||
      record.i.length > 160
    ) {
      throw new Error("invalid cursor fields");
    }
    const createdAt = new Date(record.c);
    if (!Number.isFinite(createdAt.getTime()) || createdAt.toISOString() !== record.c) {
      throw new Error("invalid cursor timestamp");
    }
    return { createdAt, threadId: record.i };
  } catch (error) {
    if (error instanceof StudioTeamCommentCursorError) throw error;
    throw new StudioTeamCommentCursorError();
  }
}

function safeCommentUserName(name: string | null, userId: string | null): string {
  const normalized = name?.trim();
  if (normalized) return normalized.slice(0, 160);
  if (userId) return userId.slice(0, 160);
  return DELETED_COMMENT_USER_NAME;
}

export function projectStudioTeamCommentUser(
  userId: string | null,
  name: string | null,
  status: string | null
): StudioTeamCommentMessage["author"] {
  if (status === "deleted") {
    return { userId: null, name: DELETED_COMMENT_USER_NAME };
  }
  if (userId === null || (status !== "active" && status !== "suspended")) {
    return { userId: null, name: UNKNOWN_COMMENT_USER_NAME };
  }
  return {
    userId,
    name: safeCommentUserName(name, userId),
  };
}

function requireStudioTeamCommentAccess(
  access: StudioTeamCommentAccess,
  operation: keyof StudioTeamCommentAccess
): void {
  if (!access[operation]) throw new StudioTeamCommentForbiddenError(operation);
}

async function loadStudioTeamCommentContext(
  transaction: StudioTeamCommentTransaction,
  actorUserId: string,
  workId: string,
  lock: "share" | "update" = "share"
): Promise<StudioTeamCommentContext> {
  // Every comments operation takes this shared work/owner fence first. Collaboration role changes
  // lock the work row and account lifecycle changes update the owner row, so FOR SHARE prevents
  // either authorization source from changing midway while still allowing independent comments to
  // progress concurrently. Quota mutations upgrade this to FOR UPDATE to serialize work totals.
  const [work] = await transaction
    .select({ ownerUserId: creatorWorks.userId, ownerStatus: workOwners.status })
    .from(creatorWorks)
    .innerJoin(workOwners, eq(workOwners.id, creatorWorks.userId))
    .where(eq(creatorWorks.id, workId))
    .limit(1)
    .for(lock);
  if (!work) throw new StudioTeamCommentNotFoundError("work");

  if (work.ownerStatus !== "active") {
    return {
      access: { view: false, comment: false, resolve: false },
    };
  }

  const [membership] = actorUserId === work.ownerUserId
    ? []
    : await transaction
        .select({
          userId: creatorWorkCollaborators.userId,
          role: creatorWorkCollaborators.role,
          status: creatorWorkCollaborators.status,
        })
        .from(creatorWorkCollaborators)
        .where(
          and(
            eq(creatorWorkCollaborators.workId, workId),
            eq(creatorWorkCollaborators.userId, actorUserId)
          )
        )
        .limit(1);
  return {
    access: resolveStudioTeamCommentAccess({
      actorUserId,
      ownerUserId: work.ownerUserId,
      membership: membership ?? null,
    }),
  };
}

async function loadActor(
  transaction: StudioTeamCommentTransaction,
  actorUserId: string
): Promise<StudioTeamCommentMessage["author"]> {
  const [actor] = await transaction
    .select({ userId: users.id, name: users.name, status: users.status })
    .from(users)
    .where(eq(users.id, actorUserId))
    .limit(1);
  if (!actor || actor.status !== "active") {
    throw new StudioTeamCommentForbiddenError("view");
  }
  return projectStudioTeamCommentUser(actor.userId, actor.name, actor.status);
}

async function appendStudioTeamCommentActivity(
  transaction: StudioTeamCommentTransaction,
  input: {
    id: string;
    workId: string;
    threadId: string;
    actorUserId: string;
    messageId: string | null;
    action: StudioTeamCommentActivityAction;
    createdAt: Date;
  }
): Promise<bigint> {
  const [activity] = await transaction
    .insert(creatorWorkTeamCommentActivities)
    .values(input)
    .returning({ sequence: creatorWorkTeamCommentActivities.sequence });
  if (!activity || typeof activity.sequence !== "bigint") {
    throw new Error("invalid Studio team comment activity sequence");
  }
  return activity.sequence;
}

async function recordStudioTeamCommentRead(
  transaction: StudioTeamCommentTransaction,
  threadId: string,
  actorUserId: string,
  sequence: bigint,
  readAt: Date
): Promise<void> {
  await transaction
    .insert(creatorWorkTeamCommentReads)
    .values({
      threadId,
      userId: actorUserId,
      lastReadActivitySequence: sequence,
      readAt,
    })
    .onConflictDoUpdate({
      target: [creatorWorkTeamCommentReads.threadId, creatorWorkTeamCommentReads.userId],
      set: {
        lastReadActivitySequence: sequence,
        readAt,
      },
    });
}

function studioTeamCommentMessageFromRow(row: {
  id: string;
  authorUserId: string | null;
  authorName: string | null;
  authorStatus: string | null;
  body: string;
  createdAt: Date;
}): StudioTeamCommentMessage {
  return {
    id: row.id,
    author: projectStudioTeamCommentUser(
      row.authorUserId,
      row.authorName,
      row.authorStatus
    ),
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  };
}

export class DrizzleStudioTeamCommentRepository implements StudioTeamCommentRepository {
  private readonly now: () => Date;
  private readonly createThreadId: () => string;
  private readonly createMessageId: () => string;
  private readonly createActivityId: () => string;

  constructor(options: StudioTeamCommentRepositoryOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.createThreadId = options.createThreadId ?? randomUUID;
    this.createMessageId = options.createMessageId ?? randomUUID;
    this.createActivityId = options.createActivityId ?? randomUUID;
  }

  async list(
    actorUserId: string,
    workId: string,
    input: ListStudioTeamCommentsInput
  ): Promise<StudioTeamCommentListResponse> {
    return db.transaction(async (transaction) => {
      const context = await loadStudioTeamCommentContext(transaction, actorUserId, workId);
      requireStudioTeamCommentAccess(context.access, "view");
      const cursor = input.cursor ? decodeStudioTeamCommentCursor(input.cursor) : null;
      // Pagination must use immutable fields. updatedAt/lastActivitySequence move when replies or
      // resolution events arrive and can otherwise skip a thread between cursor pages.
      const sortAt = sql<Date>`date_trunc('milliseconds', ${creatorWorkTeamCommentThreads.createdAt})`;
      const afterCursor = cursor
        ? or(
            lt(sortAt, cursor.createdAt),
            and(
              eq(sortAt, cursor.createdAt),
              lt(creatorWorkTeamCommentThreads.id, cursor.threadId)
            )
          )
        : undefined;
      const threadRows = await transaction
        .select({
          id: creatorWorkTeamCommentThreads.id,
          workId: creatorWorkTeamCommentThreads.workId,
          anchor: creatorWorkTeamCommentThreads.anchor,
          status: creatorWorkTeamCommentThreads.status,
          createdByUserId: creatorWorkTeamCommentThreads.createdBy,
          createdByName: threadCreators.name,
          createdByStatus: threadCreators.status,
          resolvedByUserId: creatorWorkTeamCommentThreads.resolvedBy,
          resolvedByName: threadResolvers.name,
          resolvedByStatus: threadResolvers.status,
          resolvedAt: creatorWorkTeamCommentThreads.resolvedAt,
          latestActivitySequence: creatorWorkTeamCommentThreads.lastActivitySequence,
          lastReadActivitySequence: creatorWorkTeamCommentReads.lastReadActivitySequence,
          createdAt: creatorWorkTeamCommentThreads.createdAt,
          updatedAt: creatorWorkTeamCommentThreads.updatedAt,
          messageCount: sql<number>`(
            select count(*)::int
            from ${creatorWorkTeamCommentMessages}
            where ${creatorWorkTeamCommentMessages.threadId} = ${creatorWorkTeamCommentThreads.id}
          )`,
        })
        .from(creatorWorkTeamCommentThreads)
        .leftJoin(threadCreators, eq(threadCreators.id, creatorWorkTeamCommentThreads.createdBy))
        .leftJoin(threadResolvers, eq(threadResolvers.id, creatorWorkTeamCommentThreads.resolvedBy))
        .leftJoin(
          creatorWorkTeamCommentReads,
          and(
            eq(creatorWorkTeamCommentReads.threadId, creatorWorkTeamCommentThreads.id),
            eq(creatorWorkTeamCommentReads.userId, actorUserId)
          )
        )
        .where(
          and(
            eq(creatorWorkTeamCommentThreads.workId, workId),
            input.status === "all"
              ? undefined
              : eq(creatorWorkTeamCommentThreads.status, input.status),
            afterCursor
          )
        )
        .orderBy(desc(sortAt), desc(creatorWorkTeamCommentThreads.id))
        .limit(input.limit + 1);

      const hasNextPage = threadRows.length > input.limit;
      const selectedRows = hasNextPage ? threadRows.slice(0, input.limit) : threadRows;
      const threadIds = selectedRows.map((thread) => thread.id);
      const messagesByThread = new Map<string, StudioTeamCommentMessage[]>();

      if (threadIds.length > 0) {
        const rankedMessages = transaction
          .select({
            id: creatorWorkTeamCommentMessages.id,
            threadId: creatorWorkTeamCommentMessages.threadId,
            authorUserId: creatorWorkTeamCommentMessages.authorUserId,
            body: creatorWorkTeamCommentMessages.body,
            createdAt: creatorWorkTeamCommentMessages.createdAt,
            activitySequence: creatorWorkTeamCommentActivities.sequence,
            threadRank: sql<number>`row_number() over (
              partition by ${creatorWorkTeamCommentMessages.threadId}
              order by ${creatorWorkTeamCommentActivities.sequence} desc,
                ${creatorWorkTeamCommentMessages.id} desc
            )`.as("thread_message_rank"),
          })
          .from(creatorWorkTeamCommentMessages)
          .innerJoin(
            creatorWorkTeamCommentActivities,
            and(
              eq(
                creatorWorkTeamCommentActivities.threadId,
                creatorWorkTeamCommentMessages.threadId
              ),
              eq(
                creatorWorkTeamCommentActivities.messageId,
                creatorWorkTeamCommentMessages.id
              )
            )
          )
          .where(inArray(creatorWorkTeamCommentMessages.threadId, threadIds))
          .as("ranked_studio_team_comment_message");
        const messageRows = await transaction
          .select({
            id: rankedMessages.id,
            threadId: rankedMessages.threadId,
            authorUserId: rankedMessages.authorUserId,
            authorName: messageAuthors.name,
            authorStatus: messageAuthors.status,
            body: rankedMessages.body,
            createdAt: rankedMessages.createdAt,
            activitySequence: rankedMessages.activitySequence,
          })
          .from(rankedMessages)
          .leftJoin(messageAuthors, eq(messageAuthors.id, rankedMessages.authorUserId))
          .where(lte(rankedMessages.threadRank, input.messageLimit))
          .orderBy(
            asc(rankedMessages.threadId),
            asc(rankedMessages.activitySequence),
            asc(rankedMessages.id)
          );
        for (const row of messageRows) {
          const bucket = messagesByThread.get(row.threadId) ?? [];
          bucket.push(studioTeamCommentMessageFromRow(row));
          messagesByThread.set(row.threadId, bucket);
        }
      }

      const items: StudioTeamCommentThread[] = selectedRows.map((thread) => {
        const messages = messagesByThread.get(thread.id) ?? [];
        const messageCount = Number(thread.messageCount);
        const lastRead = thread.lastReadActivitySequence ?? BigInt(0);
        return {
          id: thread.id,
          workId: thread.workId,
          anchor: thread.anchor,
          status: thread.status as "open" | "resolved",
          createdBy: projectStudioTeamCommentUser(
            thread.createdByUserId,
            thread.createdByName,
            thread.createdByStatus
          ),
          resolvedBy: thread.resolvedAt
            ? projectStudioTeamCommentUser(
                thread.resolvedByUserId,
                thread.resolvedByName,
                thread.resolvedByStatus
              )
            : null,
          resolvedAt: thread.resolvedAt?.toISOString() ?? null,
          createdAt: thread.createdAt.toISOString(),
          updatedAt: thread.updatedAt.toISOString(),
          latestActivitySequence: thread.latestActivitySequence.toString(),
          unread: lastRead < thread.latestActivitySequence,
          messageCount,
          messages,
          messagesTruncated: messageCount > messages.length,
        };
      });
      const last = selectedRows.at(-1);
      return {
        workId,
        capabilities: {
          view: true,
          comment: context.access.comment,
          resolve: context.access.resolve,
        },
        items,
        nextCursor: hasNextPage && last
          ? encodeStudioTeamCommentCursor({ createdAt: last.createdAt, threadId: last.id })
          : null,
      };
    }, { isolationLevel: "repeatable read" });
  }

  async createThread(
    actorUserId: string,
    workId: string,
    input: CreateStudioTeamCommentThreadInput
  ): Promise<StudioTeamCommentThread> {
    return db.transaction(async (transaction) => {
      const context = await loadStudioTeamCommentContext(
        transaction,
        actorUserId,
        workId,
        "update"
      );
      requireStudioTeamCommentAccess(context.access, "comment");
      const actor = await loadActor(transaction, actorUserId);
      const [threadUsage] = await transaction
        .select({ value: count() })
        .from(creatorWorkTeamCommentThreads)
        .where(eq(creatorWorkTeamCommentThreads.workId, workId));
      if ((threadUsage?.value ?? 0) >= STUDIO_TEAM_COMMENT_MAX_THREADS_PER_WORK) {
        throw new StudioTeamCommentQuotaError("threads");
      }
      const [workMessageUsage] = await transaction
        .select({ value: count() })
        .from(creatorWorkTeamCommentMessages)
        .innerJoin(
          creatorWorkTeamCommentThreads,
          eq(creatorWorkTeamCommentThreads.id, creatorWorkTeamCommentMessages.threadId)
        )
        .where(eq(creatorWorkTeamCommentThreads.workId, workId));
      if ((workMessageUsage?.value ?? 0) >= STUDIO_TEAM_COMMENT_MAX_MESSAGES_PER_WORK) {
        throw new StudioTeamCommentQuotaError("work_messages");
      }
      const now = this.now();
      const threadId = this.createThreadId();
      const messageId = this.createMessageId();
      await transaction.insert(creatorWorkTeamCommentThreads).values({
        id: threadId,
        workId,
        anchor: input.anchor,
        status: "open",
        createdBy: actorUserId,
        lastActivitySequence: BigInt(0),
        createdAt: now,
        updatedAt: now,
      });
      await transaction.insert(creatorWorkTeamCommentMessages).values({
        id: messageId,
        threadId,
        authorUserId: actorUserId,
        body: input.body,
        createdAt: now,
      });
      const sequence = await appendStudioTeamCommentActivity(transaction, {
        id: this.createActivityId(),
        workId,
        threadId,
        actorUserId,
        messageId,
        action: "thread_created",
        createdAt: now,
      });
      await transaction
        .update(creatorWorkTeamCommentThreads)
        .set({ lastActivitySequence: sequence, updatedAt: now })
        .where(eq(creatorWorkTeamCommentThreads.id, threadId));
      await recordStudioTeamCommentRead(transaction, threadId, actorUserId, sequence, now);

      return {
        id: threadId,
        workId,
        anchor: input.anchor,
        status: "open",
        createdBy: actor,
        resolvedBy: null,
        resolvedAt: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        latestActivitySequence: sequence.toString(),
        unread: false,
        messageCount: 1,
        messages: [{
          id: messageId,
          author: actor,
          body: input.body,
          createdAt: now.toISOString(),
        }],
        messagesTruncated: false,
      };
    });
  }

  async addReply(
    actorUserId: string,
    workId: string,
    threadId: string,
    body: string
  ): Promise<StudioTeamCommentReplyResponse> {
    return db.transaction(async (transaction) => {
      const context = await loadStudioTeamCommentContext(
        transaction,
        actorUserId,
        workId,
        "update"
      );
      requireStudioTeamCommentAccess(context.access, "comment");
      const thread = await this.lockThread(transaction, workId, threadId);
      if (thread.status === "resolved") {
        throw new StudioTeamCommentStateConflictError("resolved");
      }
      if (thread.status !== "open") throw new Error("invalid Studio team comment status");
      const [workMessageUsage] = await transaction
        .select({ value: count() })
        .from(creatorWorkTeamCommentMessages)
        .innerJoin(
          creatorWorkTeamCommentThreads,
          eq(creatorWorkTeamCommentThreads.id, creatorWorkTeamCommentMessages.threadId)
        )
        .where(eq(creatorWorkTeamCommentThreads.workId, workId));
      if ((workMessageUsage?.value ?? 0) >= STUDIO_TEAM_COMMENT_MAX_MESSAGES_PER_WORK) {
        throw new StudioTeamCommentQuotaError("work_messages");
      }
      const [messageUsage] = await transaction
        .select({ value: count() })
        .from(creatorWorkTeamCommentMessages)
        .where(eq(creatorWorkTeamCommentMessages.threadId, threadId));
      if ((messageUsage?.value ?? 0) >= STUDIO_TEAM_COMMENT_MAX_MESSAGES_PER_THREAD) {
        throw new StudioTeamCommentQuotaError("thread_messages");
      }
      const actor = await loadActor(transaction, actorUserId);
      const now = this.now();
      const messageId = this.createMessageId();
      await transaction.insert(creatorWorkTeamCommentMessages).values({
        id: messageId,
        threadId,
        authorUserId: actorUserId,
        body,
        createdAt: now,
      });
      const sequence = await appendStudioTeamCommentActivity(transaction, {
        id: this.createActivityId(),
        workId,
        threadId,
        actorUserId,
        messageId,
        action: "reply_added",
        createdAt: now,
      });
      await transaction
        .update(creatorWorkTeamCommentThreads)
        .set({ lastActivitySequence: sequence, updatedAt: now })
        .where(eq(creatorWorkTeamCommentThreads.id, threadId));
      await recordStudioTeamCommentRead(transaction, threadId, actorUserId, sequence, now);
      return {
        threadId,
        message: {
          id: messageId,
          author: actor,
          body,
          createdAt: now.toISOString(),
        },
        latestActivitySequence: sequence.toString(),
      };
    });
  }

  resolve(
    actorUserId: string,
    workId: string,
    threadId: string
  ): Promise<StudioTeamCommentTransitionResponse> {
    return this.transition(actorUserId, workId, threadId, "resolved");
  }

  reopen(
    actorUserId: string,
    workId: string,
    threadId: string
  ): Promise<StudioTeamCommentTransitionResponse> {
    return this.transition(actorUserId, workId, threadId, "open");
  }

  async markRead(
    actorUserId: string,
    workId: string,
    threadId: string
  ): Promise<StudioTeamCommentReadResponse> {
    return db.transaction(async (transaction) => {
      const context = await loadStudioTeamCommentContext(transaction, actorUserId, workId);
      requireStudioTeamCommentAccess(context.access, "view");
      const thread = await this.lockThread(transaction, workId, threadId);
      const readAt = this.now();
      await recordStudioTeamCommentRead(
        transaction,
        threadId,
        actorUserId,
        thread.lastActivitySequence,
        readAt
      );
      return {
        threadId,
        lastReadActivitySequence: thread.lastActivitySequence.toString(),
        readAt: readAt.toISOString(),
      };
    });
  }

  async markAllRead(
    actorUserId: string,
    workId: string
  ): Promise<StudioTeamCommentReadAllResponse> {
    return db.transaction(async (transaction) => {
      const context = await loadStudioTeamCommentContext(transaction, actorUserId, workId);
      requireStudioTeamCommentAccess(context.access, "view");

      // Work mutations take the same work row first, and state transitions take one of these
      // thread rows next. A deterministic lock order gives this bulk receipt one stable snapshot
      // without introducing a bulk/bulk deadlock when several collaborators acknowledge at once.
      const threads = await transaction
        .select({
          threadId: creatorWorkTeamCommentThreads.id,
          latestActivitySequence: creatorWorkTeamCommentThreads.lastActivitySequence,
        })
        .from(creatorWorkTeamCommentThreads)
        .where(eq(creatorWorkTeamCommentThreads.workId, workId))
        .orderBy(asc(creatorWorkTeamCommentThreads.id))
        .for("update");
      const readAt = this.now();

      if (threads.length > 0) {
        await transaction
          .insert(creatorWorkTeamCommentReads)
          .values(threads.map((thread) => ({
            threadId: thread.threadId,
            userId: actorUserId,
            lastReadActivitySequence: thread.latestActivitySequence,
            readAt,
          })))
          .onConflictDoUpdate({
            target: [
              creatorWorkTeamCommentReads.threadId,
              creatorWorkTeamCommentReads.userId,
            ],
            set: {
              // Never move a read frontier or its observation time backwards, even if a receipt
              // created by another request already won this user's conflict row.
              lastReadActivitySequence: sql`greatest(
                ${creatorWorkTeamCommentReads.lastReadActivitySequence},
                excluded."lastReadActivitySequence"
              )`,
              readAt: sql`greatest(
                ${creatorWorkTeamCommentReads.readAt},
                excluded."readAt"
              )`,
            },
          });
      }

      return {
        workId,
        readCount: threads.length,
        readAt: readAt.toISOString(),
      };
    });
  }

  private async transition(
    actorUserId: string,
    workId: string,
    threadId: string,
    targetStatus: "open" | "resolved"
  ): Promise<StudioTeamCommentTransitionResponse> {
    return db.transaction(async (transaction) => {
      const context = await loadStudioTeamCommentContext(transaction, actorUserId, workId);
      requireStudioTeamCommentAccess(context.access, "resolve");
      const thread = await this.lockThread(transaction, workId, threadId);
      if (thread.status !== "open" && thread.status !== "resolved") {
        throw new Error("invalid Studio team comment status");
      }
      const now = this.now();
      if (thread.status === targetStatus) {
        await recordStudioTeamCommentRead(
          transaction,
          threadId,
          actorUserId,
          thread.lastActivitySequence,
          now
        );
        return this.transitionProjection(transaction, thread);
      }

      const resolvedBy = targetStatus === "resolved" ? actorUserId : null;
      const resolvedAt = targetStatus === "resolved" ? now : null;
      await transaction
        .update(creatorWorkTeamCommentThreads)
        .set({
          status: targetStatus,
          resolvedBy,
          resolvedAt,
          updatedAt: now,
        })
        .where(eq(creatorWorkTeamCommentThreads.id, threadId));
      const sequence = await appendStudioTeamCommentActivity(transaction, {
        id: this.createActivityId(),
        workId,
        threadId,
        actorUserId,
        messageId: null,
        action: targetStatus === "resolved" ? "resolved" : "reopened",
        createdAt: now,
      });
      await transaction
        .update(creatorWorkTeamCommentThreads)
        .set({ lastActivitySequence: sequence })
        .where(eq(creatorWorkTeamCommentThreads.id, threadId));
      await recordStudioTeamCommentRead(transaction, threadId, actorUserId, sequence, now);
      return {
        threadId,
        status: targetStatus,
        resolvedBy: targetStatus === "resolved"
          ? await loadActor(transaction, actorUserId)
          : null,
        resolvedAt: resolvedAt?.toISOString() ?? null,
        updatedAt: now.toISOString(),
        latestActivitySequence: sequence.toString(),
      };
    });
  }

  private async transitionProjection(
    transaction: StudioTeamCommentTransaction,
    thread: {
      id: string;
      status: string;
      resolvedBy: string | null;
      resolvedAt: Date | null;
      updatedAt: Date;
      lastActivitySequence: bigint;
    }
  ): Promise<StudioTeamCommentTransitionResponse> {
    let resolver: StudioTeamCommentTransitionResponse["resolvedBy"] = null;
    if (thread.resolvedAt) {
      const [user] = thread.resolvedBy
        ? await transaction
            .select({ userId: users.id, name: users.name, status: users.status })
            .from(users)
            .where(eq(users.id, thread.resolvedBy))
            .limit(1)
        : [];
      resolver = projectStudioTeamCommentUser(
        user?.userId ?? null,
        user?.name ?? null,
        user?.status ?? null
      );
    }
    return {
      threadId: thread.id,
      status: thread.status as "open" | "resolved",
      resolvedBy: resolver,
      resolvedAt: thread.resolvedAt?.toISOString() ?? null,
      updatedAt: thread.updatedAt.toISOString(),
      latestActivitySequence: thread.lastActivitySequence.toString(),
    };
  }

  private async lockThread(
    transaction: StudioTeamCommentTransaction,
    workId: string,
    threadId: string
  ): Promise<{
    id: string;
    status: string;
    resolvedBy: string | null;
    resolvedAt: Date | null;
    updatedAt: Date;
    lastActivitySequence: bigint;
  }> {
    const [thread] = await transaction
      .select({
        id: creatorWorkTeamCommentThreads.id,
        status: creatorWorkTeamCommentThreads.status,
        resolvedBy: creatorWorkTeamCommentThreads.resolvedBy,
        resolvedAt: creatorWorkTeamCommentThreads.resolvedAt,
        updatedAt: creatorWorkTeamCommentThreads.updatedAt,
        lastActivitySequence: creatorWorkTeamCommentThreads.lastActivitySequence,
      })
      .from(creatorWorkTeamCommentThreads)
      .where(
        and(
          eq(creatorWorkTeamCommentThreads.workId, workId),
          eq(creatorWorkTeamCommentThreads.id, threadId)
        )
      )
      .limit(1)
      .for("update");
    if (!thread) throw new StudioTeamCommentNotFoundError("thread");
    return thread;
  }
}

export const studioTeamCommentRepositoryProvider = {
  provide: STUDIO_TEAM_COMMENT_REPOSITORY,
  useFactory: (): StudioTeamCommentRepository => new DrizzleStudioTeamCommentRepository(),
};
