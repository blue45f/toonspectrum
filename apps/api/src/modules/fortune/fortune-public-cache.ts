import { randomBytes } from "node:crypto";
import { fortuneKstDate } from "../../../../../packages/core/src/fortune";
import type { UpstashCoordinationPort } from "../../platform/adapters/upstash-coordination/upstash-coordination.port";
import type { FortuneEnrichmentConfig, FortuneEnrichmentRuntime } from "./fortune-enrichment.provider";
import { parseFortuneSnapshot, type FortunePublicResult, type FortuneSnapshotPort } from "./fortune-snapshot";

export class FortunePublicCache {
  private readonly memory = new Map<string, { expires: number; value: FortunePublicResult }>();
  private readonly pending = new Map<string, Promise<FortunePublicResult>>();
  constructor(private readonly config: FortuneEnrichmentConfig, private readonly runtime: FortuneEnrichmentRuntime,
    private readonly coordination?: UpstashCoordinationPort | null, private readonly snapshots?: FortuneSnapshotPort | null) {}
  async get<T extends FortunePublicResult>(key: string, providerId: string, produce: () => Promise<T>, fallback: () => T): Promise<T> {
    const current = this.memory.get(key);
    if (current && current.expires > this.runtime.now().getTime()) {
      const value = structuredClone(current.value) as T;
      if (value.status === "external") value.status = "external-cache";
      return value;
    }
    const pending = this.pending.get(key);
    if (pending) return structuredClone(await pending) as T;
    if (this.pending.size >= 16) return fallback();
    const promise = this.collect(key, providerId, produce).catch(() => fallback()).then((value) => {
      if (value.expiresAt && Date.parse(value.expiresAt) <= this.runtime.now().getTime()) value = fallback();
      const expires = value.expiresAt ? Date.parse(value.expiresAt) : this.runtime.now().getTime() + 60000;
      if (this.memory.size >= 72) this.memory.delete(this.memory.keys().next().value!);
      this.memory.set(key, { expires, value: structuredClone(value) });
      return value;
    });
    this.pending.set(key, promise);
    try { return structuredClone(await promise) as T; } finally { this.pending.delete(key); }
  }
  private async collect<T extends FortunePublicResult>(key: string, providerId: string, produce: () => Promise<T>): Promise<T> {
    const shared = this.config.snapshotsEnabled;
    const lease = { scope: "provider-dispatch" as const, resourceId: `fortune:${key}`, leaseToken: randomBytes(32).toString("base64url"), ttlMs: 60000 };
    let acquired = false;
    const read = async () => {
      const snapshot = await this.snapshots!.get(key, this.runtime.now());
      if (!snapshot) return null;
      const value = parseFortuneSnapshot(snapshot, key, this.runtime.now());
      return { ...value, status: "external-cache" } as T;
    };
    try {
      if (shared) {
        if (!this.snapshots || !this.coordination) throw new Error("snapshot-storage-unavailable");
        const existing = await read();
        if (existing) return existing;
        acquired = (await this.coordination.acquireLease(lease, { signal: AbortSignal.timeout(1000) })).acquired;
        if (!acquired) throw new Error("snapshot-collection-busy");
        const winner = await read();
        if (winner) return winner;
      }
      const value = await produce();
      if (value.status !== "external") return value;
      const checked = Date.parse(value.checkedAt!);
      const midnight = Date.parse(`${fortuneKstDate(this.runtime.now())}T00:00:00+09:00`) + 86400000;
      const expires = value.kind === "horoscope" ? Math.min(checked + 3600000, midnight) : checked + 86400000;
      const safe = parseFortuneSnapshot({ ...value, expiresAt: new Date(expires).toISOString() }, key, this.runtime.now());
      if (shared) {
        const renewed = await this.coordination!.renewLease(lease, { signal: AbortSignal.timeout(1000) });
        if (!renewed.matched) throw new Error("snapshot-lease-lost");
        await this.snapshots!.put(safe);
      }
      try { await this.coordination?.closeProviderCircuit({ providerId }, { signal: AbortSignal.timeout(1000) }); } catch { /* Validated data stays usable. */ }
      return safe as T;
    } finally {
      if (acquired) {
        try { await this.coordination!.releaseLease(lease, { signal: AbortSignal.timeout(1000) }); } catch { /* Token-fenced lease expires. */ }
      }
    }
  }
}
