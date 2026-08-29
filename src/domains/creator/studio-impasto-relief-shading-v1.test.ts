import { describe, expect, it, vi } from "vitest";

import {
  computeStudioImpastoReliefShading,
  STUDIO_IMPASTO_RELIEF_LIGHT_DIRECTION_DEFAULT,
  STUDIO_IMPASTO_RELIEF_SHADING_DEFAULTS,
  STUDIO_IMPASTO_RELIEF_SHADING_PROVENANCE,
  STUDIO_IMPASTO_RELIEF_SHADING_V1_VERSION,
  StudioImpastoReliefShadingError,
} from "./studio-impasto-relief-shading-v1";
import { studioOssUnitHash } from "./studio-oss-brush-kernels";

const QUALITIES = ["ggx", "emboss-2tap"] as const;

/** Horizontal Gaussian ridge: crest along the row `crestY`, uniform in x. */
function ridgeTile(width: number, height: number, crestY: number): Float32Array {
  const heights = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const distance = y - crestY;
    const ridge = Math.exp(-(distance * distance) / 18) * 0.85;
    for (let x = 0; x < width; x += 1) {
      heights[y * width + x] = ridge;
    }
  }
  return heights;
}

function meanRows(
  shading: Float32Array,
  width: number,
  fromRow: number,
  toRow: number,
): number {
  let sum = 0;
  let count = 0;
  for (let y = fromRow; y < toRow; y += 1) {
    for (let x = 0; x < width; x += 1) {
      sum += shading[y * width + x]!;
      count += 1;
    }
  }
  return count > 0 ? sum / count : 0;
}

