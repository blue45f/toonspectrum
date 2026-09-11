import { describe, expect, it } from "vitest";

import {
  addStudioReviewThread,
  createStudioReviewSession,
  recordStudioReviewDecision,
  resolveStudioReviewThread,
  startStudioRevision,
  studioReviewReadiness,
  submitStudioReview,
  type StudioReviewThread,
} from "./studio-review-workflow";

const CREATED_AT = "2026-09-11T00:00:00.000Z";

function changeRequest(): StudioReviewThread {
  return {
    id: "thread-1",
    kind: "change-request",
    targetId: "cut-34",
    status: "open",
    resolvedBy: null,
    resolvedAt: null,
    messages: [
      {
        id: "message-1",
        authorId: "reviewer-a",
        body: "말풍선이 인물 얼굴을 가립니다.",
        createdAt: CREATED_AT,
      },
    ],
  };
}

describe("Studio review workflow", () => {
  it("requires submission, resolved change requests and all approvals", () => {
    const draft = createStudioReviewSession({
      documentId: "document-1",
      versionId: "v1",
      requiredReviewerIds: ["reviewer-a", "reviewer-b"],
      createdAt: CREATED_AT,
    });
    expect(studioReviewReadiness(draft).canApprove).toBe(false);

    const submitted = submitStudioReview(draft, "2026-09-11T00:01:00.000Z");
    const requested = addStudioReviewThread(
      submitted,
      changeRequest(),
      "2026-09-11T00:02:00.000Z",
    );
    expect(requested.status).toBe("changes-requested");
    expect(studioReviewReadiness(requested)).toMatchObject({
      canApprove: false,
      openChangeRequestCount: 1,
    });

    const resolved = resolveStudioReviewThread(
      requested,
      "thread-1",
      "artist",
      "2026-09-11T00:03:00.000Z",
    );
    const oneApproval = recordStudioReviewDecision(resolved, {
      reviewerId: "reviewer-a",
      decision: "approved",
      note: "수정 확인",
      decidedAt: "2026-09-11T00:04:00.000Z",
    });
    expect(studioReviewReadiness(oneApproval).missingApprovalReviewerIds).toEqual([
      "reviewer-b",
    ]);

    const approved = recordStudioReviewDecision(oneApproval, {
      reviewerId: "reviewer-b",
      decision: "approved",
      note: "승인",
      decidedAt: "2026-09-11T00:05:00.000Z",
    });
    expect(approved).toMatchObject({ status: "approved", approvedAt: "2026-09-11T00:05:00.000Z" });
    expect(studioReviewReadiness(approved).canApprove).toBe(true);
  });

  it("keeps approved versions immutable and starts edits in a new draft", () => {
    const submitted = submitStudioReview(createStudioReviewSession({
      documentId: "document-1",
      versionId: "v1",
      requiredReviewerIds: ["reviewer-a"],
      createdAt: CREATED_AT,
    }), "2026-09-11T00:01:00.000Z");
    const approved = recordStudioReviewDecision(submitted, {
      reviewerId: "reviewer-a",
      decision: "approved",
      note: "승인",
      decidedAt: "2026-09-11T00:02:00.000Z",
    });
    expect(() => addStudioReviewThread(
      approved,
      changeRequest(),
      "2026-09-11T00:03:00.000Z",
    )).toThrow("immutable");

    const transition = startStudioRevision(approved, {
      nextVersionId: "v2",
      actorId: "artist",
      createdAt: "2026-09-11T00:04:00.000Z",
    });
    expect(transition.previous.status).toBe("superseded");
    expect(transition.next).toMatchObject({
      versionId: "v2",
      basedOnVersionId: "v1",
      status: "draft",
      threads: [],
      decisions: [],
    });
  });

  it("records a change-request decision without approving the version", () => {
    const submitted = submitStudioReview(createStudioReviewSession({
      documentId: "document-1",
      versionId: "v1",
      requiredReviewerIds: ["reviewer-a"],
      createdAt: CREATED_AT,
    }), "2026-09-11T00:01:00.000Z");
    const requested = recordStudioReviewDecision(submitted, {
      reviewerId: "reviewer-a",
      decision: "changes-requested",
      note: "컷 간격을 조정해 주세요.",
      decidedAt: "2026-09-11T00:02:00.000Z",
    });
    expect(requested).toMatchObject({ status: "changes-requested", approvedAt: null });
  });

  it("rejects duplicate reviewers and duplicate thread ids", () => {
    expect(() => createStudioReviewSession({
      documentId: "document-1",
      versionId: "v1",
      requiredReviewerIds: ["same", "same"],
      createdAt: CREATED_AT,
    })).toThrow("unique");

    const submitted = submitStudioReview(createStudioReviewSession({
      documentId: "document-1",
      versionId: "v1",
      requiredReviewerIds: [],
      createdAt: CREATED_AT,
    }), "2026-09-11T00:01:00.000Z");
    const withThread = addStudioReviewThread(submitted, changeRequest(), CREATED_AT);
    expect(() => addStudioReviewThread(withThread, changeRequest(), CREATED_AT)).toThrow(
      "thread ids must be unique",
    );
  });
});
