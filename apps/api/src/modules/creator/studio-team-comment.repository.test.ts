import { getTableConfig } from "drizzle-orm/pg-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { db } from "../../../../../lib/db";
import {
  creatorWorks,
  creatorWorkTeamCommentActivities,
  creatorWorkTeamCommentMessages,
  creatorWorkTeamCommentMutations,
  creatorWorkTeamCommentReads,
  creatorWorkTeamCommentThreads,
  users,
} from "../../../../../lib/db/schema";

import {
  decodeStudioTeamCommentCursor,
  DrizzleStudioTeamCommentRepository,
  encodeStudioTeamCommentCursor,
  hashStudioTeamCommentMutation,
  projectStudioTeamCommentUser,
  resolveStudioTeamCommentAccess,
  STUDIO_TEAM_COMMENT_REPOSITORY,
  STUDIO_TEAM_COMMENT_MAX_MESSAGES_PER_THREAD,
  STUDIO_TEAM_COMMENT_MAX_MESSAGES_PER_WORK,
  STUDIO_TEAM_COMMENT_MAX_THREADS_PER_WORK,
  StudioTeamCommentCursorError,
  StudioTeamCommentMutationConflictError,
  studioTeamCommentRepositoryProvider,
} from "./studio-team-comment.repository";

function names(values: readonly { name?: string; config?: { name?: string } }[]): string[] {
  return values.flatMap((value) => {
    const name = value.name ?? value.config?.name;
    return name ? [name] : [];
  }).sort();
}

type FakeRow = Record<string, unknown>;

interface CommentMutationHarnessState {
  readonly threads: Map<string, FakeRow>;
  readonly messages: Map<string, FakeRow>;
  readonly receipts: Map<string, FakeRow>;
  readonly locks: string[];
  threadInsertions: number;
  messageInsertions: number;
  receiptInsertions: number;
}

class FakeSelectQuery implements PromiseLike<FakeRow[]> {
  private table: unknown;

  constructor(
    private readonly selection: FakeRow | undefined,
    private readonly rowsFor: (table: unknown, selection: FakeRow | undefined) => FakeRow[],
    private readonly locks: string[]
  ) {}

  from(table: unknown): this {
    this.table = table;
    return this;
  }

  innerJoin(..._arguments: unknown[]): this {
    return this;
  }

  leftJoin(..._arguments: unknown[]): this {
    return this;
  }

  where(..._arguments: unknown[]): this {
    return this;
  }

  limit(..._arguments: unknown[]): this {
    return this;
  }

  orderBy(..._arguments: unknown[]): this {
    return this;
  }

  for(lock: string): Promise<FakeRow[]> {
    this.locks.push(`${this.table === creatorWorks ? "work" : "row"}:${lock}`);
    return Promise.resolve(this.rowsFor(this.table, this.selection));
  }

