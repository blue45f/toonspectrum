import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveStudioReviewComment } from "../project-graph/studio-project-graph-client";
import { reviewResolutionFixture } from "./studio-review-resolution-test-fixture";

const io = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("@/infrastructure/api", () => ({ api: io }));
beforeEach(() => { io.post.mockReset().mockResolvedValue({ id: "comment", status: "resolved", resolutionRevisionId: "submission-new", resolvedBy: "actor", updatedAt: "now" }); });
describe("optional source-proof resolve HTTP contract", () => {
  it("preserves the legacy body and admits the explicit new proof without changing the target revision", async () => {
    const { request } = reviewResolutionFixture(); await resolveStudioReviewComment("comment", "submission-new");
    expect(io.post.mock.calls[0]?.[1]).toEqual({ resolutionRevisionId: "submission-new", status: "resolved" });
    await resolveStudioReviewComment("comment", "submission-new", "resolved", request.replacement);
    expect(io.post.mock.calls[1]?.[1]).toEqual({ resolutionRevisionId: "submission-new", status: "resolved", resolutionSourceRef: request.replacement });
  });
  it("rejects malformed pins before POST and propagates rejection with no legacy fallback or retry", async () => {
    const { request } = reviewResolutionFixture();
    await expect(resolveStudioReviewComment("comment", "submission-new", "resolved", { ...request.replacement, rootGraphHash: "invalid" })).rejects.toThrow();
    expect(io.post).not.toHaveBeenCalled(); const rejected = new Error("review_resolution_source_mismatch"); io.post.mockRejectedValue(rejected);
    await expect(resolveStudioReviewComment("comment", "submission-new", "resolved", request.replacement)).rejects.toBe(rejected); expect(io.post).toHaveBeenCalledOnce();
  });
});
