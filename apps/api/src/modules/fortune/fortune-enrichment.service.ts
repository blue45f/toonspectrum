import { randomUUID } from "node:crypto";
import { Inject, Injectable, Optional } from "@nestjs/common";
import { fortuneKstDate, fortuneMonthDays, localFortuneHoroscope,
  type FortuneCalendarEnrichment, type FortuneHoroscopeEnrichment, type FortuneUnavailableReason,
  type FortunePeriod, type FortuneZodiacId } from "../../../../../packages/core/src/fortune";
import { UPSTASH_COORDINATION_PORT, type UpstashCoordinationPort } from "../../infrastructure/upstash-coordination/upstash-coordination.port";
import { FORTUNE_ENRICHMENT_CONFIG, FORTUNE_ENRICHMENT_RUNTIME, KASI_POLICY_REVISION,
  compareKasiCalendar, horoscopeUrl, kasiCalendarUrl, parseKasiCalendarPage, parseProviderHoroscope, readBoundedProviderBody,
  type FortuneEnrichmentConfig, type FortuneEnrichmentRuntime, type KasiCalendarRow } from "./fortune-enrichment.provider";

type Result = FortuneCalendarEnrichment | FortuneHoroscopeEnrichment;
class ProviderUnavailable extends Error {
  constructor(readonly reason: FortuneUnavailableReason) { super(reason); }
}
@Injectable()
export class FortuneEnrichmentService {
  // Public per-instance cache; distributed coordination controls quotas across hosts.
  private readonly cache = new Map<string, { expires: number; value: Result }>();
  private readonly pending = new Map<string, Promise<Result>>();
  constructor(
    @Inject(FORTUNE_ENRICHMENT_CONFIG) private readonly config: FortuneEnrichmentConfig,
    @Inject(FORTUNE_ENRICHMENT_RUNTIME) private readonly runtime: FortuneEnrichmentRuntime,
    @Optional() @Inject(UPSTASH_COORDINATION_PORT) private readonly coordination?: UpstashCoordinationPort | null,
  ) {}
  capabilities() {
    return { version: 1, base: "local", serviceTimeZone: "Asia/Seoul", paidFallback: false,
      calendar: { available: !this.blocked("kasi"), reason: this.blocked("kasi") ?? null },
      horoscope: { available: !this.blocked("free-horoscope"), reason: this.blocked("free-horoscope") ?? null, translated: false },
      tarotDecks: ["major-22", "full-78"], cacheScope: "per-instance", budgetScope: "distributed-utc-day" }; }
  private blocked(provider: "kasi" | "free-horoscope"): FortuneUnavailableReason | undefined {
    if (provider === "kasi" && (!this.config.kasiEnabled || !this.config.kasiServiceKey)) return "not-configured";
    if (provider === "free-horoscope") {
      if (!this.config.horoscopeEnabled) return "not-configured";
      if (!this.config.horoscopeRightsApproved || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,95}$/u.test(this.config.horoscopePolicyRevision)) return "rights-pending";
    }
    if (!this.coordination) return "coordination-unavailable";
    return undefined;
  }
  private async request(provider: "kasi" | "free-horoscope", url: URL): Promise<string> {
    const blocked = this.blocked(provider);
    if (blocked || !this.coordination) throw new ProviderUnavailable(blocked ?? "coordination-unavailable");
    const signal = AbortSignal.timeout(2500);
    try {
      const circuit = await this.coordination.readProviderCircuit({ providerId: `fortune-${provider}` }, { signal });
      if (circuit.state === "open") throw new ProviderUnavailable("provider-unavailable");
      const budget = await this.coordination.consumeProviderBudget({ providerId: `fortune-${provider}`, operationId: randomUUID(),
        requestUnits: 1, costUnits: 0, maximumRequestUnits: this.config.dailyRequestLimit, maximumCostUnits: 0, expiryGraceMs: 60000 }, { signal });
      if (!budget.accepted || budget.duplicate) throw new ProviderUnavailable("budget-exhausted");
    } catch (error) { throw error instanceof ProviderUnavailable ? error : new ProviderUnavailable("coordination-unavailable"); }
    const response = await this.runtime.fetch(url, { signal, redirect: "error", headers: { Accept: provider === "kasi" ? "application/xml" : "application/json" } });
    return readBoundedProviderBody(response);
  }
  private async failure(provider: "kasi" | "free-horoscope", error: unknown): Promise<FortuneUnavailableReason> {
    if (error instanceof ProviderUnavailable) return error.reason;
    try { await this.coordination?.recordProviderFailure({ providerId: `fortune-${provider}`, failureThreshold: 3, cooldownMs: 60000, stateTtlMs: 300000 }, { signal: AbortSignal.timeout(1000) }); } catch { /* enrichment remains optional */ }
    // Never log provider bodies or URLs containing the KASI key.
    return "provider-unavailable";
  }
  private async cached<T extends Result>(key: string, produce: () => Promise<T>, fallback: () => T): Promise<T> {
    const now = this.runtime.now().getTime();
    const existing = this.cache.get(key);
    if (existing && existing.expires > now) {
      const value = structuredClone(existing.value) as T;
      if (value.status === "external") value.status = "external-cache";
      return value;
    }
    const inflight = this.pending.get(key);
    if (inflight) return structuredClone(await inflight) as T;
    if (this.pending.size >= 16) return fallback();
    const promise = produce().then(async (value) => {
      const at = this.runtime.now().getTime();
      const midnight = new Date(`${fortuneKstDate(this.runtime.now())}T00:00:00+09:00`).getTime() + 86400000;
      const ttl = value.status === "external" ? (value.kind === "calendar" ? 86400000 : Math.min(3600000, Math.max(0, midnight - at))) : 60000;
      if (this.cache.size >= 72) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(key, { value: structuredClone(value), expires: at + ttl });
      if (value.status === "external") {
        try { await this.coordination?.closeProviderCircuit({ providerId: `fortune-${value.source === "kasi" ? "kasi" : "free-horoscope"}` }, { signal: AbortSignal.timeout(1000) }); } catch { /* validated content remains available */ }
      }
      return value;
    });
    this.pending.set(key, promise);
    try { return structuredClone(await promise); } finally { this.pending.delete(key); }
  }
  async calendar(month: string): Promise<FortuneCalendarEnrichment> {
    fortuneMonthDays(month);
    const fallback = (reason: FortuneUnavailableReason): FortuneCalendarEnrichment => ({ kind: "calendar", month, status: "local-fallback", reason, source: "local", checks: [], policyRevision: KASI_POLICY_REVISION });
    return this.cached(`calendar:${month}:${KASI_POLICY_REVISION}`, async () => {
      const blocked = this.blocked("kasi");
      if (blocked) return fallback(blocked);
      try {
        const rows: KasiCalendarRow[] = [];
        for (let page = 1; page <= 4; page += 1) {
          const parsed = parseKasiCalendarPage(await this.request("kasi", kasiCalendarUrl(this.config.kasiServiceKey, month, page)), month, page);
          rows.push(...parsed.rows);
          if (rows.length >= parsed.totalCount) break;
        }
        return { kind: "calendar", month, status: "external", source: "kasi", checks: compareKasiCalendar(month, rows),
          checkedAt: this.runtime.now().toISOString(), policyRevision: KASI_POLICY_REVISION };
      } catch (error) { return fallback(await this.failure("kasi", error)); }
    }, () => fallback("provider-unavailable"));
  }
  async horoscope(sign: FortuneZodiacId, period: FortunePeriod, date: string): Promise<FortuneHoroscopeEnrichment> {
    const local = localFortuneHoroscope(sign, period, date);
    const fallback = (reason: FortuneUnavailableReason): FortuneHoroscopeEnrichment => ({ ...local, status: "local-fallback", reason });
    return this.cached(`horoscope:${sign}:${period}:${date}:${this.config.horoscopePolicyRevision}`, async () => {
      if (date !== fortuneKstDate(this.runtime.now())) return fallback("historical-request");
      const blocked = this.blocked("free-horoscope");
      if (blocked) return fallback(blocked);
      try {
        const text = parseProviderHoroscope(await this.request("free-horoscope", horoscopeUrl(sign, period)), sign, period, date);
        if (date !== fortuneKstDate(this.runtime.now())) return fallback("historical-request");
        return { ...local, status: "external", source: "free-horoscope", language: "en", text, sourceDate: date,
          checkedAt: this.runtime.now().toISOString(), policyRevision: this.config.horoscopePolicyRevision };
      } catch (error) { return fallback(await this.failure("free-horoscope", error)); }
    }, () => fallback("provider-unavailable"));
  }
}