  then<TResult1 = FakeRow[], TResult2 = never>(
    onfulfilled?: ((value: FakeRow[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.rowsFor(this.table, this.selection)).then(
      onfulfilled,
      onrejected
    );
  }
}

class FakeInsertQuery implements PromiseLike<void> {
  private returnedSequence: bigint | null = null;

  constructor(
    private readonly table: unknown,
    private readonly insertRows: (table: unknown, rows: FakeRow[]) => bigint | null
  ) {}

  values(value: unknown): this {
    const rows = (Array.isArray(value) ? value : [value]) as FakeRow[];
    this.returnedSequence = this.insertRows(this.table, rows);
    return this;
  }

  returning(..._arguments: unknown[]): Promise<FakeRow[]> {
    return Promise.resolve(
      this.returnedSequence === null ? [] : [{ sequence: this.returnedSequence }]
    );
  }

  onConflictDoUpdate(..._arguments: unknown[]): Promise<void> {
    return Promise.resolve();
  }

  then<TResult1 = void, TResult2 = never>(
    onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve().then(onfulfilled, onrejected);
  }
}

class FakeUpdateQuery implements PromiseLike<void> {
  private patch: FakeRow = {};

  constructor(
    private readonly table: unknown,
    private readonly apply: (table: unknown, patch: FakeRow) => void
  ) {}

  set(value: FakeRow): this {
    this.patch = value;
    return this;
  }

  where(..._arguments: unknown[]): this {
    this.apply(this.table, this.patch);
    return this;
  }

  then<TResult1 = void, TResult2 = never>(
    onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve().then(onfulfilled, onrejected);
  }
}

function createCommentMutationHarness(
  initialThread: FakeRow | null = null,
  initialMessage: FakeRow | null = null
): { transaction: object; state: CommentMutationHarnessState } {
  const state: CommentMutationHarnessState = {
    threads: new Map(),
    messages: new Map(),
    receipts: new Map(),
    locks: [],
    threadInsertions: 0,
    messageInsertions: 0,
    receiptInsertions: 0,
  };
  if (initialThread) state.threads.set(String(initialThread.id), initialThread);
  if (initialMessage) state.messages.set(String(initialMessage.id), initialMessage);
  let sequence = BigInt(initialThread?.lastActivitySequence as bigint | undefined ?? 0);

  function rowsFor(table: unknown, selection: FakeRow | undefined): FakeRow[] {
    if (table === creatorWorks) {
      return [{ ownerUserId: "owner", ownerStatus: "active" }];
    }
    if (table === users) {
      return [{ userId: "owner", name: "작가", status: "active" }];
    }
    if (table === creatorWorkTeamCommentMutations) {
      const receipt = state.receipts.values().next().value as FakeRow | undefined;
      return receipt ? [receipt] : [];
    }
    if (table === creatorWorkTeamCommentThreads) {
      if (selection && Object.hasOwn(selection, "value")) {
        return [{ value: state.threads.size }];
      }
      const thread = state.threads.values().next().value as FakeRow | undefined;
      return thread ? [thread] : [];
    }
    if (table === creatorWorkTeamCommentMessages) {
      return [{ value: state.messages.size }];
    }
    return [];
  }

  function insertRows(table: unknown, rows: FakeRow[]): bigint | null {
    for (const row of rows) {
      if (table === creatorWorkTeamCommentThreads) {
        state.threads.set(String(row.id), { ...row });
        state.threadInsertions += 1;
      } else if (table === creatorWorkTeamCommentMessages) {
        state.messages.set(String(row.id), { ...row });
        state.messageInsertions += 1;
      } else if (table === creatorWorkTeamCommentActivities) {
        sequence += BigInt(1);
      } else if (table === creatorWorkTeamCommentMutations) {
        const key = `${String(row.workId)}:${String(row.actorUserId)}:${String(row.mutationId)}`;
        state.receipts.set(key, { ...row });
        state.receiptInsertions += 1;
      }
    }
    return table === creatorWorkTeamCommentActivities ? sequence : null;
  }

  function applyUpdate(table: unknown, patch: FakeRow): void {
    if (table !== creatorWorkTeamCommentThreads) return;
    const entry = state.threads.entries().next().value as [string, FakeRow] | undefined;
    if (!entry) return;
    state.threads.set(entry[0], { ...entry[1], ...patch });
  }

  const transaction = {
    select: (selection?: FakeRow) => new FakeSelectQuery(selection, rowsFor, state.locks),
    insert: (table: unknown) => new FakeInsertQuery(table, insertRows),
    update: (table: unknown) => new FakeUpdateQuery(table, applyUpdate),
  };
  return { transaction, state };
}

function installSerializedCommentTransactions(transaction: object) {
  let tail: Promise<void> = Promise.resolve();
  return vi.spyOn(db, "transaction").mockImplementation(((callback: (
    value: object
  ) => Promise<unknown>) => {
    const result = tail.then(() => callback(transaction));
    tail = result.then(() => undefined, () => undefined);
    return result;
  }) as never);
}

describe("Studio team comment persistence contract", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps private threads, append-only messages/activity, and read frontiers separate", () => {
    const threads = getTableConfig(creatorWorkTeamCommentThreads);
    const messages = getTableConfig(creatorWorkTeamCommentMessages);
    const activities = getTableConfig(creatorWorkTeamCommentActivities);
    const reads = getTableConfig(creatorWorkTeamCommentReads);
    const mutations = getTableConfig(creatorWorkTeamCommentMutations);

    expect(threads.name).toBe("creator_work_team_comment_thread");
    expect(messages.name).toBe("creator_work_team_comment_message");
    expect(activities.name).toBe("creator_work_team_comment_activity");
    expect(reads.name).toBe("creator_work_team_comment_read");
    expect(mutations.name).toBe("creator_work_team_comment_mutation");
    expect(threads.foreignKeys.map((key) => key.getName()).sort()).toEqual([
      "creator_work_team_comment_thread_created_by_fkey",
      "creator_work_team_comment_thread_resolved_by_fkey",
      "creator_work_team_comment_thread_work_fkey",
    ]);
    expect(messages.foreignKeys.map((key) => key.getName()).sort()).toEqual([
      "creator_work_team_comment_message_author_user_fkey",
      "creator_work_team_comment_message_thread_fkey",
    ]);
    expect(activities.foreignKeys.map((key) => key.getName()).sort()).toEqual([
      "creator_work_team_comment_activity_actor_user_fkey",
      "creator_work_team_comment_activity_message_fkey",
      "creator_work_team_comment_activity_thread_fkey",
    ]);
    expect(reads.foreignKeys.map((key) => key.getName()).sort()).toEqual([
      "creator_work_team_comment_read_thread_fkey",
      "creator_work_team_comment_read_user_fkey",
    ]);
    expect(mutations.foreignKeys.map((key) => key.getName()).sort()).toEqual([
      "creator_work_team_comment_mutation_actor_fkey",
      "creator_work_team_comment_mutation_message_fkey",
      "creator_work_team_comment_mutation_thread_fkey",
      "creator_work_team_comment_mutation_work_fkey",
    ]);
    expect(mutations.primaryKeys.map((key) => ({
      name: key.getName(),
      columns: key.columns.map((column) => column.name),
    }))).toEqual([{
      name: "creator_work_team_comment_mutation_pkey",
      columns: ["workId", "actorUserId", "mutationId"],
    }]);
    expect(mutations.uniqueConstraints.map((constraint) => constraint.getName()))
      .toEqual(["creator_work_team_comment_mutation_message_unique"]);
    expect(mutations.indexes.map((indexValue) => indexValue.config.name).sort()).toEqual([
      "idx_creator_work_team_comment_mutation_actor_created",
      "idx_creator_work_team_comment_mutation_thread_created",
    ]);
    expect(names(threads.checks)).toEqual([
      "creator_work_team_comment_thread_activity_sequence_check",
      "creator_work_team_comment_thread_anchor_check",
      "creator_work_team_comment_thread_id_check",
      "creator_work_team_comment_thread_resolution_state_check",
      "creator_work_team_comment_thread_status_check",
      "creator_work_team_comment_thread_timestamp_order_check",
    ]);
    expect(names(messages.checks)).toEqual([
      "creator_work_team_comment_message_body_check",
      "creator_work_team_comment_message_id_check",
    ]);
    expect(names(activities.checks)).toEqual([
      "creator_work_team_comment_activity_action_check",
      "creator_work_team_comment_activity_id_check",
      "creator_work_team_comment_activity_message_state_check",
    ]);
    expect(names(reads.checks)).toEqual([
      "creator_work_team_comment_read_sequence_check",
    ]);
    expect(names(mutations.checks)).toEqual([
      "creator_work_team_comment_mutation_id_check",
      "creator_work_team_comment_mutation_operation_check",
      "creator_work_team_comment_mutation_request_hash_check",
      "creator_work_team_comment_mutation_response_check",
    ]);
    expect(STUDIO_TEAM_COMMENT_MAX_THREADS_PER_WORK).toBe(200);
    expect(STUDIO_TEAM_COMMENT_MAX_MESSAGES_PER_THREAD).toBe(51);
    expect(STUDIO_TEAM_COMMENT_MAX_MESSAGES_PER_WORK).toBe(1_000);
  });

