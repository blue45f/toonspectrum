import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ZodValidationPipe } from "../../common/zod-validation.pipe";

import { StudioTeamCommentLivePublisher } from "./studio-team-comment-live.publisher";
import { StudioTeamCommentController } from "./studio-team-comment.controller";
import {
  AddStudioTeamCommentReplyDto,
  CreateStudioTeamCommentThreadDto,
  GetStudioTeamCommentThreadQueryDto,
  ListStudioTeamCommentsQueryDto,
  ReanchorStudioTeamCommentThreadDto,
  StudioTeamCommentThreadParamsDto,
} from "./studio-team-comment.dto";
import { StudioTeamCommentService } from "./studio-team-comment.service";

const service = {
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
const livePublisher = {
  publish: vi.fn(),
};

function controller(): StudioTeamCommentController {
  return new StudioTeamCommentController(
    service as unknown as StudioTeamCommentService,
    livePublisher as unknown as StudioTeamCommentLivePublisher
  );
}

describe("StudioTeamCommentController", () => {
  beforeEach(() => {
    for (const mock of Object.values(service)) mock.mockReset();
    livePublisher.publish.mockReset();
  });

  it("validates strict bounded anchors, text, params, and list defaults", () => {
    const paramsPipe = new ZodValidationPipe(StudioTeamCommentThreadParamsDto);
    const queryPipe = new ZodValidationPipe(ListStudioTeamCommentsQueryDto);
    const createPipe = new ZodValidationPipe(CreateStudioTeamCommentThreadDto);
    const replyPipe = new ZodValidationPipe(AddStudioTeamCommentReplyDto);
    const detailPipe = new ZodValidationPipe(GetStudioTeamCommentThreadQueryDto);
    const reanchorPipe = new ZodValidationPipe(ReanchorStudioTeamCommentThreadDto);

    expect(paramsPipe.transform(
      { id: " work-1 ", threadId: "legacy-thread:1" },
      { type: "param", metatype: undefined, data: undefined }
    )).toEqual({ id: "work-1", threadId: "legacy-thread:1" });
    expect(queryPipe.transform(
      {},
      { type: "query", metatype: undefined, data: undefined }
    )).toEqual({ status: "all", limit: 20, messageLimit: 20 });
    expect(detailPipe.transform(
      {},
      { type: "query", metatype: undefined, data: undefined }
    )).toEqual({ messageLimit: 51 });
    expect(createPipe.transform(
      {
        mutationId: "mutation-create-1",
        anchor: { type: "element", pageId: "page-1", elementId: "panel-1" },
        body: "  선을 조금 더 굵게 해 주세요.  ",
      },
      { type: "body", metatype: undefined, data: undefined }
    )).toEqual({
      mutationId: "mutation-create-1",
      anchor: { type: "element", pageId: "page-1", elementId: "panel-1" },
      body: "선을 조금 더 굵게 해 주세요.",
    });
    expect(createPipe.transform(
      {
        mutationId: "mutation-create-2",
        anchor: { type: "frame", pageId: "page-1", frameId: "panel-1" },
        body: "컷 검수",
      },
      { type: "body", metatype: undefined, data: undefined }
    )).toMatchObject({ anchor: { type: "frame", frameId: "panel-1" } });
    expect(() => createPipe.transform(
      {
        mutationId: "mutation-spoof",
        anchor: { type: "page", pageId: "page-1" },
        body: "본문",
        actorUserId: "spoofed-user",
        createdAt: "2020-01-01T00:00:00.000Z",
      },
      { type: "body", metatype: undefined, data: undefined }
    )).toThrow(BadRequestException);
    expect(() => createPipe.transform(
      {
        mutationId: "mutation-invalid-point",
        anchor: { type: "point", pageId: "page-1", x: -0.1, y: 0.2, zoom: 4 },
        body: "본문",
      },
      { type: "body", metatype: undefined, data: undefined }
    )).toThrow(BadRequestException);
    expect(() => replyPipe.transform(
      { mutationId: "mutation-long-reply", body: "x".repeat(4_001) },
      { type: "body", metatype: undefined, data: undefined }
    )).toThrow(BadRequestException);
    expect(createPipe.transform(
      { anchor: { type: "page", pageId: "page-1" }, body: "본문" },
      { type: "body", metatype: undefined, data: undefined }
    )).toEqual({
      anchor: { type: "page", pageId: "page-1" },
      body: "본문",
    });
    expect(replyPipe.transform(
      { body: "  구버전 답글  " },
      { type: "body", metatype: undefined, data: undefined }
    )).toEqual({ body: "구버전 답글" });
    expect(() => replyPipe.transform(
      { mutationId: "bad\nmutation", body: "본문" },
      { type: "body", metatype: undefined, data: undefined }
    )).toThrow(BadRequestException);
    expect(() => queryPipe.transform(
      { limit: 50, messageLimit: 51 },
      { type: "query", metatype: undefined, data: undefined }
    )).toThrow(BadRequestException);
    expect(reanchorPipe.transform(
      {
        anchor: { type: "point", pageId: "page-1", x: 0, y: 1 },
        expectedActivitySequence: "42",
      },
      { type: "body", metatype: undefined, data: undefined }
    )).toEqual({
      anchor: { type: "point", pageId: "page-1", x: 0, y: 1 },
      expectedActivitySequence: "42",
    });
    for (const body of [
      {
        anchor: { type: "point", pageId: "page-1", x: 1.01, y: 0.5 },
        expectedActivitySequence: "42",
      },
      { anchor: { type: "page", pageId: "page-1" }, expectedActivitySequence: "0" },
      {
        anchor: { type: "page", pageId: "page-1" },
        expectedActivitySequence: "42",
        actorUserId: "spoofed",
      },
    ]) {
      expect(() => reanchorPipe.transform(
        body,
        { type: "body", metatype: undefined, data: undefined }
      )).toThrow(BadRequestException);
    }
  });

  it("injects Idempotency-Key headers into authenticated comment mutations", async () => {
    const anchor = { type: "point" as const, pageId: "page-1", x: 0.1, y: 0.2 };
    service.createThread.mockResolvedValue({
      id: "thread-1",
      latestActivitySequence: "11",
    });
    service.addReply.mockResolvedValue({
      threadId: "thread-1",
      latestActivitySequence: "12",
    });
    service.resolve.mockResolvedValue({
      threadId: "thread-1",
      status: "resolved",
      latestActivitySequence: "13",
    });
    service.reopen.mockResolvedValue({
      threadId: "thread-1",
      status: "open",
      latestActivitySequence: "14",
    });
    service.reanchor.mockResolvedValue({
      threadId: "thread-1",
      anchor,
      latestActivitySequence: "15",
    });
    service.getThread.mockResolvedValue({ id: "thread-1" });
    service.markRead.mockResolvedValue({ threadId: "thread-1" });
    service.markAllRead.mockResolvedValue({ workId: "work-1", readCount: 1 });
    const instance = controller();

    await instance.createThread(
      { id: "work-1" },
      { anchor, body: "검수" },
      "commenter",
      "mutation-create"
    );
    await instance.addReply(
      { id: "work-1", threadId: "thread-1" },
      { body: "반영했습니다." },
      "editor",
      "mutation-reply"
    );
    await instance.resolve({ id: "work-1", threadId: "thread-1" }, "editor");
    await instance.reopen({ id: "work-1", threadId: "thread-1" }, "owner");
    await instance.reanchor(
      { id: "work-1", threadId: "thread-1" },
      { anchor, expectedActivitySequence: "7" },
      "commenter",
      "mutation-reanchor"
    );
    await instance.getThread(
      { id: "work-1", threadId: "thread-1" },
      { messageLimit: 17 },
      "viewer"
    );
    await instance.markRead({ id: "work-1", threadId: "thread-1" }, "viewer");
    await instance.markAllRead({ id: "work-1" }, "viewer");

    expect(service.createThread).toHaveBeenCalledWith(
      "commenter",
      "work-1",
      { mutationId: "mutation-create", anchor, body: "검수" }
    );
    expect(service.addReply).toHaveBeenCalledWith(
      "editor",
      "work-1",
      "thread-1",
      { mutationId: "mutation-reply", body: "반영했습니다." }
    );
    expect(service.resolve).toHaveBeenCalledWith("editor", "work-1", "thread-1");
    expect(service.reopen).toHaveBeenCalledWith("owner", "work-1", "thread-1");
    expect(service.reanchor).toHaveBeenCalledWith("commenter", "work-1", "thread-1", {
      mutationId: "mutation-reanchor",
      anchor,
      expectedActivitySequence: "7",
    });
    expect(service.getThread).toHaveBeenCalledWith("viewer", "work-1", "thread-1", 17);
    expect(service.markRead).toHaveBeenCalledWith("viewer", "work-1", "thread-1");
    expect(service.markAllRead).toHaveBeenCalledWith("viewer", "work-1");
    expect(livePublisher.publish.mock.calls.map(([event]) => event)).toEqual([
      {
        version: 1,
        workId: "work-1",
        threadId: "thread-1",
        activitySequence: "11",
        kind: "created",
      },
      {
        version: 1,
        workId: "work-1",
        threadId: "thread-1",
        activitySequence: "12",
        kind: "replied",
      },
      {
        version: 1,
        workId: "work-1",
        threadId: "thread-1",
        activitySequence: "13",
        kind: "resolved",
      },
      {
        version: 1,
        workId: "work-1",
        threadId: "thread-1",
        activitySequence: "14",
        kind: "reopened",
      },
      {
        version: 1,
        workId: "work-1",
        threadId: "thread-1",
        activitySequence: "15",
        kind: "reanchored",
      },
    ]);
  });

  it("publishes only after a comment mutation commits and never for comment reads", async () => {
    const failure = new Error("repository failed before commit");
    service.createThread.mockRejectedValue(failure);
    const instance = controller();

    await expect(instance.createThread(
      { id: "work-1" },
      { anchor: { type: "page", pageId: "page-1" }, body: "검수" },
      "commenter"
    )).rejects.toBe(failure);
    expect(livePublisher.publish).not.toHaveBeenCalled();

    service.list.mockResolvedValue({ items: [] });
    service.getThread.mockResolvedValue({ id: "thread-1" });
    service.markRead.mockResolvedValue({ threadId: "thread-1" });
    service.markAllRead.mockResolvedValue({ workId: "work-1", readCount: 0 });
    await instance.list(
      { id: "work-1" },
      { status: "all", limit: 20, messageLimit: 20 },
      "viewer"
    );
    await instance.getThread(
      { id: "work-1", threadId: "thread-1" },
      { messageLimit: 51 },
      "viewer"
    );
    await instance.markRead({ id: "work-1", threadId: "thread-1" }, "viewer");
    await instance.markAllRead({ id: "work-1" }, "viewer");
    expect(livePublisher.publish).not.toHaveBeenCalled();
  });

  it("keeps legacy body mutation IDs and rejects conflicting header/body IDs", async () => {
    service.createThread.mockResolvedValue({ id: "thread-1" });
    service.addReply.mockResolvedValue({ threadId: "thread-1" });
    const instance = controller();
    const anchor = { type: "page" as const, pageId: "page-1" };

    await instance.createThread(
      { id: "work-1" },
      { mutationId: "legacy-create", anchor, body: "구버전 요청" },
      "commenter"
    );
    await instance.addReply(
      { id: "work-1", threadId: "thread-1" },
      { mutationId: "legacy-reply", body: "구버전 답글" },
      "editor"
    );

    expect(service.createThread).toHaveBeenCalledWith("commenter", "work-1", {
      mutationId: "legacy-create",
      anchor,
      body: "구버전 요청",
    });
    expect(service.addReply).toHaveBeenCalledWith(
      "editor",
      "work-1",
      "thread-1",
      { mutationId: "legacy-reply", body: "구버전 답글" }
    );

    await expect(instance.createThread(
      { id: "work-1" },
      { mutationId: "body-id", anchor, body: "충돌 요청" },
      "commenter",
      "header-id"
    )).rejects.toBeInstanceOf(BadRequestException);
    await expect(instance.addReply(
      { id: "work-1", threadId: "thread-1" },
      { body: "잘못된 헤더" },
      "editor",
      "bad\nmutation"
    )).rejects.toBeInstanceOf(BadRequestException);
    await expect(instance.reanchor(
      { id: "work-1", threadId: "thread-1" },
      { anchor, expectedActivitySequence: "7" },
      "commenter"
    )).rejects.toBeInstanceOf(BadRequestException);
    await expect(instance.reanchor(
      { id: "work-1", threadId: "thread-1" },
      { mutationId: "body-reanchor", anchor, expectedActivitySequence: "7" },
      "commenter",
      "header-reanchor"
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(service.createThread).toHaveBeenCalledTimes(1);
    expect(service.addReply).toHaveBeenCalledTimes(1);
    expect(service.reanchor).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated private review reads and writes before service access", async () => {
    const instance = controller();
    await expect(instance.list(
      { id: "work-1" },
      { status: "all", limit: 20, messageLimit: 50 }
    )).rejects.toBeInstanceOf(ForbiddenException);
    await expect(instance.createThread(
      { id: "work-1" },
      {
        mutationId: "mutation-unauthenticated",
        anchor: { type: "page", pageId: "page-1" },
        body: "본문",
      }
    )).rejects.toBeInstanceOf(ForbiddenException);
    await expect(instance.resolve({ id: "work-1", threadId: "thread-1" }))
      .rejects.toBeInstanceOf(ForbiddenException);
    await expect(instance.reanchor(
      { id: "work-1", threadId: "thread-1" },
      {
        anchor: { type: "page", pageId: "page-1" },
        expectedActivitySequence: "1",
      },
      undefined,
      "mutation-reanchor"
    )).rejects.toBeInstanceOf(ForbiddenException);
    await expect(instance.getThread(
      { id: "work-1", threadId: "thread-1" },
      { messageLimit: 51 }
    )).rejects.toBeInstanceOf(ForbiddenException);
    await expect(instance.markAllRead({ id: "work-1" }))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(service.list).not.toHaveBeenCalled();
    expect(service.createThread).not.toHaveBeenCalled();
    expect(service.resolve).not.toHaveBeenCalled();
    expect(service.reanchor).not.toHaveBeenCalled();
    expect(service.getThread).not.toHaveBeenCalled();
    expect(service.markAllRead).not.toHaveBeenCalled();
  });
});
