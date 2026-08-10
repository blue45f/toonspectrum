import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  V12_FAULT_MATRIX_TARGETS,
  runV12RuntimeFaultMatrix,
  type V12RuntimeFaultMeasurements,
} from "./v12-runtime-fault-harness";

interface V12RuntimeFaultArtifact {
  readonly schema: string;
  readonly version: number;
  readonly authority: string;
  readonly runner: string;
  readonly measured: V12RuntimeFaultMeasurements;
  readonly simulated: readonly {
    readonly id: string;
    readonly fault: string;
    readonly productionSubjects: readonly string[];
    readonly automation: string;
    readonly proves: string;
    readonly doesNotClaim: string;
  }[];
  readonly externalRequired: readonly {
    readonly id: string;
    readonly status: "required-not-run";
    readonly gate: string;
  }[];
  readonly verdict: {
    readonly automatedStateMachineGate: "pass";
    readonly externalHardwareBrowserGate: "required-not-run";
    readonly releaseGate: "not-satisfied-by-this-artifact-alone";
  };
}

const artifact = JSON.parse(
  readFileSync(
    new URL("../benchmarks/results/v12-runtime-fault-matrix.json", import.meta.url),
    "utf8",
  ),
) as V12RuntimeFaultArtifact;

describe.sequential("V12 runtime fault-injection release matrix", () => {
  it("pins the document targets and keeps simulated evidence separate from external gates", () => {
    expect(V12_FAULT_MATRIX_TARGETS).toEqual({
      deviceLossCycles: 100,
      workerKillCycles: 1_000,
      queueCompletionFlights: 64,
      journalCrashReopens: 64,
    });
    expect(artifact).toMatchObject({
      schema: "toonspectrum-v12-runtime-fault-matrix",
      version: 1,
      verdict: {
        automatedStateMachineGate: "pass",
        externalHardwareBrowserGate: "required-not-run",
        releaseGate: "not-satisfied-by-this-artifact-alone",
      },
    });
    expect(artifact.simulated.map(({ id }) => id)).toEqual([
      "gpu-device-loss",
      "provider-worker-termination",
      "queue-submit-completion-inversion",
      "tab-crash-journal-recovery",
      "storage-quota-write-rejection",
      "corrupt-blob-crc",
      "network-offline-retry-outbox",
    ]);
    expect(artifact.simulated.every(({ doesNotClaim }) => doesNotClaim.length > 0)).toBe(true);
    expect(artifact.externalRequired).toHaveLength(6);
    expect(
      artifact.externalRequired.every(({ status }) => status === "required-not-run"),
    ).toBe(true);
  });

  it(
    "executes the production runtimes/stores at the pinned counts and rejects artifact drift",
    async () => {
      const measured = await runV12RuntimeFaultMatrix();
      expect(measured).toEqual(artifact.measured);
    },
    120_000,
  );
});
