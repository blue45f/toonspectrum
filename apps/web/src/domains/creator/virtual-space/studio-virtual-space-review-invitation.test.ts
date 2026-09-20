import { describe, expect, it, vi } from "vitest";

import type { StudioProjectRecord, StudioReviewRecord, StudioRevisionRecord } from "../project-graph/studio-project-graph-contract";
import { studioProjectRecordSchema, studioReviewRecordSchema, studioRevisionRecordSchema } from "../project-graph/studio-project-graph-contract";
import {
  listStudioVirtualSpaceReviewSubjects, listStudioVirtualSpaceReviewHistory, parseStudioVirtualSpaceReviewSubject,
  studioVirtualSpaceReviewHref, studioVirtualSpaceReviewSubjectFromLocation,
  verifyStudioVirtualSpaceReviewSubject, type StudioVirtualSpaceReviewAuthority,
} from "./studio-virtual-space-review-invitation";
import { sameStudioVirtualSpaceReviewSubject } from "./studio-virtual-space-review-subject";

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/infrastructure/api", () => ({ api: http,
  httpStatus: (error: { response?: { status: number } }) => error?.response?.status ?? null }));

const subject = Object.freeze({ schemaVersion: 1 as const, projectId: "graph-1", workId: "work-1",
  artifactId: "artifact-1", reviewId: "review-1", revisionId: "snapshot-1", rootGraphHash: "a".repeat(64) });
const date = "2026-09-20T00:00:00.000Z";

function fixture() {
  const project: StudioProjectRecord = {
    id: subject.projectId, workId: subject.workId, schemaVersion: 3, authorityVersion: "project-graph-v3",
    ownerUserId: "owner", createdAt: date, updatedAt: date,
    access: { view: true, comment: true, edit: true, manageMembers: true, respondInvite: false, owner: true, role: "owner" },
    artifacts: [{ id: subject.artifactId, projectId: subject.projectId, kind: "canvas-2d", title: "Chapter 1",
      scope: { projectId: subject.projectId },
      headRevisionId: "newer-editable-head", approvedRevisionId: null, ownerWorkspaceId: "workspace-1",
      createdAt: date, updatedAt: date }],
  };
  const review: StudioReviewRecord = {
    id: subject.reviewId, artifactId: subject.artifactId, revisionId: subject.revisionId,
    requestedBy: "owner", reviewerIds: ["reviewer"], title: "Chapter review", status: "open",
    decidedAt: null, decidedBy: null, createdAt: date, updatedAt: date, openRequiredCommentCount: 0, comments: [],
  };
  const revision: StudioRevisionRecord = {
    id: subject.revisionId, artifactId: subject.artifactId, kind: "review-snapshot", parentIds: ["submission-1"],
    rootGraphHash: subject.rootGraphHash, operationFirst: null, operationLast: null, createdBy: "owner",
    deviceId: "device-1", createdAt: date, message: null, compatibilityReportId: null, provenanceManifestId: null, blobRefs: [],
  };
  let now = 1_000;
  const authority = {
    getProject: vi.fn(async () => project), getProjectByWork: vi.fn(async () => project),
    getReview: vi.fn(async () => review), listReviews: vi.fn(async () => [review]),
    listRevisions: vi.fn(async () => [revision]), now: () => now,
  } satisfies StudioVirtualSpaceReviewAuthority;
  return { project, review, revision, authority, advance: (ms: number) => { now += ms; } };
}

