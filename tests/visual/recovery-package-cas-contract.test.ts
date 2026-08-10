import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

interface BenchmarkArtifact {
  schema: string;
  version: number;
  workload: {
    recoveredSeq: number;
    packageBytes: number;
    attachments: number;
  };
  quality: {
    deterministicExportBytes: boolean;
    digestAndSeqEqual: boolean;
    importedAttachmentHashesVerified: number;
  };
  latency: Record<
    "export" | "importAuthenticate" | "restoreToFreshSqlite",
    { samples: number; p50Ms: number; p95Ms: number; p99Ms: number }
  >;
  memory: {
    measurement: string;
    observedPeakRssDeltaBytes: number;
    observedPeakArrayBuffersDeltaBytes: number;
  };
  hashCandidates: {
    sha256WebCrypto: {
      directRuntimeDependency: boolean;
      incrementalBundleBytes: number;
    };
    blake3WasmCandidate: {
      version: string;
      license: string;
      directRuntimeDependency: boolean;
      browserWasmBytes: number;
    };
  };
  verdict: { selected: string; blake3ReplacementCondition: string };
}

const artifact = JSON.parse(
  readFileSync(
    new URL("../benchmarks/results/recovery-package-cas.json", import.meta.url),
    "utf8",
  ),
) as BenchmarkArtifact;

describe("V12 recovery package CAS benchmark artifact", () => {
  it("pins deterministic SQLite recovery quality and complete latency samples", () => {
    expect(artifact).toMatchObject({
      schema: "toonspectrum.studio-v12-recovery-package-benchmark",
      version: 1,
      quality: {
        deterministicExportBytes: true,
        digestAndSeqEqual: true,
        importedAttachmentHashesVerified: 8,
      },
      workload: { recoveredSeq: 33, attachments: 8 },
    });
    expect(artifact.workload.packageBytes).toBeGreaterThan(1_000_000);
    expect(artifact.latency.export.samples).toBe(30);
    expect(artifact.latency.importAuthenticate.samples).toBe(30);
    expect(artifact.latency.restoreToFreshSqlite.samples).toBe(12);
    for (const metric of Object.values(artifact.latency)) {
      expect(metric.p50Ms).toBeLessThanOrEqual(metric.p95Ms);
      expect(metric.p95Ms).toBeLessThanOrEqual(metric.p99Ms);
    }
  });

  it("keeps memory telemetry honest and selects the zero-bundle compatible hash", () => {
    expect(artifact.memory.measurement).toMatch(/not browser OPFS\/WASM peak/u);
    expect(artifact.memory.observedPeakRssDeltaBytes).toBeGreaterThanOrEqual(0);
    expect(artifact.memory.observedPeakArrayBuffersDeltaBytes).toBeGreaterThanOrEqual(0);
    expect(artifact.hashCandidates.sha256WebCrypto).toMatchObject({
      directRuntimeDependency: true,
      incrementalBundleBytes: 0,
    });
    expect(artifact.hashCandidates.blake3WasmCandidate).toMatchObject({
      version: "2.1.5",
      license: "MIT",
      directRuntimeDependency: false,
      browserWasmBytes: 34_398,
    });
    expect(artifact.verdict.selected).toBe("webcrypto-sha256");
    expect(artifact.verdict.blake3ReplacementCondition.length).toBeGreaterThan(40);
  });
});
