import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  buildAbrFile,
  buildComputedAbr,
  buildComputedBody,
  buildSampledAbr,
  buildSampledBody,
  radialTipAlpha,
} from "../../../../tests/corpus/brushes/abr/synthetic-abr";
import { AbrParseError } from "../abr";
import {
  AbrPreviewError,
  abrBrushToTipMask,
  decodeAbrPreviewBrushes,
  renderAbrStrokePreview,
} from "../abr-preview";

import type { AbrPreviewBrush, AbrTipMask } from "../abr-preview";

function onlyBrush(bytes: Uint8Array): AbrPreviewBrush {
  const decoded = decodeAbrPreviewBrushes(bytes);
  expect(decoded.brushes).toHaveLength(1);
  const brush = decoded.brushes[0];
  if (brush === undefined) {
    throw new Error("fixture decoded to no brushes");
  }
  return brush;
}

function maskAlphaAt(mask: AbrTipMask, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= mask.width || y >= mask.height) {
    return 0;
  }
  return mask.alpha[y * mask.width + x] ?? 0;
}

/** Alpha profile along +x from the mask center to the right edge. */
function centerRowProfile(mask: AbrTipMask): number[] {
  const row = Math.floor(mask.height / 2);
  const start = Math.floor(mask.width / 2);
  const profile: number[] = [];
  for (let x = start; x < mask.width; x += 1) {
    profile.push(maskAlphaAt(mask, x, row));
  }
  return profile;
}

function expectMonotoneNonIncreasing(profile: number[], label: string): void {
  for (let index = 1; index < profile.length; index += 1) {
    expect(
      profile[index] ?? 0,
      `${label}: profile rose at offset ${index} (${profile.join(",")})`,
    ).toBeLessThanOrEqual(profile[index - 1] ?? 0);
  }
}

/** Pixels whose RGB differs from the white background by more than 8/255. */
function inkPixels(
  pixels: Uint8Array,
  width: number,
  height: number,
  xFrom: number,
  xTo: number,
): number {
  let ink = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = xFrom; x < xTo; x += 1) {
      const base = (y * width + x) * 4;
      if (
        Math.abs((pixels[base] ?? 255) - 255) > 8 ||
        Math.abs((pixels[base + 1] ?? 255) - 255) > 8 ||
        Math.abs((pixels[base + 2] ?? 255) - 255) > 8
      ) {
        ink += 1;
      }
    }
  }
  return ink;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

const COMPUTED_V2 = buildComputedAbr({
  version: 2,
  name: "G-Pen Oval",
  spacingPct: 25,
  angleDeg: 0,
  roundness: 50,
  diameterPx: 32,
});

const SAMPLED_TIP = { width: 16, height: 12, alpha: radialTipAlpha(16, 12) };

