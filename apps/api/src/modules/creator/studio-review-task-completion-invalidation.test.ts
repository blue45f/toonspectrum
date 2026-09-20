import { describe, expect, it } from "vitest";
import { studioReviewTaskCompletionReceiptSchema } from "@toonspectrum/studio-project-model";
import { StudioProductionWorkspaceDocumentSchema } from "./studio-production.dto";
import { studioReviewTaskCompletionBasis, studioReviewTaskCompletionChangedTasks, studioReviewTaskCompletionFingerprint, studioReviewTaskCompletionInvalidations } from "./studio-review-task-completion-invalidation";

function fixture() {
  const reference = { subject: { schemaVersion: 1 as const, projectId: "project", workId: "work", artifactId: "artifact", reviewId: "review", revisionId: "snapshot", rootGraphHash: "a".repeat(64) }, commentId: "comment", handoffId: "handoff" };
  const at = "2026-09-20T00:00:00.000001Z";
  const receipt = studioReviewTaskCompletionReceiptSchema.parse({ contract: "studio-review-task-completion-v1", workId: "work", taskId: "task", requestId: "intent", reference,
    replacement: { ...reference.subject, reviewId: "new-review", revisionId: "new-snapshot", rootGraphHash: "b".repeat(64) }, criteria: ["A"],
    resolution: { revisionId: "submission", resolvedBy: "actor", updatedAt: at }, proofDigest: "c".repeat(64), workspaceRevision: 2, completedBy: "actor", completedAt: at });
  const task = { id: "task", title: "Task", owner: "", due: "2026-09-20", progress: 100, status: "done", stage: "lineart", priority: "normal", role: null,
    hierarchyNodeId: "episode", dependencyIds: [], assigneeIds: [], reviewerIds: [], blockedReason: "", reviewRef: reference };
  const document = StudioProductionWorkspaceDocumentSchema.parse({ schemaVersion: 3, revision: 2, scopeKey: "work:work", title: "Work", updatedAt: at,
    tasks: [task, { ...task, id: "other", reviewRef: undefined }], reviews: [], hierarchy: [{ id: "episode", kind: "episode", parentId: null, title: "Episode", order: 0, pageId: null }], roleAssignments: [],
    handoffs: [{ id: "handoff", hierarchyNodeId: "episode", fromRole: "story", toRole: "lineart", status: "ready", scenePurpose: "", emotionalBeat: "", mustShow: [], continuityNotes: [], lockedFields: [], acceptanceCriteria: ["A"], createdBy: "", assignedTo: "", updatedAt: at }], versions: [], slides: [], members: [], inviteToken: null });
  return { receipt, document };
}

