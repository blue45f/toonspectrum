import { describe, expect, it } from "vitest";

import { STUDIO_INK_PRESSURE_MODEL_LINEAR_FULL_V1 } from "./studio-ink-pressure-model";
import {
  createStudioRasterHandoffAuthorityKey,
  createStudioRasterHandoffBaseKey,
  isStudioRasterHandoffCandidateAuthorized,
  readStudioAuthoritativeStageFrame,
  studioRasterAuthorizedOperationIds,
  type StudioRasterHandoffCandidate,
} from "./studio-raster-handoff-authority";

const viewport = {
  surface: { left: 10, top: 20, width: 300, height: 400 },
  transform: {
    scaleX: 2,
    scaleY: 3,
    offsetX: -4,
    offsetY: -5,
    flipX: false,
  },
} as const;

function baseKey(overrides: Partial<Parameters<typeof createStudioRasterHandoffBaseKey>[0]> = {}) {
  return createStudioRasterHandoffBaseKey({
    pageId: "page-a",
    documentWidth: 720,
    documentHeight: 1_200,
    elements: [{
      id: "draw-a",
      type: "draw",
      kind: "freehand",
      mode: "pen",
      points: [1, 2, 3, 4],
      pressures: [0.5, 0.6],
      stroke: "#123456",
      strokeWidth: 4,
      opacity: 1,
      brush: "pen",
      panelClip: "none",
    }],
    viewport,
    ...overrides,
  });
}

function candidate(key: string): StudioRasterHandoffCandidate {
  const sourceOperations = [{ operationId: "draw-a", semanticParameters: "{\"a\":1}" }];
  const rasterLogSha256 = "a".repeat(64);
  return {
    baseKey: key,
    generation: 3,
    operationIds: ["draw-a"],
    rasterLogSha256,
    authorityKey: createStudioRasterHandoffAuthorityKey({
      baseKey: key,
      generation: 3,
      rasterLogSha256,
      sourceOperations,
    }),
  };
}

describe("studio raster handoff authority", () => {
  it("uses exact scene, viewport and gate semantics in the base identity", () => {
    const current = baseKey();
    expect(baseKey()).toBe(current);
    expect(baseKey({ viewport: { ...viewport, surface: { ...viewport.surface, left: 11 } } }))
      .not.toBe(current);
    expect(baseKey({ gates: { exportActive: true } })).not.toBe(current);
    expect(baseKey({ elements: [{
      id: "draw-a",
      type: "draw",
      kind: "freehand",
      mode: "pen",
      points: [1, 2, 3, 4],
      pressures: [0.5, 0.6],
      stroke: "#123456",
      strokeWidth: 4,
      pressureModel: STUDIO_INK_PRESSURE_MODEL_LINEAR_FULL_V1,
      opacity: 1,
      brush: "pen",
      panelClip: "none",
    }] })).not.toBe(current);
    expect(baseKey({ elements: [{
      id: "draw-a",
      type: "draw",
      kind: "freehand",
      mode: "pen",
      points: [1, 2, 3, 4],
      pressures: [0.5, 0.6],
      stroke: "#123456",
      strokeWidth: 4,
      paintModel: "layered-flow-v1",
      opacity: 1,
      brush: "pen",
      panelClip: "none",
    }] })).not.toBe(current);
    expect(baseKey({ elements: [{
      id: "draw-a",
      type: "draw",
      kind: "freehand",
      mode: "pen",
      points: [1, 2, 3, 5],
      pressures: [0.5, 0.6],
      stroke: "#123456",
      strokeWidth: 4,
      opacity: 1,
      brush: "pen",
      panelClip: "none",
    }] })).not.toBe(current);
  });

  it("authorizes only a non-empty exact candidate while every gate stays open", () => {
    const key = baseKey();
    const ready = candidate(key);
    expect(isStudioRasterHandoffCandidateAuthorized({
      candidate: ready,
      currentBaseKey: key,
      authorizedRasterLogSha256: ready.rasterLogSha256,
      blocked: false,
    })).toBe(true);
    expect(isStudioRasterHandoffCandidateAuthorized({
      candidate: ready,
      currentBaseKey: baseKey({ gates: { editActive: true } }),
      authorizedRasterLogSha256: ready.rasterLogSha256,
      blocked: false,
    })).toBe(false);
    expect(isStudioRasterHandoffCandidateAuthorized({
      candidate: ready,
      currentBaseKey: key,
      authorizedRasterLogSha256: ready.rasterLogSha256,
      blocked: true,
    })).toBe(false);
    expect(isStudioRasterHandoffCandidateAuthorized({
      candidate: { ...ready, operationIds: [] },
      currentBaseKey: key,
      authorizedRasterLogSha256: ready.rasterLogSha256,
      blocked: false,
    })).toBe(false);
    expect(isStudioRasterHandoffCandidateAuthorized({
      candidate: { ...ready, operationIds: ["draw-a", "draw-a"] },
      currentBaseKey: key,
      authorizedRasterLogSha256: ready.rasterLogSha256,
      blocked: false,
    })).toBe(false);
    expect(isStudioRasterHandoffCandidateAuthorized({
      candidate: ready,
      currentBaseKey: key,
      authorizedRasterLogSha256: "b".repeat(64),
      blocked: false,
    })).toBe(false);
  });

  it("returns no hidden vector ids for stale or blocked frames", () => {
    const key = baseKey();
    const ready = candidate(key);
    expect([...studioRasterAuthorizedOperationIds({
      candidate: ready,
      currentBaseKey: key,
      authorizedRasterLogSha256: ready.rasterLogSha256,
      blocked: false,
    })]).toEqual(["draw-a"]);
    expect(studioRasterAuthorizedOperationIds({
      candidate: ready,
      currentBaseKey: `${key}:stale`,
      authorizedRasterLogSha256: ready.rasterLogSha256,
      blocked: false,
    }).size).toBe(0);
  });

  it("revokes the raster surface and redraws Konva before a Stage-only readback", () => {
    const calls: string[] = [];
    const value = readStudioAuthoritativeStageFrame({
      revokeRasterHandoff: () => calls.push("revoke"),
      drawStage: () => calls.push("draw"),
      read: () => {
        calls.push("read");
        return "captured";
      },
    });
    expect(value).toBe("captured");
    expect(calls).toEqual(["revoke", "draw", "read"]);
  });
});