describe("abrBrushToTipMask — computed analytic ellipse", () => {
  it("builds an opaque-core mask whose axes honor roundness", () => {
    const mask = abrBrushToTipMask(onlyBrush(COMPUTED_V2));
    // roundness 50 → ry = rx/2, so the bounding box is ~2:1 (angle 0).
    expect(mask.width / mask.height).toBeGreaterThan(1.6);
    expect(mask.width / mask.height).toBeLessThan(2.4);
    // Center of the hard (h = 1 default) tip is fully opaque.
    expect(
      maskAlphaAt(mask, Math.floor(mask.width / 2), Math.floor(mask.height / 2)),
    ).toBe(255);
    // Well inside the nominal rx = 16 the tip is still solid.
    expect(
      maskAlphaAt(mask, Math.floor(mask.width / 2) + 12, Math.floor(mask.height / 2)),
    ).toBeGreaterThan(200);
    // Corners sit outside the ρcut ellipse.
    expect(maskAlphaAt(mask, 0, 0)).toBe(0);
    expect(maskAlphaAt(mask, mask.width - 1, mask.height - 1)).toBe(0);
    expectMonotoneNonIncreasing(centerRowProfile(mask), "hard ellipse");
  });

  it("rotates the ellipse: 90° swaps the bounding box", () => {
    const rotated = abrBrushToTipMask(
      onlyBrush(
        buildComputedAbr({
          version: 2,
          spacingPct: 25,
          angleDeg: 90,
          roundness: 50,
          diameterPx: 32,
        }),
      ),
    );
    expect(rotated.height).toBeGreaterThan(rotated.width);
  });

  it("maps hardness to Gaussian width: softer tips widen the skirt, all profiles monotone", () => {
    const brush = onlyBrush(
      buildComputedAbr({ version: 2, spacingPct: 25, roundness: 100, diameterPx: 32 }),
    );
    const hard = abrBrushToTipMask(brush, { hardness: 1 });
    const medium = abrBrushToTipMask(brush, { hardness: 0.5 });
    const soft = abrBrushToTipMask(brush, { hardness: 0 });
    // ρcut = h + σ·√(2·ln 255) grows as hardness falls → so does the canvas.
    expect(soft.width).toBeGreaterThan(medium.width);
    expect(medium.width).toBeGreaterThan(hard.width);
    for (const [label, mask] of [
      ["hard", hard],
      ["medium", medium],
      ["soft", soft],
    ] as const) {
      expectMonotoneNonIncreasing(centerRowProfile(mask), label);
    }
    // At a fixed physical offset past the nominal radius (ρ = 1.4) the soft
    // Gaussian skirt still carries ink while the hard tip has cut off.
    const offset = Math.round(1.4 * 16);
    const softRim = maskAlphaAt(
      soft,
      Math.floor(soft.width / 2) + offset,
      Math.floor(soft.height / 2),
    );
    const hardRim = maskAlphaAt(
      hard,
      Math.floor(hard.width / 2) + offset,
      Math.floor(hard.height / 2),
    );
    expect(softRim).toBeGreaterThan(hardRim);
    expect(hardRim).toBe(0);
  });
});

describe("sampled tips (type 2 decode)", () => {
  it("v1 raw: bitmap alpha passes through byte-for-byte", () => {
    const brush = onlyBrush(
      buildSampledAbr({ version: 1, compress: 0, ...SAMPLED_TIP }),
    );
    expect(brush.kind).toBe("sampled");
    if (brush.kind !== "sampled") {
      return;
    }
    expect(brush.width).toBe(SAMPLED_TIP.width);
    expect(brush.height).toBe(SAMPLED_TIP.height);
    const mask = abrBrushToTipMask(brush);
    expect(Buffer.from(mask.alpha).equals(Buffer.from(SAMPLED_TIP.alpha))).toBe(true);
  });

  it("v2 PackBits RLE decodes identically to raw and keeps the name", () => {
    const raw = onlyBrush(
      buildSampledAbr({ version: 2, name: "Chalk 16", compress: 0, ...SAMPLED_TIP }),
    );
    const rle = onlyBrush(
      buildSampledAbr({ version: 2, name: "Chalk 16", compress: 1, ...SAMPLED_TIP }),
    );
    if (raw.kind !== "sampled" || rle.kind !== "sampled") {
      throw new Error("sampled fixtures decoded to a non-sampled brush");
    }
    expect(rle.name).toBe("Chalk 16");
    expect(Buffer.from(rle.alpha).equals(Buffer.from(raw.alpha))).toBe(true);
    expect(Buffer.from(rle.alpha).equals(Buffer.from(SAMPLED_TIP.alpha))).toBe(true);
  });

  it("refuses non-8-bit depth and unknown compression loudly", () => {
    const deep = buildSampledAbr({ version: 1, depth: 16, ...SAMPLED_TIP });
    let caught: unknown;
    try {
      decodeAbrPreviewBrushes(deep);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AbrPreviewError);
    expect((caught as AbrPreviewError).code).toBe("unsupported-depth");

    const weird = buildSampledAbr({ version: 1, compress: 2, ...SAMPLED_TIP });
    caught = undefined;
    try {
      decodeAbrPreviewBrushes(weird);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AbrPreviewError);
    expect((caught as AbrPreviewError).code).toBe("unsupported-compression");
  });
});

