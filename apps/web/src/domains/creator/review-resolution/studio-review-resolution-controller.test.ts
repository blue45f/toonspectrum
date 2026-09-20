import { describe, expect, it, vi } from "vitest";
import { StudioReviewResolutionController } from "./studio-review-resolution-controller";
import { StudioReviewResolutionError } from "./studio-review-resolution-authority";
import { reviewResolutionFixture } from "./studio-review-resolution-test-fixture";

vi.mock("@/infrastructure/api", () => ({ httpStatus: (error: unknown) => error instanceof Response ? error.status : null }));
function fixture() {
  const f = reviewResolutionFixture(1000), context = { actorId: "actor" as string | null, generation: 1, available: true };
  const read = vi.fn(async () => f.authority), resolve = vi.fn(async () => ({ id: "comment", status: "resolved" as const,
    resolutionRevisionId: "submission-new", resolvedBy: "actor", updatedAt: "2026-09-20T00:00:00.000Z" }));
  const now = vi.fn(() => 1000), controller = new StudioReviewResolutionController(f.request, { getContext: () => context, read, resolve, now });
  return { ...f, context, read, resolve, now, controller };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { resolve, promise }; }
describe("explicit correction resolution controller", () => {
  it("never resolves on arrival/check or without confirmation; sends the actual parent and full source proof once", async () => {
    const f = fixture(); expect(f.read).not.toHaveBeenCalled(); await f.controller.resolve(true); expect(f.resolve).not.toHaveBeenCalled();
    await f.controller.check(); await f.controller.resolve(false); expect(f.resolve).not.toHaveBeenCalled();
    await f.controller.resolve(true); expect(f.read).toHaveBeenCalledTimes(2); expect(f.resolve).toHaveBeenCalledExactlyOnceWith("comment", "submission-new", "resolved", f.request.replacement);
    expect(f.controller.getSnapshot().phase).toBe("resolved");
  });
  it("rejects legacy or mismatched source proof without falling back to a three-argument POST", async () => {
    const f = fixture(); await f.controller.check(); f.resolve.mockRejectedValue(new Response(null, { status: 422 }));
    await f.controller.resolve(true); expect(f.resolve).toHaveBeenCalledOnce(); expect(f.controller.getSnapshot().reason).toBe("invalid-source");
  });
  it("coalesces double clicks and suppresses writes after late actor/visibility/session invalidation", async () => {
    for (const mode of ["actor", "hidden", "session", "dispose"]) {
      const f = fixture(); await f.controller.check(); const wait = deferred<typeof f.authority>(); f.read.mockReturnValue(wait.promise);
      const pending = f.controller.resolve(true); void f.controller.resolve(true);
      if (mode === "actor") f.context.actorId = "other";
      if (mode === "hidden") f.context.available = false;
      if (mode === "session") f.context.generation++;
      if (mode === "dispose") f.controller.dispose();
      wait.resolve(f.authority); await pending; expect(f.resolve).not.toHaveBeenCalled();
    }
  });
  it("discards late mutation completion after cancellation", async () => {
    const f = fixture(); await f.controller.check(); const wait = deferred<Awaited<ReturnType<typeof f.resolve>>>(); f.resolve.mockReturnValue(wait.promise);
    const pending = f.controller.resolve(true); await vi.waitFor(() => expect(f.resolve).toHaveBeenCalledOnce()); f.controller.invalidate();
    wait.resolve({ id: "comment", status: "resolved", resolutionRevisionId: "submission-new", resolvedBy: "actor", updatedAt: "now" });
    await pending; expect(f.controller.getSnapshot().phase).not.toBe("resolved"); expect(f.controller.getSnapshot().authority).toBeNull();
  });
  it("confirms lost-response success through a fresh recorded comment, without POST retry", async () => {
    const f = fixture(); await f.controller.check(); f.resolve.mockRejectedValue(new Error("response lost"));
    f.read.mockResolvedValueOnce(f.authority).mockResolvedValueOnce({ ...f.authority, resolved: true });
    await f.controller.resolve(true); expect(f.controller.getSnapshot().phase).toBe("resolved"); expect(f.resolve).toHaveBeenCalledOnce();
  });
  it("keeps an unconfirmed POST read-only on explicit recheck and never reissues it", async () => {
    const f = fixture(); await f.controller.check(); f.resolve.mockRejectedValue(new Error("response lost"));
    await f.controller.resolve(true); expect(f.controller.getSnapshot().phase).toBe("uncertain");
    await f.controller.check(); await f.controller.resolve(true); expect(f.resolve).toHaveBeenCalledOnce();
    expect(f.controller.getSnapshot().phase).toBe("uncertain");
    f.read.mockResolvedValue({ ...f.authority, resolved: true }); await f.controller.check(); expect(f.controller.getSnapshot().phase).toBe("resolved");
  });
  it("requires current permission and lease before posting, while preserving focused forms during bounded renewal", async () => {
    const f = fixture(); await f.controller.check(); const wait = deferred<typeof f.authority>(); f.read.mockReturnValueOnce(wait.promise);
    const renewing = f.controller.check(true); expect(f.controller.getSnapshot().phase).toBe("ready");
    f.now.mockReturnValue(16000); f.controller.checkLease(); expect(f.controller.getSnapshot().authority).toBeNull();
    wait.resolve({ ...f.authority, expiresAt: 30000 }); await renewing; expect(f.controller.getSnapshot().authority).toBeNull();
    await f.controller.resolve(true); expect(f.resolve).not.toHaveBeenCalled();
    f.read.mockRejectedValue(new StudioReviewResolutionError("access-denied")); await f.controller.check(); expect(f.controller.getSnapshot().reason).toBe("access-denied");
  });
});
