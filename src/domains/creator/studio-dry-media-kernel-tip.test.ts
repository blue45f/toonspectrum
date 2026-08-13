import { describe, expect, it } from "vitest";

import {
  normalizeStudioBrushDynamicsSettings,
  studioBrushDynamicsSettingsForBrushId,
  studioDryMediaUnionComposableProgramPin,
  type NormalizedStudioBrushDynamicsSettings,
} from "./studio-brush-dynamics";
import {
  resolveStudioDynamicBrushMaterialIdentity,
} from "./studio-dry-media-dynamic-bridge";
import {
  linearizeStudioDryMediaKernelDepositionAlpha,
  resolveStudioDryMediaKernelTipAlphaMap,
  resolveStudioDryMediaKernelTipMaterial,
  shapeStudioDryMediaKernelTipCoverage,
  STUDIO_DRY_MEDIA_CORE_IDS,
  STUDIO_DRY_MEDIA_KERNEL_TIP_MAP_SIZE,
  STUDIO_DRY_MEDIA_KERNEL_TIP_VARIANT_COUNT,
  STUDIO_DRY_MEDIA_KERNEL_TIP_VERSION,
  studioDryMediaKernelDabPathOwnsMaterial,
  studioDryMediaKernelStrokeToothMultiplier,
  studioDryMediaKernelTipCoverage,
  type StudioDryMediaCoreId,
} from "./studio-dry-media-kernel-tip";
import {
  studioDryMediaUnionRibbonCarrierOwnsMaterial,
} from "./studio-dry-media-union-ribbon-carrier";

function authoredSettings(
  brushId: StudioDryMediaCoreId,
): NormalizedStudioBrushDynamicsSettings {
  const authored = studioBrushDynamicsSettingsForBrushId(brushId);
  if (!authored) throw new Error(`missing ${brushId} dynamics`);
  return authored;
}

function identityOf(brushId: string) {
  const identity = resolveStudioDynamicBrushMaterialIdentity(brushId);
  if (!identity) throw new Error(`missing ${brushId} identity`);
  return identity;
}

describe("dry-media kernel tip routing", () => {
  it("owns every unpinned causal core dry medium while the union carrier releases it", () => {
    for (const brushId of STUDIO_DRY_MEDIA_CORE_IDS) {
      const settings = authoredSettings(brushId);
      const identity = identityOf(brushId);
      expect(settings.dryMediaUnionProgram, brushId).toBeUndefined();
      expect(
        studioDryMediaKernelDabPathOwnsMaterial(identity, settings),
        brushId,
      ).toBe(brushId);
      expect(
        studioDryMediaUnionRibbonCarrierOwnsMaterial(identity, settings),
        brushId,
      ).toBe(false);
    }
  });

  it("returns pinned strokes to the union carrier and never to the kernel path", () => {
    for (const brushId of STUDIO_DRY_MEDIA_CORE_IDS) {
      const pinned = normalizeStudioBrushDynamicsSettings({
        ...authoredSettings(brushId),
        dryMediaUnionProgram: studioDryMediaUnionComposableProgramPin(),
      });
      const identity = identityOf(brushId);
      expect(
        studioDryMediaKernelDabPathOwnsMaterial(identity, pinned),
        brushId,
      ).toBeNull();
      expect(
        studioDryMediaUnionRibbonCarrierOwnsMaterial(identity, pinned),
        brushId,
      ).toBe(true);
    }
  });

  it("keeps unpinned legacy (non-causal) snapshots on the union carrier", () => {
    for (const brushId of STUDIO_DRY_MEDIA_CORE_IDS) {
      const legacy = normalizeStudioBrushDynamicsSettings({
        ...authoredSettings(brushId),
        depositPipeline: undefined,
      });
      const identity = identityOf(brushId);
      expect(legacy.depositPipeline, brushId).toBeUndefined();
      expect(
        studioDryMediaKernelDabPathOwnsMaterial(identity, legacy),
        brushId,
      ).toBeNull();
      expect(
        studioDryMediaUnionRibbonCarrierOwnsMaterial(identity, legacy),
        brushId,
      ).toBe(true);
    }
  });

  it("never converges an unknown or re-shaped identity onto the kernel tips", () => {
    const crayon = authoredSettings("crayon");
    expect(
      resolveStudioDryMediaKernelTipMaterial(
        identityOf("pencil-grain"),
        crayon,
      ),
    ).toBeNull();
    expect(
      resolveStudioDryMediaKernelTipMaterial(undefined, crayon),
    ).toBeNull();
    // A re-shaped tip leaves the catalogue material: neither owner claims it, so the generic
    // dynamics pipeline keeps its historical output instead of substituting texture.
    const reshaped = normalizeStudioBrushDynamicsSettings({
      ...crayon,
      tip: { shape: "round", softness: 0.3 },
    });
    const identity = identityOf("crayon");
    expect(resolveStudioDryMediaKernelTipMaterial(identity, reshaped)).toBeNull();
    expect(studioDryMediaKernelDabPathOwnsMaterial(identity, reshaped)).toBeNull();
    expect(studioDryMediaUnionRibbonCarrierOwnsMaterial(identity, reshaped)).toBe(false);
  });

  it("splits ownership exhaustively: every eligible dynamics has exactly one owner", () => {
    for (const brushId of STUDIO_DRY_MEDIA_CORE_IDS) {
      const identity = identityOf(brushId);
      const variants = [
        authoredSettings(brushId),
        normalizeStudioBrushDynamicsSettings({
          ...authoredSettings(brushId),
          dryMediaUnionProgram: studioDryMediaUnionComposableProgramPin(),
        }),
        normalizeStudioBrushDynamicsSettings({
          ...authoredSettings(brushId),
          depositPipeline: undefined,
        }),
      ];
      for (const dynamics of variants) {
        const kernelOwned =
          studioDryMediaKernelDabPathOwnsMaterial(identity, dynamics) !== null;
        const unionOwned =
          studioDryMediaUnionRibbonCarrierOwnsMaterial(identity, dynamics);
        expect(kernelOwned !== unionOwned, brushId).toBe(true);
      }
    }
  });
});