describe("decodeAbrPreviewBrushes container behavior", () => {
  it("keeps the v6+ refusal from the parser intact", () => {
    const v6 = new Uint8Array([0x00, 0x06, 0x00, 0x02]);
    let caught: unknown;
    try {
      decodeAbrPreviewBrushes(v6);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AbrParseError);
    expect((caught as AbrParseError).code).toBe("unsupported-version");
  });

  it("decodes mixed files and reports records without a preview lane", () => {
    const mixed = buildAbrFile(2, [
      {
        typeCode: 1,
        body: buildComputedBody({ version: 2, name: "Round", diameterPx: 24 }),
      },
      {
        typeCode: 2,
        body: buildSampledBody({ version: 2, name: "Grain", ...SAMPLED_TIP }),
      },
      { typeCode: 3, body: Uint8Array.of(1, 2, 3, 4) },
    ]);
    const decoded = decodeAbrPreviewBrushes(mixed);
    expect(decoded.brushes.map((brush) => brush.kind)).toEqual([
      "computed",
      "sampled",
    ]);
    expect(decoded.warnings).toHaveLength(1);
    expect(decoded.warnings[0]).toContain("type 3");
  });
});

describe("renderAbrStrokePreview", () => {
  const strokeBrush = onlyBrush(
    buildComputedAbr({ version: 2, spacingPct: 25, roundness: 100, diameterPx: 20 }),
  );

  it("is deterministic: two runs hash identically", () => {
    const first = renderAbrStrokePreview(strokeBrush);
    const second = renderAbrStrokePreview(strokeBrush);
    expect(sha256(first.pixels)).toBe(sha256(second.pixels));
  });

  it("ink area grows along the pressure ramp (size ∝ pressure)", () => {
    const result = renderAbrStrokePreview(strokeBrush);
    const half = Math.floor(result.width / 2);
    const firstHalf = inkPixels(result.pixels, result.width, result.height, 0, half);
    const secondHalf = inkPixels(
      result.pixels,
      result.width,
      result.height,
      half,
      result.width,
    );
    expect(firstHalf).toBeGreaterThan(0);
    expect(secondHalf).toBeGreaterThan(firstHalf * 2);
  });

  it("honors spacing: dab count matches the arc-length calculation", () => {
    const result = renderAbrStrokePreview(strokeBrush);
    expect(result.spacingPx).toBe(5); // 25% of the 20px diameter
    expect(result.dabCount).toBe(
      Math.floor(result.pathLengthPx / result.spacingPx) + 1,
    );
    const wide = renderAbrStrokePreview(strokeBrush, { spacingPctOverride: 50 });
    // Same tip and canvas → identical path; only the dab cadence changes.
    expect(wide.pathLengthPx).toBe(result.pathLengthPx);
    expect(wide.spacingPx).toBe(10);
    expect(wide.dabCount).toBe(Math.floor(wide.pathLengthPx / wide.spacingPx) + 1);
    expect(wide.dabCount).toBeLessThan(result.dabCount);
  });

  it("renders a sampled tip stroke with ink", () => {
    const brush = onlyBrush(
      buildSampledAbr({ version: 2, name: "Chalk 16", compress: 1, ...SAMPLED_TIP }),
    );
    const result = renderAbrStrokePreview(brush);
    expect(result.warnings).toEqual([]);
    expect(
      inkPixels(result.pixels, result.width, result.height, 0, result.width),
    ).toBeGreaterThan(0);
  });

  it("propagates decoder warnings and its own fallbacks", () => {
    const mixed = buildAbrFile(2, [
      {
        typeCode: 1,
        body: buildComputedBody({ version: 2, name: "Round", diameterPx: 24 }),
      },
      { typeCode: 7, body: Uint8Array.of(9, 9) },
    ]);
    const decoded = decodeAbrPreviewBrushes(mixed);
    const brush = decoded.brushes[0];
    if (brush === undefined) {
      throw new Error("mixed fixture decoded to no brushes");
    }
    const result = renderAbrStrokePreview(brush, {
      inheritedWarnings: decoded.warnings,
      spacingPctOverride: 0,
    });
    expect(result.warnings.some((warning) => warning.includes("type 7"))).toBe(true);
    expect(
      result.warnings.some((warning) => warning.includes("falling back to 25%")),
    ).toBe(true);
  });
});
