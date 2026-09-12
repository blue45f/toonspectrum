import { describe, expect, it } from "vitest";

import {
  createBrushStudioV6Program,
  patchBrushStudioV6Input,
  patchBrushStudioV6Tuning,
} from "./brush-studio-v6-engine";
import {
  brushStudioV6ExperimentFields,
  compareBrushStudioV6Programs,
  createBrushStudioV6EditHistory,
  createBrushStudioV6ExperimentSamples,
  parseBrushStudioV6Import,
  reduceBrushStudioV6EditHistory,
} from "./brush-studio-v6-experiments";

describe("V6 reversible material experiments", () => {
  it("coalesces a slider gesture, preserves separate gestures and branches safely after undo", () => {
    const baseline = createBrushStudioV6Program("oil-hair-mixer");
    let history = createBrushStudioV6EditHistory(baseline);
    for (const flow of [0.2, 0.3, 0.4]) history = reduceBrushStudioV6EditHistory(history,
      { type: "edit", program: patchBrushStudioV6Tuning(history.present, { flow }), group: "flow" });
    expect(history.past).toHaveLength(1);
    history = reduceBrushStudioV6EditHistory(history, { type: "end-group" });
    history = reduceBrushStudioV6EditHistory(history,
      { type: "edit", program: patchBrushStudioV6Tuning(history.present, { flow: 0.8 }), group: "flow" });
    expect(history.past).toHaveLength(2);
    history = reduceBrushStudioV6EditHistory(history, { type: "undo" });
    expect(history.present.tuning.flow).toBe(0.4);
    history = reduceBrushStudioV6EditHistory(history, { type: "undo" });
    expect(history.present).toEqual(baseline);
    history = reduceBrushStudioV6EditHistory(history, { type: "redo" });
    expect(history.present.tuning.flow).toBe(0.4);
    history = reduceBrushStudioV6EditHistory(history,
      { type: "edit", program: patchBrushStudioV6Input(history.present, { pressureGamma: 1.8 }) });
    expect(history.future).toHaveLength(0);
    expect(reduceBrushStudioV6EditHistory(history, { type: "redo" })).toBe(history);
  });

  it("restores the complete reference including input policy and seed without losing the candidate", () => {
    const baseline = createBrushStudioV6Program("mineral-bloom");
    const candidate = createBrushStudioV6Program("oil-hair-mixer");
    let history = createBrushStudioV6EditHistory(candidate);
    history = reduceBrushStudioV6EditHistory(history, { type: "edit", program: baseline });
    expect(history.present).toEqual(baseline);
    expect(reduceBrushStudioV6EditHistory(history, { type: "undo" }).present).toEqual(candidate);
    expect(compareBrushStudioV6Programs(baseline, candidate).some((difference) => difference.path === "slots.physics")).toBe(true);
    expect(compareBrushStudioV6Programs(baseline, baseline)).toEqual([]);
  });

  it("sweeps exactly one physical setting while locking the path seed, input and all engine slots", () => {
    const baseline = createBrushStudioV6Program("mineral-bloom");
    const field = brushStudioV6ExperimentFields(baseline).find((entry) => entry.key === "wetness")!;
    const samples = createBrushStudioV6ExperimentSamples(baseline, field);
    expect(samples).toHaveLength(3);
    expect(samples[0]!.value).toBeLessThan(baseline.tuning.wetness);
    expect(samples[1]!.program).toEqual(baseline);
    expect(samples[2]!.value).toBeGreaterThan(baseline.tuning.wetness);
    for (const sample of [samples[0]!, samples[2]!]) {
      expect(compareBrushStudioV6Programs(baseline, sample.program).map((entry) => entry.path)).toEqual(["tuning.wetness"]);
      expect(sample.program.seed).toBe(baseline.seed);
      expect(sample.program.input).toEqual(baseline.input);
      expect(sample.program.slots).toEqual(baseline.slots);
    }
  });

  it("bounds extreme experiments and excludes parameters without an active material source", () => {
    const ink = patchBrushStudioV6Tuning(createBrushStudioV6Program(), { flow: 1 });
    const fields = brushStudioV6ExperimentFields(ink);
    expect(fields.some((field) => field.key === "wetness")).toBe(false);
    expect(fields.some((field) => field.key === "bristleStrands")).toBe(false);
    const samples = createBrushStudioV6ExperimentSamples(ink, fields.find((field) => field.key === "flow")!);
    expect(samples[2]!.value).toBe(1);
    expect(samples.every((sample) => Number.isFinite(sample.value))).toBe(true);
  });

  it("refuses unrelated and future JSON instead of resetting the brush through default normalization", () => {
    for (const source of ["null", "[]", "{}", '{"schemaVersion":7,"slots":{},"tuning":{}}', '{"kind":"unrelated","program":{}}']) {
      expect(() => parseBrushStudioV6Import(source)).toThrow();
    }
    const program = createBrushStudioV6Program("wax-resist");
    expect(parseBrushStudioV6Import(JSON.stringify(program))).toEqual(program);
    expect(parseBrushStudioV6Import(JSON.stringify({ kind: "toonspectrum.brush-program-v6", program }))).toEqual(program);
  });
});
