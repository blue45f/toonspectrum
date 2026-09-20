import { createHash } from "node:crypto";
import { canonicalJson } from "@toonspectrum/studio-project-model";
import { describe, expect, it, vi } from "vitest";

import type { StudioVirtualSpaceVerifiedReview } from "../virtual-space/studio-virtual-space-review-invitation";
import type { StudioVirtualSpaceReviewPreviews } from "../virtual-space/studio-virtual-space-review-preview";

import { readStudioReviewEditorAuthority, type StudioReviewEditorReader } from "./studio-review-editor-authority";
import { reviewEditorFixture } from "./studio-review-editor-test-fixture";

const digestForTest = (value: Record<string, unknown>) => createHash("sha256").update(canonicalJson(value)).digest("hex");

function fixture() {
  const data = reviewEditorFixture(digestForTest), subject = data.request.subject, at = "2026-09-20T00:00:00.000Z";
  const verified: StudioVirtualSpaceVerifiedReview = { ok: true, subject, verifiedAt: 1_000, expiresAt: 16_000, href: "/pinned",
    project: { id: subject.projectId, workId: subject.workId, schemaVersion: 3, authorityVersion: "project-graph-v3",
      ownerUserId: "owner", createdAt: at, updatedAt: at,
      access: { view: true, comment: true, edit: true, manageMembers: true, respondInvite: false, owner: true, role: "owner" },
      artifacts: [{ id: subject.artifactId, projectId: subject.projectId, kind: "canvas-2d", title: "Chapter",
        scope: { projectId: subject.projectId }, headRevisionId: "head", approvedRevisionId: null, ownerWorkspaceId: "workspace", createdAt: at, updatedAt: at }] },
    review: { id: subject.reviewId, artifactId: subject.artifactId, revisionId: subject.revisionId, title: "Review", status: "approved",
      requestedBy: "owner", reviewerIds: ["owner"], decidedAt: at, decidedBy: "owner", createdAt: at, updatedAt: at,
      openRequiredCommentCount: 0, comments: [{ id: data.request.commentId, reviewId: subject.reviewId, anchor: data.authority.anchor,
        authorUserId: "owner", body: "Original comment", severity: "note", status: "resolved", dueAt: null,
        resolutionRevisionId: "resolution", resolvedBy: "owner", createdAt: at, updatedAt: at, assigneeIds: [] }] },
    revision: { id: subject.revisionId, artifactId: subject.artifactId, kind: "review-snapshot", parentIds: [],
      rootGraphHash: subject.rootGraphHash, operationFirst: null, operationLast: null, createdBy: "owner", deviceId: "device",
      createdAt: at, message: null, compatibilityReportId: null, provenanceManifestId: null, blobRefs: [] },
  };
  const page = (ordinal: number): StudioVirtualSpaceReviewPreviews => ({ ok: true, subject, previews: [{ ordinal,
    sha256: "a".repeat(64), url: "https://private.invalid/signed-secret", expiresAt: 16_000, byteLength: 99, mediaType: "image/png",
    mapping: ordinal === 1 ? data.authority.mapping : { status: "unmapped", reason: "legacy-review" } }],
    nextCursor: ordinal === 0 ? `0.${"a".repeat(64)}` : null });
  const reader: StudioReviewEditorReader = {
    verify: vi.fn(async () => verified), previews: vi.fn(async () => page(1)), now: () => 1_000,
  };
  return { ...data, verified, reader, page };
}
describe("fresh review source authority reader", () => {
  it("reads exact comment IDs from closed history without returning private URLs or guessing the latest head", async () => {
    const f = fixture();
    const result = await readStudioReviewEditorAuthority(f.request, new AbortController().signal, f.reader);
    expect(f.reader.verify).toHaveBeenCalledWith(f.request.subject, "view");
    expect(result).toEqual({ anchor: f.authority.anchor, mapping: f.authority.mapping, expiresAt: 16_000 });
    expect(JSON.stringify(result)).not.toContain("signed-secret");
  });
  it("retains source ordinal across preview pagination", async () => {
    const f = fixture(); vi.mocked(f.reader.previews).mockResolvedValueOnce(f.page(0)).mockResolvedValueOnce(f.page(1));
    expect((await readStudioReviewEditorAuthority(f.request, new AbortController().signal, f.reader)).mapping.page.ordinal).toBe(1);
    expect(f.reader.previews).toHaveBeenNthCalledWith(2, f.request.subject, `0.${"a".repeat(64)}`);
  });
  it.each(["view-only", "missing-comment", "legacy-anchor", "wrong-review", "legacy-mapping"])("denies %s without promoting cached state", async (reason) => {
    const f = fixture();
    if (reason === "view-only") f.verified.project.access.edit = false;
    if (reason === "missing-comment") f.verified.review.comments = [];
    if (reason === "legacy-anchor") f.verified.review.comments[0]!.anchor = { kind: "artifact", artifactId: "artifact", revisionId: "revision", scope: { projectId: "graph" } };
    if (reason === "wrong-review") f.verified.review.comments[0]!.reviewId = "other";
    if (reason === "legacy-mapping") vi.mocked(f.reader.previews).mockResolvedValue({ ...f.page(1), ok: true, subject: f.request.subject,
      previews: [{ ordinal: 1, sha256: "a".repeat(64), mediaType: "image/png", byteLength: 99, url: "https://private.invalid/signed", expiresAt: 16_000,
        mapping: { status: "unmapped", reason: "legacy-review" } }], nextCursor: null });
    await expect(readStudioReviewEditorAuthority(f.request, new AbortController().signal, f.reader)).rejects.toHaveProperty("reason", reason === "view-only" ? "access-denied" : "unmapped");
  });
  it("stops revoked/expired or cancelled pagination before returning a location", async () => {
    const f = fixture(), abort = new AbortController();
    vi.mocked(f.reader.previews).mockImplementation(async () => { abort.abort(); return f.page(1); });
    await expect(readStudioReviewEditorAuthority(f.request, abort.signal, f.reader)).rejects.toHaveProperty("reason", "context-changed");
    f.reader.now = () => 16_000;
    await expect(readStudioReviewEditorAuthority(f.request, new AbortController().signal, f.reader)).rejects.toHaveProperty("reason", "access-denied");
  });
});
