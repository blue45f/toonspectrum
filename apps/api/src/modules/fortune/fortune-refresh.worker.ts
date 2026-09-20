import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { fortuneKstDate } from "../../../../../packages/core/src/fortune";
import type { FortuneEnrichmentConfig, FortuneEnrichmentRuntime } from "./fortune-enrichment.provider";
import type { FortuneEnrichmentService } from "./fortune-enrichment.service";
import type { FortuneSnapshotPort } from "./fortune-snapshot";

export interface FortuneRefreshClock {
  schedule(work: () => void, delay: number): ReturnType<typeof setTimeout>;
  clear(timer: ReturnType<typeof setTimeout>): void;
}
const clock: FortuneRefreshClock = { schedule: (work, delay) => setTimeout(work, delay), clear: (timer) => clearTimeout(timer) };
export function nextFortuneRefreshDelay(now: Date): number {
  let next = Date.parse(`${fortuneKstDate(now)}T01:15:00+09:00`);
  if (next <= now.getTime()) next += 86400000;
  return next - now.getTime();
}
export interface FortuneMaintenanceRun {
  startedAt: string;
  finishedAt: string | null;
  cleanup: "not-run" | "success" | "failed";
  refresh: "disabled" | "running" | "completed" | "fallback" | "failed" | "stopped";
  attemptedDatasets: number;
}
/** Optional warm-up only. Request-path reads remain the cold-start recovery path. */
export class FortuneRefreshWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setTimeout>;
  private pending?: Promise<void>;
  private stopped = false;
  private lastRun: FortuneMaintenanceRun | null = null;
  private nextRunAt: string | null = null;
  constructor(private readonly config: FortuneEnrichmentConfig, private readonly runtime: FortuneEnrichmentRuntime,
    private readonly service: FortuneEnrichmentService, private readonly snapshots?: FortuneSnapshotPort | null,
    private readonly timers: FortuneRefreshClock = clock) {}
  private refreshEnabled() { return Boolean(this.config.refreshEnabled && (this.config.kasiEnabled || this.config.specialDaysEnabled)); }
  private enabled() { return Boolean(this.config.snapshotsEnabled && this.snapshots && (this.config.maintenanceEnabled || this.refreshEnabled())); }
  status() {
    return { scope: "process-local" as const, enabled: this.enabled() && !this.stopped,
      refreshEnabled: this.enabled() && this.refreshEnabled() && !this.stopped, running: Boolean(this.pending),
      nextRunAt: this.nextRunAt, lastRun: this.lastRun ? structuredClone(this.lastRun) : null };
  }
  onModuleInit() { if (this.enabled() && !this.timer && !this.pending && !this.stopped) this.schedule(30000); }
  private schedule(delay: number) {
    if (this.stopped || !this.enabled()) { this.nextRunAt = null; return; }
    this.nextRunAt = new Date(this.runtime.now().getTime() + delay).toISOString();
    this.timer = this.timers.schedule(() => { this.timer = undefined; this.nextRunAt = null; void this.tick().finally(() => this.schedule(nextFortuneRefreshDelay(this.runtime.now()))); }, delay);
    this.timer.unref?.();
  }
  tick(): Promise<void> {
    if (this.pending) return this.pending;
    if (!this.enabled() || this.stopped) return Promise.resolve();
    const run: FortuneMaintenanceRun = { startedAt: this.runtime.now().toISOString(), finishedAt: null,
      cleanup: "not-run", refresh: this.refreshEnabled() ? "running" : "disabled", attemptedDatasets: 0 };
    this.lastRun = run;
    this.pending = this.run(run).catch(() => { run.refresh = "failed"; }).finally(() => {
      run.finishedAt = this.runtime.now().toISOString(); this.pending = undefined;
    });
    return this.pending;
  }
  private async run(run: FortuneMaintenanceRun) {
    // Retention is independent of provider availability; pruning never dispatches an external request.
    try { await this.snapshots!.prune(); run.cleanup = "success"; } catch { run.cleanup = "failed"; }
    if (this.stopped) { run.refresh = "stopped"; return; }
    if (!this.refreshEnabled()) return;
    const current = fortuneKstDate(this.runtime.now()).slice(0, 7);
    const next = new Date(Date.UTC(Number(current.slice(0, 4)), Number(current.slice(5)), 1)).toISOString().slice(0, 7);
    for (const month of [current, next].filter((value) => Number(value.slice(0, 4)) <= 2050)) {
      const jobs = [
        ...(this.config.kasiEnabled ? [() => this.service.calendar(month)] : []),
        ...(this.config.specialDaysEnabled ? [() => this.service.specialDays(month, "holidays"), () => this.service.specialDays(month, "solar-terms")] : []),
      ];
      for (const job of jobs) {
        if (this.stopped) { run.refresh = "stopped"; return; }
        run.attemptedDatasets += 1;
        if ((await job()).status === "local-fallback") { run.refresh = "fallback"; return; }
      }
    }
    run.refresh = this.stopped ? "stopped" : "completed";
  }
  async onModuleDestroy() {
    this.stopped = true;
    if (this.timer) this.timers.clear(this.timer);
    this.timer = undefined; this.nextRunAt = null; await this.pending;
  }
}
