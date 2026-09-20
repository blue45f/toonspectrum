import { vi } from "vitest";

import { fortuneEnrichmentConfig } from "../src/modules/fortune/fortune-enrichment.provider";
import { fortuneSnapshotKey } from "../src/modules/fortune/fortune-snapshot";

import type { FortuneSnapshotPort, FortunePublicSnapshot } from "../src/modules/fortune/fortune-snapshot";

export const followupNow = () => new Date("2026-09-20T01:00:00.000Z");
export const followupConfig = fortuneEnrichmentConfig({ FORTUNE_KASI_SPECIAL_DAYS_ENABLED: "true", FORTUNE_KASI_SPECIAL_SERVICE_KEY: "protocol-fixture-key" });
export const specialItem = (date = "20240917", sequence = 1, kind = "01") => `<item><locdate>${date}</locdate><seq>${sequence}</seq><dateKind>${kind}</dateKind><dateName>테스트 휴일</dateName><isHoliday>Y</isHoliday></item>`;
export const specialXml = (items = specialItem(), total = 1, page = 1) => `<response><header><resultCode>00</resultCode></header><body><pageNo>${page}</pageNo><totalCount>${total}</totalCount><items>${items}</items></body></response>`;
export function followupCoordination() {
  return { readProviderCircuit: vi.fn().mockResolvedValue({ state: "closed" }), closeProviderCircuit: vi.fn().mockResolvedValue({ state: "closed" }),
    recordProviderFailure: vi.fn().mockResolvedValue({ state: "closed" }), consumeProviderBudget: vi.fn().mockResolvedValue({ accepted: true, duplicate: false }),
    acquireLease: vi.fn().mockResolvedValue({ acquired: true }), renewLease: vi.fn().mockResolvedValue({ matched: true }), releaseLease: vi.fn().mockResolvedValue({ matched: true }) };
}
export class FixtureSnapshots implements FortuneSnapshotPort {
  readonly rows = new Map<string, FortunePublicSnapshot>();
  get = vi.fn(async (key: string, now: Date) => { const value = this.rows.get(key); return value && Date.parse(value.expiresAt) > now.getTime() ? structuredClone(value) : null; });
  put = vi.fn(async (value: FortunePublicSnapshot) => { this.rows.set(fortuneSnapshotKey(value), structuredClone(value)); });
  prune = vi.fn(async () => undefined);
}
