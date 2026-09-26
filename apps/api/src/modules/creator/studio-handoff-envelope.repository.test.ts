import { beforeEach, describe, expect, it, vi } from "vitest";
import { StudioProductionWorkspaceDocumentSchema } from "./studio-production.dto";
import { studioReviewTaskCompletionContextSchema } from "@toonspectrum/studio-project-model";
import { studioReviewTaskCompletionFingerprint as hash } from "./studio-review-task-completion-invalidation";
import { StudioHandoffEnvelopeRepository } from "./studio-handoff-envelope.repository";
import { studioHandoffChangedBriefs, studioHandoffChangedRoles } from "./studio-handoff-envelope-basis";

const io = vi.hoisted(() => ({ connect: vi.fn(), inspect: vi.fn() }));
vi.mock("../../platform/database", () => ({ dbPool: { connect: io.connect } }));
vi.mock("./studio-review-task-completion.repository", async (original) => ({ ...await original<object>(), inspectStudioReviewTaskCompletion: io.inspect }));
function fixture() {
  const pin = { schemaVersion: 1 as const, workId: "work", projectId: "project", artifactId: "artifact", reviewId: "review", revisionId: "snapshot", rootGraphHash: "a".repeat(64) };
  const reference = { subject: pin, commentId: "comment", handoffId: "handoff" }, at = "2026-09-20T00:00:00.000001Z";
  const replacement = { ...pin, reviewId: "new-review", revisionId: "new-snapshot", rootGraphHash: "b".repeat(64) };
  const task = { id: "선화 수정 1", title: "Task", owner: "", due: "2026-09-20", progress: 100, status: "done", stage: "lineart", priority: "normal", role: null,
    hierarchyNodeId: "episode", dependencyIds: [], assigneeIds: [], reviewerIds: [], blockedReason: "", reviewRef: reference };
  const document = StudioProductionWorkspaceDocumentSchema.parse({ schemaVersion: 3, revision: 2, scopeKey: "work:work", title: "Work", updatedAt: at,
    tasks: [task], reviews: [], hierarchy: [{ id: "episode", kind: "episode", parentId: null, title: "Episode", order: 0, pageId: null }],
    roleAssignments: [{ id: "role", memberId: "recipient", displayName: "선화", roles: ["lineart"], hierarchyNodeId: "episode" }],
    handoffs: [{ id: "handoff", hierarchyNodeId: "episode", fromRole: "story", toRole: "lineart", status: "accepted", scenePurpose: "목적", emotionalBeat: "", mustShow: [], continuityNotes: [], lockedFields: [], acceptanceCriteria: ["A"], createdBy: "", assignedTo: "", updatedAt: at }], versions: [], slides: [], members: [], inviteToken: null });
  const resolution = { revisionId: "submission", resolvedBy: "owner", updatedAt: at };
  const receipt = { contract: "studio-review-task-completion-v1", workId: "work", taskId: task.id, requestId: "done", reference, replacement, criteria: ["A"],
    resolution, proofDigest: "c".repeat(64), workspaceRevision: 2, completedBy: "owner", completedAt: at };
  const context = studioReviewTaskCompletionContextSchema.parse({ workId: "work", taskId: task.id, taskTitle: "Task", commentBody: "Fix", reference, replacement,
    criteria: ["A"], resolution, baseRevision: 2, proofDigest: "c".repeat(64), evidence: { receipt, current: true } });
  const state = { document, context, sequence: "1", otherSequence: "1", invitationId: "invite", recipientStatus: "active", invalidated: false, userStatus: "active",
    receipts: [] as { response: Record<string, unknown>; requestHash: string; key: string }[], fail: false };
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (state.fail && sql.includes("collaboration_event")) throw new Error("database offline");
    let rows: unknown[] = [];
    if (sql.startsWith('SELECT "userId" FROM creator_work')) rows = [{ userId: "owner" }];
    else if (sql.includes('FROM "user"')) rows = [{ status: state.userStatus, name: "담당자" }];
    else if (sql.includes("FROM creator_work_collaborator ")) rows = params[1] === "recipient" ? [{ userId: "recipient", role: "viewer", status: state.recipientStatus, invitationId: state.invitationId }] : [];
    else if (sql.includes("collaboration_event")) rows = [{ sequence: params[1] === "recipient" ? state.sequence : state.otherSequence }];
    else if (sql.includes('SELECT comment.id')) rows = [{ commentId: "pending", reviewId: "new-review", revisionId: "new-snapshot", body: "미해결", severity: "note", status: "open", updatedAt: at }];
    else if (sql.includes("clock_timestamp")) rows = [{ at }];
    else if (sql.includes("invalidated-v1")) rows = state.invalidated ? [{ found: 1 }] : [];
    else if (sql.includes("SELECT") && sql.includes("studio_mutation_receipt")) {
      rows = state.receipts.filter((record) => sql.includes("action-v1") ? record.response.contract === "studio-handoff-envelope-action-v1" : record.response.contract === "studio-handoff-envelope-v1");
    } else if (sql.startsWith("INSERT INTO studio_mutation_receipt")) {
      state.receipts.push({ response: JSON.parse(String(params[5])), requestHash: String(params[3]), key: String(params[2]) });
    }
    return { rows, rowCount: rows.length };
  });
  io.connect.mockResolvedValue({ query, release: vi.fn() }); io.inspect.mockImplementation(async () => ({ document: state.document, context: state.context }));
  const repository = new StudioHandoffEnvelopeRepository();
  const input = async () => { const prepared = await repository.prepare("owner", "work", task.id); return { envelopeId: "envelope", taskId: task.id, baseRevision: 2,
    completionFingerprint: prepared.completionFingerprint, recipient: { userId: "recipient", roleAssignmentId: "role" }, recipientBindingDigest: prepared.recipients[0]!.bindingDigest, usageConditions: "이 장면의 선화 작업용", remainingNotes: "" }; };
  const create = async () => repository.create("owner", "work", await input());
  const action = (digest: string, requestId = "action") => ({ requestId, envelopeDigest: digest, confirmed: true as const });
  return { state, repository, query, input, create, action };
}
beforeEach(() => vi.clearAllMocks());
describe("server-owned handoff envelope", () => {
  it("pins narrow inputs/output/issues and requires actual recipient open then acceptance; plan accepted has no authority", async () => {
    const f = fixture(), sent = await f.create();
    expect(sent.status).toBe("delivered"); expect(sent.opened).toBeNull(); expect(sent.accepted).toBeNull();
    expect(sent.envelope.senderUserId).toBe("owner"); expect(sent.envelope.createdAt).toBe("2026-09-20T00:00:00.000001Z");
    expect(sent.envelope.remainingIssues).toEqual([expect.objectContaining({ body: "미해결", revisionId: "new-snapshot" })]);
    await expect(f.repository.act("owner", "work", "envelope", "accept", f.action(sent.envelopeDigest))).rejects.toMatchObject({ code: "forbidden" });
    await expect(f.repository.act("recipient", "work", "envelope", "accept", f.action(sent.envelopeDigest))).rejects.toMatchObject({ code: "not-opened" });
    expect((await f.repository.act("recipient", "work", "envelope", "open", { requestId: "open", envelopeDigest: sent.envelopeDigest })).status).toBe("read");
    const accepted = await f.repository.act("recipient", "work", "envelope", "accept", f.action(sent.envelopeDigest));
    expect(accepted.status).toBe("accepted"); expect(accepted.accepted?.actorUserId).toBe("recipient");
    expect(io.inspect.mock.calls.some((args) => args[4] === "view")).toBe(true);
  });
  it("reconciles identical create and action requests once; changed create bytes cannot reuse the ID", async () => {
    const f = fixture(), input = await f.input(), sent = await f.repository.create("owner", "work", input);
    await f.repository.create("owner", "work", input); expect(f.state.receipts).toHaveLength(1);
    await expect(f.repository.create("owner", "work", { ...input, usageConditions: "different" })).rejects.toMatchObject({ code: "idempotency" });
    await f.repository.act("recipient", "work", "envelope", "open", { requestId: "open", envelopeDigest: sent.envelopeDigest });
    await f.repository.act("recipient", "work", "envelope", "open", { requestId: "open", envelopeDigest: sent.envelopeDigest });
    expect(f.state.receipts).toHaveLength(2);
  });
  it("targets recipient permission epochs; other member events and role names preserve the envelope", async () => {
    const f = fixture(); await f.create(); f.state.otherSequence = "999"; f.state.document.roleAssignments[0]!.displayName = "이름만 변경";
    expect((await f.repository.read("recipient", "work", "envelope")).status).toBe("delivered");
    f.state.sequence = "2"; expect((await f.repository.read("recipient", "work", "envelope")).status).toBe("changed");
    f.state.sequence = "3"; expect((await f.repository.read("recipient", "work", "envelope")).status).toBe("changed");
    expect(f.query.mock.calls.filter(([sql]) => sql.includes("collaboration_event")).every(([sql, values]) => sql.includes('"targetUserId"=$2') && values[1] === "recipient")).toBe(true);
  });
  it("denies revoked recipients, and restored invitation never revives prior acceptance", async () => {
    const f = fixture(); await f.create(); f.state.recipientStatus = "declined";
    await expect(f.repository.read("recipient", "work", "envelope")).rejects.toMatchObject({ code: "forbidden" });
    f.state.recipientStatus = "active"; f.state.invitationId = "new-invite"; f.state.sequence = "3";
    expect((await f.repository.read("recipient", "work", "envelope")).status).toBe("changed");
  });
  it("preserves cancelled history and prevents role/brief A B A revival through immutable invalidation", async () => {
    const f = fixture(), sent = await f.create(); f.state.invalidated = true;
    expect((await f.repository.read("recipient", "work", "envelope")).canAccept).toBe(false);
    expect((await f.repository.act("owner", "work", "envelope", "cancel", { requestId: "cancel", envelopeDigest: sent.envelopeDigest })).status).toBe("cancelled");
    expect(f.state.receipts[0]?.response.envelope).toEqual(sent.envelope);
  });
  it("does not mask infrastructure failure as a changed historical envelope", async () => {
    const f = fixture(); await f.create(); f.state.fail = true;
    await expect(f.repository.read("recipient", "work", "envelope")).rejects.toThrow("database offline");
    expect(f.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
  });
  it("selects exact changed bindings and briefs while excluding labels, order and other members", () => {
    const f = fixture(), a = f.state.document, b = structuredClone(a);
    b.roleAssignments[0]!.displayName = "new"; b.hierarchy[0]!.title = "new"; b.hierarchy[0]!.order = 4;
    expect(studioHandoffChangedRoles(a, b)).toEqual([]); expect(studioHandoffChangedBriefs(a, b)).toEqual([]);
    b.roleAssignments[0]!.memberId = "other"; expect(studioHandoffChangedRoles(a, b)).toEqual(["role"]);
    expect(studioHandoffChangedRoles(b, a)).toEqual(["role"]);
    b.roleAssignments[0]!.memberId = "recipient"; b.hierarchy[0]!.pageId = "pageB"; expect(studioHandoffChangedRoles(a, b)).toEqual(["role"]);
    b.handoffs[0]!.scenePurpose = "changed"; expect(studioHandoffChangedBriefs(a, b)).toEqual(["handoff"]);
    expect(hash(a)).not.toBe(hash(b));
  });
});
