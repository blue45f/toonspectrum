import { expect, it, vi } from "vitest";
import { FixtureSnapshots, followupConfig, followupNow } from "../../../test/fortune-followup-fixtures";
import { fortuneEnrichmentConfig } from "./fortune-enrichment.provider";
import type { FortuneEnrichmentService } from "./fortune-enrichment.service";
import { FortuneRefreshWorker, nextFortuneRefreshDelay } from "./fortune-refresh.worker";

const enabled = { ...followupConfig, kasiEnabled: true, snapshotsEnabled: true, refreshEnabled: true };
function service() { return { calendar: vi.fn().mockResolvedValue({ status: "external-cache" }), specialDays: vi.fn().mockResolvedValue({ status: "external-cache" }) }; }
it("rejects automatic refresh without shared storage and defaults off", async () => {
  expect(() => fortuneEnrichmentConfig({ FORTUNE_REFRESH_ENABLED: "true" })).toThrow();
  const fake = service(); const worker = new FortuneRefreshWorker(fortuneEnrichmentConfig({}), { now: followupNow, fetch }, fake as unknown as FortuneEnrichmentService);
  worker.onModuleInit(); await worker.tick(); await worker.onModuleDestroy(); expect(fake.calendar).not.toHaveBeenCalled();
});
it("warms only current and next month public datasets and joins overlapping ticks", async () => {
  const fake = service(), snapshots = new FixtureSnapshots();
  const worker = new FortuneRefreshWorker(enabled, { now: followupNow, fetch }, fake as unknown as FortuneEnrichmentService, snapshots);
  const first = worker.tick(); expect(worker.tick()).toBe(first); await first;
  expect(fake.calendar.mock.calls).toEqual([["2026-09"], ["2026-10"]]);
  expect(fake.specialDays.mock.calls).toEqual([["2026-09", "holidays"], ["2026-09", "solar-terms"], ["2026-10", "holidays"], ["2026-10", "solar-terms"]]);
  expect(snapshots.prune).toHaveBeenCalledTimes(1); await worker.onModuleDestroy();
});
it("stops further collection on fallback or shutdown", async () => {
  const fake = service(), snapshots = new FixtureSnapshots(); fake.calendar.mockResolvedValueOnce({ status: "local-fallback" });
  const worker = new FortuneRefreshWorker(enabled, { now: followupNow, fetch }, fake as unknown as FortuneEnrichmentService, snapshots);
  await worker.tick(); expect(fake.specialDays).not.toHaveBeenCalled(); await worker.onModuleDestroy(); await worker.tick(); expect(fake.calendar).toHaveBeenCalledTimes(1);
});
it("bounds timers and cancels the scheduled wake-up on shutdown", async () => {
  const schedule = vi.fn(() => ({ unref: vi.fn() }) as unknown as ReturnType<typeof setTimeout>), clear = vi.fn();
  const worker = new FortuneRefreshWorker(enabled, { now: followupNow, fetch }, service() as unknown as FortuneEnrichmentService, new FixtureSnapshots(), { schedule, clear });
  worker.onModuleInit(); expect(schedule.mock.calls[0][1]).toBe(30000); await worker.onModuleDestroy(); expect(clear).toHaveBeenCalledTimes(1);
  expect(nextFortuneRefreshDelay(new Date("2026-12-31T16:14:59.000Z"))).toBe(1000);
  expect(nextFortuneRefreshDelay(new Date("2026-12-31T16:15:00.000Z"))).toBe(86400000);
});
it("handles December rollover and the calendar upper boundary", async () => {
  for (const [year, months] of [[2026, ["2026-12", "2027-01"]], [2050, ["2050-12"]]] as const) {
    const fake = service(); const worker = new FortuneRefreshWorker(enabled, { now: () => new Date(`${year}-12-20T01:00:00.000Z`), fetch }, fake as unknown as FortuneEnrichmentService, new FixtureSnapshots());
    await worker.tick(); expect(fake.calendar.mock.calls.map(([month]) => month)).toEqual(months); await worker.onModuleDestroy();
  }
});
it("does not start another request after shutdown during a fetch", async () => {
  const fake = service(); let complete!: (value: { status: string }) => void;
  fake.calendar.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
  const worker = new FortuneRefreshWorker(enabled, { now: followupNow, fetch }, fake as unknown as FortuneEnrichmentService, new FixtureSnapshots());
  const pending = worker.tick(); await vi.waitFor(() => expect(fake.calendar).toHaveBeenCalledOnce());
  const closing = worker.onModuleDestroy(); complete({ status: "external" }); await Promise.all([pending, closing]);
  expect(fake.specialDays).not.toHaveBeenCalled();
});