function pageFixture() {
  const { receipt, document } = fixture();
  document.hierarchy.push(
    { id: "sequence", kind: "sequence", parentId: "episode", title: "Sequence", order: 0, pageId: null },
    { id: "scene", kind: "scene", parentId: "sequence", title: "Scene", order: 0, pageId: null },
    { id: "page-node", kind: "page", parentId: "scene", title: "Page", order: 0, pageId: "source-page-A" },
  );
  document.tasks[0]!.hierarchyNodeId = "page-node";
  document.handoffs[0]!.hierarchyNodeId = "page-node";
  return { receipt, document: StudioProductionWorkspaceDocumentSchema.parse(document) };
}
describe("server completion invalidation", () => {
  it("keeps unrelated tasks, workspace names and completed task title edits out of receipt reads", () => {
    const { document, receipt } = fixture(); const next = structuredClone(document); next.revision++;
    next.title = "Rename"; next.tasks[0]!.title = "Clearer label"; next.tasks[1]!.status = "doing"; next.tasks[1]!.progress = 10;
    expect(studioReviewTaskCompletionChangedTasks(document, next)).toEqual([]);
    expect(studioReviewTaskCompletionInvalidations(document, next, [receipt])).toEqual([]);
  });
  it("invalidates A -> B -> A with an append-only fingerprint while keeping the original receipt", () => {
    const { document, receipt } = fixture(); const b = structuredClone(document); b.revision++; b.handoffs[0]!.acceptanceCriteria = ["B"];
    const a = structuredClone(document); a.revision += 2;
    const invalidations = [...studioReviewTaskCompletionInvalidations(document, b, [receipt]), ...studioReviewTaskCompletionInvalidations(b, a, [receipt])];
    expect(invalidations).toHaveLength(2); expect(invalidations.every((item) => item.completionFingerprint === studioReviewTaskCompletionFingerprint(receipt))).toBe(true);
    expect(receipt.criteria).toEqual(["A"]); expect(studioReviewTaskCompletionChangedTasks(document, b)).toEqual(["task"]);
  });
  it.each(["status", "progress", "link", "delete"])("invalidates only the affected task after %s changes", (change) => {
    const { document, receipt } = fixture(); const next = structuredClone(document); next.revision++;
    if (change === "status") next.tasks[0]!.status = "todo";
    if (change === "progress") next.tasks[0]!.progress = 99;
    if (change === "link") next.tasks[0]!.reviewRef!.commentId = "another-comment";
    if (change === "delete") next.tasks.shift();
    expect(studioReviewTaskCompletionInvalidations(document, next, [receipt])).toHaveLength(1);
  });
  it("retains exact microseconds so same-millisecond reopen/resolve cannot match old evidence", () => {
    const { receipt } = fixture(); const later = structuredClone(receipt); later.resolution.updatedAt = "2026-09-20T00:00:00.000002Z";
    expect(Date.parse(receipt.resolution.updatedAt)).toBe(Date.parse(later.resolution.updatedAt));
    expect(studioReviewTaskCompletionFingerprint(receipt.resolution)).not.toBe(studioReviewTaskCompletionFingerprint(later.resolution));
  });
  it("invalidates a changed scope ancestry even when task and handoff node IDs remain equal", () => {
    const { document, receipt } = fixture();
    document.hierarchy.push({ id: "sequence", kind: "sequence", parentId: "episode", title: "Sequence", order: 0, pageId: null });
    document.tasks[0]!.hierarchyNodeId = "sequence"; document.handoffs[0]!.hierarchyNodeId = "sequence";
    const next = structuredClone(document); next.revision++;
    next.hierarchy.push({ id: "episode-other", kind: "episode", parentId: null, title: "Other episode", order: 1, pageId: null });
    next.hierarchy[1]!.parentId = "episode-other";
    expect(studioReviewTaskCompletionChangedTasks(document, next)).toEqual(["task"]);
    expect(studioReviewTaskCompletionInvalidations(document, next, [receipt])).toHaveLength(1);
  });
  it("invalidates a changed source page behind the same task and handoff scope IDs", () => {
    const { document, receipt } = pageFixture(); const next = structuredClone(document); next.revision++;
    next.hierarchy.find((node) => node.id === "page-node")!.pageId = "source-page-B";
    const parsed = StudioProductionWorkspaceDocumentSchema.parse(next);
    expect(studioReviewTaskCompletionBasis(parsed, "task")).not.toEqual(studioReviewTaskCompletionBasis(document, "task"));
    expect(studioReviewTaskCompletionChangedTasks(document, parsed)).toEqual(["task"]);
    expect(studioReviewTaskCompletionInvalidations(document, parsed, [receipt])).toEqual([
      expect.objectContaining({ taskId: "task", completionFingerprint: studioReviewTaskCompletionFingerprint(receipt), workspaceRevision: parsed.revision }),
    ]);
  });
  it("keeps page binding A -> B -> A invalidated without replacing its original receipt", () => {
    const { document, receipt } = pageFixture(); const originalReceipt = structuredClone(receipt);
    const b = structuredClone(document); b.revision++;
    b.hierarchy.find((node) => node.id === "page-node")!.pageId = "source-page-B";
    const a = structuredClone(document); a.revision += 2;
    const invalidations = [...studioReviewTaskCompletionInvalidations(document, b, [receipt]), ...studioReviewTaskCompletionInvalidations(b, a, [receipt])];
    expect(studioReviewTaskCompletionBasis(a, "task")).toEqual(studioReviewTaskCompletionBasis(document, "task"));
    expect(invalidations).toHaveLength(2);
    expect(invalidations.map((item) => item.workspaceRevision)).toEqual([b.revision, a.revision]);
    expect(invalidations.every((item) => item.completionFingerprint === studioReviewTaskCompletionFingerprint(receipt))).toBe(true);
    expect(receipt).toEqual(originalReceipt);
  });
  it("preserves a page-scoped completion after hierarchy labels, order and unrelated task edits", () => {
    const { document, receipt } = pageFixture(); const next = structuredClone(document); next.revision++;
    next.hierarchy.forEach((node) => { node.title = `Renamed ${node.id}`; node.order += 1; });
    next.title = "Renamed work"; next.tasks[0]!.title = "Renamed completed task";
    next.tasks[1]!.status = "doing"; next.tasks[1]!.progress = 15; next.tasks[1]!.hierarchyNodeId = "page-node";
    const parsed = StudioProductionWorkspaceDocumentSchema.parse(next);
    expect(studioReviewTaskCompletionBasis(parsed, "task")).toEqual(studioReviewTaskCompletionBasis(document, "task"));
    expect(studioReviewTaskCompletionChangedTasks(document, parsed)).toEqual([]);
    expect(studioReviewTaskCompletionInvalidations(document, parsed, [receipt])).toEqual([]);
  });
  it("rejects completion evidence in a generic workspace document and client-supplied completion actors", async () => {
    const { document, receipt } = fixture();
    expect(StudioProductionWorkspaceDocumentSchema.safeParse({ ...document, tasks: [{ ...document.tasks[0], reviewCompletion: receipt }] }).success).toBe(false);
    const { studioReviewTaskCompletionInputSchema } = await import("@toonspectrum/studio-project-model");
    expect(studioReviewTaskCompletionInputSchema.safeParse({ requestId: "intent", baseRevision: 1, proofDigest: receipt.proofDigest, confirmedCriteria: ["A"], completedBy: "other" }).success).toBe(false);
  });
});
