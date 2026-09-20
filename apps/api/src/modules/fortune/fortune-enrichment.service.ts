import { randomUUID } from "node:crypto";
import { FortunePublicCache } from "./fortune-public-cache";
import { FORTUNE_SNAPSHOT_PORT, type FortuneSnapshotPort } from "./fortune-snapshot";
import { kasiSpecialDaysUrl, parseKasiSpecialDaysPage, KASI_SPECIAL_POLICY_REVISION } from "./fortune-special-days.provider";
import { validateFortuneSpecialDays, type FortuneSpecialDay, type FortuneSpecialDayCategory, type FortuneSpecialDaysEnrichment, fortuneKstDate, fortuneMonthDays, localFortuneHoroscope,
  type FortuneCalendarEnrichment, type FortuneHoroscopeEnrichment, type FortuneUnavailableReason,
  type FortunePeriod, type FortuneZodiacId  } from "../../../../../packages/core/src/fortune";
import { Inject, Injectable, Optional } from "@nestjs/common";
import { UPSTASH_COORDINATION_PORT, type UpstashCoordinationPort } from "../../infrastructure/upstash-coordination/upstash-coordination.port";
import { FORTUNE_ENRICHMENT_CONFIG, FORTUNE_ENRICHMENT_RUNTIME, KASI_POLICY_REVISION,
  compareKasiCalendar, horoscopeUrl, kasiCalendarUrl, parseKasiCalendarPage, parseProviderHoroscope, readBoundedProviderBody,
  type FortuneEnrichmentConfig, type FortuneEnrichmentRuntime, type KasiCalendarRow } from "./fortune-enrichment.provider";

