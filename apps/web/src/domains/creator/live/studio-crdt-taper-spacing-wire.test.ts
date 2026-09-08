import { describe, expect, it } from "vitest";

import {
  normalizeStudioBrushDynamicsSettings,
  STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V2,
  STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V3,
  STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V4,
} from "../brush/studio-brush-dynamics";

import { StudioCrdtDocument, type StudioCrdtStrokeRecord } from "./studio-crdt-document";
import {
  studioCrdtStrokeToDrawElement,
  studioDrawElementToCrdtStroke,
  type StudioCrdtCompatibleDrawElement,
} from "./studio-crdt-page-bridge";
import type { StudioCrdtStrokePayloadVersion } from "./studio-crdt-protocol";

function element(depositPipeline: string): StudioCrdtCompatibleDrawElement {
  return {
    id: "taper-spacing-stroke",
    type: "draw",
    kind: "freehand",
    mode: "pen",
    points: [1, 2, 12, 8],
    pressures: [0.5, 0.8],
    tiltXs: [0, 0],
    tiltYs: [0, 0],
    twists: [0, 0],
    speeds: [0, 0],
    tangentialPressures: [0, 0],
    paintModel: "bounded-flow-v2",
    sampleSpacing: 0.25,
    stroke: "#285080",
    strokeWidth: 24,
    brush: "dry-media",
    brushDynamics: normalizeStudioBrushDynamicsSettings({
      depositPipeline,
      seed: 731,
      minimumDiameterRatio: 0.16,
      taper: { enabled: true, startLength: 0.18, minSizeRatio: 0.16 },
    }),
  };
}

function record(source: StudioCrdtCompatibleDrawElement): StudioCrdtStrokeRecord {
  return {
    ...studioDrawElementToCrdtStroke("page-a", source),
    orderIndex: 0,
    status: "finalized",
    deleted: false,
  };
}

describe("taper-aware spacing wire compatibility", () => {
  it.each([
    [STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V2, 3],
    [STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V3, 4],
    [STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V4, 5],
  ] as const)("mints %s as wire %i and preserves it across actual Yjs peers and re-export", (pipeline, version) => {
    const source = element(pipeline);
    const dynamicsBytes = JSON.stringify(source.brushDynamics);
    const input = studioDrawElementToCrdtStroke("page-a", source);
    expect(input.payload.version).toBe(version);
    const author = new StudioCrdtDocument();
    let peer: StudioCrdtDocument | undefined;
    try {
      author.addStroke(input);
      peer = new StudioCrdtDocument(author.encodeStateAsUpdate());
      const restored = peer.getStroke(input.id)!;
      expect(restored.payload.version).toBe(version);
      const decoded = studioCrdtStrokeToDrawElement(restored);
      expect(JSON.stringify(decoded.brushDynamics)).toBe(dynamicsBytes);
      expect(studioDrawElementToCrdtStroke("page-a", decoded)).toEqual(input);
      expect(JSON.stringify(source.brushDynamics)).toBe(dynamicsBytes);
    } finally {
      peer?.destroy();
      author.destroy();
    }
  });

  it.each([1, 2, 3, 4, 6])("rejects V4 on wire %i before document mutation and inverse projection", (version) => {
    const current = record(element(STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V4));
    const poison = {
      ...current,
      payload: { ...current.payload, version: version as StudioCrdtStrokePayloadVersion },
    };
    const document = new StudioCrdtDocument();
    try {
      expect(() => document.addStroke(poison)).toThrow();
      expect(document.getStroke(poison.id)).toBeNull();
      expect(() => studioCrdtStrokeToDrawElement(poison)).toThrow();
    } finally {
      document.destroy();
    }
  });

  it("keeps v4 grain and geometry features on v5 during Yjs recovery", () => {
    const source = element(STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V4);
    source.brushDynamics = normalizeStudioBrushDynamicsSettings({
      ...normalizeStudioBrushDynamicsSettings(source.brushDynamics),
      grain: {
        amount: 0.55,
        scale: 32,
        source: {
          kind: "r8-texture-v1",
          asset: {
            assetId: "paper.canvas-fine.v1",
            encodedSha256: `sha256:${"a".repeat(64)}`,
            decodedSha256: `sha256:${"b".repeat(64)}`,
            byteLength: 2048,
            mediaType: "image/png",
            width: 32,
            height: 32,
            channel: "luminance",
            encoding: "r8-unorm",
          },
        },
      },
    });
    const author = new StudioCrdtDocument();
    let recovered: StudioCrdtDocument | undefined;
    try {
      author.addStroke(studioDrawElementToCrdtStroke("page-a", source));
      recovered = new StudioCrdtDocument(author.encodeStateAsUpdate());
      const stroke = recovered.getStroke(source.id)!;
      expect(stroke.payload.version).toBe(5);
      expect(studioCrdtStrokeToDrawElement(stroke).brushDynamics).toEqual(source.brushDynamics);
    } finally {
      recovered?.destroy();
      author.destroy();
    }
  });
});
