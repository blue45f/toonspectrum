import { afterEach, describe, expect, it, vi } from "vitest";

import { hiringAutomationConfig } from "./hiring-automation.config";
import { automationBackoffMs } from "./hiring-automation.repository";
import { HiringAutomationWorker } from "./hiring-automation.worker";

import type { HiringAutomationRepository } from "./hiring-automation.repository";

const config = hiringAutomationConfig({ CREATOR_HIRING_AUTOMATION: "in-app-v1" });
function harness(enabled = true) {
  const repository = { claim: vi.fn().mockResolvedValue(null), execute: vi.fn(), acknowledge: vi.fn(), fail: vi.fn() };
  const clock = { schedule: vi.fn().mockReturnValue({ unref: vi.fn() }), clear: vi.fn() };
  const worker = new HiringAutomationWorker(repository as unknown as HiringAutomationRepository, { ...config, enabled }, clock);
  return { repository, worker, clock };
}
afterEach(() => vi.restoreAllMocks());
describe("opt-in in-app hiring lifecycle", () => {
  it("does not schedule or touch the database by default or for unsupported transport", async () => {
    expect(hiringAutomationConfig({})).toMatchObject({ enabled: false, supported: true });
    expect(hiringAutomationConfig({ CREATOR_HIRING_AUTOMATION: "email" })).toMatchObject({ enabled: false, supported: false });
    const h = harness(false); h.worker.onModuleInit(); await h.worker.tick(); await h.worker.onModuleDestroy();
    expect(h.clock.schedule).not.toHaveBeenCalled(); expect(h.repository.claim).not.toHaveBeenCalled();
  });
  it("keeps one run in flight and waits for shutdown without sending a late claim", async () => {
    const h = harness(); let resolve!: (job: object) => void;
    h.repository.claim.mockImplementation(() => new Promise((r) => { resolve = r; }));
    const first = h.worker.tick(); expect(h.worker.tick()).toBe(first);
    const stopped = h.worker.onModuleDestroy(); resolve({ id: "job" }); await stopped; await first;
    expect(h.repository.claim).toHaveBeenCalledTimes(1); expect(h.repository.execute).not.toHaveBeenCalled();
    await h.worker.tick(); expect(h.repository.claim).toHaveBeenCalledTimes(1);
  });
  it("unrefs and clears its timer and bounds the batch", async () => {
    const h = harness(); h.worker.onModuleInit(); expect(h.clock.schedule).toHaveBeenCalledOnce();
    expect(h.clock.schedule.mock.results[0].value.unref).toHaveBeenCalledOnce();
    h.repository.claim.mockResolvedValue({ id: "job" }); await h.worker.tick();
    expect(h.repository.claim).toHaveBeenCalledTimes(2); expect(h.repository.acknowledge).toHaveBeenCalledTimes(2);
    await h.worker.onModuleDestroy(); expect(h.clock.clear).toHaveBeenCalledOnce();
  });
  it("records bounded failure attempts without exposing exception content", async () => {
    const h = harness(); h.repository.claim.mockResolvedValueOnce({ id: "job" }); h.repository.execute.mockRejectedValue(new Error("private contact"));
    await h.worker.tick(); expect(h.repository.fail).toHaveBeenCalledWith({ id: "job" }); expect(h.repository.acknowledge).not.toHaveBeenCalled();
    expect([1, 2, 3, 4, 5, 20].map(automationBackoffMs)).toEqual([5000, 10000, 20000, 40000, 80000, 300000]);
    expect(config.maxAttempts).toBe(5);
  });
});
