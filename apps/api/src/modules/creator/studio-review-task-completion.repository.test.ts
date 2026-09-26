import { beforeEach, describe, expect, it, vi } from "vitest";
import { canonicalJson } from "@toonspectrum/studio-project-model";
import { StudioProductionWorkspaceDocumentSchema } from "./studio-production.dto";
import { StudioReviewTaskCompletionRepository } from "./studio-review-task-completion.repository";

const mock = vi.hoisted(() => ({ connect: vi.fn(), captures: vi.fn() }));
vi.mock("../../platform/database", () => ({ dbPool: { connect: mock.connect } }));
vi.mock("../studio-project-graph/studio-review-capture-attestation", () => ({ loadStudioReviewResolutionCaptures: mock.captures }));

function fixture() {
  const pin = { schemaVersion: 1 as const, workId: "work", projectId: "project", artifactId: "artifact", reviewId: "review", revisionId: "snapshot", rootGraphHash: "a".repeat(64) };
  const replacement = { ...pin, reviewId: "new-review", revisionId: "new-snapshot", rootGraphHash: "b".repeat(64) };
  const taskId = "선화 수정 1";
  const task = { id: taskId, title: "Task", owner: "", due: "2026-09-20", progress: 50, status: "doing", stage: "lineart", priority: "normal", role: null,
    hierarchyNodeId: "episode", dependencyIds: [], assigneeIds: [], reviewerIds: [], blockedReason: "", reviewRef: { subject: pin, commentId: "comment", handoffId: "handoff" } };
  const document = StudioProductionWorkspaceDocumentSchema.parse({ schemaVersion: 3, revision: 4, scopeKey: "work:work", title: "Work", updatedAt: "2026-09-20T00:00:00.000Z",
    tasks: [task, { ...task, id: "other", reviewRef: undefined }], reviews: [], hierarchy: [{ id: "episode", kind: "episode", parentId: null, title: "Episode", order: 0, pageId: null }], roleAssignments: [],
    handoffs: [{ id: "handoff", hierarchyNodeId: "episode", fromRole: "story", toRole: "lineart", status: "ready", scenePurpose: "", emotionalBeat: "", mustShow: [], continuityNotes: [], lockedFields: [], acceptanceCriteria: ["A", "B"], createdBy: "", assignedTo: "", updatedAt: "2026-09-20T00:00:00.000Z" }], versions: [], slides: [], members: [], inviteToken: null });
  const state = { document, revision: 4, role: "editor", status: "active", commentStatus: "resolved", resolutionAt: "2026-09-20T00:00:00.000001Z", invalidated: false,
    receipt: null as null | { response: unknown; requestHash: string }, writes: 0 };
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    let rows: unknown[] = []; let rowCount = 0;
    if (sql.startsWith('SELECT "userId" FROM creator_work')) rows = [{ userId: "owner" }];
    else if (sql.includes('SELECT "userId",role,status')) rows = [{ userId: "actor", role: state.role, status: state.status }];
    else if (sql.includes('SELECT revision,document FROM creator_work_production')) rows = [{ revision: state.revision, document: state.document }];
    else if (sql.includes("FOR SHARE OF review")) rows = [{ id: "review" }];
    else if (sql.includes('SELECT body,status,"resolutionRevisionId"')) rows = [{ body: "Fix direction", status: state.commentStatus, resolutionRevisionId: "submission", resolvedBy: "actor", updatedAt: state.resolutionAt }];
    else if (sql.includes('SELECT review.id FROM studio_review review JOIN studio_revision_parent')) rows = [{ id: "new-review" }];
    else if (sql.includes("completion-invalidated-v1")) rows = state.invalidated ? [{ found: 1 }] : [];
    else if (sql.includes("SELECT response") || sql.includes('SELECT response,"requestHash"')) rows = state.receipt ? [state.receipt] : [];
    else if (sql.includes("clock_timestamp()")) rows = [{ now: "2026-09-20T00:01:00.000002Z" }];
    else if (sql.startsWith("UPDATE creator_work_production")) { state.writes++; state.revision = Number(params[2]); state.document = JSON.parse(String(params[3])); rowCount = 1; }
    else if (sql.startsWith("INSERT INTO studio_mutation_receipt")) { state.receipt = { response: JSON.parse(String(params[5])), requestHash: String(params[3]) }; }
    return { rows, rowCount };
  });
  const release = vi.fn(); mock.connect.mockResolvedValue({ query, release });
  mock.captures.mockResolvedValue([
    { subject: pin, submissionId: "old-submission", sourceServerRevision: 4, sequence: 1 },
    { subject: replacement, submissionId: "submission", sourceServerRevision: 5, sequence: 2 },
  ]);
  const repository = new StudioReviewTaskCompletionRepository();
  const input = async () => { const c = await repository.read("actor", "work", taskId); return { requestId: "intent", baseRevision: c.baseRevision, proofDigest: c.proofDigest, confirmedCriteria: c.criteria }; };
  return { repository, state, query, release, input, taskId };
}
beforeEach(() => { vi.clearAllMocks(); });
describe("server review completion transaction", () => {
  it("completes only the chosen legal Unicode task and writes actor/time from server after exact criteria", async () => {
    const f = fixture(), other = canonicalJson(f.state.document.tasks[1]), input = await f.input();
    const result = await f.repository.complete("actor", "work", f.taskId, input);
    expect(result.evidence?.receipt.completedBy).toBe("actor"); expect(result.evidence?.receipt.completedAt).toBe("2026-09-20T00:01:00.000002Z");
    expect(result.evidence?.current).toBe(true); expect(f.state.document.tasks[0]).toMatchObject({ status: "done", progress: 100 });
    expect(canonicalJson(f.state.document.tasks[1])).toBe(other); expect(f.state.writes).toBe(1);
    expect(f.query.mock.calls.map(([sql]) => sql).some((sql) => sql.includes('FOR SHARE OF review'))).toBe(true);
    expect(f.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
  });
  it("replays exactly once and never changes the document on repeated request", async () => {
    const f = fixture(), input = await f.input(); const first = await f.repository.complete("actor", "work", f.taskId, input);
    const replay = await f.repository.complete("actor", "work", f.taskId, input);
    expect(replay.evidence).toEqual(first.evidence); expect(f.state.writes).toBe(1);
    await expect(f.repository.complete("actor", "work", f.taskId, { ...input, confirmedCriteria: ["different"] })).rejects.toMatchObject({ code: "idempotency" });
  });
  it("keeps evidence current after unrelated document edits but never after append-only invalidation", async () => {
    const f = fixture(); await f.repository.complete("actor", "work", f.taskId, await f.input()); f.state.revision++;
    f.state.document.tasks[1]!.title = "Unrelated";
    expect((await f.repository.read("actor", "work", f.taskId)).evidence?.current).toBe(true);
    f.state.invalidated = true;
    expect((await f.repository.read("actor", "work", f.taskId)).evidence?.current).toBe(false);
  });
  it("does not revive a resolution changed within the same millisecond", async () => {
    const f = fixture(); await f.repository.complete("actor", "work", f.taskId, await f.input()); f.state.resolutionAt = "2026-09-20T00:00:00.000002Z";
    expect((await f.repository.read("actor", "work", f.taskId)).evidence?.current).toBe(false);
  });
  it("marks completion historical after its stable node changes source page, including return to the old binding", async () => {
    const f = fixture();
    f.state.document.hierarchy.push(
      { id: "sequence", kind: "sequence", parentId: "episode", title: "Sequence", order: 0, pageId: null },
      { id: "scene", kind: "scene", parentId: "sequence", title: "Scene", order: 0, pageId: null },
      { id: "page-node", kind: "page", parentId: "scene", title: "Page", order: 0, pageId: "source-page-A" },
    );
    f.state.document.tasks[0]!.hierarchyNodeId = "page-node";
    f.state.document.handoffs[0]!.hierarchyNodeId = "page-node";
    const input = await f.input();
    const completed = await f.repository.complete("actor", "work", f.taskId, input);
    f.state.document.hierarchy.find((node) => node.id === "page-node")!.pageId = "source-page-B";
    f.state.document.revision = ++f.state.revision;
    const changed = await f.repository.read("actor", "work", f.taskId);
    expect(changed.proofDigest).not.toBe(completed.proofDigest);
    expect(changed.evidence).toEqual({ receipt: completed.evidence!.receipt, current: false });
    // The workspace save keeps this invalidation even after the page binding returns.
    f.state.invalidated = true;
    f.state.document.hierarchy.find((node) => node.id === "page-node")!.pageId = "source-page-A";
    f.state.document.revision = ++f.state.revision;
    const replay = await f.repository.complete("actor", "work", f.taskId, input);
    expect(replay.proofDigest).toBe(completed.proofDigest);
    expect(replay.evidence).toEqual({ receipt: completed.evidence!.receipt, current: false });
    expect(f.state.writes).toBe(1);
  });
  it.each(["viewer", "revoked", "unresolved", "criteria", "CAS", "capture"])("rejects %s before any workspace write", async (failure) => {
    const f = fixture(), input = await f.input();
    if (failure === "viewer") f.state.role = "viewer";
    if (failure === "revoked") f.state.status = "declined";
    if (failure === "unresolved") f.state.commentStatus = "reopened";
    if (failure === "criteria") f.state.document.handoffs[0]!.acceptanceCriteria = ["C"];
    if (failure === "CAS") f.state.revision++;
    if (failure === "capture") mock.captures.mockResolvedValue([null, null]);
    await expect(f.repository.complete("actor", "work", f.taskId, input)).rejects.toBeInstanceOf(Error);
    expect(f.state.writes).toBe(0); expect(f.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
  });
});
