import { afterEach, describe, expect, it, vi } from "vitest";

import { FortuneProvenanceController } from "./fortune-provenance.controller";
import { DISABLED_FORTUNE_PROVIDER, FortuneProvenanceProvider, fortuneSourceDate } from "./fortune-provenance.provider";
import { fortuneEndpoint, publicFortuneAddress } from "./fortune-provider-network";

import type { FortuneService } from "./fortune.service";

const now = Date.parse("2026-09-19T16:00:00Z");
const local = { drawZodiac: vi.fn(async () => ({ interpretation: "기존 무료 로컬 운세" })) } as unknown as FortuneService;
const config = { enabled: true, providerId: "test-fixture", endpoint: "https://fortune.example.com/zodiac", allowedOrigins: ["https://fortune.example.com"], commercialPermissionVerified: true, cachePermissionVerified: true };
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });
describe("fortune provenance and fail-closed provider", () => {
  it("keeps external providers off and labels the actual KST source date", async () => {
    const network = vi.fn(); const service = new FortuneProvenanceProvider(DISABLED_FORTUNE_PROVIDER, network, local, () => now);
    const result = await service.read("aries"); expect(network).not.toHaveBeenCalled();
    expect(result).toMatchObject({ text: "기존 무료 로컬 운세", provenance: { source: "local-deterministic", sourceDate: "2026-09-20", timeZone: "Asia/Seoul", status: "local-default", externalStatus: "disabled" } });
    expect(fortuneSourceDate(Date.parse("2026-09-19T14:59:59Z"))).toBe("2026-09-19");
  });
  it.each([{ commercialPermissionVerified: false }, { cachePermissionVerified: false }])("does not fetch without permission %j", async (permissions) => {
    const network = vi.fn(); const result = await new FortuneProvenanceProvider({ ...config, ...permissions }, network, local, () => now).read("leo");
    expect(result.provenance.externalStatus).toBe("disabled"); expect(network).not.toHaveBeenCalled();
  });
  it("sends only selected zodiac, coalesces and caches bounded validated current text", async () => {
    const network = vi.fn(async (url: URL) => ({ sign: url.searchParams.get("sign"), sourceDate: "2026-09-20", timeZone: "Asia/Seoul", text: "허가된 테스트 자료" }));
    const service = new FortuneProvenanceProvider(config, network, local, () => now);
    const results = await Promise.all([service.read("aries"), service.read("aries")]); await service.read("aries");
    expect(network).toHaveBeenCalledOnce(); expect([...network.mock.calls[0][0].searchParams.keys()]).toEqual(["sign"]);
    expect(results[0].provenance.source).toBe("external-licensed"); expect(local.drawZodiac).not.toHaveBeenCalled();
  });
  it("treats actual FreeHoroscope supplier integration as unimplemented, without inventing a source date/timezone", async () => {
    const network = vi.fn(async () => ({ data: { date: "2026-02-25", period: "daily", sign: "Aries", horoscope: "공급자 원문" } }));
    const result = await new FortuneProvenanceProvider(config, network, local, () => now).read("aries");
    expect(result.provenance).toMatchObject({ source: "local-deterministic", externalStatus: "unavailable" });
    expect(result.text).not.toBe("공급자 원문"); expect(network).toHaveBeenCalledOnce();
  });
  it("rejects stale source dates and opens the circuit after three failures", async () => {
    const network = vi.fn(async () => ({ sign: "aries", sourceDate: "2026-09-18", timeZone: "Asia/Seoul", text: "오래된 자료" }));
    const service = new FortuneProvenanceProvider(config, network, local, () => now);
    for (let i = 0; i < 3; i++) expect((await service.read("aries")).provenance.status).toBe("local-after-provider-failure");
    expect((await service.read("aries")).provenance.externalStatus).toBe("circuit-open"); expect(network).toHaveBeenCalledTimes(3);
  });
  it("returns local failure provenance at the two-second timeout, with no retry", async () => {
    vi.useFakeTimers(); const network = vi.fn(() => new Promise<unknown>(() => {}));
    const pending = new FortuneProvenanceProvider(config, network, local, () => now).read("aries");
    await vi.advanceTimersByTimeAsync(2000);
    expect((await pending).provenance.externalStatus).toBe("unavailable"); expect(network).toHaveBeenCalledOnce();
  });
  it("rejects DOB/name/URL/provider injection at the controller", () => {
    const controller = new FortuneProvenanceController();
    for (const fields of [{ birthDate: "2000-01-01" }, { name: "private" }, { url: "https://evil.com" }, { provider: "paid-ai" }]) expect(() => controller.zodiac({ sign: "aries", ...fields })).toThrow();
  });
  it.each(["127.0.0.1", "10.0.0.1", "169.254.169.254", "192.168.0.1", "100.64.0.1", "::1", "::ffff:127.0.0.1", "fc00::1", "2001:db8::1", "4000::1"])('rejects non-public address %s', (ip) => expect(publicFortuneAddress(ip)).toBe(false));
  it("accepts a public address only behind fixed HTTPS allowlisting", () => {
    expect(publicFortuneAddress("8.8.8.8")).toBe(true);
    for (const url of ["http://fortune.example.com/zodiac", "https://evil.com/a", "https://u:p@fortune.example.com/a", "https://fortune.example.com:8443/a", "https://fortune.example.com/a?birth=secret", "https://localhost/a"]) expect(() => fortuneEndpoint(url, config.allowedOrigins)).toThrow();
  });
});
