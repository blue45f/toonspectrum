import { z } from "zod";

import { FORTUNE_SIGNS } from "../../../../../packages/contracts/src/fortune-provenance";

import { fetchFortuneJson, fortuneEndpoint } from "./fortune-provider-network";
import { FortuneService } from "./fortune.service";

import type { FortuneSign, SourcedFortune } from "../../../../../packages/contracts/src/fortune-provenance";

export interface FortuneProviderConfiguration { enabled: boolean; providerId: string; endpoint: string; allowedOrigins: readonly string[]; commercialPermissionVerified: boolean; cachePermissionVerified: boolean; }
// No provider in this repository has confirmed free commercial/cache permission.
export const DISABLED_FORTUNE_PROVIDER: FortuneProviderConfiguration = { enabled: false, providerId: "none", endpoint: "", allowedOrigins: [], commercialPermissionVerified: false, cachePermissionVerified: false };
export const selectedSignSchema = z.strictObject({ sign: z.enum(Object.keys(FORTUNE_SIGNS) as [FortuneSign, ...FortuneSign[]]) });
// Internal normalized fixture contract only. Actual supplier integration (including
// FreeHoroscope {data:{date,period,sign,horoscope}} and its unknown timezone) is
// UNIMPLEMENTED. No supplier/host wiring or commercial approval enables this adapter.
const externalSchema = z.strictObject({ sign: selectedSignSchema.shape.sign, sourceDate: z.iso.date(), timeZone: z.literal("Asia/Seoul"), text: z.string().trim().min(1).max(8000) });
const signDate: Record<FortuneSign, [number, number]> = { aries: [4, 1], taurus: [5, 1], gemini: [6, 1], cancer: [7, 1], leo: [8, 1], virgo: [9, 1], libra: [10, 1], scorpio: [11, 1], sagittarius: [12, 1], capricorn: [1, 1], aquarius: [2, 1], pisces: [3, 1] };
export function fortuneSourceDate(now: number) { return new Date(now + 9 * 3600000).toISOString().slice(0, 10); }
export class FortuneProvenanceProvider {
  private failures = 0;
  private openUntil = 0;
  private readonly cache = new Map<string, { until: number; text: string }>();
  private readonly inFlight = new Map<string, Promise<{ text: string | null; status: SourcedFortune["provenance"]["externalStatus"] }>>();
  constructor(private readonly config = DISABLED_FORTUNE_PROVIDER, private readonly network = fetchFortuneJson, private readonly local = new FortuneService(), private readonly clock = Date.now) {}
  private async external(sign: FortuneSign, date: string) {
    if (!this.config.enabled || !this.config.commercialPermissionVerified || !this.config.cachePermissionVerified) return { text: null, status: "disabled" as const };
    const now = this.clock(), key = `${date}:${sign}`, hit = this.cache.get(key);
    if (hit && hit.until > now) return { text: hit.text, status: "current" as const };
    if (this.openUntil > now) return { text: null, status: "circuit-open" as const };
    const running = this.inFlight.get(key); if (running) return running;
    const task = this.fetch(sign, date, key); this.inFlight.set(key, task);
    try { return await task; } finally { this.inFlight.delete(key); }
  }
  private async fetch(sign: FortuneSign, date: string, key: string) {
    const controller = new AbortController(); let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const url = fortuneEndpoint(this.config.endpoint, this.config.allowedOrigins); url.searchParams.set("sign", sign);
      const response = await Promise.race([this.network(url, controller.signal), new Promise<never>((_, reject) => { timeout = setTimeout(() => { controller.abort(); reject(new Error("provider-timeout")); }, 2000); })]);
      const parsed = externalSchema.safeParse(response);
      if (!parsed.success || parsed.data.sign !== sign || parsed.data.sourceDate !== date) throw new Error("provider-date-or-schema-invalid");
      this.failures = 0; this.openUntil = 0;
      if (this.cache.size >= 24) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(key, { until: this.clock() + 10 * 60000, text: parsed.data.text });
      return { text: parsed.data.text, status: "current" as const };
    } catch {
      this.failures++; if (this.failures >= 3) this.openUntil = this.clock() + 60000;
      return { text: null, status: "unavailable" as const };
    } finally { if (timeout) clearTimeout(timeout); controller.abort(); }
  }
  async read(sign: FortuneSign): Promise<SourcedFortune> {
    const now = this.clock(), sourceDate = fortuneSourceDate(now), external = await this.external(sign, sourceDate);
    const generatedAt = new Date(this.clock()).toISOString();
    if (external.text) return { sign, text: external.text, provenance: { provider: this.config.providerId, source: "external-licensed", sourceDate, timeZone: "Asia/Seoul", generatedAt, status: "external-current", externalStatus: "current" } };
    // Reuse the existing deterministic engine. Representative sign dates are internal constants, never personal dates.
    const result = await this.local.drawZodiac("ara", ...signDate[sign]);
    return { sign, text: result.interpretation, provenance: { provider: "ToonStudio local", source: "local-deterministic", sourceDate: fortuneSourceDate(this.clock()), timeZone: "Asia/Seoul", generatedAt, status: external.status === "disabled" ? "local-default" : "local-after-provider-failure", externalStatus: external.status } };
  }
}
