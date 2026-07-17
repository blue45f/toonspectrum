import { getTableConfig } from "drizzle-orm/pg-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { db } from "../../../../../lib/db";
import {
  creatorWorkTeamCommentActivities,
  creatorWorkTeamCommentMessages,
  creatorWorkTeamCommentReads,
  creatorWorkTeamCommentThreads,
} from "../../../../../lib/db/schema";

import {
  decodeStudioTeamCommentCursor,
  DrizzleStudioTeamCommentRepository,
  encodeStudioTeamCommentCursor,
  projectStudioTeamCommentUser,
  resolveStudioTeamCommentAccess,
  STUDIO_TEAM_COMMENT_REPOSITORY,
  STUDIO_TEAM_COMMENT_MAX_MESSAGES_PER_THREAD,
  STUDIO_TEAM_COMMENT_MAX_MESSAGES_PER_WORK,
  STUDIO_TEAM_COMMENT_MAX_THREADS_PER_WORK,
  StudioTeamCommentCursorError,
  studioTeamCommentRepositoryProvider,
} from "./studio-team-comment.repository";

function names(values: readonly { name?: string; config?: { name?: string } }[]): string[] {
  return values.flatMap((value) => {
    const name = value.name ?? value.config?.name;
    return name ? [name] : [];
  }).sort();
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

    expect(threads.name).toBe("creator_work_team_comment_thread");
    expect(messages.name).toBe("creator_work_team_comment_message");
    expect(activities.name).toBe("creator_work_team_comment_activity");
    expect(reads.name).toBe("creator_work_team_comment_read");
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
});
