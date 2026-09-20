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
/** Optional warm-up only. Request-path reads remain the cold-start recovery path. */
export class FortuneRefreshWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setTimeout>;
  private pending?: Promise<void>;
  private stopped = false;
  constructor(private readonly config: FortuneEnrichmentConfig, private readonly runtime: FortuneEnrichmentRuntime,
    private readonly service: FortuneEnrichmentService, private readonly snapshots?: FortuneSnapshotPort | null,
    private readonly timers: FortuneRefreshClock = clock) {}
  private enabled() { return this.config.refreshEnabled && this.config.snapshotsEnabled && this.snapshots && (this.config.kasiEnabled || this.config.specialDaysEnabled); }
  onModuleInit() { if (this.enabled()) this.schedule(30000); }
  private schedule(delay: number) {
    if (this.stopped) return;
    this.timer = this.timers.schedule(() => { this.timer = undefined; void this.tick().finally(() => this.schedule(nextFortuneRefreshDelay(this.runtime.now()))); }, delay);
    this.timer.unref?.();
  }
  tick(): Promise<void> {
    if (this.pending) return this.pending;
    if (!this.enabled() || this.stopped) return Promise.resolve();
    this.pending = this.run().catch(() => undefined).finally(() => { this.pending = undefined; });
    return this.pending;
  }
  private async run() {
    const current = fortuneKstDate(this.runtime.now()).slice(0, 7);
    const next = new Date(Date.UTC(Number(current.slice(0, 4)), Number(current.slice(5)), 1)).toISOString().slice(0, 7);
    for (const month of [current, next].filter((value) => Number(value.slice(0, 4)) <= 2050)) {
      const jobs = [
        ...(this.config.kasiEnabled ? [() => this.service.calendar(month)] : []),
        ...(this.config.specialDaysEnabled ? [() => this.service.specialDays(month, "holidays"), () => this.service.specialDays(month, "solar-terms")] : []),
      ];
      for (const job of jobs) { if (this.stopped) return; if ((await job()).status === "local-fallback") return; }
    }
    if (!this.stopped) await this.snapshots!.prune();
  }
  async onModuleDestroy() {
    this.stopped = true;
    if (this.timer) this.timers.clear(this.timer);
    this.timer = undefined; await this.pending;
  }
}
