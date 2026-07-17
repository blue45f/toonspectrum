import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ZodValidationPipe } from "../../common/zod-validation.pipe";

import { StudioTeamCommentController } from "./studio-team-comment.controller";
import {
  AddStudioTeamCommentReplyDto,
  CreateStudioTeamCommentThreadDto,
  ListStudioTeamCommentsQueryDto,
  StudioTeamCommentThreadParamsDto,
} from "./studio-team-comment.dto";
import { StudioTeamCommentService } from "./studio-team-comment.service";

const service = {
  list: vi.fn(),
  createThread: vi.fn(),
  addReply: vi.fn(),
  resolve: vi.fn(),
  reopen: vi.fn(),
  markRead: vi.fn(),
  markAllRead: vi.fn(),
};

function controller(): StudioTeamCommentController {
  return new StudioTeamCommentController(service as unknown as StudioTeamCommentService);
}

describe("StudioTeamCommentController", () => {
  beforeEach(() => {
    for (const mock of Object.values(service)) mock.mockReset();
  });

  it("validates strict bounded anchors, text, params, and list defaults", () => {
    const paramsPipe = new ZodValidationPipe(StudioTeamCommentThreadParamsDto);
    const queryPipe = new ZodValidationPipe(ListStudioTeamCommentsQueryDto);
    const createPipe = new ZodValidationPipe(CreateStudioTeamCommentThreadDto);
    const replyPipe = new ZodValidationPipe(AddStudioTeamCommentReplyDto);

    expect(paramsPipe.transform(
      { id: " work-1 ", threadId: "legacy-thread:1" },
      { type: "param", metatype: undefined, data: undefined }
    )).toEqual({ id: "work-1", threadId: "legacy-thread:1" });
    expect(queryPipe.transform(
      {},
      { type: "query", metatype: undefined, data: undefined }
    )).toEqual({ status: "all", limit: 20, messageLimit: 20 });
    expect(createPipe.transform(
      {
        anchor: { type: "element", pageId: "page-1", elementId: "panel-1" },
        body: "  선을 조금 더 굵게 해 주세요.  ",
      },
      { type: "body", metatype: undefined, data: undefined }
    )).toEqual({
      anchor: { type: "element", pageId: "page-1", elementId: "panel-1" },
      body: "선을 조금 더 굵게 해 주세요.",
    });
    expect(createPipe.transform(
      {
        anchor: { type: "frame", pageId: "page-1", frameId: "panel-1" },
        body: "컷 검수",
      },
      { type: "body", metatype: undefined, data: undefined }
    )).toMatchObject({ anchor: { type: "frame", frameId: "panel-1" } });
    expect(() => createPipe.transform(
      {
        anchor: { type: "page", pageId: "page-1" },
        body: "본문",
        actorUserId: "spoofed-user",
        createdAt: "2020-01-01T00:00:00.000Z",
      },
      { type: "body", metatype: undefined, data: undefined }
    )).toThrow(BadRequestException);
    expect(() => createPipe.transform(
      {
        anchor: { type: "point", pageId: "page-1", x: -0.1, y: 0.2, zoom: 4 },
        body: "본문",
      },
      { type: "body", metatype: undefined, data: undefined }
    )).toThrow(BadRequestException);
    expect(() => replyPipe.transform(
      { body: "x".repeat(4_001) },
      { type: "body", metatype: undefined, data: undefined }
    )).toThrow(BadRequestException);
    expect(() => queryPipe.transform(
      { limit: 50, messageLimit: 51 },
      { type: "query", metatype: undefined, data: undefined }
    )).toThrow(BadRequestException);
  });

  it("forwards authenticated work/thread scope without accepting actor fields from the body", async () => {
    service.createThread.mockResolvedValue({ id: "thread-1" });
    service.addReply.mockResolvedValue({ threadId: "thread-1" });
    service.resolve.mockResolvedValue({ threadId: "thread-1", status: "resolved" });
    service.reopen.mockResolvedValue({ threadId: "thread-1", status: "open" });
    service.markRead.mockResolvedValue({ threadId: "thread-1" });
    service.markAllRead.mockResolvedValue({ workId: "work-1", readCount: 1 });
    const instance = controller();
    const anchor = { type: "point" as const, pageId: "page-1", x: 0.1, y: 0.2 };

    await instance.createThread({ id: "work-1" }, { anchor, body: "검수" }, "commenter");
    await instance.addReply(
      { id: "work-1", threadId: "thread-1" },
      { body: "반영했습니다." },
      "editor"
    );
    await instance.resolve({ id: "work-1", threadId: "thread-1" }, "editor");
    await instance.reopen({ id: "work-1", threadId: "thread-1" }, "owner");
    await instance.markRead({ id: "work-1", threadId: "thread-1" }, "viewer");
    await instance.markAllRead({ id: "work-1" }, "viewer");

    expect(service.createThread).toHaveBeenCalledWith(
      "commenter",
      "work-1",
      { anchor, body: "검수" }
    );
    expect(service.addReply).toHaveBeenCalledWith(
      "editor",
      "work-1",
      "thread-1",
      { body: "반영했습니다." }
    );
    expect(service.resolve).toHaveBeenCalledWith("editor", "work-1", "thread-1");
    expect(service.reopen).toHaveBeenCalledWith("owner", "work-1", "thread-1");
    expect(service.markRead).toHaveBeenCalledWith("viewer", "work-1", "thread-1");
    expect(service.markAllRead).toHaveBeenCalledWith("viewer", "work-1");
  });

  it("rejects unauthenticated private review reads and writes before service access", async () => {
    const instance = controller();
    await expect(instance.list(
      { id: "work-1" },
      { status: "all", limit: 20, messageLimit: 50 }
    )).rejects.toBeInstanceOf(ForbiddenException);
    await expect(instance.createThread(
      { id: "work-1" },
      { anchor: { type: "page", pageId: "page-1" }, body: "본문" }
    )).rejects.toBeInstanceOf(ForbiddenException);
    await expect(instance.resolve({ id: "work-1", threadId: "thread-1" }))
      .rejects.toBeInstanceOf(ForbiddenException);
    await expect(instance.markAllRead({ id: "work-1" }))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(service.list).not.toHaveBeenCalled();
    expect(service.createThread).not.toHaveBeenCalled();
    expect(service.resolve).not.toHaveBeenCalled();
    expect(service.markAllRead).not.toHaveBeenCalled();
  });
});
