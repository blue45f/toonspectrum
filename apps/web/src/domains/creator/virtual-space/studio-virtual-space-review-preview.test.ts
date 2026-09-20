import { beforeEach, describe, expect, it, vi } from "vitest";

import { getStudioVirtualSpaceReviewPreview } from "./studio-virtual-space-review-preview";

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/infrastructure/api", () => ({ api: http,
  httpStatus: (error: { response?: { status: number } }) => error?.response?.status ?? null }));

const subject = { schemaVersion: 1 as const, projectId: "graph-1", workId: "work-1", artifactId: "artifact-1",
  reviewId: "review-1", revisionId: "snapshot-1", rootGraphHash: "a".repeat(64) };
const HASH = "b".repeat(64);
function response() {
  return { ok: true, subject, previews: [{ sha256: HASH, ordinal: 0, mediaType: "image/png", byteLength: 128,
    url: "https://storage.example.test/immutable.png?signature=private", expiresAt: Date.now() + 29_000 }], nextCursor: null };
}
beforeEach(() => { http.get.mockReset(); http.post.mockReset(); });

describe("pinned review preview client", () => {
  it("uses the authenticated read endpoint with every exact source coordinate", async () => {
    const value = response(); http.get.mockResolvedValue(value);
    expect(await getStudioVirtualSpaceReviewPreview(subject)).toEqual(value);
    const path = http.get.mock.calls[0]![0] as string;
    expect(path).toContain("/studio-project-graph/reviews/review-1/previews?");
    const query = new URLSearchParams(path.split("?")[1]);
    expect(Object.fromEntries(query)).toEqual({ projectId: subject.projectId, workId: subject.workId,
      artifactId: subject.artifactId, revisionId: subject.revisionId, rootGraphHash: subject.rootGraphHash });
    expect(http.post).not.toHaveBeenCalled();
  });

  it("rejects another snapshot even when the server payload is structurally valid", async () => {
    http.get.mockResolvedValue({ ...response(), subject: { ...subject, revisionId: "other" } });
    expect(await getStudioVirtualSpaceReviewPreview(subject)).toEqual({ ok: false, reason: "version-mismatch" });
  });

  it.each(["expired", "overlong", "svg", "http", "credentials", "unknown-field", "duplicate"])(
    "rejects %s preview content instead of substituting a current document", async (kind) => {
      const value = response();
      const first = value.previews[0]!;
      if (kind === "expired") first.expiresAt = Date.now() - 1;
      if (kind === "overlong") first.expiresAt = Date.now() + 60_000;
      if (kind === "svg") first.mediaType = "image/svg+xml";
      if (kind === "http") first.url = "http://example.test/a.png";
      if (kind === "credentials") first.url = "https://secret:password@example.test/a.png";
      if (kind === "unknown-field") Object.assign(first, { objectKey: "private" });
      if (kind === "duplicate") value.previews.push(first);
      http.get.mockResolvedValue(value);
      expect(await getStudioVirtualSpaceReviewPreview(subject)).toEqual({ ok: false, reason: "preview-unavailable" });
    },
  );

  it("supports ordered pagination and rejects forged or stale cursors", async () => {
    const value = { ...response(), nextCursor: `0.${HASH}` };
    http.get.mockResolvedValue(value);
    expect(await getStudioVirtualSpaceReviewPreview(subject)).toEqual(value);
    const next = response(); next.previews[0]!.ordinal = 1;
    http.get.mockResolvedValue(next);
    expect(await getStudioVirtualSpaceReviewPreview(subject, value.nextCursor)).toEqual(next);
    expect(http.get.mock.calls.at(-1)?.[0]).toContain(`cursor=0.${HASH}`);
    http.get.mockResolvedValue(value);
    expect(await getStudioVirtualSpaceReviewPreview(subject, value.nextCursor)).toEqual({ ok: false, reason: "preview-unavailable" });
    expect(await getStudioVirtualSpaceReviewPreview(subject, "invalid")).toEqual({ ok: false, reason: "version-mismatch" });
  });

  it("surfaces absent previews and revoked access without cached success", async () => {
    http.get.mockResolvedValue({ ok: false, reason: "preview-unavailable" });
    expect(await getStudioVirtualSpaceReviewPreview(subject)).toEqual({ ok: false, reason: "preview-unavailable" });
    http.get.mockRejectedValue({ response: { status: 403 } });
    expect(await getStudioVirtualSpaceReviewPreview(subject)).toEqual({ ok: false, reason: "access-denied" });
    http.get.mockRejectedValue(new Error("offline"));
    expect(await getStudioVirtualSpaceReviewPreview(subject)).toEqual({ ok: false, reason: "preview-unavailable" });
  });
});
