import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  PayloadTooLargeException,
} from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  StudioTeamCommentCursorError,
  StudioTeamCommentForbiddenError,
  StudioTeamCommentNotFoundError,
  StudioTeamCommentQuotaError,
  StudioTeamCommentStateConflictError,
} from "./studio-team-comment.repository";
import { StudioTeamCommentService } from "./studio-team-comment.service";

import type { StudioTeamCommentRepository } from "./studio-team-comment.repository";

const at = "2026-07-18T01:02:03.456Z";
const user = { userId: "artist-1", name: "작가" };
const message = { id: "message-1", author: user, body: "검수 본문", createdAt: at };
const thread = {
  id: "thread-1",
  workId: "work-1",
  anchor: { type: "point" as const, pageId: "page-1", x: 0.1, y: 0.2 },
  status: "open" as const,
  createdBy: user,
  resolvedBy: null,
  resolvedAt: null,
  createdAt: at,
  updatedAt: at,
  latestActivitySequence: "1",
  unread: false,
  messageCount: 1,
  messages: [message],
  messagesTruncated: false,
};

const repository = {
  list: vi.fn(),
  createThread: vi.fn(),
  addReply: vi.fn(),
  resolve: vi.fn(),
  reopen: vi.fn(),
  markRead: vi.fn(),
  markAllRead: vi.fn(),
};

function service(): StudioTeamCommentService {
  return new StudioTeamCommentService(
    repository as unknown as StudioTeamCommentRepository
  );
}

describe("StudioTeamCommentService", () => {
  beforeEach(() => {
    for (const mock of Object.values(repository)) mock.mockReset();
  });

  it("normalizes request text and validates repository responses before returning them", async () => {
    repository.list.mockResolvedValue({
      workId: "work-1",
      capabilities: { view: true, comment: true, resolve: false },
      items: [thread],
      nextCursor: null,
    });
    repository.createThread.mockResolvedValue(thread);
    repository.addReply.mockResolvedValue({
      threadId: "thread-1",
      message,
      latestActivitySequence: "2",
    });
    const instance = service();

    await expect(instance.list(
      "artist-1",
      "work-1",
      { status: "all", limit: 20, messageLimit: 20 }
    )).resolves.toMatchObject({ workId: "work-1", items: [thread] });
    await expect(instance.createThread(
      "artist-1",
      "work-1",
      { anchor: thread.anchor, body: "  검수 본문  " }
    )).resolves.toEqual(thread);
    await expect(instance.addReply(
      "artist-1",
      "work-1",
      "thread-1",
      { body: "  반영했습니다.  " }
    )).resolves.toMatchObject({ threadId: "thread-1" });

    expect(repository.createThread).toHaveBeenCalledWith("artist-1", "work-1", {
      anchor: thread.anchor,
      body: "검수 본문",
    });
    expect(repository.addReply).toHaveBeenCalledWith(
      "artist-1",
      "work-1",
      "thread-1",
      "반영했습니다."
    );

    repository.createThread.mockResolvedValue({ ...thread, serverSecret: "must-not-leak" });
    await expect(instance.createThread(
      "artist-1",
      "work-1",
      { anchor: thread.anchor, body: "검수" }
    )).rejects.toThrow();
  });

  it("maps repository capability, state, not-found, and cursor failures to HTTP errors", async () => {
    const instance = service();
    repository.list.mockRejectedValueOnce(new StudioTeamCommentCursorError());
    await expect(instance.list(
      "artist-1",
      "work-1",
      { status: "all", limit: 20, messageLimit: 20, cursor: "bad" }
    )).rejects.toBeInstanceOf(BadRequestException);

    repository.createThread.mockRejectedValueOnce(
      new StudioTeamCommentForbiddenError("comment")
    );
    await expect(instance.createThread(
      "viewer",
      "work-1",
      { anchor: thread.anchor, body: "검수" }
    )).rejects.toBeInstanceOf(ForbiddenException);

    repository.addReply.mockRejectedValueOnce(
      new StudioTeamCommentStateConflictError("resolved")
    );
    await expect(instance.addReply(
      "artist-1",
      "work-1",
      "thread-1",
      { body: "답글" }
    )).rejects.toBeInstanceOf(ConflictException);

    repository.resolve.mockRejectedValueOnce(new StudioTeamCommentNotFoundError("thread"));
    await expect(instance.resolve("editor", "work-1", "missing"))
      .rejects.toBeInstanceOf(NotFoundException);

    repository.createThread.mockRejectedValueOnce(new StudioTeamCommentQuotaError("threads"));
    await expect(instance.createThread(
      "artist-1",
      "work-1",
      { anchor: thread.anchor, body: "검수" }
    )).rejects.toBeInstanceOf(PayloadTooLargeException);

    repository.addReply.mockRejectedValueOnce(
      new StudioTeamCommentQuotaError("work_messages")
    );
    await expect(instance.addReply(
      "artist-1",
      "work-1",
      "thread-1",
      { body: "답글" }
    )).rejects.toMatchObject({
      response: { message: "이 작품에 저장할 수 있는 팀 검수 메시지 수를 초과했습니다." },
    });
  });

  it("validates resolve, reopen, and read-state response contracts", async () => {
    repository.resolve.mockResolvedValue({
      threadId: "thread-1",
      status: "resolved",
      resolvedBy: user,
      resolvedAt: at,
      updatedAt: at,
      latestActivitySequence: "2",
    });
    repository.reopen.mockResolvedValue({
      threadId: "thread-1",
      status: "open",
      resolvedBy: null,
      resolvedAt: null,
      updatedAt: at,
      latestActivitySequence: "3",
    });
    repository.markRead.mockResolvedValue({
      threadId: "thread-1",
      lastReadActivitySequence: "3",
      readAt: at,
    });
    repository.markAllRead.mockResolvedValue({
      workId: "work-1",
      readCount: 3,
      readAt: at,
    });
    const instance = service();

    await expect(instance.resolve("editor", "work-1", "thread-1"))
      .resolves.toMatchObject({ status: "resolved", resolvedBy: user });
    await expect(instance.reopen("editor", "work-1", "thread-1"))
      .resolves.toMatchObject({ status: "open", resolvedBy: null });
    await expect(instance.markRead("viewer", "work-1", "thread-1"))
      .resolves.toMatchObject({ lastReadActivitySequence: "3" });
    await expect(instance.markAllRead("viewer", "work-1"))
      .resolves.toEqual({ workId: "work-1", readCount: 3, readAt: at });

    repository.markAllRead.mockResolvedValue({
      workId: "work-1",
      readCount: 3,
      readAt: at,
      internalReceipt: "must-not-leak",
    });
    await expect(instance.markAllRead("viewer", "work-1")).rejects.toThrow();
  });
});
