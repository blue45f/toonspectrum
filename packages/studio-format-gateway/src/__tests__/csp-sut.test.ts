import { evaluateDynamicMapping } from "@toonspectrum/studio-project-model";
import { describe, expect, it } from "vitest";

import {
  buildAuthoredSutFixture,
  buildPressureGraph,
  readAuthoredSutWithNodeSqlite,
} from "../../../../tests/corpus/formats/csp-sut-fixtures";
import {
  CspToolFileError,
  importCspToolFile,
  inspectCspToolFile,
  parseCspPressureGraph,
} from "../csp-sut";

function base64Bytes(base64: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64, "base64"));
}

function mutationOffsets(byteLength: number, count: number): number[] {
  const offsets = new Set<number>();
  let state = 0x7d_29_41_b3;
  while (offsets.size < Math.min(count, byteLength)) {
    state = (Math.imul(state, 1_103_515_245) + 12_345) >>> 0;
    offsets.add(state % byteLength);
  }
  return [...offsets];
}

describe("CSP pressure-graph clean-room subset", () => {
  it("decodes the explicit v1 big-endian header and finite normalized taps", () => {
    const bytes = buildPressureGraph([0, 0.1, 0.4, 0.75, 1]);
    expect(parseCspPressureGraph(bytes)).toEqual({
      version: 1,
      count: 5,
      stride: 8,
      curve: [0, 0.1, 0.4, 0.75, 1],
    });
  });

  it("rejects version, stride/length, reserved words, non-finite, and out-of-range taps", () => {
    expect(() => parseCspPressureGraph(buildPressureGraph([0, 1], 2))).toThrow(/version 2/u);
    expect(() => parseCspPressureGraph(buildPressureGraph([0, 1]).slice(0, -1))).toThrow(
      /shorter|length/u,
    );
    const reserved = buildPressureGraph([0, 1]);
    new DataView(reserved.buffer).setUint32(12, 1, false);
    expect(() => parseCspPressureGraph(reserved)).toThrow(/reserved/u);
    const nan = buildPressureGraph([0, 1]);
    new DataView(nan.buffer).setFloat64(28, Number.NaN, false);
    expect(() => parseCspPressureGraph(nan)).toThrow(/outside/u);
    const high = buildPressureGraph([0, 1.1]);
    expect(() => parseCspPressureGraph(high)).toThrow(/outside/u);
  });
});

