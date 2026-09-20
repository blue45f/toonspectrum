import { describe, expect, it, vi } from "vitest";

import { readStudioReviewProductionAuthority } from "./studio-review-production-authority";
import { reviewProductionFixture } from "./studio-review-production-test-fixture";

function setup() {
  const f = reviewProductionFixture(1000);
  return { ...f, readers: { verify: vi.fn(async () => f.verified), workspace: vi.fn(async () => f.authority.workspace),
    team: vi.fn(async () => f.authority.team), now: vi.fn(() => 1000) }, signal: new AbortController().signal };
}
describe("fresh production connection authority", () => {
  it("requires three fresh authorities and the exact saved comment including closed historical reviews", async () => {
    const f = setup(); f.readers.verify.mockResolvedValue({ ...f.verified, review: { ...f.verified.review, status: "approved" } });
    const result = await readStudioReviewProductionAuthority(f.request, "actor", f.signal, f.readers);
    expect(result.comment.id).toBe("comment"); expect(result.expiresAt).toBe(16000);
    expect(f.readers.verify).toHaveBeenCalledWith(f.request.subject, "view"); expect(f.readers.team).toHaveBeenCalledWith("work", f.signal);
  });
  it("rejects mismatched comment, anchor source, work or current actor", async () => {
    for (const mode of ["comment", "anchor", "work", "actor"]) {
      const f = setup();
      if (mode === "comment") f.readers.verify.mockResolvedValue({ ...f.verified, review: { ...f.verified.review, comments: [] } });
      if (mode === "anchor") f.readers.verify.mockResolvedValue({ ...f.verified, review: { ...f.verified.review,
        comments: [{ ...f.authority.comment, anchor: { ...f.authority.comment.anchor, revisionId: "wrong" } }] } });
      if (mode === "work") f.readers.workspace.mockResolvedValue({ ...f.authority.workspace, workId: "wrong" });
      await expect(readStudioReviewProductionAuthority(f.request, mode === "actor" ? "other" : "actor", f.signal, f.readers)).rejects.toThrow();
    }
  });
  it("fails closed on graph, production or team permission loss and a read exceeding the lease", async () => {
    for (const mode of ["graph", "production", "team", "expired"]) {
      const f = setup();
      if (mode === "graph") f.readers.verify.mockResolvedValue({ ...f.verified, project: { ...f.verified.project, access: { ...f.verified.project.access, edit: false } } });
      if (mode === "production") f.readers.workspace.mockResolvedValue({ ...f.authority.workspace, capabilities: { ...f.authority.workspace.capabilities, edit: false } });
      if (mode === "team") f.readers.team.mockResolvedValue({ ...f.authority.team, viewer: { ...f.authority.team.viewer, capabilities: { ...f.authority.team.viewer.capabilities, edit: false } } });
      if (mode === "expired") f.readers.now.mockReturnValueOnce(1000).mockReturnValue(16000);
      await expect(readStudioReviewProductionAuthority(f.request, "actor", f.signal, f.readers)).rejects.toThrow();
    }
  });
});