describe("dry-media kernel tip maps", () => {
  it("bakes deterministic immutable maps with stable content revisions", () => {
    for (const brushId of STUDIO_DRY_MEDIA_CORE_IDS) {
      const tip = authoredSettings(brushId).tip;
      const first = resolveStudioDryMediaKernelTipAlphaMap(brushId, tip, 7, 0.8);
      const second = resolveStudioDryMediaKernelTipAlphaMap(brushId, tip, 7, 0.8);
      expect(second, brushId).toBe(first);
      expect(first.size, brushId).toBe(STUDIO_DRY_MEDIA_KERNEL_TIP_MAP_SIZE);
      expect(first.alphas.length, brushId).toBe(first.size * first.size);
      expect(String(first.revision), brushId).toContain(
        STUDIO_DRY_MEDIA_KERNEL_TIP_VERSION,
      );
      expect(String(first.revision), brushId).toContain(brushId);
      expect(Object.isFrozen(first), brushId).toBe(true);
      let peak = 0;
      for (const alpha of first.alphas) {
        expect(alpha).toBeGreaterThanOrEqual(0);
        expect(alpha).toBeLessThanOrEqual(1);
        if (alpha > peak) peak = alpha;
      }
      expect(peak, brushId).toBeGreaterThan(0.5);
    }
  });

  it("keeps per-material textures measurably distinct", () => {
    const signatures = new Set<string>();
    for (const brushId of STUDIO_DRY_MEDIA_CORE_IDS) {
      const tip = authoredSettings(brushId).tip;
      const map = resolveStudioDryMediaKernelTipAlphaMap(brushId, tip, 0, 1);
      let sum = 0;
      let zeros = 0;
      for (const alpha of map.alphas) {
        sum += alpha;
        if (alpha === 0) zeros += 1;
      }
      signatures.add(
        `${(sum / map.alphas.length).toFixed(4)}:${(zeros / map.alphas.length).toFixed(4)}`,
      );
    }
    expect(signatures.size).toBe(STUDIO_DRY_MEDIA_CORE_IDS.length);
  });

  it("rotates a bounded deterministic variant set from the stable dab index", () => {
    const tip = authoredSettings("chalk").tip;
    const revisions = new Set<string>();
    for (let index = 0; index < 32; index += 1) {
      revisions.add(String(
        resolveStudioDryMediaKernelTipAlphaMap("chalk", tip, index, 0.8).revision,
      ));
    }
    expect(revisions.size).toBe(STUDIO_DRY_MEDIA_KERNEL_TIP_VARIANT_COUNT);
    // Same stable index always selects the same variant — chunked live planning and full replay
    // agree per fibre.
    expect(
      resolveStudioDryMediaKernelTipAlphaMap("chalk", tip, 13, 0.8),
    ).toBe(resolveStudioDryMediaKernelTipAlphaMap("chalk", tip, 13, 0.8));
  });

  it("steps banded wax widths by pressure alpha and keeps powder widths constant", () => {
    const crayonTip = authoredSettings("crayon").tip;
    const light = resolveStudioDryMediaKernelTipAlphaMap("crayon", crayonTip, 0, 0.2);
    const heavy = resolveStudioDryMediaKernelTipAlphaMap("crayon", crayonTip, 0, 1);
    expect(light).not.toBe(heavy);
    const occupiedRows = (map: typeof light): number => {
      let rows = 0;
      for (let y = 0; y < map.size; y += 1) {
        for (let x = 0; x < map.size; x += 1) {
          if (map.alphas[y * map.size + x]! > 0) {
            rows += 1;
            break;
          }
        }
      }
      return rows;
    };
    expect(occupiedRows(light)).toBeLessThan(occupiedRows(heavy));

    const chalkTip = authoredSettings("chalk").tip;
    expect(resolveStudioDryMediaKernelTipAlphaMap("chalk", chalkTip, 0, 0.2))
      .toBe(resolveStudioDryMediaKernelTipAlphaMap("chalk", chalkTip, 0, 1));
  });

  it("keeps coverage and shaping pure and deterministic", () => {
    for (const brushId of STUDIO_DRY_MEDIA_CORE_IDS) {
      expect(studioDryMediaKernelTipCoverage(brushId, 0.31, -0.12, 77, 0.6))
        .toBe(studioDryMediaKernelTipCoverage(brushId, 0.31, -0.12, 77, 0.6));
      expect(shapeStudioDryMediaKernelTipCoverage(brushId, 0.6, 0.2, 0.1))
        .toBe(shapeStudioDryMediaKernelTipCoverage(brushId, 0.6, 0.2, 0.1));
      expect(shapeStudioDryMediaKernelTipCoverage(brushId, 0, 0.2, 0.1)).toBe(0);
    }
  });
});

