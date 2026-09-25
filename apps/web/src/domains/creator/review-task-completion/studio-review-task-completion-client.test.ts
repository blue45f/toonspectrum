import { beforeEach, describe, expect, it, vi } from "vitest";
import { completeStudioReviewTask, readStudioReviewTaskCompletion } from "./studio-review-task-completion-client";
import { completionFixture } from "./studio-review-task-completion-fixture";

const io = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/platform/api", () => ({ api: io, isHttpError: () => false }));
beforeEach(() => { vi.clearAllMocks(); });
describe("task completion authenticated HTTP contract", () => {
  it("keeps a legal Unicode task ID in the encoded route and accepts exact raw API JSON", async () => {
    const f = completionFixture(), request = { ...f.request, taskId: "선화 수정 1" }, context = { ...f.context, taskId: request.taskId };
    io.get.mockResolvedValue(context); const signal = new AbortController().signal;
    expect(await readStudioReviewTaskCompletion(request, signal)).toEqual(context);
    expect(io.get).toHaveBeenCalledExactlyOnceWith(`/creator/works/work/production-tasks/${encodeURIComponent(request.taskId)}/review-completion`, { signal });
  });
  it.each(["work", "task", "comment", "pin"])("refuses a response from another %s", async (field) => {
    const f = completionFixture(), bad = structuredClone(f.context);
    if (field === "work") bad.workId = "other"; if (field === "task") bad.taskId = "other";
    if (field === "comment") bad.reference.commentId = "other"; if (field === "pin") bad.reference.subject.rootGraphHash = "d".repeat(64);
    io.get.mockResolvedValue(bad); await expect(readStudioReviewTaskCompletion(f.request, new AbortController().signal)).rejects.toMatchObject({ reason: "invalid" });
  });
  it("sends only the explicit intent, criteria, CAS and proof; response loss causes no HTTP retry", async () => {
    const f = completionFixture(); io.post.mockRejectedValue(new Error("lost"));
    await expect(completeStudioReviewTask(f.request, f.input, new AbortController().signal)).rejects.toThrow("lost");
    expect(io.post).toHaveBeenCalledOnce(); expect(io.post.mock.calls[0]?.[1]).toEqual(f.input);
    expect(Object.keys(io.post.mock.calls[0]?.[1]).sort()).toEqual(["baseRevision", "confirmedCriteria", "proofDigest", "requestId"]);
  });
});
