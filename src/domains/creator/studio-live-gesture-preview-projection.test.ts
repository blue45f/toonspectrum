import { describe, expect, it } from "vitest";

import {
  mergeStudioLiveGesturePreviewElements,
  projectStudioLiveGesturePreviewEntry,
} from "./studio-live-gesture-preview-projection";

import type { DrawEl, El } from "./studio-element-model";
import type {
  StudioLiveGesturePreviewSnapshot,
  StudioLiveGesturePreviewSnapshotEntry,
} from "./studio-live-gesture-preview-store";

function freehandEntry(
  overrides: Partial<StudioLiveGesturePreviewSnapshotEntry> = {},
): StudioLiveGesturePreviewSnapshotEntry {
  return {
    key: "8:sender-agesture-a",
    senderSessionId: "sender-a",
    gestureId: "gesture-a",
    pageId: "page-a",
    seq: 3,
    lastPhase: "end",
    operation: "erase",
    base: { documentGeneration: 7 },
    renderer: {
      kind: "freehand",
      mode: "eraser",
      stroke: "#112233",
      strokeWidth: 18,
      opacity: 0.75,
      brush: "soft-airbrush",
      brushCatalogId: "airbrush-v1",
      brushCatalogName: "Soft Airbrush",
      sampleSpacing: 1.5,
      blendMode: "multiply",
      paintModel: "bounded-flow-v2",
      pressureModel: "linear-residual-path-v3",
      materialPressureModel: "canonical-material-v1",
      materialMinimumDiameterRatio: 0.2,
      stampPipeline: "causal-walker-v2",
      brushTip: { tiltEnabled: true, angleDeg: 12, roundness: 0.8 },
      symmetry: { type: "none", centerX: 0, centerY: 0 },
      brushDynamics: {
        version: 1,
        presetId: "airbrush",
        seed: 99,
        fallbackPressure: 0.4,
        minimumDiameterRatio: 0.15,
        spacingRatio: 0.2,
        scatterRatio: null,
      },
    },
    samples: {
      startIndex: 0,
      points: [0, 0, 10, 10, 20, 20],
      pressures: [0.4, 0.5, 0.6],
      tiltXs: [1, 2, 3],
      tiltYs: [4, 5, 6],
      twists: [7, 8, 9],
      speeds: [0.1, 0.2, 0.3],
      tangentialPressures: [0, 0.1, 0.2],
      altitudeAngles: [0.5, 0.6, 0.7],
      azimuthAngles: [1, 1.1, 1.2],
      contactWidths: [2, 3, 4],
      contactHeights: [3, 4, 5],
      sampleTimeOffsets: [0, 8, 16],
    },
    sampleCount: 3,
    updatedAt: 10_000,
    ...overrides,
  };
}

function shapeEntry(
  overrides: Partial<StudioLiveGesturePreviewSnapshotEntry> = {},
): StudioLiveGesturePreviewSnapshotEntry {
  return {
    key: "8:sender-ashape-a",
    senderSessionId: "sender-a",
    gestureId: "shape-a",
    pageId: "page-a",
    seq: 2,
    lastPhase: "end",
    operation: "shape",
    base: { documentGeneration: 7 },
    renderer: {
      kind: "rect",
      mode: "pen",
      stroke: "#223344",
      strokeWidth: 4,
      fill: "#aabbcc",
      strokeStyle: {
        dash: "solid",
        lineCap: "round",
        arrowStart: "none",
        arrowEnd: "none",
      },
      shapeParams: {
        starPoints: 5,
        starInnerRatio: 0.5,
        polygonSides: 6,
        cornerRadius: 3,
      },
      sketch: {
        enabled: true,
        roughness: 1.5,
        bowing: 1,
        fillStyle: "hachure",
      },
    },
    shape: { kind: "rect", x0: 1, y0: 2, x1: 30, y1: 40 },
    sampleCount: 0,
    updatedAt: 10_000,
    ...overrides,
  };
}

function draw(id: string, points: number[], kind: DrawEl["kind"] = "freehand"): DrawEl {
  return {
    id,
    type: "draw",
    kind,
    mode: "pen",
    points,
    stroke: "#000000",
    strokeWidth: 4,
  };
}

function eligibleKeys(
  snapshot: StudioLiveGesturePreviewSnapshot,
): ReadonlySet<string> {
  return new Set(snapshot.map((entry) => entry.key));
}

