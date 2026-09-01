import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import {
  isAdminBenchmarkWarmupEnabled,
  normalizeAdminBenchmarkQuery,
  parseIpAddress,
  summarizeAdminBenchmarkSample,
} from "./admin-types";

describe("parseIpAddress", () => {
  it("accepts IPv4 addresses", () => {
    expect(parseIpAddress("192.168.0.1")).toBe("192.168.0.1");
    expect(parseIpAddress(" 8.8.8.8 ")).toBe("8.8.8.8");
  });

  it("accepts IPv6 addresses", () => {
    expect(parseIpAddress("2001:db8::1")).toBe("2001:db8::1");
  });

  it("accepts CIDR ranges", () => {
    expect(parseIpAddress("10.0.0.0/16")).toBe("10.0.0.0/16");
    expect(parseIpAddress("2001:db8::/64")).toBe("2001:db8::/64");
  });

  it("throws on invalid addresses", () => {
    expect(() => parseIpAddress("")).toThrow(BadRequestException);
    expect(() => parseIpAddress("999.1.1.1")).toThrow(BadRequestException);
    expect(() => parseIpAddress("10.0.0.1/33")).toThrow(BadRequestException);
    expect(() => parseIpAddress("2001:db8::/129")).toThrow(BadRequestException);
    expect(() => parseIpAddress("bad-ip")).toThrow(BadRequestException);
  });
});

describe("normalizeAdminBenchmarkQuery", () => {
  it("clamps iterations to 1-10 and defaults invalid values to 3", () => {
    expect(normalizeAdminBenchmarkQuery("0").iterations).toBe(1);
    expect(normalizeAdminBenchmarkQuery("1").iterations).toBe(1);
    expect(normalizeAdminBenchmarkQuery("10").iterations).toBe(10);
    expect(normalizeAdminBenchmarkQuery("99").iterations).toBe(10);
    expect(normalizeAdminBenchmarkQuery("2.7").iterations).toBe(2);
    expect(normalizeAdminBenchmarkQuery("abc").iterations).toBe(3);
    expect(normalizeAdminBenchmarkQuery(undefined).iterations).toBe(3);
  });

  it("parses warmup query flags", () => {
    expect(normalizeAdminBenchmarkQuery("3", "1").warmup).toBe(true);
    expect(normalizeAdminBenchmarkQuery("3", "true").warmup).toBe(true);
    expect(normalizeAdminBenchmarkQuery("3", "0").warmup).toBe(false);
    expect(normalizeAdminBenchmarkQuery("3", undefined).warmup).toBe(false);
  });
});

describe("isAdminBenchmarkWarmupEnabled", () => {
  it("treats a true boolean the same as { warmup: true }", () => {
    expect(isAdminBenchmarkWarmupEnabled(true)).toBe(true);
    expect(isAdminBenchmarkWarmupEnabled({ warmup: true })).toBe(true);
    expect(isAdminBenchmarkWarmupEnabled(false)).toBe(false);
    expect(isAdminBenchmarkWarmupEnabled({ warmup: false })).toBe(false);
    expect(isAdminBenchmarkWarmupEnabled(undefined)).toBe(false);
  });
});

describe("summarizeAdminBenchmarkSample", () => {
  it("reports p99, stddev, and errorRate from the measured attempts", () => {
    const ok = summarizeAdminBenchmarkSample("dashboard_30", [
      { status: "ok", durationMs: 4 },
      { status: "ok", durationMs: 8 },
    ]);
    expect(ok.status).toBe("ok");
    expect(ok.p50Ms).toBe(4);
    expect(ok.p95Ms).toBe(8);
    expect(ok.p99Ms).toBe(8);
    expect(ok.stdDevMs).toBe(2);
    expect(ok.errorRate).toBe(0);

    const partial = summarizeAdminBenchmarkSample("revenue_30_all", [
      { status: "ok", durationMs: 10 },
      { status: "ok", durationMs: 10 },
      { status: "ok", durationMs: 10 },
      { status: "error", durationMs: 1, error: "timeout" },
    ]);
    expect(partial.status).toBe("partial");
    expect(partial.errorRate).toBe(0.25);
    expect(partial.stdDevMs).toBe(0);
    expect(partial.p99Ms).toBe(10);
  });
});
