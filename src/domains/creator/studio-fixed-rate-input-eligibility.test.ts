import { describe, expect, it } from "vitest";

import {
  isStudioFixedRateInputEligible,
  type StudioFixedRateInputEligibility,
} from "./studio-fixed-rate-input-eligibility";

const STANDARD_PEN: StudioFixedRateInputEligibility = {
  stabilizerMode: "standard",
  stabilizerStrength: 0,
  drawMode: "pen",
  brushFamily: "pen",
};

describe("studio fixed-rate input eligibility", () => {
  it.each([
    {
      name: "ordinary pen with stabilizer strength zero",
      input: STANDARD_PEN,
    },
    {
      name: "ordinary marker with a filtered stabilizer strength",
      input: { ...STANDARD_PEN, stabilizerStrength: 3.4, brushFamily: "marker" },
    },
    {
      name: "causal watercolor v2",
      input: {
        ...STANDARD_PEN,
        brushFamily: "watercolor",
        causalWatercolorV2: true,
      },
    },
    {
      name: "causal stamp v2 from a specialty family",
      input: {
        ...STANDARD_PEN,
        brushFamily: "airbrush",
        causalStampV2: true,
      },
    },
    {
      name: "eraser",
      input: {
        ...STANDARD_PEN,
        drawMode: "eraser",
        brushFamily: "other",
      },
    },
  ])("accepts $name", ({ input }) => {
    expect(isStudioFixedRateInputEligible(input)).toBe(true);
  });

  it.each([
    {
      name: "adaptive pen",
      input: { ...STANDARD_PEN, stabilizerMode: "adaptive" },
    },
    {
      name: "precision pen",
      input: { ...STANDARD_PEN, stabilizerMode: "precision" },
    },
    {
      name: "shape",
      input: { ...STANDARD_PEN, drawMode: "shape" },
    },
    {
      name: "pixel pencil",
      input: { ...STANDARD_PEN, drawMode: "pixel" },
    },
    {
      name: "lasso fill",
      input: { ...STANDARD_PEN, drawMode: "lasso-fill" },
    },
    {
      name: "whole-stroke dynamics pen",
      input: { ...STANDARD_PEN, hasBrushDynamics: true },
    },
    {
      name: "dynamics eraser fails closed too",
      input: {
        ...STANDARD_PEN,
        drawMode: "eraser",
        hasBrushDynamics: true,
      },
    },
    {
      name: "legacy watercolor",
      input: { ...STANDARD_PEN, brushFamily: "watercolor" },
    },
    {
      name: "unversioned specialty stamp",
      input: { ...STANDARD_PEN, brushFamily: "airbrush" },
    },
    {
      name: "causal watercolor flag on the wrong family",
      input: {
        ...STANDARD_PEN,
        brushFamily: "oil",
        causalWatercolorV2: true,
      },
    },
    {
      name: "unknown stabilizer mode",
      input: { ...STANDARD_PEN, stabilizerMode: "future-mode" },
    },
    {
      name: "unknown draw mode",
      input: { ...STANDARD_PEN, drawMode: "future-tool" },
    },
  ])("rejects $name", ({ input }) => {
    expect(isStudioFixedRateInputEligible(input)).toBe(false);
  });

  it("lets dynamics exclusion override every causal capability flag", () => {
    expect(isStudioFixedRateInputEligible({
      ...STANDARD_PEN,
      brushFamily: "watercolor",
      causalStampV2: true,
      causalWatercolorV2: true,
      hasBrushDynamics: true,
    })).toBe(false);
  });
});
