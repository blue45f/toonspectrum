import { describe, expect, it, vi } from "vitest";

import { StudioProductionServerConflictError } from "../studio-production/studio-production-server-client";
import type { ProductionWorkspace } from "../studio-production/studio-production-workspace-runtime";
import { StudioReviewProductionController } from "./studio-review-production-controller";
import { prepareStudioReviewProductionPatch, StudioReviewProductionError } from "./studio-review-production-model";
import { reviewProductionFixture } from "./studio-review-production-test-fixture";

function setup() {
  const f = reviewProductionFixture(1000), context = { actorId: "actor" as string | null, workId: "work", generation: 1, available: true };
  const read = vi.fn(async () => f.authority), save = vi.fn(async (_work: string, _revision: number, document: ProductionWorkspace) => ({ ...f.authority.workspace, document, revision: 5 }));
  const now = vi.fn(() => 1000), controller = new StudioReviewProductionController(f.request, { getContext: () => context, read, save, now });
  return { ...f, context, read, save, now, controller };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }

describe("review production connection lifecycle", () => {
  it("does no work on construction; reads for display and re-reads before the single explicit CAS", async () => {
    const f = setup(); expect(f.read).not.toHaveBeenCalled(); expect(f.save).not.toHaveBeenCalled();
    await f.controller.refresh(); expect(f.save).not.toHaveBeenCalled();
    const fresh = { ...f.authority, workspace: { ...f.authority.workspace, revision: 9,
      document: { ...f.authority.workspace.document, title: "Concurrently saved board", revision: 9 } } };
    f.read.mockResolvedValue(fresh); await f.controller.connect(f.choice);
    expect(f.read).toHaveBeenCalledTimes(2); expect(f.save).toHaveBeenCalledOnce();
    expect(f.save.mock.calls[0]?.[1]).toBe(9); expect(f.save.mock.calls[0]?.[2].title).toBe("Concurrently saved board");
    expect(f.controller.getSnapshot().phase).toBe("connected");
  });
  it("coalesces double click and fences a late grant after actor, work, visibility or generation changes", async () => {
    for (const change of [(f: ReturnType<typeof setup>) => { f.context.actorId = "other"; }, (f: ReturnType<typeof setup>) => { f.context.workId = "other"; },
      (f: ReturnType<typeof setup>) => { f.context.available = false; }, (f: ReturnType<typeof setup>) => { f.context.generation++; }]) {
      const f = setup(), wait = deferred<typeof f.authority>(); f.read.mockReturnValue(wait.promise);
      const pending = f.controller.connect(f.choice); void f.controller.connect(f.choice); expect(f.read).toHaveBeenCalledOnce();
      change(f); wait.resolve(f.authority); await pending; expect(f.save).not.toHaveBeenCalled();
    }
  });
  it("explicit cancellation and disposal suppress late success and stop pending work", async () => {
    for (const dispose of [false, true]) {
      const f = setup(), wait = deferred<typeof f.authority.workspace>(); f.save.mockReturnValue(wait.promise);
      const pending = f.controller.connect(f.choice); await vi.waitFor(() => expect(f.save).toHaveBeenCalledOnce());
      if (dispose) f.controller.dispose(); else f.controller.invalidate();
      wait.resolve({ ...f.authority.workspace, document: prepareStudioReviewProductionPatch(f.authority, f.choice).document });
      await pending; expect(f.controller.getSnapshot().phase).not.toBe("connected"); expect(f.controller.getSnapshot().authority).toBeNull();
    }
  });
  it("reconciles a lost PUT response by reading the same saved reference without another PUT", async () => {
    const f = setup(), patch = prepareStudioReviewProductionPatch(f.authority, f.choice);
    f.save.mockRejectedValue(new Error("response lost")); f.read.mockResolvedValueOnce(f.authority)
      .mockResolvedValueOnce({ ...f.authority, workspace: { ...f.authority.workspace, document: patch.document } });
    await f.controller.connect(f.choice); expect(f.controller.getSnapshot().phase).toBe("connected"); expect(f.save).toHaveBeenCalledOnce();
  });
  it("preserves an uncertain attempt and only retries from another explicit request", async () => {
    const f = setup(); f.save.mockRejectedValueOnce(new Error("network lost")); await f.controller.connect(f.choice);
    expect(f.controller.getSnapshot().phase).toBe("uncertain"); expect(f.save).toHaveBeenCalledOnce();
    await f.controller.connect(f.choice); expect(f.save).toHaveBeenCalledTimes(2);
    expect(f.save.mock.calls[0]?.slice(0, 3)).toEqual(f.save.mock.calls[1]?.slice(0, 3));
    expect(f.controller.getSnapshot().phase).toBe("connected");
  });
  it("does not confirm a lost PUT when the same role ID was rebound or the handoff criteria changed", async () => {
    for (const mode of ["member", "scope", "criteria"]) {
      const f = setup(), patch = prepareStudioReviewProductionPatch(f.authority, f.choice), document = patch.document;
      const changed = { ...document,
        roleAssignments: document.roleAssignments.map((role) => mode === "member" ? { ...role, memberId: "actor" }
          : mode === "scope" ? { ...role, hierarchyNodeId: "missing-scope" } : role),
        handoffs: document.handoffs.map((brief) => mode === "criteria" ? { ...brief, acceptanceCriteria: ["Changed condition"] } : brief) };
      f.save.mockRejectedValue(new Error("lost")); f.read.mockResolvedValueOnce(f.authority)
        .mockResolvedValueOnce({ ...f.authority, workspace: { ...f.authority.workspace, document: changed } });
      await f.controller.connect(f.choice); expect(f.controller.getSnapshot().phase).toBe("uncertain"); expect(f.save).toHaveBeenCalledOnce();
    }
  });
  it("blocks a CAS conflict until explicit reload and never automatically reapplies it", async () => {
    const f = setup(); f.save.mockRejectedValueOnce(new StudioProductionServerConflictError(8));
    await f.controller.connect(f.choice); expect(f.controller.getSnapshot().phase).toBe("conflict"); expect(f.read).toHaveBeenCalledOnce();
    await f.controller.connect(f.choice); expect(f.save).toHaveBeenCalledOnce();
    await f.controller.refresh(); await f.controller.connect(f.choice); expect(f.save).toHaveBeenCalledTimes(2);
  });
  it("expires visible data and rejects expired or revoked fresh authority before writing", async () => {
    const f = setup(); await f.controller.refresh(); f.now.mockReturnValue(16000); f.controller.checkLease();
    expect(f.controller.getSnapshot().authority).toBeNull(); await f.controller.connect(f.choice); expect(f.save).not.toHaveBeenCalled();
    f.read.mockRejectedValue(new StudioReviewProductionError("access-denied")); await f.controller.connect(f.choice);
    expect(f.controller.getSnapshot().reason).toBe("access-denied"); expect(f.save).not.toHaveBeenCalled();
  });
  it("proves an already connected task by reading and performs zero duplicate writes", async () => {
    const f = setup(), patch = prepareStudioReviewProductionPatch(f.authority, f.choice);
    f.read.mockResolvedValue({ ...f.authority, workspace: { ...f.authority.workspace, document: patch.document } });
    await f.controller.connect(f.choice); expect(f.controller.getSnapshot().phase).toBe("connected"); expect(f.save).not.toHaveBeenCalled();
  });
});