  it("maps the existing collaboration policy into least-privilege review capabilities", () => {
    expect(resolveStudioTeamCommentAccess({
      actorUserId: "owner",
      ownerUserId: "owner",
    })).toEqual({ view: true, comment: true, resolve: true });
    expect(resolveStudioTeamCommentAccess({
      actorUserId: "commenter",
      ownerUserId: "owner",
      membership: { userId: "commenter", role: "commenter", status: "active" },
    })).toEqual({ view: true, comment: true, resolve: false });
    expect(resolveStudioTeamCommentAccess({
      actorUserId: "viewer",
      ownerUserId: "owner",
      membership: { userId: "viewer", role: "viewer", status: "active" },
    })).toEqual({ view: true, comment: false, resolve: false });
    expect(resolveStudioTeamCommentAccess({
      actorUserId: "pending",
      ownerUserId: "owner",
      membership: { userId: "pending", role: "editor", status: "pending" },
    })).toEqual({ view: false, comment: false, resolve: false });
    expect(resolveStudioTeamCommentAccess({
      actorUserId: "intruder",
      ownerUserId: "owner",
      membership: { userId: "other", role: "admin", status: "active" },
    })).toEqual({ view: false, comment: false, resolve: false });
  });

  it("redacts soft-deleted and missing comment identities", () => {
    expect(projectStudioTeamCommentUser("active", "작가", "active")).toEqual({
      userId: "active",
      name: "작가",
    });
    expect(projectStudioTeamCommentUser("deleted", "이전 이름", "deleted")).toEqual({
      userId: null,
      name: "탈퇴한 사용자",
    });
    expect(projectStudioTeamCommentUser("orphan", "노출 금지", null)).toEqual({
      userId: null,
      name: "알 수 없는 사용자",
    });
  });

