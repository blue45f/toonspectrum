import { describe, expect, it } from "vitest";

import { episodeScope, type ProductionProjectAggregate, type ProductionTask } from "@toonspectrum/core/production";
import type { StudioProjectRecord, StudioReviewSummary, StudioRevisionRecord } from "../project-graph/studio-project-graph-contract";
import type { StudioVirtualSpaceReviewPreview } from "../virtual-space/studio-virtual-space-review-preview";
import type { ProductionManuscriptProcess } from "./production-manuscript-model";
import {
  appendProductionManifestPages,
  buildProductionMatrixTaskUpdates,
  buildProductionReviewCandidates,
  manifestPageFromPreview,
  moveProductionManifestPage,
  parseProductionWorkbenchState,
  productionManifestPageState,
  productionReviewMatchesApprovedFinal,
  productionRolePreset,
  summarizeProductionManifestPages,
  writeProductionWorkbenchState,
} from "./production-manuscript-competitive-model";

const digest = (value: string) => value.repeat(64).slice(0, 64);
const revision = (id: string, kind: StudioRevisionRecord["kind"]): StudioRevisionRecord => ({
  id, artifactId: "artifact-a", kind, parentIds: [], rootGraphHash: digest(id[0] ?? "a"), operationFirst: null,
  operationLast: null, createdBy: "owner", deviceId: "device", createdAt: "2026-09-24T00:00:00.000Z",
  message: id, compatibilityReportId: null, provenanceManifestId: null, blobRefs: [],
});
const review = (id: string, revisionId: string): StudioReviewSummary => ({
  id, artifactId: "artifact-a", revisionId, requestedBy: "owner", title: id, status: "open", decidedAt: null,
  decidedBy: null, createdAt: "2026-09-24T00:00:00.000Z", updatedAt: "2026-09-24T00:00:00.000Z",
  reviewerIds: [], openRequiredCommentCount: 0,
});
const project = {
  id: "graph", workId: "work", schemaVersion: 3, authorityVersion: "project-graph-v3", ownerUserId: "owner",
  createdAt: "2026-09-24T00:00:00.000Z", updatedAt: "2026-09-24T00:00:00.000Z",
  access: { view: true, comment: true, edit: true, manageMembers: true, respondInvite: false, owner: true, role: "owner" },
  artifacts: [],
} satisfies StudioProjectRecord;
const process = (id: string, reviewId: string): ProductionManuscriptProcess => {
  const snapshot = { ...revision(`snapshot-${id}`, "review-snapshot"), artifactId: id };
  const item = { ...review(reviewId, snapshot.id), artifactId: id };
  return {
    artifact: { id, projectId: "graph", kind: "canvas-2d", title: id, scope: { projectId: "graph", episodeId: "ep-1" },
      headRevisionId: snapshot.id, approvedRevisionId: null, ownerWorkspaceId: "workspace", createdAt: snapshot.createdAt, updatedAt: snapshot.createdAt },
    processType: "image", label: "작화 원고", revisions: [snapshot], reviews: [item], headRevision: snapshot,
    submissionRevision: null, reviewSnapshotRevision: snapshot, approvedRevision: null, releaseRevision: null,
    latestReview: item, lifecyclePhase: "in-review", hasUnapprovedChanges: false, readyToDeliver: false,
    openReviewCount: 1, openRequiredFeedbackCount: 0, latestActivityAt: snapshot.createdAt,
  };
};
const preview = (ordinal: number, sha: string): StudioVirtualSpaceReviewPreview => ({
  ordinal, sha256: digest(sha), mediaType: "image/png", byteLength: 100, url: `https://example.com/${ordinal}.png`,
  expiresAt: Date.now() + 20_000, mapping: { status: "unmapped", reason: "legacy-review" },
});