describe("dry-media kernel deposition response", () => {
  it("linearizes monotonically with fixed ends", () => {
    for (const brushId of STUDIO_DRY_MEDIA_CORE_IDS) {
      expect(linearizeStudioDryMediaKernelDepositionAlpha(brushId, 0)).toBe(0);
      expect(linearizeStudioDryMediaKernelDepositionAlpha(brushId, 1)).toBe(1);
      let previous = 0;
      for (let step = 1; step <= 20; step += 1) {
        const value = linearizeStudioDryMediaKernelDepositionAlpha(
          brushId,
          step / 20,
        );
        expect(value, brushId).toBeGreaterThan(previous);
        expect(value, brushId).toBeLessThanOrEqual(1);
        previous = value;
      }
      // The lift is a deposition response toward the historical bed density, never a reduction.
      expect(
        linearizeStudioDryMediaKernelDepositionAlpha(brushId, 0.4),
        brushId,
      ).toBeGreaterThanOrEqual(0.4);
    }
  });

  it("anchors stroke tooth deterministically with bounded depth", () => {
    for (const brushId of STUDIO_DRY_MEDIA_CORE_IDS) {
      for (let sampleIndex = 0; sampleIndex < 64; sampleIndex += 1) {
        const dab = {
          index: sampleIndex,
          x: 12 + sampleIndex * 1.7,
          y: 40 + Math.sin(sampleIndex / 5) * 6,
          distanceFromStrokeStart: sampleIndex * 1.9,
        };
        const first = studioDryMediaKernelStrokeToothMultiplier(
          brushId,
          dab,
          12,
          40,
          0x51a7,
        );
        expect(first, brushId).toBeGreaterThanOrEqual(0);
        expect(first, brushId).toBeLessThanOrEqual(1);
        expect(
          studioDryMediaKernelStrokeToothMultiplier(brushId, dab, 12, 40, 0x51a7),
          brushId,
        ).toBe(first);
      }
    }
  });

  it("opens full-contrast pores somewhere along a wax lane while rails stay denser", () => {
    let inner = 0;
    let innerPored = 0;
    let rail = 0;
    let railPored = 0;
    for (let station = 0; station < 400; station += 1) {
      for (let lane = 0; lane < 5; lane += 1) {
        const value = studioDryMediaKernelStrokeToothMultiplier(
          "crayon",
          {
            index: station * 5 + lane,
            x: station * 1.3,
            y: 0,
            distanceFromStrokeStart: station * 1.3,
          },
          0,
          0,
          0xbeef,
        );
        const pored = value < 0.5;
        if (lane === 0 || lane === 4) {
          rail += 1;
          if (pored) railPored += 1;
        } else {
          inner += 1;
          if (pored) innerPored += 1;
        }
      }
    }
    expect(innerPored / inner).toBeGreaterThan(0.1);
    expect(railPored / rail).toBeLessThan(innerPored / inner);
  });
});