describe("SUT/SUTG preserve-first importer", () => {
  it("recognizes the real SQLite header and preserves without a semantic reader", async () => {
    const bytes = buildAuthoredSutFixture();
    const inspection = inspectCspToolFile(bytes);
    expect(inspection).toMatchObject({
      container: "sqlite3",
      pageSize: 4096,
      schemaFormat: 4,
      textEncoding: "utf-8",
      userVersion: 12,
      applicationId: 0x54535453,
    });
    const result = await importCspToolFile(bytes, { kind: "sut" });
    expect(result.supportLevel).toBe("preserve-only");
    expect(result.programs).toEqual([]);
    expect(result.unsupported).toContainEqual(
      expect.objectContaining({ code: "sut-sqlite-reader-unavailable" }),
    );
    expect(base64Bytes(result.sourcePayload.base64)).toEqual(bytes);
  });

  it("lowers only verified brush fields, keeps rights, and surfaces every other column", async () => {
    const bytes = buildAuthoredSutFixture();
    const result = await importCspToolFile(bytes, {
      kind: "sut",
      sqliteReader: readAuthoredSutWithNodeSqlite,
    });
    expect(result.supportLevel).toBe("structured-partial");
    expect(result.programs).toHaveLength(1);
    const program = result.programs[0]!;
    expect(program).toMatchObject({
      name: "Authored CSP Ink",
      stabilizer: { strength: 0.42 },
      tip: { hardness: 0.82, spacingPct: 12 },
      output: { target: "raster-tiles", bake: "flatten" },
      providerPreference: ["hokusai-natural-media"],
    });
    expect(program.sizeDynamics).toHaveLength(2);
    expect(program.flowDynamics).toHaveLength(2);
    expect(program.sizeDynamics[1]?.curve).toEqual([0.05, 0.18, 0.42, 0.72, 1]);
    expect(result.rights).toEqual({
      authors: ["ToonSpectrum QA"],
      licenses: ["CC0-1.0"],
      websites: ["https://example.invalid/toonspectrum"],
      emails: ["qa@example.invalid"],
    });
    expect(result.unsupported).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "sut-column-unmapped", message: expect.stringContaining("FutureCspField") }),
        expect.objectContaining({ code: "sut-material-link-unverified" }),
      ]),
    );
    expect(result.assets).toHaveLength(1);
    expect(result.assets[0]).toMatchObject({ mimeType: "image/png", width: 1, height: 1 });
    expect(base64Bytes(program.sourcePayload?.base64 ?? "")).toEqual(bytes);
  });

  it("preserves group order and produces deterministic, unique SUTG programs", async () => {
    const bytes = buildAuthoredSutFixture({ group: true });
    const first = await importCspToolFile(bytes, {
      kind: "sutg",
      sqliteReader: readAuthoredSutWithNodeSqlite,
    });
    const second = await importCspToolFile(bytes, {
      kind: "sutg",
      sqliteReader: readAuthoredSutWithNodeSqlite,
    });
    expect(first.programs.map((program) => program.name)).toEqual([
      "Authored CSP Ink",
      "Authored CSP Wash",
    ]);
    expect(new Set(first.programs.map((program) => program.id)).size).toBe(2);
    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("retains pressure precision as a monotone high-correlation IR curve", async () => {
    const result = await importCspToolFile(buildAuthoredSutFixture(), {
      kind: "sut",
      sqliteReader: readAuthoredSutWithNodeSqlite,
    });
    const pressure = result.programs[0]?.sizeDynamics.find(
      (mapping) => mapping.input === "pressure",
    );
    expect(pressure).toBeDefined();
    const sampled = Array.from({ length: 101 }, (_, index) =>
      evaluateDynamicMapping(pressure!, index / 100),
    );
    for (let index = 1; index < sampled.length; index += 1) {
      expect(sampled[index]).toBeGreaterThanOrEqual(sampled[index - 1] ?? 0);
    }
    const input = sampled.map((_, index) => index / 100);
    const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    const meanInput = mean(input);
    const meanSample = mean(sampled);
    let covariance = 0;
    let varianceInput = 0;
    let varianceSample = 0;
    for (let index = 0; index < input.length; index += 1) {
      const left = (input[index] ?? 0) - meanInput;
      const right = (sampled[index] ?? 0) - meanSample;
      covariance += left * right;
      varianceInput += left * left;
      varianceSample += right * right;
    }
    expect(covariance / Math.sqrt(varianceInput * varianceSample)).toBeGreaterThan(0.98);
  });

  it("surfaces an unknown pressure graph version instead of guessing", async () => {
    const result = await importCspToolFile(
      buildAuthoredSutFixture({ pressureVersion: 9 }),
      { kind: "sut", sqliteReader: readAuthoredSutWithNodeSqlite },
    );
    expect(result.programs).toHaveLength(1);
    expect(result.programs[0]?.sizeDynamics.filter((mapping) => mapping.input === "pressure"))
      .toEqual([]);
    expect(result.unsupported).toContainEqual(
      expect.objectContaining({
        code: "sut-pressure-graph-unsupported",
        message: expect.stringContaining("version 9"),
      }),
    );
  });

  it("preserves opaque/truncated variants and fails closed on adapter limits", async () => {
    const opaque = Uint8Array.from([0x53, 0x55, 0x54, 0x00, 1, 2, 3]);
    const opaqueResult = await importCspToolFile(opaque, { kind: "sut" });
    expect(opaqueResult).toMatchObject({
      supportLevel: "preserve-only",
      inspection: { container: "opaque" },
    });
    expect(opaqueResult.unsupported).toContainEqual(
      expect.objectContaining({ code: "sut-container-unverified" }),
    );

    const valid = buildAuthoredSutFixture();
    const truncated = await importCspToolFile(valid.slice(0, 60), { kind: "sut" });
    expect(truncated.unsupported).toContainEqual(
      expect.objectContaining({ code: "sqlite-header-truncated" }),
    );

    const limited = await importCspToolFile(valid, {
      kind: "sut",
      sqliteReader: readAuthoredSutWithNodeSqlite,
      limits: { maxRows: 0 },
    });
    expect(limited.supportLevel).toBe("preserve-only");
    expect(limited.unsupported).toContainEqual(
      expect.objectContaining({ code: "sut-sqlite-read-failed" }),
    );
  });

  it("has a deterministic authored SQLite corpus and rejects source/abort violations", async () => {
    expect(buildAuthoredSutFixture()).toEqual(buildAuthoredSutFixture());
    const bytes = buildAuthoredSutFixture();
    await expect(
      importCspToolFile(bytes, { kind: "sut", limits: { maxBytes: 100 } }),
    ).rejects.toMatchObject({ code: "source-too-large" } satisfies Partial<CspToolFileError>);

    const controller = new AbortController();
    controller.abort();
    await expect(
      importCspToolFile(bytes, { kind: "sut", signal: controller.signal }),
    ).rejects.toMatchObject({ code: "aborted" } satisfies Partial<CspToolFileError>);
  });

  it("preserves every deterministic SQLite byte mutation or reports a bounded read failure", async () => {
    const valid = buildAuthoredSutFixture({ group: true });
    for (const offset of mutationOffsets(valid.byteLength, 48)) {
      const mutated = valid.slice();
      mutated[offset] = (mutated[offset] ?? 0) ^ 0x5a;
      const result = await importCspToolFile(mutated, {
        kind: "sutg",
        sqliteReader: readAuthoredSutWithNodeSqlite,
      });
      expect(base64Bytes(result.sourcePayload.base64), `mutation at byte ${offset}`).toEqual(mutated);
      expect(["preserve-only", "structured-partial"]).toContain(result.supportLevel);
      if (result.supportLevel === "preserve-only") {
        expect(result.unsupported.length).toBeGreaterThan(0);
      }
    }
  });
});