  it("round-trips a canonical opaque keyset cursor and rejects tampering", () => {
    const key = {
      createdAt: new Date("2026-07-18T01:02:03.456Z"),
      threadId: "legacy-thread:page-1",
    };
    const cursor = encodeStudioTeamCommentCursor(key);
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(decodeStudioTeamCommentCursor(cursor)).toEqual(key);
    expect(() => decodeStudioTeamCommentCursor(`${cursor}=`))
      .toThrow(StudioTeamCommentCursorError);
    expect(() => decodeStudioTeamCommentCursor(
      Buffer.from(JSON.stringify({ v: 2, u: key.createdAt.toISOString(), i: key.threadId }))
        .toString("base64url")
    )).toThrow(StudioTeamCommentCursorError);
  });

  it("fingerprints normalized create/reply payload scope without including the retry key", () => {
    const createInput = {
      operation: "thread_create" as const,
      anchor: { type: "point" as const, pageId: "page-1", x: 0.25, y: 0.75 },
      body: "검수",
    };
    const createHash = hashStudioTeamCommentMutation(createInput);
    expect(createHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(hashStudioTeamCommentMutation({ ...createInput })).toBe(createHash);
    expect(hashStudioTeamCommentMutation({ ...createInput, body: "다른 검수" }))
      .not.toBe(createHash);
    expect(hashStudioTeamCommentMutation({
      operation: "reply_add",
      threadId: "thread-1",
      body: "검수",
    })).not.toBe(createHash);
  });

  it("exposes a swappable production repository provider", () => {
    expect(studioTeamCommentRepositoryProvider.provide).toBe(STUDIO_TEAM_COMMENT_REPOSITORY);
    expect(studioTeamCommentRepositoryProvider.useFactory())
      .toBeInstanceOf(DrizzleStudioTeamCommentRepository);
  });

  it("acknowledges every thread frontier with one deterministic bulk upsert", async () => {
    const now = new Date("2026-07-18T01:02:03.456Z");
    const locks: string[] = [];
    const resultSets = [
      [{ ownerUserId: "owner", ownerStatus: "active" }],
      [
        { threadId: "thread-a", latestActivitySequence: BigInt(3) },
        { threadId: "thread-b", latestActivitySequence: BigInt(8) },
      ],
    ];
    const select = vi.fn(() => {
      const rows = resultSets.shift() ?? [];
      const query = {
        from: vi.fn(),
        innerJoin: vi.fn(),
        where: vi.fn(),
        limit: vi.fn(),
        orderBy: vi.fn(),
        for: vi.fn(async (lock: string) => {
          locks.push(lock);
          return rows;
        }),
      };
      query.from.mockReturnValue(query);
      query.innerJoin.mockReturnValue(query);
      query.where.mockReturnValue(query);
      query.limit.mockReturnValue(query);
      query.orderBy.mockReturnValue(query);
      return query;
    });
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    const insert = vi.fn().mockReturnValue({ values });
    const transaction = { select, insert };
    const transactionSpy = vi.spyOn(db, "transaction").mockImplementation(
      ((callback: (value: unknown) => Promise<unknown>) => callback(transaction)) as never
    );
    const repository = new DrizzleStudioTeamCommentRepository({ now: () => now });

    await expect(repository.markAllRead("owner", "work-1")).resolves.toEqual({
      workId: "work-1",
      readCount: 2,
      readAt: now.toISOString(),
    });

    expect(transactionSpy).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledTimes(2);
    expect(locks).toEqual(["share", "update"]);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith(creatorWorkTeamCommentReads);
    expect(values).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledWith([
      {
        threadId: "thread-a",
        userId: "owner",
        lastReadActivitySequence: BigInt(3),
        readAt: now,
      },
      {
        threadId: "thread-b",
        userId: "owner",
        lastReadActivitySequence: BigInt(8),
        readAt: now,
      },
    ]);
    expect(onConflictDoUpdate).toHaveBeenCalledTimes(1);
  });

  it("serializes concurrent create retries and rejects mutation-key payload reuse", async () => {
    const now = new Date("2026-07-18T01:02:03.456Z");
    const { transaction, state } = createCommentMutationHarness();
    installSerializedCommentTransactions(transaction);
    let threadIds = 0;
    let messageIds = 0;
    let activityIds = 0;
    const repository = new DrizzleStudioTeamCommentRepository({
      now: () => now,
      createThreadId: () => `thread-${threadIds += 1}`,
      createMessageId: () => `message-${messageIds += 1}`,
      createActivityId: () => `activity-${activityIds += 1}`,
    });
    const input = {
      mutationId: "mutation-create-1",
      anchor: { type: "point" as const, pageId: "page-1", x: 0.2, y: 0.3 },
      body: "검수",
    };

    const [first, retried] = await Promise.all([
      repository.createThread("owner", "work-1", input),
      repository.createThread("owner", "work-1", input),
    ]);

    expect(retried).toEqual(first);
    expect(state.threadInsertions).toBe(1);
    expect(state.messageInsertions).toBe(1);
    expect(state.receiptInsertions).toBe(1);
    expect(threadIds).toBe(1);
    expect(messageIds).toBe(1);
    expect(state.locks.filter((lock) => lock === "work:update")).toHaveLength(2);

    await expect(repository.createThread("owner", "work-1", {
      ...input,
      body: "같은 키의 다른 본문",
    })).rejects.toBeInstanceOf(StudioTeamCommentMutationConflictError);
    expect(state.threadInsertions).toBe(1);
    expect(state.messageInsertions).toBe(1);
  });

  it("replays one concurrent reply after later resolution and conflicts on another target", async () => {
    const createdAt = new Date("2026-07-18T01:00:00.000Z");
    const now = new Date("2026-07-18T01:02:03.456Z");
    const { transaction, state } = createCommentMutationHarness(
      {
        id: "thread-1",
        workId: "work-1",
        status: "open",
        resolvedBy: null,
        resolvedAt: null,
        createdAt,
        updatedAt: createdAt,
        lastActivitySequence: BigInt(1),
      },
      {
        id: "message-1",
        threadId: "thread-1",
        authorUserId: "owner",
        body: "첫 댓글",
        createdAt,
      }
    );
    installSerializedCommentTransactions(transaction);
    let messageIds = 1;
    let activityIds = 1;
    const repository = new DrizzleStudioTeamCommentRepository({
      now: () => now,
      createMessageId: () => `message-${messageIds += 1}`,
      createActivityId: () => `activity-${activityIds += 1}`,
    });
    const input = { mutationId: "mutation-reply-1", body: "반영했습니다." };

    const [first, retried] = await Promise.all([
      repository.addReply("owner", "work-1", "thread-1", input),
      repository.addReply("owner", "work-1", "thread-1", input),
    ]);
    expect(retried).toEqual(first);
    expect(first).toMatchObject({
      threadId: "thread-1",
      message: { id: "message-2", body: "반영했습니다." },
      latestActivitySequence: "2",
    });
    expect(state.messageInsertions).toBe(1);
    expect(state.receiptInsertions).toBe(1);

    const storedThread = state.threads.get("thread-1");
    if (!storedThread) throw new Error("missing fake comment thread");
    storedThread.status = "resolved";
    const afterResolutionRetry = await repository.addReply(
      "owner",
      "work-1",
      "thread-1",
      input
    );
    expect(afterResolutionRetry).toEqual(first);
    expect(state.messageInsertions).toBe(1);

    await expect(repository.addReply("owner", "work-1", "thread-other", {
      ...input,
    })).rejects.toBeInstanceOf(StudioTeamCommentMutationConflictError);
    expect(state.messageInsertions).toBe(1);
  });
});
