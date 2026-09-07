import { describe, expect, it } from "vitest";

import {
  canPublishStudioApproval,
  carryOverStudioReviewThreads,
  createStudioApproval,
  createStudioReviewCycle,
  evaluateStudioReviewApproval,
  supersedeStudioApproval,
  transitionStudioReviewCycle,
  validateStudioReviewAnchorV2,
  validateStudioReviewWorkflow,
  type StudioReviewThreadV1,
} from "./studio-review-workflow";

const NOW = "2026-09-07T00:00:00.000Z";
const LATER = "2026-09-08T00:00:00.000Z";

function review() {
  return createStudioReviewCycle({
    cycleId: "review-cycle-1",
    snapshotId: "review-snapshot-1",
    workId: "work-1",
    sourceServerRevision: 42,
    sourceContentDigest: "digest-r42",
    sourceArchiveSchemaVersion: 3,
    actorId: "user-producer",
    createdAt: NOW,
  });
}

function thread(
  patch: Partial<StudioReviewThreadV1> = {},
): StudioReviewThreadV1 {
  return {
    version: 1,
    id: "thread-1",
    reviewSnapshotId: "review-snapshot-1",
    sourceThreadId: null,
    anchor: {
      type: "element",
      semanticPanelId: "panel-1",
      pageId: "page-1",
      elementId: "element-1",
    },
    severity: "major",
    status: "open",
    assigneeId: "user-artist",
    dueAt: null,
    createdBy: "user-producer",
    createdAt: NOW,
    resolvedBy: null,
    resolvedAt: null,
    ...patch,
  };
}

describe("Studio review workflow", () => {
  it("creates a review snapshot pinned to an immutable server source", () => {
    const { cycle, snapshot } = review();

    expect(cycle).toMatchObject({
      status: "in-review",
      currentSnapshotId: snapshot.id,
      snapshotIds: [snapshot.id],
    });
    expect(snapshot).toMatchObject({
      workId: "work-1",
      sourceServerRevision: 42,
      sourceContentDigest: "digest-r42",
    });
    expect(validateStudioReviewWorkflow({
      cycle,
      snapshots: [snapshot],
      threads: [],
    })).toEqual([]);
  });

  it("accepts normalized point and region anchors but rejects overflow", () => {
    expect(validateStudioReviewAnchorV2({
      type: "point",
      pageId: "page-1",
      x: 0.5,
      y: 0.25,
    })).toBe(true);
    expect(validateStudioReviewAnchorV2({
      type: "region",
      pageId: "page-1",
      x: 0.2,
      y: 0.2,
      width: 0.4,
      height: 0.5,
    })).toBe(true);
    expect(validateStudioReviewAnchorV2({
      type: "region",
      pageId: "page-1",
      x: 0.8,
      y: 0.8,
      width: 0.4,
      height: 0.4,
    })).toBe(false);
  });

  it("blocks approval while unresolved blocker threads remain", () => {
    const { cycle, snapshot } = review();
    const blocker = thread({ severity: "blocker" });
    const decision = evaluateStudioReviewApproval({
      cycle,
      snapshot,
      threads: [blocker],
    });

    expect(decision.allowed).toBe(false);
    expect(decision.blockingThreadIds).toEqual([blocker.id]);
    expect(() => createStudioApproval({
      approvalId: "approval-1",
      cycle,
      snapshot,
      threads: [blocker],
      approvedBy: "user-producer",
      approvedAt: LATER,
      statementDigest: "statement-digest",
    })).toThrow(/blocked/u);
  });

  it("creates an immutable approval that pins the exact review source", () => {
    const { cycle, snapshot } = review();
    const approval = createStudioApproval({
      approvalId: "approval-1",
      cycle,
      snapshot,
      threads: [thread()],
      approvedBy: "user-producer",
      approvedAt: LATER,
      statementDigest: "statement-digest",
    });

    expect(approval).toMatchObject({
      reviewCycleId: cycle.id,
      reviewSnapshotId: snapshot.id,
      sourceServerRevision: 42,
      sourceContentDigest: "digest-r42",
      supersededAt: null,
    });
    expect(canPublishStudioApproval(approval, 42, "digest-r42")).toBe(true);
    expect(canPublishStudioApproval(approval, 43, "digest-r43")).toBe(false);

    const superseded = supersedeStudioApproval(approval, "2026-09-09T00:00:00.000Z");
    expect(canPublishStudioApproval(superseded, 42, "digest-r42")).toBe(false);
  });

  it("preserves source lineage and orphaned anchors during thread carry-over", () => {
    const source = thread();
    const carried = carryOverStudioReviewThreads({
      sourceSnapshotId: "review-snapshot-1",
      targetSnapshotId: "review-snapshot-2",
      candidates: [{
        thread: source,
        targetResolution: "orphaned",
        nextAnchor: null,
      }],
      actorId: "user-producer",
      createdAt: LATER,
      createThreadId: (sourceThreadId) => `${sourceThreadId}:copy`,
    });

    expect(carried[0]).toMatchObject({
      id: "thread-1:copy",
      sourceThreadId: "thread-1",
      reviewSnapshotId: "review-snapshot-2",
      status: "carried-over",
      anchor: source.anchor,
    });
  });

  it("enforces the review-cycle state machine", () => {
    const { cycle } = review();
    const changes = transitionStudioReviewCycle(cycle, "changes-requested", LATER);
    expect(changes.status).toBe("changes-requested");
    const revised = transitionStudioReviewCycle(
      changes,
      "revised",
      "2026-09-09T00:00:00.000Z",
    );
    expect(transitionStudioReviewCycle(
      revised,
      "in-review",
      "2026-09-10T00:00:00.000Z",
    ).status).toBe("in-review");
    expect(() => transitionStudioReviewCycle(
      cycle,
      "revised",
      LATER,
    )).toThrow(/not allowed/u);
  });

  it("reports approval source mismatch and inconsistent resolution metadata", () => {
    const { cycle, snapshot } = review();
    const approval = createStudioApproval({
      approvalId: "approval-1",
      cycle,
      snapshot,
      threads: [],
      approvedBy: "user-producer",
      approvedAt: LATER,
      statementDigest: "statement-digest",
    });
    const invalidApproval = {
      ...approval,
      sourceContentDigest: "another-digest",
    };
    const invalidThread = thread({
      status: "resolved",
      resolvedBy: null,
      resolvedAt: null,
    });

    expect(validateStudioReviewWorkflow({
      cycle,
      snapshots: [snapshot],
      threads: [invalidThread],
      approval: invalidApproval,
    }).map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "approval-source-mismatch",
      "resolved-metadata-mismatch",
    ]));
  });
});