it("can maintain expired public snapshots with every external provider disabled", async () => {
  const config = fortuneEnrichmentConfig({ FORTUNE_SHARED_SNAPSHOTS_ENABLED: "true", FORTUNE_MAINTENANCE_ENABLED: "true" });
  const fake = service(), snapshots = new FixtureSnapshots();
  const worker = new FortuneRefreshWorker(config, { now: followupNow, fetch }, fake as unknown as FortuneEnrichmentService, snapshots);
  expect(worker.status()).toMatchObject({ enabled: true, running: false, lastRun: null });
  await worker.tick();
  expect(snapshots.prune).toHaveBeenCalledOnce(); expect(fake.calendar).not.toHaveBeenCalled(); expect(fake.specialDays).not.toHaveBeenCalled();
  expect(worker.status().lastRun).toMatchObject({ cleanup: "success", refresh: "disabled", attemptedDatasets: 0 });
  await worker.onModuleDestroy();
});
it.each(["fallback", "rejection"])("still prunes when collection ends with %s", async (mode) => {
  const fake = service(), snapshots = new FixtureSnapshots();
  if (mode === "fallback") fake.calendar.mockResolvedValueOnce({ status: "local-fallback" });
  else fake.calendar.mockRejectedValueOnce(new Error("secret-key-and-provider-body"));
  const worker = new FortuneRefreshWorker(enabled, { now: followupNow, fetch }, fake as unknown as FortuneEnrichmentService, snapshots);
  await worker.tick(); expect(snapshots.prune).toHaveBeenCalledOnce();
  expect(worker.status().lastRun).toMatchObject({ cleanup: "success", refresh: mode === "fallback" ? "fallback" : "failed", attemptedDatasets: 1 });
  expect(JSON.stringify(worker.status())).not.toContain("secret-key");
  await worker.onModuleDestroy();
});

it("reports cleanup failures separately and never leaks or shares mutable diagnostic state", async () => {
  const fake = service(), snapshots = new FixtureSnapshots(); snapshots.prune.mockRejectedValueOnce(new Error("private database URL"));
  const worker = new FortuneRefreshWorker(enabled, { now: followupNow, fetch }, fake as unknown as FortuneEnrichmentService, snapshots);
  await worker.tick(); const state = worker.status();
  expect(state.lastRun).toMatchObject({ cleanup: "failed", refresh: "completed", attemptedDatasets: 6 });
  expect(JSON.stringify(state)).not.toContain("private database");
  state.lastRun!.attemptedDatasets = 999;
  expect(worker.status().lastRun!.attemptedDatasets).toBe(6);
  await worker.onModuleDestroy(); expect(worker.status()).toMatchObject({ running: false, enabled: false, nextRunAt: null });
});
it("requires explicit shared storage and registers only one lifecycle timer", async () => {
  expect(() => fortuneEnrichmentConfig({ FORTUNE_MAINTENANCE_ENABLED: "true" })).toThrow();
  const schedule = vi.fn(() => ({ unref: vi.fn() }) as unknown as ReturnType<typeof setTimeout>), clear = vi.fn();
  const worker = new FortuneRefreshWorker(enabled, { now: followupNow, fetch }, service() as unknown as FortuneEnrichmentService, new FixtureSnapshots(), { schedule, clear });
  worker.onModuleInit(); worker.onModuleInit(); expect(schedule).toHaveBeenCalledOnce();
  expect(worker.status().nextRunAt).toBe("2026-09-20T01:00:30.000Z");
  await worker.onModuleDestroy(); worker.onModuleInit(); expect(schedule).toHaveBeenCalledOnce();
});