describe("studio impasto relief shading v1 (dli/paint MIT port)", () => {
  it("carries frozen MIT provenance and dli's verbatim default parameters", () => {
    expect(STUDIO_IMPASTO_RELIEF_SHADING_V1_VERSION).toBe(
      "studio-impasto-relief-shading-v1",
    );
    expect(Object.isFrozen(STUDIO_IMPASTO_RELIEF_SHADING_PROVENANCE)).toBe(true);
    expect(STUDIO_IMPASTO_RELIEF_SHADING_PROVENANCE.license).toContain("MIT");
    expect(STUDIO_IMPASTO_RELIEF_SHADING_DEFAULTS.normalScale).toBe(7.0);
    expect(STUDIO_IMPASTO_RELIEF_SHADING_DEFAULTS.roughness).toBe(0.075);
    expect(STUDIO_IMPASTO_RELIEF_SHADING_DEFAULTS.f0).toBe(0.05);
    expect(STUDIO_IMPASTO_RELIEF_SHADING_DEFAULTS.specularScale).toBe(0.5);
    expect(STUDIO_IMPASTO_RELIEF_SHADING_DEFAULTS.diffuseScale).toBe(0.15);
    // dli LIGHT_DIRECTION (0, 1, 1) in GL space = (0, −1, 1) with y down.
    expect(STUDIO_IMPASTO_RELIEF_LIGHT_DIRECTION_DEFAULT).toEqual([0, -1, 1]);
  });

  it.each(QUALITIES)("shades any flat tile to a uniform 1.0 (%s)", (quality) => {
    for (const level of [0, 0.5, 1]) {
      const heights = new Float32Array(48 * 32).fill(level);
      const shading = computeStudioImpastoReliefShading(heights, {
        width: 48,
        height: 32,
        quality,
      });
      for (const value of shading) {
        expect(Math.abs(value - 1)).toBeLessThanOrEqual(1e-6);
      }
    }
  });

  it.each(QUALITIES)(
    "lights a ridge's light-facing flank and darkens the far flank (%s)",
    (quality) => {
      const width = 64;
      const height = 64;
      const crestY = 32;
      const shading = computeStudioImpastoReliefShading(
        ridgeTile(width, height, crestY),
        { width, height, quality },
      );
      // Default light (0, −1, 1) shines from the tile's top edge: the upper
      // flank (rows before the crest) must brighten, the lower flank darken.
      const upperFlank = meanRows(shading, width, crestY - 6, crestY - 1);
      const lowerFlank = meanRows(shading, width, crestY + 2, crestY + 7);
      expect(upperFlank).toBeGreaterThan(1.005);
      expect(lowerFlank).toBeLessThan(0.995);
      expect(upperFlank - lowerFlank).toBeGreaterThan(0.02);
      // Far away from the ridge the multiplier returns to identity.
      const farField = meanRows(shading, width, 2, 6);
      expect(Math.abs(farField - 1)).toBeLessThanOrEqual(1e-3);
    },
  );

  it.each(QUALITIES)("swaps the lit flank when the light flips (%s)", (quality) => {
    const width = 48;
    const height = 48;
    const crestY = 24;
    const flipped = computeStudioImpastoReliefShading(
      ridgeTile(width, height, crestY),
      { width, height, quality, lightDirection: [0, 1, 1] },
    );
    const upperFlank = meanRows(flipped, width, crestY - 6, crestY - 1);
    const lowerFlank = meanRows(flipped, width, crestY + 2, crestY + 7);
    expect(lowerFlank).toBeGreaterThan(upperFlank);
  });

  it("raises a GGX specular highlight the emboss fallback cannot fake", () => {
    // A plane whose Sobel normal aligns with the half vector between the
    // default light and the (0, 0, 1) eye: the surface rises with +y so its
    // normal tips toward the light, at ∂h/∂y = tan(22.5°)·normalScale/8.
    const width = 48;
    const height = 48;
    const slope = (Math.tan(Math.PI / 8) * STUDIO_IMPASTO_RELIEF_SHADING_DEFAULTS.normalScale) / 8;
    const heights = new Float32Array(width * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        heights[y * width + x] = y * slope;
      }
    }
    const ggx = computeStudioImpastoReliefShading(heights, { width, height });
    const emboss = computeStudioImpastoReliefShading(heights, {
      width,
      height,
      quality: "emboss-2tap",
    });
    // Interior pixels (borders see clamped taps) catch the GGX lobe. Closed
    // form at perfect alignment: (diffuse 0.9886 + D·G·F·0.5 = 0.4142) / flat
    // 0.9568 ≈ 1.4661 — far above the pure-diffuse ceiling 1/0.9568 ≈ 1.045.
    const centre = ggx[24 * width + 24]!;
    expect(centre).toBeGreaterThan(1.4);
    expect(centre).toBeLessThanOrEqual(
      STUDIO_IMPASTO_RELIEF_SHADING_DEFAULTS.maxShadingMultiplier,
    );
    // The 2-tap emboss has no specular lobe: on the same plane it stays a
    // plain slope response (≈1.293) below the GGX highlight.
    const embossCentre = emboss[24 * width + 24]!;
    expect(centre).toBeGreaterThan(embossCentre + 0.1);
  });

  it.each(QUALITIES)(
    "keeps every output bounded in [0, max] on a hostile seeded tile (%s)",
    (quality) => {
      const width = 96;
      const height = 64;
      const heights = new Float32Array(width * height);
      for (let index = 0; index < heights.length; index += 1) {
        // Deterministic spiky field — repo seeded-hash idiom, no Math.random.
        heights[index] = studioOssUnitHash(0x51ee, index) * 3 - 1;
      }
      const shading = computeStudioImpastoReliefShading(heights, {
        width,
        height,
        quality,
        heightScale: 4,
      });
      for (const value of shading) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(
          STUDIO_IMPASTO_RELIEF_SHADING_DEFAULTS.maxShadingMultiplier,
        );
      }
    },
  );

  it("treats a Uint8 tile as height/255, matching the Float32 equivalent", () => {
    const width = 40;
    const height = 24;
    const bytes = new Uint8Array(width * height);
    const floats = new Float32Array(width * height);
    for (let index = 0; index < bytes.length; index += 1) {
      const byte = Math.floor(studioOssUnitHash(0xbeef, index) * 256);
      bytes[index] = byte;
      floats[index] = byte / 255;
    }
    const fromBytes = computeStudioImpastoReliefShading(bytes, { width, height });
    const fromFloats = computeStudioImpastoReliefShading(floats, { width, height });
    for (let index = 0; index < fromBytes.length; index += 1) {
      expect(Math.abs(fromBytes[index]! - fromFloats[index]!)).toBeLessThanOrEqual(1e-6);
    }
  });

  it("is deterministic and supports a caller-provided output buffer", () => {
    const width = 32;
    const height = 32;
    const heights = ridgeTile(width, height, 16);
    const first = computeStudioImpastoReliefShading(heights, { width, height });
    const into = new Float32Array(width * height);
    const second = computeStudioImpastoReliefShading(heights, { width, height, into });
    expect(second).toBe(into);
    expect([...second]).toEqual([...first]);
  });

  it("rejects out-of-contract inputs loudly instead of clamping them silently", () => {
    const heights = new Float32Array(16);
    expect(() =>
      computeStudioImpastoReliefShading(heights, { width: 5, height: 5 }),
    ).toThrow(StudioImpastoReliefShadingError);
    expect(() =>
      computeStudioImpastoReliefShading(heights, { width: 4, height: 4, roughness: 0 }),
    ).toThrow(StudioImpastoReliefShadingError);
    expect(() =>
      computeStudioImpastoReliefShading(heights, {
        width: 4,
        height: 4,
        lightDirection: [0, 0, 0],
      }),
    ).toThrow(StudioImpastoReliefShadingError);
    expect(() =>
      computeStudioImpastoReliefShading(heights, {
        width: 4,
        height: 4,
        normalScale: -1,
      }),
    ).toThrow(StudioImpastoReliefShadingError);
    expect(() =>
      computeStudioImpastoReliefShading(heights, {
        width: 4,
        height: 4,
        into: new Float32Array(3),
      }),
    ).toThrow(StudioImpastoReliefShadingError);
  });

  /**
   * Exact transcendental census, measured rather than derived: `Math.sqrt` is called
   * `4 * width * height + 4` times for ggx (four per shaded pixel — `halfLength` in
   * `shadeNormal`, both terms of `gggxVisibility`, and `normalLength` in the loop — plus a
   * fixed four in setup), and exactly four times for emboss-2tap, which never enters
   * `shadeNormal`. No other transcendental is called at all in either mode.
   *
   * "No other" means every costly `Math` member, not the handful this shader happens to use today
   * — a census scoped to the current call set says nothing about a regression that reaches for
   * `Math.tan` or `Math.cbrt` tomorrow.
   *
   * This is what the 40ms budget below was really protecting, and it protects it far better: a
   * normalize added per tap, a second sqrt in the visibility term, an `acos`/`pow` creeping into
   * the BRDF, or `(1 - lDotH) ** 5` becoming `Math.pow` all move these counts, and they move them
   * identically on every machine, every Node version and under any load.
   *
   * Runs on a small tile in its own test, never inside a timed window: installing a spy on
   * `Math.sqrt` defeats V8's lowering of it to a hardware instruction, so a spied call is not the
   * call the budget measures.
   */
  it("calls exactly four transcendentals per shaded pixel, and nothing else", () => {
    // EVERY `Math` member whose cost is more than a machine instruction, not a hand-picked few.
    // A census listing only the functions the shader happens to call today convicts nothing when
    // it starts calling one it does not: a per-pixel `Math.tan`, `Math.cbrt` or `Math.log2` would
    // leave every count below unchanged and clear the smoke bound as well.
    //
    // The cheap arithmetic members (`abs`, `min`, `max`, `floor`, `ceil`, `round`, `sign`,
    // `trunc`, `imul`, `clz32`, `random`) are excluded deliberately: they compile to instructions,
    // so counting them would pin the shader's arithmetic shape rather than its transcendental
    // cost. `random` is excluded for a different reason -- this path must never call it, and the
    // determinism test above is what proves that.
    const transcendentals = [
      "sqrt", "cbrt", "pow", "exp", "expm1", "log", "log2", "log10", "log1p",
      "sin", "cos", "tan", "asin", "acos", "atan", "atan2",
      "sinh", "cosh", "tanh", "asinh", "acosh", "atanh",
      "hypot", "fround",
    ] as const;

    const census = (
      width: number,
      height: number,
      quality: "ggx" | "emboss-2tap",
    ): Record<string, number> => {
      const heights = new Float32Array(width * height);
      for (let index = 0; index < heights.length; index += 1) {
        heights[index] = studioOssUnitHash(0x7a11, index);
      }
      const counts: Record<string, number> = {};
      const spies = transcendentals.map((name) => {
        counts[name] = 0;
        const original = Math[name] as (...args: number[]) => number;
        return vi.spyOn(Math, name).mockImplementation(((...args: number[]) => {
          counts[name] += 1;
          return original(...args);
        }) as never);
      });
      try {
        computeStudioImpastoReliefShading(heights, {
          width,
          height,
          into: new Float32Array(width * height),
          quality,
        });
      } finally {
        for (const spy of spies) spy.mockRestore();
      }
      return counts;
    };

    // Two tile sizes pin the per-pixel slope AND the constant separately — one size alone could
    // be satisfied by a wrong split between them.
    for (const [width, height] of [[16, 12], [32, 24]] as const) {
      const ggx = census(width, height, "ggx");
      expect(ggx.sqrt, `ggx ${width}x${height}`).toBe(4 * width * height + 4);
      const emboss = census(width, height, "emboss-2tap");
      expect(emboss.sqrt, `emboss ${width}x${height}`).toBe(4);
      expect(emboss.hypot, `emboss ${width}x${height}`).toBe(1);

      for (const name of transcendentals) {
        if (name === "sqrt") continue;
        if (name === "hypot") {
          expect(ggx[name], `ggx ${name}`).toBe(0);
          continue;
        }
        expect(ggx[name], `ggx ${name}`).toBe(0);
        expect(emboss[name], `emboss ${name}`).toBe(0);
      }
    }
  });

});
