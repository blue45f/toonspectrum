import { describe, expect, it } from "vitest";

import {
  normalizeStudioBrushDynamicsSettings,
  planNormalizedStudioDynamicBrushDabs,
  studioBrushDynamicsSettingsForBrushId,
  studioDryMediaUnionComposableProgramPin,
  type NormalizedStudioBrushDynamicsSettings,
  type StudioDynamicBrushDab,
} from "./studio-brush-dynamics";
import {
  bridgeStudioDynamicDabsToDryMediaV1,
  resolveStudioDynamicBrushMaterialIdentity,
} from "./studio-dry-media-dynamic-bridge";
import {
  planStudioDryMediaUnionRibbonCarrier,
  STUDIO_DRY_MEDIA_UNION_COMPOSABLE_PROGRAM_DIGEST,
  STUDIO_DRY_MEDIA_UNION_COMPOSABLE_PROGRAM_VERSION,
  type StudioDryMediaUnionComposableGroup,
  type StudioDryMediaUnionRibbonCoverageMark,
  type StudioDryMediaUnionRibbonSourceMark,
} from "./studio-dry-media-union-ribbon-carrier";
import { sha256HexPortable } from "./studio-sha256";

const CORE_DRY_MEDIA_IDS = [
  "crayon",
  "chalk",
  "charcoal",
  "pastel",
  "oil-pastel",
] as const;

type CoreDryMediaId = (typeof CORE_DRY_MEDIA_IDS)[number];

const LEGACY_CARRIER_SHA256: Readonly<Record<CoreDryMediaId, string>> = Object.freeze({
  crayon: "e2e842338d10c8d099881e9f48ee8b80ac943866591c24fbdc613739a7a525ea",
  chalk: "33b358794aa321406c6afca80fd41373af44c5f858294784842cc9c74d2a0d45",
  charcoal: "73d5a05fbe1c85ad27d9545fe4cb0166e17beec8b953c0b6c829de7f55c316c0",
  pastel: "550525d2f47d66ce41d1d743cad912063940b4b18b5fdd044d45dfc6b04da5e3",
  "oil-pastel": "bfddc491446750a182e0ca35bcce3183693d671b2f14e797787f4fe0de0783bb",
});

const POINTS = Object.freeze([
  0, 0,
  10, 2,
  18, 9,
  7, 16,
  22, 23,
  35, 20,
]);
const PRESSURES = Object.freeze([0.2, 0.55, 0.9, 0.4, 0.75, 0.6]);

function settingsFor(
  brushId: CoreDryMediaId,
  pinned: boolean,
): NormalizedStudioBrushDynamicsSettings {
  const authored = studioBrushDynamicsSettingsForBrushId(brushId);
  if (!authored) throw new Error(`Missing ${brushId} dynamics`);
  return pinned
    ? normalizeStudioBrushDynamicsSettings({
        ...authored,
        dryMediaUnionProgram: studioDryMediaUnionComposableProgramPin(),
      })
    : authored;
}

function sourceDabsFor(
  settings: NormalizedStudioBrushDynamicsSettings,
): readonly StudioDynamicBrushDab[] {
  return planNormalizedStudioDynamicBrushDabs({
    points: POINTS,
    pressures: PRESSURES,
    baseWidth: 18,
    baseOpacity: 0.82,
  }, settings);
}

function sourceMarksFor(
  brushId: CoreDryMediaId,
  settings: NormalizedStudioBrushDynamicsSettings,
  dabs: readonly StudioDynamicBrushDab[],
): Readonly<{
  dabs: readonly StudioDynamicBrushDab[];
  marks: readonly StudioDryMediaUnionRibbonSourceMark[];
  laneCount: number;
}> {
  const bridged = bridgeStudioDynamicDabsToDryMediaV1({
    brushId,
    seed: settings.seed,
    dabs,
  });
  if (!bridged.ok) throw new Error(`${brushId}: ${bridged.reason}`);
  return Object.freeze({
    dabs: bridged.receipt.adjustedDabs,
    marks: Object.freeze(bridged.receipt.marks.map((mark) => Object.freeze({
      x: mark.x,
      y: mark.y,
      radiusX: mark.radiusX,
      radiusY: mark.radiusY,
      angleRadians: mark.angleRadians,
      alpha: 1,
      color: "#264466",
    }))),
    laneCount: bridged.receipt.laneCount,
  });
}

