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
  StudioTeamCommentActivityConflictError,
  StudioTeamCommentForbiddenError,
  StudioTeamCommentMutationConflictError,
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
  getThread: vi.fn(),
  createThread: vi.fn(),
  addReply: vi.fn(),
  resolve: vi.fn(),
  reopen: vi.fn(),
  reanchor: vi.fn(),
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
    repository.getThread.mockResolvedValue(thread);
    repository.addReply.mockResolvedValue({
      threadId: "thread-1",
      message,
      latestActivitySequence: "2",
    });
    repository.reanchor.mockResolvedValue({
      threadId: "thread-1",
      anchor: { type: "point", pageId: "page-1", x: 0.75, y: 0.8 },
      updatedAt: at,
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
      {
        mutationId: "  mutation-create  ",
        anchor: thread.anchor,
        body: "  검수 본문  ",
      }
    )).resolves.toEqual(thread);
    await expect(instance.addReply(
      "artist-1",
      "work-1",
      "thread-1",
      { mutationId: "  mutation-reply  ", body: "  반영했습니다.  " }
    )).resolves.toMatchObject({ threadId: "thread-1" });
    await expect(instance.getThread(
      "artist-1",
      "work-1",
      "thread-1",
      51
    )).resolves.toEqual(thread);
    await expect(instance.reanchor(
      "artist-1",
      "work-1",
      "thread-1",
      {
        mutationId: "  mutation-reanchor  ",
        anchor: { type: "point", pageId: "page-1", x: 0.75, y: 0.8 },
        expectedActivitySequence: "1",
      }
    )).resolves.toMatchObject({ threadId: "thread-1", latestActivitySequence: "2" });

    expect(repository.createThread).toHaveBeenCalledWith("artist-1", "work-1", {
      mutationId: "mutation-create",
      anchor: thread.anchor,
      body: "검수 본문",
    });
    expect(repository.addReply).toHaveBeenCalledWith(
      "artist-1",
      "work-1",
      "thread-1",
      { mutationId: "mutation-reply", body: "반영했습니다." }
    );
    expect(repository.getThread).toHaveBeenCalledWith(
      "artist-1",
      "work-1",
      "thread-1",
      51
    );
    expect(repository.reanchor).toHaveBeenCalledWith(
      "artist-1",
      "work-1",
      "thread-1",
      {
        mutationId: "mutation-reanchor",
        anchor: { type: "point", pageId: "page-1", x: 0.75, y: 0.8 },
        expectedActivitySequence: "1",
      }
    );

    repository.createThread.mockResolvedValue({ ...thread, serverSecret: "must-not-leak" });
    await expect(instance.createThread(
      "artist-1",
      "work-1",
      { mutationId: "mutation-extra-response", anchor: thread.anchor, body: "검수" }
    )).rejects.toThrow();
  });

  it("supplies server mutation IDs when rolling-deploy clients omit them", async () => {
    repository.createThread.mockResolvedValue(thread);
    repository.addReply.mockResolvedValue({
      threadId: "thread-1",
      message,
      latestActivitySequence: "2",
    });
    const instance = service();

    await expect(instance.createThread(
      "artist-1",
      "work-1",
      { anchor: thread.anchor, body: "구버전 댓글" }
    )).resolves.toEqual(thread);
    await expect(instance.addReply(
      "artist-1",
      "work-1",
      "thread-1",
      { body: "구버전 답글" }
    )).resolves.toMatchObject({ threadId: "thread-1" });

    const createInput = repository.createThread.mock.calls[0]?.[2];
    const replyInput = repository.addReply.mock.calls[0]?.[3];
    expect(createInput).toEqual({
      anchor: thread.anchor,
      body: "구버전 댓글",
      mutationId: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
      ),
    });
    expect(replyInput).toEqual({
      body: "구버전 답글",
      mutationId: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
      ),
    });
    expect(createInput?.mutationId).not.toBe(replyInput?.mutationId);
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
      { mutationId: "mutation-forbidden", anchor: thread.anchor, body: "검수" }
    )).rejects.toBeInstanceOf(ForbiddenException);

    repository.addReply.mockRejectedValueOnce(
      new StudioTeamCommentStateConflictError("resolved")
    );
    await expect(instance.addReply(
      "artist-1",
      "work-1",
      "thread-1",
      { mutationId: "mutation-resolved", body: "답글" }
    )).rejects.toBeInstanceOf(ConflictException);

    repository.resolve.mockRejectedValueOnce(new StudioTeamCommentNotFoundError("thread"));
    await expect(instance.resolve("editor", "work-1", "missing"))
      .rejects.toBeInstanceOf(NotFoundException);

    repository.createThread.mockRejectedValueOnce(new StudioTeamCommentQuotaError("threads"));
    await expect(instance.createThread(
      "artist-1",
      "work-1",
      { mutationId: "mutation-quota", anchor: thread.anchor, body: "검수" }
    )).rejects.toBeInstanceOf(PayloadTooLargeException);

    repository.addReply.mockRejectedValueOnce(
      new StudioTeamCommentQuotaError("work_messages")
    );
    await expect(instance.addReply(
      "artist-1",
      "work-1",
      "thread-1",
      { mutationId: "mutation-work-quota", body: "답글" }
    )).rejects.toMatchObject({
      response: { message: "이 작품에 저장할 수 있는 팀 검수 메시지 수를 초과했습니다." },
    });

    repository.reanchor.mockRejectedValueOnce(
      new StudioTeamCommentForbiddenError("reanchor")
    );
    await expect(instance.reanchor(
      "viewer",
      "work-1",
      "thread-1",
      {
        mutationId: "mutation-reanchor-forbidden",
        anchor: thread.anchor,
        expectedActivitySequence: "1",
      }
    )).rejects.toMatchObject({
      response: { message: "이 댓글의 위치를 변경할 권한이 없습니다." },
    });

    repository.reanchor.mockRejectedValueOnce(
      new StudioTeamCommentActivityConflictError("1", "2")
    );
    await expect(instance.reanchor(
      "artist-1",
      "work-1",
      "thread-1",
      {
        mutationId: "mutation-reanchor-stale",
        anchor: thread.anchor,
        expectedActivitySequence: "1",
      }
    )).rejects.toMatchObject({
      response: {
        message: "댓글이 다른 작업으로 변경되었습니다. 최신 댓글을 불러온 뒤 위치를 다시 옮겨 주세요.",
      },
    });

    repository.addReply.mockRejectedValueOnce(
      new StudioTeamCommentMutationConflictError()
    );
    await expect(instance.addReply(
      "artist-1",
      "work-1",
      "thread-1",
      { mutationId: "mutation-reused", body: "다른 답글" }
    )).rejects.toMatchObject({
      response: {
        message: "같은 댓글 요청 식별자가 다른 내용에 이미 사용되었습니다. 새 요청으로 다시 시도해 주세요.",
      },
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
