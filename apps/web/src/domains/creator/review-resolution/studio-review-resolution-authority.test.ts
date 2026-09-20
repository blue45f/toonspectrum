import { describe, expect, it, vi } from "vitest";
import { readStudioReviewResolutionAuthority } from "./studio-review-resolution-authority";
import { reviewResolutionFixture } from "./studio-review-resolution-test-fixture";
import { parseStudioVirtualSpaceReviewSubject } from "../virtual-space/studio-virtual-space-review-subject";

function fixture() {
  const f = reviewResolutionFixture(1000);
  return { ...f, readers: { verify: vi.fn(async (rawSubject: unknown) => parseStudioVirtualSpaceReviewSubject(rawSubject)?.reviewId === f.origin.subject.reviewId ? f.origin : f.replacement),
    revisions: vi.fn(async () => f.revisions), now: () => 1000 } };
}
describe("subsequent review resolution authority", () => {
  it("reads both exact pins and resolves only the snapshot's actual single submission parent", async () => {
    const f = fixture(), result = await readStudioReviewResolutionAuthority(f.request, new AbortController().signal, f.readers);
    expect(result.submissionId).toBe("submission-new"); expect(result.submissionId).not.toBe(f.replacement.revision.id);
    expect(f.readers.verify).toHaveBeenCalledTimes(2); expect(f.readers.revisions).toHaveBeenCalledWith("artifact");
  });
  it.each(["missing-parent", "multiple-parents", "wrong-kind", "wrong-artifact", "wrong-hash", "duplicate-parent"])("rejects %s instead of guessing a latest revision", async (mode) => {
    const f = fixture(); const values = f.revisions.map((revision) => {
      if (revision.id === "snapshot-new" && mode === "missing-parent") return { ...revision, parentIds: [] };
      if (revision.id === "snapshot-new" && mode === "multiple-parents") return { ...revision, parentIds: ["submission-new", "another"] };
      if (revision.id !== "submission-new") return revision;
      if (mode === "wrong-kind") return { ...revision, kind: "checkpoint" as const };
      if (mode === "wrong-artifact") return { ...revision, artifactId: "other" };
      if (mode === "wrong-hash") return { ...revision, rootGraphHash: "c".repeat(64) };
      return revision;
    });
    if (mode === "duplicate-parent") values.push(values[2]!); f.readers.revisions.mockResolvedValue(values);
    await expect(readStudioReviewResolutionAuthority(f.request, new AbortController().signal, f.readers)).rejects.toThrow("invalid-source");
  });
  it("rejects a missing saved comment, revoked edit access or closed unmodified history", async () => {
    for (const mode of ["missing", "revoked", "closed"]) {
      const f = fixture(); const old = { ...f.origin,
        project: mode === "revoked" ? { ...f.origin.project, access: { ...f.origin.project.access, edit: false } } : f.origin.project,
        review: { ...f.origin.review, comments: mode === "missing" ? [] : f.origin.review.comments, status: mode === "closed" ? "approved" as const : "open" as const } };
      f.readers.verify.mockImplementation(async (subject) => parseStudioVirtualSpaceReviewSubject(subject)?.reviewId === old.subject.reviewId ? old : f.replacement);
      await expect(readStudioReviewResolutionAuthority(f.request, new AbortController().signal, f.readers)).rejects.toThrow();
    }
  });
  it("can confirm the same recorded resolution in closed history without writing", async () => {
    const f = fixture(), old = { ...f.origin, review: { ...f.origin.review, status: "approved" as const,
      comments: [{ ...f.authority.comment, status: "resolved" as const, resolutionRevisionId: "submission-new" }] } };
    f.readers.verify.mockImplementation(async (subject) => parseStudioVirtualSpaceReviewSubject(subject)?.reviewId === old.subject.reviewId ? old : f.replacement);
    expect((await readStudioReviewResolutionAuthority(f.request, new AbortController().signal, f.readers)).resolved).toBe(true);
  });
});