function requireCarrier(
  brushId: CoreDryMediaId,
  settings: NormalizedStudioBrushDynamicsSettings,
  sourceDabs: readonly StudioDynamicBrushDab[],
  skipLeadingSourceDabs = 0,
): StudioDryMediaUnionRibbonCoverageMark {
  const bridged = sourceMarksFor(brushId, settings, sourceDabs);
  const result = planStudioDryMediaUnionRibbonCarrier({
    dabs: bridged.dabs,
    marks: bridged.marks,
    materialIdentity: resolveStudioDynamicBrushMaterialIdentity(brushId) ?? undefined,
    dynamics: settings,
    ...(skipLeadingSourceDabs > 0
      ? { skipLeadingMarks: skipLeadingSourceDabs * bridged.laneCount }
      : {}),
  });
  if (!result.applied) throw new Error(`${brushId}: ${result.reason}`);
  expect(result.marks).toHaveLength(1);
  return result.marks[0]!;
}

function composableGroups(
  mark: StudioDryMediaUnionRibbonCoverageMark,
): readonly StudioDryMediaUnionComposableGroup[] {
  const compositing = mark.ribbon.compositing;
  expect(compositing).toMatchObject({
    kind: "causal-group-alpha-max",
    version: STUDIO_DRY_MEDIA_UNION_COMPOSABLE_PROGRAM_VERSION,
    programDigest: STUDIO_DRY_MEDIA_UNION_COMPOSABLE_PROGRAM_DIGEST,
  });
  if (!compositing) throw new Error("Missing composable dry-media groups");
  return compositing.groups;
}

describe("dry-media union ribbon carrier v3 representation", () => {
  it("keeps every unpinned core dry-media carrier byte-identical to the legacy baseline", () => {
    for (const brushId of CORE_DRY_MEDIA_IDS) {
      const settings = settingsFor(brushId, false);
      expect(settings.dryMediaUnionProgram, brushId).toBeUndefined();
      const mark = requireCarrier(brushId, settings, sourceDabsFor(settings));
      expect(mark.ribbon.compositing, brushId).toBeUndefined();
      const serialized = JSON.stringify({ applied: true, marks: [mark] });
      expect(
        sha256HexPortable(new TextEncoder().encode(serialized)),
        brushId,
      ).toBe(LEGACY_CARRIER_SHA256[brushId]);
    }
  });

  it("pins immutable station groups whose arbitrary delivery chunks flatten to one full plan", () => {
    for (const brushId of CORE_DRY_MEDIA_IDS) {
      const settings = settingsFor(brushId, true);
      const sourceDabs = sourceDabsFor(settings);
      const full = requireCarrier(brushId, settings, sourceDabs);
      const fullGroups = composableGroups(full);
      expect(fullGroups.length, brushId).toBeGreaterThan(0);
      expect(fullGroups.flatMap((group) => group.polygons), brushId)
        .toEqual(full.ribbon.polygons);
      expect(Object.isFrozen(fullGroups), brushId).toBe(true);
      for (let index = 0; index < fullGroups.length; index += 1) {
        const group = fullGroups[index]!;
        expect(Number.isSafeInteger(group.stationIndex), brushId).toBe(true);
        expect(group.polygons.length, brushId).toBeGreaterThan(0);
        expect(Object.isFrozen(group), brushId).toBe(true);
        if (index > 0) {
          expect(group.stationIndex, brushId)
            .toBeGreaterThan(fullGroups[index - 1]!.stationIndex);
        }
      }

      const chunkEnds = [1, 3, 7, 13, 31, sourceDabs.length]
        .filter((end, index, values) => (
          end <= sourceDabs.length && end > (values[index - 1] ?? 0)
        ));
      if (chunkEnds.at(-1) !== sourceDabs.length) chunkEnds.push(sourceDabs.length);
      const chunkedGroups: StudioDryMediaUnionComposableGroup[] = [];
      let start = 0;
      for (const end of chunkEnds) {
        const predecessor = start > 0 ? start - 1 : 0;
        const chunk = sourceDabs.slice(predecessor, end);
        const mark = requireCarrier(
          brushId,
          settings,
          chunk,
          start > 0 ? 1 : 0,
        );
        chunkedGroups.push(...composableGroups(mark));
        start = end;
      }
      expect(chunkedGroups, brushId).toEqual(fullGroups);
      expect(chunkedGroups.flatMap((group) => group.polygons), brushId)
        .toEqual(full.ribbon.polygons);
    }
  });
});
