import { describe, expect, it, vi } from "vitest";
import { StudioHandoffEnvelopeController } from "./studio-handoff-envelope-controller";
import { StudioHandoffClientError } from "./studio-handoff-envelope-client";
import { handoffFixture } from "./studio-handoff-envelope-fixture";

function fixture(taskId: string | null = "task") {
  const data = handoffFixture(); let now = 1000;
  const owner = { actorId: "actor", generation: 1, available: true };
  const client = { prepare: vi.fn().mockResolvedValue(data.prepared), read: vi.fn().mockResolvedValue(data.view),
    create: vi.fn().mockResolvedValue(data.view), act: vi.fn().mockResolvedValue(data.view),
    list: vi.fn().mockResolvedValue({ items: [], nextCursor: null }) };
  const createId = vi.fn(() => "envelope");
  const controller = new StudioHandoffEnvelopeController("work", taskId, { client, owner: () => owner, now: () => now, createId });
  return { ...data, controller, client, owner, createId, advance: (ms: number) => { now += ms; } };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }

describe("explicit, receipt-backed handoff", () => {
  it("only reads on entry and rechecks the recipient before one explicit delivery", async () => {
    const f = fixture(); await f.controller.refresh(); expect(f.client.create).not.toHaveBeenCalled();
    await f.controller.send(f.choice);
    expect(f.client.prepare).toHaveBeenCalledTimes(2); expect(f.client.create).toHaveBeenCalledTimes(1);
    expect(f.client.create.mock.calls[0]?.[1]).toMatchObject({ envelopeId: "envelope", recipient: f.view.envelope.recipient, usageConditions: f.choice.usageConditions });
    expect(f.controller.getSnapshot()).toMatchObject({ phase: "ready", view: f.view });
  });
  it("refuses a changed recipient binding without posting", async () => {
    const f = fixture(); await f.controller.refresh();
    f.client.prepare.mockResolvedValue({ ...f.prepared, recipients: [{ ...f.prepared.recipients[0]!, bindingDigest: "a".repeat(64) }] });
    await f.controller.send(f.choice); expect(f.client.create).not.toHaveBeenCalled();
    expect(f.controller.getSnapshot()).toMatchObject({ phase: "failed", reason: "changed" });
  });
  it("reconciles an uncertain successful response with a read, without a second write", async () => {
    const f = fixture(); await f.controller.refresh(); f.client.create.mockRejectedValue(new Error("invalid successful response"));
    await f.controller.send(f.choice); expect(f.client.create).toHaveBeenCalledTimes(1);
    expect(f.client.read).toHaveBeenCalledTimes(1); expect(f.controller.getSnapshot().phase).toBe("ready");
  });
  it("retains the exact request across explicit retry and never resends while refreshing", async () => {
    const f = fixture(); await f.controller.refresh(); f.client.create.mockRejectedValueOnce(new Error("response lost"));
    f.client.read.mockRejectedValue(new StudioHandoffClientError("missing"));
    await f.controller.send(f.choice); expect(f.controller.getSnapshot().phase).toBe("uncertain");
    await f.controller.refresh(); expect(f.client.create).toHaveBeenCalledTimes(1);
    await f.controller.retry(); expect(f.client.create).toHaveBeenCalledTimes(2);
    expect(f.client.create.mock.calls[0]?.[1]).toBe(f.client.create.mock.calls[1]?.[1]);
    expect(f.createId).toHaveBeenCalledTimes(1); expect(f.controller.getSnapshot().phase).toBe("ready");
  });
  it("does not replay a rejected write", async () => {
    const f = fixture(); await f.controller.refresh(); f.client.create.mockRejectedValue(new StudioHandoffClientError("changed"));
    await f.controller.send(f.choice); await f.controller.retry();
    expect(f.client.create).toHaveBeenCalledTimes(1); expect(f.client.read).not.toHaveBeenCalled();
    expect(f.controller.getSnapshot()).toMatchObject({ phase: "failed", reason: "changed" });
  });
  it.each(["actor", "generation", "hidden", "dispose"])("fences a late preparation on %s change", async (kind) => {
    const f = fixture(); await f.controller.refresh(); const pending = deferred<typeof f.prepared>();
    f.client.prepare.mockReturnValue(pending.promise); const run = f.controller.send(f.choice);
    if (kind === "actor") f.owner.actorId = "other"; if (kind === "generation") f.owner.generation++;
    if (kind === "hidden") f.owner.available = false; if (kind === "dispose") f.controller.dispose();
    pending.resolve(f.prepared); await run; expect(f.client.create).not.toHaveBeenCalled();
  });
  it("blocks an expired display and does not extend the lease with a late write response", async () => {
    const f = fixture(); await f.controller.refresh(); f.advance(15_001); f.controller.checkLease();
    await f.controller.send(f.choice); expect(f.client.create).not.toHaveBeenCalled();
    await f.controller.refresh(); const pending = deferred<typeof f.view>(); f.client.create.mockReturnValue(pending.promise);
    const run = f.controller.send(f.choice); await Promise.resolve(); f.advance(15_001);
    pending.resolve(f.view); await run; expect(f.controller.getSnapshot().view).toBeNull();
  });
  it("keeps an expired acceptance from reaching the server after a fresh recheck", async () => {
    const f = fixture(null); f.owner.actorId = "recipient";
    const opened = { actorUserId: "recipient", requestId: "opened", at: "2026-09-20T00:03:00.000Z" };
    f.client.read.mockResolvedValue({ ...f.view, opened, status: "read", canAccept: true, canCancel: false });
    await f.controller.select("envelope");
    f.client.read.mockResolvedValue({ ...f.view, opened, status: "changed", canAccept: false, canCancel: false });
    await f.controller.act("accept"); expect(f.client.act).not.toHaveBeenCalled();
  });
  it("keeps inbox reads independent from recipient preparation and all writes", async () => {
    const f = fixture(null); await f.controller.refresh(); await f.controller.select(null, "cursor");
    expect(f.client.list).toHaveBeenLastCalledWith("work", "cursor", expect.any(AbortSignal));
    expect(f.client.prepare).not.toHaveBeenCalled(); expect(f.client.create).not.toHaveBeenCalled();
  });
});