describe("version-pinned shared review authority", () => {
  it("pins the immutable snapshot even after the editable head advances and preserves decision permissions", async () => {
    const { authority, project, review } = fixture();
    const result = await verifyStudioVirtualSpaceReviewSubject(subject, "propose", authority);
    expect(result).toMatchObject({ ok: true, subject, verifiedAt: 1_000, expiresAt: 16_000, project, review,
      revision: { id: "snapshot-1", kind: "review-snapshot", rootGraphHash: subject.rootGraphHash } });
    expect(authority.getProject).toHaveBeenCalledWith(subject.projectId);
    expect(authority.getReview).toHaveBeenCalledWith(subject.reviewId);
    expect(authority.listRevisions).toHaveBeenCalledWith(subject.artifactId);
  });

  it("rechecks access every time and permits viewing without promoting a viewer to editor/reviewer", async () => {
    const { authority, project } = fixture();
    project.access.edit = false;
    project.access.comment = false;
    project.access.manageMembers = false;
    project.access.role = "viewer";
    expect(await verifyStudioVirtualSpaceReviewSubject(subject, "propose", authority)).toEqual({ ok: false, reason: "access-denied" });
    const result = await verifyStudioVirtualSpaceReviewSubject(subject, "view", authority);
    expect(result).toMatchObject({ ok: true, project: { access: { edit: false, comment: false, role: "viewer" } } });
    project.access.view = false;
    expect(await verifyStudioVirtualSpaceReviewSubject(subject, "view", authority)).toEqual({ ok: false, reason: "access-denied" });
    expect(authority.getProject).toHaveBeenCalledTimes(3);
  });

  it.each(["approved", "rejected", "cancelled"] as const)("keeps %s history readable but refuses new invitation consent", async (status) => {
    const { authority, review } = fixture();
    review.status = status;
    expect(await verifyStudioVirtualSpaceReviewSubject(subject, "view", authority)).toMatchObject({ ok: true, review: { status } });
    expect(await verifyStudioVirtualSpaceReviewSubject(subject, "propose", authority)).toEqual({ ok: false, reason: "closed" });
    expect(await verifyStudioVirtualSpaceReviewSubject(subject, "receive", authority)).toEqual({ ok: false, reason: "closed" });
  });

  it.each(["project", "work", "artifact", "review", "revision", "hash", "kind", "missing"])(
    "rejects a changed %s identity without substituting the current head", async (coordinate) => {
      const { authority, project, review, revision } = fixture();
      if (coordinate === "project") project.id = "another-project";
      if (coordinate === "work") project.workId = "another-work";
      if (coordinate === "artifact") project.artifacts = [];
      if (coordinate === "review") review.id = "another-review";
      if (coordinate === "revision") review.revisionId = "newer-editable-head";
      if (coordinate === "hash") revision.rootGraphHash = "b".repeat(64);
      if (coordinate === "kind") revision.kind = "checkpoint";
      if (coordinate === "missing") authority.listRevisions.mockResolvedValue([]);
      expect(await verifyStudioVirtualSpaceReviewSubject(subject, "view", authority)).toEqual({ ok: false, reason: "version-mismatch" });
    },
  );

  it("rejects stale reads, API errors and revocation instead of using cached authority", async () => {
    const { authority, revision, advance } = fixture();
    authority.listRevisions.mockImplementation(async () => { advance(10_000); return [revision]; });
    expect(await verifyStudioVirtualSpaceReviewSubject(subject, "view", authority)).toEqual({ ok: false, reason: "unavailable" });
    authority.getProject.mockRejectedValue({ response: { status: 403 } });
    expect(await verifyStudioVirtualSpaceReviewSubject(subject, "view", authority)).toEqual({ ok: false, reason: "access-denied" });
    authority.getProject.mockRejectedValue(new Error("offline"));
    expect(await verifyStudioVirtualSpaceReviewSubject(subject, "view", authority)).toEqual({ ok: false, reason: "unavailable" });
  });

  it("uses real authenticated client routes and performs no mutation with the default authority", async () => {
    const { project, review, revision } = fixture();
    studioProjectRecordSchema.parse(project);
    studioReviewRecordSchema.parse(review);
    studioRevisionRecordSchema.parse(revision);
    http.get.mockReset(); http.post.mockReset();
    http.get.mockImplementation(async (path: string) => {
      if (path === "/studio-project-graph/projects/graph-1") return project;
      if (path === "/studio-project-graph/reviews/review-1") return review;
      if (path === "/studio-project-graph/artifacts/artifact-1/revisions") return [revision];
      throw new Error(`Unexpected authority route: ${path}`);
    });
    expect(await verifyStudioVirtualSpaceReviewSubject(subject, "view")).toMatchObject({ ok: true });
    expect(http.get).toHaveBeenCalledTimes(3);
    expect(http.post).not.toHaveBeenCalled();
  });
});