describe("studio live gesture preview projection", () => {
  it("projects a settling freehand entry into a detached preview-only DrawEl", () => {
    const entry = freehandEntry();
    const projected = projectStudioLiveGesturePreviewEntry(entry);

    expect(projected).toMatchObject({
      id: "gesture-a",
      type: "draw",
      kind: "freehand",
      mode: "eraser",
      points: [0, 0, 10, 10, 20, 20],
      pressures: [0.4, 0.5, 0.6],
      stroke: "#112233",
      strokeWidth: 18,
      opacity: 0.75,
      paintModel: "bounded-flow-v2",
      pressureModel: "linear-residual-path-v3",
      brushDynamics: {
        presetId: "airbrush",
        seed: 99,
        fallbackPressure: 0.4,
        minimumDiameterRatio: 0.15,
        spacingRatio: 0.2,
        scatterRatio: null,
      },
    });
    expect(projected?.points).not.toBe(entry.samples?.points);
    expect(projected?.pressures).not.toBe(entry.samples?.pressures);
    projected!.points[0] = 999;
    expect(entry.samples?.points[0]).toBe(0);
  });

  it("projects shape endpoints and fails closed for retouch", () => {
    expect(projectStudioLiveGesturePreviewEntry(shapeEntry())).toMatchObject({
      id: "shape-a",
      kind: "rect",
      mode: "pen",
      points: [1, 2, 30, 40],
      fill: "#aabbcc",
      strokeStyle: { dash: "solid", lineCap: "round" },
      shapeParams: { cornerRadius: 3 },
      sketch: { enabled: true },
    });
    expect(projectStudioLiveGesturePreviewEntry(freehandEntry({
      operation: "retouch",
      renderer: undefined,
      samples: undefined,
      retouch: {
        tool: "smudge",
        startIndex: 0,
        points: [0.1, 0.2],
        radiusNorm: 0.1,
        strength: 0.5,
      },
      sampleCount: 1,
    }))).toBeNull();
  });

  it("inserts an absent preview exactly once and replaces a lagging freehand in the same slot", () => {
    const before = draw("before", [0, 0]);
    const after = draw("after", [0, 0]);
    const lagging = draw("gesture-a", [0, 0]);
    const snapshot: StudioLiveGesturePreviewSnapshot = [freehandEntry()];

    const inserted = mergeStudioLiveGesturePreviewElements(
      [before],
      snapshot,
      eligibleKeys(snapshot),
    );
    expect(inserted).toHaveLength(2);
    expect(inserted[0]).toBe(before);
    expect(inserted[1]).toMatchObject({ id: "gesture-a", mode: "eraser" });

    const replaced = mergeStudioLiveGesturePreviewElements(
      [before, lagging, after],
      snapshot,
      eligibleKeys(snapshot),
    );
    expect(replaced).toHaveLength(3);
    expect(replaced[0]).toBe(before);
    expect(replaced[1]).not.toBe(lagging);
    expect(replaced[1]).toMatchObject({
      id: "gesture-a",
      mode: "eraser",
      points: [0, 0, 10, 10, 20, 20],
    });
    expect(replaced[2]).toBe(after);
  });

  it("uses authoritative freehand as soon as its sample count catches up", () => {
    const caughtUp = draw("gesture-a", [100, 100, 110, 110, 120, 120]);
    const authoritative: readonly El[] = [caughtUp];

    const merged = mergeStudioLiveGesturePreviewElements(
      authoritative,
      [freehandEntry()],
      new Set([freehandEntry().key]),
    );
    expect(merged).toBe(authoritative);
    expect(merged[0]).toBe(caughtUp);
  });

  it("keeps matching authoritative shape endpoints and substitutes a stale endpoint in place", () => {
    const matching = draw("shape-a", [1, 2, 30, 40], "rect");
    const matchingList: readonly El[] = [matching];
    const snapshot: StudioLiveGesturePreviewSnapshot = [shapeEntry()];
    expect(mergeStudioLiveGesturePreviewElements(
      matchingList,
      snapshot,
      eligibleKeys(snapshot),
    )).toBe(
      matchingList,
    );

    const stale = draw("shape-a", [1, 2, 3, 4], "rect");
    const replaced = mergeStudioLiveGesturePreviewElements(
      [stale],
      snapshot,
      eligibleKeys(snapshot),
    );
    expect(replaced).toHaveLength(1);
    expect(replaced[0]).not.toBe(stale);
    expect(replaced[0]).toMatchObject({ points: [1, 2, 30, 40] });
  });

  it("leaves authoritative elements untouched for retouch and duplicate preview ids", () => {
    const authoritative: readonly El[] = [draw("kept", [0, 0])];
    const retouch = freehandEntry({
      gestureId: "retouch-a",
      operation: "retouch",
      renderer: undefined,
      samples: undefined,
      retouch: {
        tool: "smudge",
        startIndex: 0,
        points: [0.1, 0.2],
        radiusNorm: 0.1,
        strength: 0.5,
      },
      sampleCount: 1,
    });
    const retouchSnapshot: StudioLiveGesturePreviewSnapshot = [retouch];
    expect(mergeStudioLiveGesturePreviewElements(
      authoritative,
      retouchSnapshot,
      eligibleKeys(retouchSnapshot),
    )).toBe(
      authoritative,
    );

    const duplicateIdSnapshot: StudioLiveGesturePreviewSnapshot = [
      freehandEntry(),
      freehandEntry({ key: "8:sender-bgesture-a", senderSessionId: "sender-b" }),
    ];
    // Both sender+gesture identities were independently pinned at begin time. The duplicate
    // authoritative id remains ambiguous and therefore fails closed.
    expect(
      mergeStudioLiveGesturePreviewElements(
        authoritative,
        duplicateIdSnapshot,
        eligibleKeys(duplicateIdSnapshot),
      ),
    ).toBe(authoritative);
  });

  it("requires begin-time absent evidence for the exact sender and gesture key", () => {
    const preExisting = draw("gesture-a", [100, 100]);
    const authoritative: readonly El[] = [preExisting];
    const senderA = freehandEntry();
    const senderB = freehandEntry({
      key: "8:sender-bgesture-a",
      senderSessionId: "sender-b",
    });

    expect(mergeStudioLiveGesturePreviewElements(
      authoritative,
      [senderA],
      new Set(),
    )).toBe(authoritative);
    expect(mergeStudioLiveGesturePreviewElements(
      authoritative,
      [senderB],
      new Set([senderA.key]),
    )).toBe(authoritative);
    expect(mergeStudioLiveGesturePreviewElements(
      [],
      [senderA],
      new Set(),
    )).toEqual([]);
  });
});
