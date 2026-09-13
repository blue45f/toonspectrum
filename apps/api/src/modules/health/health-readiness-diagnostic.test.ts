import { Logger, ServiceUnavailableException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HealthController } from "./health.controller";
import { createReadinessFailureReporter, databaseTargetFingerprint } from "./health-readiness-diagnostic";

import type { HealthReadinessReport } from "./health.service";

const databaseUrl = "postgresql://runtime:DO_NOT_LOG_PASSWORD@ep-test.example/neondb?sslmode=require";
const unready = (): HealthReadinessReport => ({
  ready: false, database: true, schema: false, realtime: true,
  objectStorage: true, coordination: true, durableQueueExecutor: true,
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("private readiness diagnostics", () => {
  it("identifies the target independently of password rotation and TLS options", () => {
    const first = databaseTargetFingerprint(databaseUrl);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(databaseTargetFingerprint(databaseUrl.replace("DO_NOT_LOG_PASSWORD", "rotated").replace("sslmode=require", "sslmode=verify-full&channel_binding=require"))).toBe(first);
    expect(databaseTargetFingerprint(databaseUrl.replace("ep-test.", "ep-test-pooler."))).toBe(first);
  });

  it.each([
    ["ep-test.example", "other.example"], ["/neondb", "/another"], ["runtime:", "another:"],
  ])("distinguishes target field %s", (from, to) => {
    expect(databaseTargetFingerprint(databaseUrl.replace(from, to))).not.toBe(databaseTargetFingerprint(databaseUrl));
  });

  it.each([undefined, "bad", "https://example.com/db", "postgres://host/", "postgres://user:pw@host/%E0", `${databaseUrl}&host=other.example`, `${databaseUrl}&ho%73t=other.example`])("fails closed for an invalid or ambiguous target: %s", (raw) => {
    expect(databaseTargetFingerprint(raw)).toBeNull();
  });

  it("logs only failed check names and a non-secret fingerprint", () => {
    const write = vi.fn();
    const report = unready();
    const before = structuredClone(report);
    createReadinessFailureReporter(write)(report, databaseUrl);
    const message = String(write.mock.calls[0]?.[0]);
    expect(JSON.parse(message)).toEqual({
      event: "service_readiness_failed", failedChecks: ["schema"],
      databaseTargetFingerprint: databaseTargetFingerprint(databaseUrl),
    });
    expect(message).not.toMatch(/DO_NOT_LOG_PASSWORD|postgresql:|runtime:|ep-test|sslmode/);
    expect(report).toEqual(before);
  });

  it("bounds identical failures and logs a new failure after recovery", () => {
    const write = vi.fn();
    let now = 0;
    const report = createReadinessFailureReporter(write, () => now);
    report(unready(), databaseUrl);
    now = 59_999; report(unready(), databaseUrl);
    expect(write).toHaveBeenCalledTimes(1);
    now = 60_000; report(unready(), databaseUrl);
    expect(write).toHaveBeenCalledTimes(2);
    report({ ...unready(), ready: true, schema: true }, databaseUrl);
    expect(write).toHaveBeenCalledTimes(2);
    report(unready(), databaseUrl);
    expect(write).toHaveBeenCalledTimes(3);
  });

  it("reports a changed failing dependency without waiting for the old interval", () => {
    const write = vi.fn();
    const report = createReadinessFailureReporter(write, () => 0);
    report(unready(), databaseUrl);
    report({ ...unready(), database: false }, databaseUrl);
    expect(write).toHaveBeenCalledTimes(2);
  });

  it("does not let a logging sink change the readiness result", () => {
    const report = createReadinessFailureReporter(() => { throw new Error("logger unavailable"); });
    expect(() => report(unready(), databaseUrl)).not.toThrow();
  });

  it("keeps the public 503 generic while emitting the private diagnostic", async () => {
    vi.stubEnv("DATABASE_URL", databaseUrl);
    const write = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const controller = new HealthController({ checkReadiness: async () => unready() } as never);
    const error: unknown = await controller.ready().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as ServiceUnavailableException).getResponse()).toEqual({
      statusCode: 503, status: "not_ready", error: "service_not_ready", message: "Service is not ready",
    });
    expect(write).toHaveBeenCalledTimes(1);
    expect(String(write.mock.calls[0]?.[0])).not.toContain("DO_NOT_LOG_PASSWORD");
    expect(JSON.stringify((error as ServiceUnavailableException).getResponse())).not.toMatch(/fingerprint|schema|DO_NOT_LOG_PASSWORD/);
  });
});