type FortuneProvider = "kasi" | "kasi-special" | "free-horoscope";
const providerIdentity = (provider: FortuneProvider) => `fortune-${provider === "kasi-special" ? "kasi" : provider}`;
class ProviderUnavailable extends Error {
  constructor(readonly reason: FortuneUnavailableReason) { super(reason); }
}
@Injectable()
export class FortuneEnrichmentService {
  private readonly cache: FortunePublicCache;
  constructor(
    @Inject(FORTUNE_ENRICHMENT_CONFIG) private readonly config: FortuneEnrichmentConfig,
    @Inject(FORTUNE_ENRICHMENT_RUNTIME) private readonly runtime: FortuneEnrichmentRuntime,
    @Optional() @Inject(UPSTASH_COORDINATION_PORT) private readonly coordination?: UpstashCoordinationPort | null,
    @Optional() @Inject(FORTUNE_SNAPSHOT_PORT) private readonly snapshots?: FortuneSnapshotPort | null,
  ) { this.cache = new FortunePublicCache(config, runtime, coordination, snapshots); }
  capabilities() {
    return { version: 1, base: "local", serviceTimeZone: "Asia/Seoul", paidFallback: false,
      specialDays: { available: !this.blocked("kasi-special"), reason: this.blocked("kasi-special") ?? null },
      refreshConfigured: Boolean(this.config.refreshEnabled && this.snapshots),
      calendar: { available: !this.blocked("kasi"), reason: this.blocked("kasi") ?? null },
      horoscope: { available: !this.blocked("free-horoscope"), reason: this.blocked("free-horoscope") ?? null, translated: false },
      tarotDecks: ["major-22", "full-78"], cacheScope: this.config.snapshotsEnabled ? "shared-postgres-with-l1" : "per-instance", budgetScope: "distributed-utc-day" }; }
  private blocked(provider: FortuneProvider): FortuneUnavailableReason | undefined {
    if (provider === "kasi" && (!this.config.kasiEnabled || !this.config.kasiServiceKey)) return "not-configured";
    if (provider === "free-horoscope") {
      if (!this.config.horoscopeEnabled) return "not-configured";
      if (!this.config.horoscopeRightsApproved || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,95}$/u.test(this.config.horoscopePolicyRevision)) return "rights-pending";
    }
    if (provider === "kasi-special" && (!this.config.specialDaysEnabled || !this.config.specialDaysServiceKey)) return "not-configured";
    if (!this.coordination) return "coordination-unavailable";
    if (this.config.snapshotsEnabled && !this.snapshots) return "provider-unavailable";
    return undefined;
  }
  private async request(provider: FortuneProvider, url: URL): Promise<string> {
    const blocked = this.blocked(provider);
    if (blocked || !this.coordination) throw new ProviderUnavailable(blocked ?? "coordination-unavailable");
    const signal = AbortSignal.timeout(2500);
    try {
      const circuit = await this.coordination.readProviderCircuit({ providerId: providerIdentity(provider) }, { signal });
      if (circuit.state === "open") throw new ProviderUnavailable("provider-unavailable");
      const budget = await this.coordination.consumeProviderBudget({ providerId: providerIdentity(provider), operationId: randomUUID(),
        requestUnits: 1, costUnits: 0, maximumRequestUnits: this.config.dailyRequestLimit, maximumCostUnits: 0, expiryGraceMs: 60000 }, { signal });
      if (!budget.accepted || budget.duplicate) throw new ProviderUnavailable("budget-exhausted");
    } catch (error) { throw error instanceof ProviderUnavailable ? error : new ProviderUnavailable("coordination-unavailable"); }
    const response = await this.runtime.fetch(url, { signal, redirect: "error", headers: { Accept: provider !== "free-horoscope" ? "application/xml" : "application/json" } });
    return readBoundedProviderBody(response);
  }
  private async failure(provider: FortuneProvider, error: unknown): Promise<FortuneUnavailableReason> {
    if (error instanceof ProviderUnavailable) return error.reason;
    try { await this.coordination?.recordProviderFailure({ providerId: providerIdentity(provider), failureThreshold: 3, cooldownMs: 60000, stateTtlMs: 300000 }, { signal: AbortSignal.timeout(1000) }); } catch { /* enrichment remains optional */ }
    // Never log provider bodies or URLs containing the KASI key.
    return "provider-unavailable";
  }
  async calendar(month: string): Promise<FortuneCalendarEnrichment> {
    fortuneMonthDays(month);
    const fallback = (reason: FortuneUnavailableReason): FortuneCalendarEnrichment => ({ kind: "calendar", month, status: "local-fallback", reason, source: "local", checks: [], policyRevision: KASI_POLICY_REVISION });
    const unavailable = this.blocked("kasi");
    if (unavailable) return fallback(unavailable);
    return this.cache.get(`v2:calendar:${month}:${KASI_POLICY_REVISION}`, "fortune-kasi", async () => {
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
  async specialDays(month: string, category: FortuneSpecialDayCategory): Promise<FortuneSpecialDaysEnrichment> {
    if (!validateFortuneSpecialDays(month, category, [])) throw new Error("invalid-special-days-query");
    const fallback = (reason: FortuneUnavailableReason): FortuneSpecialDaysEnrichment => ({ kind: "special-days", month, category,
      status: "local-fallback", reason, source: "local", items: [], policyRevision: KASI_SPECIAL_POLICY_REVISION });
    const unavailable = this.blocked("kasi-special");
    if (unavailable) return fallback(unavailable);
    return this.cache.get(`v2:special-days:${month}:${category}:${KASI_SPECIAL_POLICY_REVISION}`, "fortune-kasi", async () => {
      try {
        const items: FortuneSpecialDay[] = [];
        let total: number | undefined;
        for (let page = 1; page <= 4; page += 1) {
          const parsed = parseKasiSpecialDaysPage(await this.request("kasi-special", kasiSpecialDaysUrl(this.config.specialDaysServiceKey!, month, category, page)), month, category, page);
          if (total !== undefined && total !== parsed.totalCount) throw new Error("changing-special-days-total");
          total = parsed.totalCount;
          items.push(...parsed.items);
          if (items.length >= total) break;
        }
        if (items.length !== total || !validateFortuneSpecialDays(month, category, items)) throw new Error("incomplete-special-days");
        items.sort((a, b) => a.date.localeCompare(b.date) || a.sequence - b.sequence);
        return { kind: "special-days", month, category, status: "external", source: "kasi", items,
          checkedAt: this.runtime.now().toISOString(), policyRevision: KASI_SPECIAL_POLICY_REVISION };
      } catch (error) { return fallback(await this.failure("kasi-special", error)); }
    }, () => fallback("provider-unavailable"));
  }
  async horoscope(sign: FortuneZodiacId, period: FortunePeriod, date: string): Promise<FortuneHoroscopeEnrichment> {
    const local = localFortuneHoroscope(sign, period, date);
    const fallback = (reason: FortuneUnavailableReason): FortuneHoroscopeEnrichment => ({ ...local, status: "local-fallback", reason });
    if (date !== fortuneKstDate(this.runtime.now())) return fallback("historical-request");
    const unavailable = this.blocked("free-horoscope");
    if (unavailable) return fallback(unavailable);
    return this.cache.get(`v2:horoscope:${sign}:${period}:${date}:${this.config.horoscopePolicyRevision}`, "fortune-free-horoscope", async () => {
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