describe("shared review selection and identity", () => {
  it("offers closed history to a viewer for comparison without granting invitations or changing the pinned source", async () => {
    const { authority, review, revision, project } = fixture();
    project.access.edit = false;
    const previous = { ...revision, id: "previous-snapshot", rootGraphHash: "b".repeat(64) };
    authority.listRevisions.mockResolvedValue([revision, previous]);
    authority.listReviews.mockResolvedValue([review, { ...review, id: "previous-review", revisionId: previous.id, status: "approved" }]);
    const result = await listStudioVirtualSpaceReviewHistory(subject, authority);
    expect(result).toMatchObject({ ok: true, truncated: false, choices: [{ subject: {
      ...subject, reviewId: "previous-review", revisionId: previous.id, rootGraphHash: previous.rootGraphHash,
    } }] });
    expect(await listStudioVirtualSpaceReviewSubjects(subject.workId, authority)).toEqual({ ok: false, reason: "access-denied" });
    expect(project.artifacts[0]!.headRevisionId).toBe("newer-editable-head");
  });

  it("excludes another artifact, missing snapshots and duplicate review identities from comparison history", async () => {
    const { authority, review, revision } = fixture();
    const previous = { ...review, id: "previous", status: "rejected" as const };
    authority.listReviews.mockResolvedValue([review, previous, previous,
      { ...previous, id: "foreign", artifactId: "foreign-artifact" },
      { ...previous, id: "missing", revisionId: "missing-snapshot" }]);
    const result = await listStudioVirtualSpaceReviewHistory(subject, authority);
    expect(result.ok && result.choices.map((choice) => choice.subject.reviewId)).toEqual(["previous"]);
    expect(result.ok && result.choices[0]!.subject.rootGraphHash).toBe(revision.rootGraphHash);
  });

  it("rejects revoked access or history reads that outlive the base pin's verification lease", async () => {
    const { authority, review, advance, project } = fixture();
    project.access.view = false;
    expect(await listStudioVirtualSpaceReviewHistory(subject, authority)).toEqual({ ok: false, reason: "access-denied" });
    expect(authority.listReviews).not.toHaveBeenCalled();
    project.access.view = true;
    authority.listReviews.mockImplementation(async () => { advance(15_000); return [review]; });
    expect(await listStudioVirtualSpaceReviewHistory(subject, authority)).toEqual({ ok: false, reason: "unavailable" });
  });

  it("discovers existing accessible review snapshots without creating server records", async () => {
    const { authority, review } = fixture();
    authority.listReviews.mockResolvedValue([review, { ...review, id: "closed-review", status: "cancelled" },
      { ...review, id: "missing-revision", revisionId: "missing" }]);
    expect(await listStudioVirtualSpaceReviewSubjects(subject.workId, authority)).toEqual({ ok: true, truncated: false,
      choices: [{ subject, title: review.title, artifactTitle: "Chapter 1", createdAt: date }] });
    expect(authority.getProjectByWork).toHaveBeenCalledWith("work-1");
  });

  it("does not offer invitations from a local-only, missing or read-only graph", async () => {
    const { authority, project } = fixture();
    project.access.edit = false;
    expect(await listStudioVirtualSpaceReviewSubjects(subject.workId, authority)).toEqual({ ok: false, reason: "access-denied" });
    authority.getProjectByWork.mockRejectedValue({ response: { status: 404 } });
    expect(await listStudioVirtualSpaceReviewSubjects(subject.workId, authority)).toEqual({ ok: false, reason: "unavailable" });
    expect(authority.listReviews).not.toHaveBeenCalled();
  });

  it("caps choices and artifact queries for large works", async () => {
    const { authority, project, review } = fixture();
    project.artifacts = Array.from({ length: 40 }, () => ({ ...project.artifacts[0]! }));
    authority.listReviews.mockResolvedValue(Array.from({ length: 80 }, (_, index) => ({ ...review, id: `review-${index}` })));
    const result = await listStudioVirtualSpaceReviewSubjects(subject.workId, authority);
    expect(result.ok && result.choices).toHaveLength(64);
    expect(result).toMatchObject({ ok: true, truncated: true });
    expect(authority.listReviews).toHaveBeenCalledTimes(1);
  });

  it("keeps stable identity across key order and rejects arbitrary URLs, tokens and invalid hashes", () => {
    const reversed = Object.fromEntries(Object.entries(subject).reverse());
    expect(parseStudioVirtualSpaceReviewSubject(reversed)).toEqual(subject);
    expect(sameStudioVirtualSpaceReviewSubject(subject, parseStudioVirtualSpaceReviewSubject(reversed))).toBe(true);
    for (const value of [null, [], { ...subject, schemaVersion: 2 }, { ...subject, rootGraphHash: "bad" },
      { ...subject, reviewId: "https://example.com" }, { ...subject, shareToken: "secret" }, { ...subject, url: "/studio" }]) {
      expect(parseStudioVirtualSpaceReviewSubject(value)).toBeNull();
    }
  });

  it("round-trips exact version pins through the canonical work route and rejects ambiguous duplicate parameters", () => {
    const href = studioVirtualSpaceReviewHref(subject);
    expect(href).toMatch(/^\/studio\/p\/work-1\/review\?/u);
    const search = href.slice(href.indexOf("?"));
    expect(studioVirtualSpaceReviewSubjectFromLocation(subject.workId, search)).toEqual(subject);
    expect(studioVirtualSpaceReviewSubjectFromLocation(subject.workId, `${search}&revision=other`)).toBeNull();
    expect(studioVirtualSpaceReviewSubjectFromLocation(subject.workId, "?view=versions")).toBeNull();
  });
});