describe("production manuscript competitive model", () => {
  it("keeps explicit invalid workbench coordinates fail-closed and serializes four panes", () => {
    const candidates = buildProductionReviewCandidates(project, [process("a", "review-a"), process("b", "review-b")]);
    const invalid = parseProductionWorkbenchState(new URLSearchParams("comparePanes=4&compareReviews=review-a,missing"), candidates);
    expect(invalid.invalidReviewIds).toEqual(["missing"]);
    expect(invalid.state.reviewIds).toEqual([]);
    const valid = parseProductionWorkbenchState(new URLSearchParams("comparePanes=4&compareReviews=review-a,review-b&compareActive=review-b&comparePages=review-a:3&compareScroll=review-a:6250,review-b:10001"), candidates);
    expect(valid.state).toMatchObject({ paneCount: 4, reviewIds: ["review-a", "review-b"], activeReviewId: "review-b", pageOrdinals: { "review-a": 3 }, scrollRatios: { "review-a": 6250 } });
    const serialized = writeProductionWorkbenchState(new URLSearchParams(), valid.state);
    expect(serialized.get("compareReviews")).toBe("review-a,review-b");
    expect(serialized.get("compareScroll")).toBe("review-a:6250");
  });

  it("builds, deduplicates, reorders and classifies a page manifest", () => {
    const candidate = buildProductionReviewCandidates(project, [process("a", "review-a")])[0]!;
    const first = manifestPageFromPreview(candidate, preview(0, "a"));
    const second = manifestPageFromPreview(candidate, preview(1, "b"));
    const appended = appendProductionManifestPages([], [first, second, first]);
    expect(appended.pages).toHaveLength(2);
    expect(appended.skippedDuplicateCount).toBe(1);
    expect(moveProductionManifestPage(appended.pages, 1, 0).map((page) => page.sha256)).toEqual([second.sha256, first.sha256]);
    expect(productionManifestPageState(first, 0, [first, second], [first, second])).toBe("reused");
    expect(productionManifestPageState(second, 0, [first], [second])).toBe("changed");
    expect(summarizeProductionManifestPages([second], [first, second])).toEqual({
      reused: 0,
      changed: 1,
      new: 0,
      duplicate: 0,
      missing: 1,
    });
  });

  it("labels quick export as approved only when the pinned review exactly matches FINAL", () => {
    const base = process("a", "review-a");
    const candidate = buildProductionReviewCandidates(project, [base])[0]!;
    const approved = {
      ...revision("approved-a", "approved"),
      artifactId: base.artifact.id,
      rootGraphHash: candidate.subject.rootGraphHash,
    };
    const approvedReview = { ...candidate.review, status: "approved" as const };
    const approvedCandidate = { ...candidate, review: approvedReview };
    const approvedProcess = {
      ...base,
      artifact: { ...base.artifact, approvedRevisionId: approved.id },
      approvedRevision: approved,
      reviews: [approvedReview],
      latestReview: approvedReview,
      openReviewCount: 0,
      openRequiredFeedbackCount: 0,
      lifecyclePhase: "approved" as const,
    };
    expect(productionReviewMatchesApprovedFinal(approvedCandidate, approvedProcess)).toBe(true);
    expect(productionReviewMatchesApprovedFinal(
      { ...approvedCandidate, subject: { ...approvedCandidate.subject, rootGraphHash: digest("z") } },
      approvedProcess,
    )).toBe(false);
  });

  it("keeps role presets least-privileged and preserves existing task fields in bulk updates", () => {
    expect(productionRolePreset("external-reviewer")).toMatchObject({ projectRole: "commenter", workspaceRole: "guest" });
    expect(productionRolePreset("external-reviewer").blockedActions).toContain("원본 편집");
    const p = process("a", "review-a");
    const existing: ProductionTask = {
      id: "task", projectId: "p", scope: episodeScope("p", "ep-1"), processKey: "drawing", title: "기존", status: "in-progress",
      assignmentIds: ["old"], reviewerAssignmentIds: ["reviewer"], inputRevisionRefs: [], outputDeliverableIds: ["deliverable"],
      dependencyTaskIds: ["dependency"], dueAt: null, estimateHours: null, completionCriteria: ["keep"], sourceAgreementMilestoneId: null,
    };
    const aggregate = { projectId: "p", tasks: [existing] } as unknown as ProductionProjectAggregate;
    const updates = buildProductionMatrixTaskUpdates({ aggregate, cells: [{ key: "ep-1:a", episodeId: "ep-1", process: p, task: existing, assigneeNames: [] }],
      selectedKeys: new Set(["ep-1:a"]), assignmentId: "new", dueAt: "2026-10-01T00:00:00.000Z", status: "internal-review", idFactory: () => "new-task" });
    expect(updates[0]).toMatchObject({ id: "task", assignmentIds: ["new"], reviewerAssignmentIds: ["reviewer"],
      outputDeliverableIds: ["deliverable"], dependencyTaskIds: ["dependency"], completionCriteria: ["keep"], status: "internal-review" });
  });
});
