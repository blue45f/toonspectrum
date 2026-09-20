import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import type { HiringAutomationConfig } from "./hiring-automation.config";
import type { HiringAutomationRepository } from "./hiring-automation.repository";

export interface AutomationClock { schedule(work: () => void, ms: number): ReturnType<typeof setTimeout>; clear(timer: ReturnType<typeof setTimeout>): void; }
export const automationClock: AutomationClock = { schedule: (work, ms) => setTimeout(work, ms), clear: (timer) => clearTimeout(timer) };
export class HiringAutomationWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setTimeout>;
  private pending?: Promise<void>;
  private readonly abort = new AbortController();
  constructor(readonly repository: HiringAutomationRepository, readonly config: HiringAutomationConfig, readonly clock: AutomationClock = automationClock) {}
  onModuleInit() { if (this.config.enabled && this.config.supported) this.schedule(); }
  private schedule() {
    if (this.abort.signal.aborted) return;
    this.timer = this.clock.schedule(() => { this.timer = undefined; void this.tick().finally(() => this.schedule()); }, this.config.tickMs);
    this.timer.unref?.();
  }
  tick(): Promise<void> {
    if (this.pending) return this.pending;
    if (!this.config.enabled || !this.config.supported || this.abort.signal.aborted) return Promise.resolve();
    this.pending = this.run().finally(() => { this.pending = undefined; });
    return this.pending;
  }
  private async run() {
    // Bounded sequential concurrency: at most two jobs/tick, one transaction at a time.
    for (let i = 0; i < this.config.batch && !this.abort.signal.aborted; i++) {
      try {
        const job = await this.repository.claim(); if (!job) break;
        if (this.abort.signal.aborted) break; // recoverable lease; never send after shutdown
        try { await this.repository.execute(job); if (!this.abort.signal.aborted) await this.repository.acknowledge(job); }
        catch { if (!this.abort.signal.aborted) await this.repository.fail(job); }
      } catch { break; } // bounded retry on next tick; never log DB content or secrets
    }
  }
  async onModuleDestroy() {
    this.abort.abort(); if (this.timer) this.clock.clear(this.timer); this.timer = undefined;
    await this.pending;
  }
}
