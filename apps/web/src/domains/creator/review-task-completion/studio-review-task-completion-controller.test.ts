import { describe, expect, it, vi } from "vitest";
import { StudioReviewTaskCompletionController } from "./studio-review-task-completion-controller";
import { StudioReviewTaskCompletionClientError } from "./studio-review-task-completion-client";
import { completionFixture } from "./studio-review-task-completion-fixture";

function fixture() {
  const data = completionFixture(); let now = 1000;
  const owner = { actorId: "actor", generation: 1, available: true };
  const deps = { owner: () => owner, now: () => now, createId: () => "intent", read: vi.fn().mockResolvedValue(data.context), complete: vi.fn().mockResolvedValue(data.completed) };
  const controller = new StudioReviewTaskCompletionController(data.request, deps);
  return { ...data, controller, deps, owner, advance: (ms: number) => { now += ms; } };
}
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; };

describe("review-linked task explicit completion", () => {
  it("does not POST on reads and requires all exact criteria before one explicit completion", async () => {
    const f = fixture(); await f.controller.refresh(); expect(f.deps.complete).not.toHaveBeenCalled();
    await f.controller.confirm(f.context.proofDigest, [f.context.criteria[0]!]); expect(f.deps.complete).not.toHaveBeenCalled();
    await f.controller.refresh(); await f.controller.confirm(f.context.proofDigest, f.context.criteria);
    expect(f.deps.complete).toHaveBeenCalledExactlyOnceWith(f.request, f.input, expect.any(AbortSignal));
    expect(f.controller.getSnapshot().phase).toBe("completed");
  });
  it("rereads before POST and refuses changed criteria, link or resolution", async () => {
    const f = fixture(); await f.controller.refresh(); f.deps.read.mockResolvedValue({ ...f.context, proofDigest: "d".repeat(64) });
    await f.controller.confirm(f.context.proofDigest, f.context.criteria);
    expect(f.deps.complete).not.toHaveBeenCalled(); expect(f.controller.getSnapshot().reason).toBe("conflict");
  });
  it("uses a fresh CAS for unrelated changes without requiring the same criteria again", async () => {
    const f = fixture(); await f.controller.refresh(); f.deps.read.mockResolvedValue({ ...f.context, baseRevision: 9 });
    await f.controller.confirm(f.context.proofDigest, f.context.criteria);
    expect(f.deps.complete.mock.calls[0]?.[1]).toEqual({ ...f.input, baseRevision: 9 });
  });
  it("reconciles a lost response with GET and never automatically repeats POST", async () => {
    const f = fixture(); await f.controller.refresh(); f.deps.complete.mockRejectedValue(new Error("response lost"));
    f.deps.read.mockResolvedValueOnce(f.context).mockResolvedValueOnce(f.completed);
    await f.controller.confirm(f.context.proofDigest, f.context.criteria);
    expect(f.controller.getSnapshot().phase).toBe("completed"); expect(f.deps.complete).toHaveBeenCalledTimes(1);
  });
  it("retains the exact intent across an explicit uncertain retry", async () => {
    const f = fixture(); await f.controller.refresh(); f.deps.complete.mockRejectedValueOnce(new Error("lost"));
    await f.controller.confirm(f.context.proofDigest, f.context.criteria); expect(f.controller.getSnapshot().phase).toBe("uncertain");
    await f.controller.confirm(f.context.proofDigest, f.context.criteria);
    expect(f.deps.complete).toHaveBeenCalledTimes(2); expect(f.deps.complete.mock.calls[0]?.[1]).toBe(f.deps.complete.mock.calls[1]?.[1]);
  });
  it("does not retry CAS conflicts or accept a different actor's identical request ID", async () => {
    const f = fixture(); await f.controller.refresh(); f.deps.complete.mockRejectedValue(new StudioReviewTaskCompletionClientError("conflict"));
    await f.controller.confirm(f.context.proofDigest, f.context.criteria); expect(f.controller.getSnapshot().reason).toBe("conflict");
    expect(f.deps.complete).toHaveBeenCalledTimes(1);
    f.deps.complete.mockRejectedValue(new Error("lost")); f.deps.read.mockResolvedValue({ ...f.completed, evidence: { ...f.completed.evidence!, receipt: { ...f.completed.evidence!.receipt, completedBy: "other" } } });
    await f.controller.refresh(); await f.controller.confirm(f.context.proofDigest, f.context.criteria);
    expect(f.controller.getSnapshot().phase).toBe("uncertain");
  });
  it.each(["actor", "generation", "hidden", "dispose"])("fences late read on %s change", async (kind) => {
    const f = fixture(); await f.controller.refresh(); const pending = deferred<typeof f.context>(); f.deps.read.mockReturnValue(pending.promise);
    const run = f.controller.confirm(f.context.proofDigest, f.context.criteria);
    if (kind === "actor") f.owner.actorId = "other"; if (kind === "generation") f.owner.generation++;
    if (kind === "hidden") f.owner.available = false; if (kind === "dispose") f.controller.dispose();
    pending.resolve(f.context); await run; expect(f.deps.complete).not.toHaveBeenCalled(); expect(f.controller.getSnapshot().phase).not.toBe("completed");
  });
  it("never reuses an uncertain intent for a different freshly observed proof", async () => {
    const f = fixture(); await f.controller.refresh(); f.deps.complete.mockRejectedValueOnce(new Error("lost"));
    await f.controller.confirm(f.context.proofDigest, f.context.criteria);
    const changed = { ...f.context, proofDigest: "d".repeat(64), criteria: ["Changed"] }; f.deps.read.mockResolvedValue(changed);
    await f.controller.refresh(); await f.controller.confirm(changed.proofDigest, changed.criteria);
    expect(f.deps.complete).toHaveBeenCalledTimes(1); expect(f.controller.getSnapshot().reason).toBe("conflict");
  });
  it("does not turn a delayed completion response into a fresh display lease", async () => {
    const f = fixture(); await f.controller.refresh(); const pending = deferred<typeof f.completed>(); f.deps.complete.mockReturnValue(pending.promise);
    const action = f.controller.confirm(f.context.proofDigest, f.context.criteria); await Promise.resolve();
    f.advance(15_001); pending.resolve(f.completed); await action;
    expect(f.controller.getSnapshot()).toMatchObject({ phase: "completed", context: null, reason: "expired" });
  });
  it("blocks expired display and a slow read before the write", async () => {
    const f = fixture(); await f.controller.refresh(); f.advance(15_001); f.controller.checkLease();
    await f.controller.confirm(f.context.proofDigest, f.context.criteria); expect(f.deps.complete).not.toHaveBeenCalled();
  });
});
