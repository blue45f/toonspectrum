import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { hasValidStudioCrdtRootSchema, hasValidStudioCrdtStrokePaintContract } from "../../../../../api/src/modules/creator/studio-crdt-root-schema";
import { BRUSH_STUDIO_V6_RECIPES, createBrushStudioV6Program } from "../brush-lab/brush-studio-v6-engine";
import { createBrushStudioV6ProductBrush } from "../brush-lab/brush-studio-v6-product-bridge";
import { studioBrushEngineProgramSetFromOil } from "../brush/studio-brush-engine-program-set";
import { planStudioMaterialBrush, type StudioMaterialBrushElement } from "../brush/studio-material-brush-runtime";
import { StudioCrdtDocument, type StudioCrdtDrawStrokePayload } from "./studio-crdt-document";
import { studioCrdtStrokeToDrawElement, studioDrawElementToCrdtStroke, type StudioCrdtCompatibleDrawElement } from "./studio-crdt-page-bridge";
import { STUDIO_CRDT_ENGINE_PROGRAM_STROKE_PAYLOAD_VERSION } from "./studio-crdt-protocol";

function materialStroke(recipe = "oil-hair-mixer"): StudioCrdtCompatibleDrawElement {
  const saved = createBrushStudioV6ProductBrush(createBrushStudioV6Program(recipe));
  return {
    id: "material-stroke", type: "draw", kind: "freehand", mode: "pen", brush: saved.brushId,
    points: [10, 20, 35, 30, 70, 15], pressures: [0.2, 0.7, 0.4], tiltXs: [0, 30, 15],
    stroke: saved.color, strokeWidth: saved.strokeWidth, opacity: saved.brushOpacity,
    brushEnginePrograms: saved.enginePrograms!, symmetry: { type: "vertical", centerX: 100, centerY: 0 },
  };
}

function serverDocument(payload: StudioCrdtDrawStrokePayload): Y.Doc {
  const local = new StudioCrdtDocument();
  local.addStroke({ id: "material-stroke", pageId: "page-a", layerId: "page-root", payload });
  const server = new Y.Doc();
  Y.applyUpdate(server, local.encodeStateAsUpdate());
  local.destroy();
  return server;
}

describe("versioned collaborative material brushes", () => {
  it("preserves every recipe and rendered contact across real Yjs transport and server admission", () => {
    for (const recipe of BRUSH_STUDIO_V6_RECIPES) {
      const source = materialStroke(recipe.id);
      const encoded = studioDrawElementToCrdtStroke("page-a", source);
      expect(encoded.payload.version).toBe(STUDIO_CRDT_ENGINE_PROGRAM_STROKE_PAYLOAD_VERSION);
      expect(encoded.payload.extensions?.brushEnginePrograms).toEqual(source.brushEnginePrograms);
      const server = serverDocument(encoded.payload);
      expect(hasValidStudioCrdtRootSchema(server), recipe.id).toBe(true);
      const remote = new StudioCrdtDocument(Y.encodeStateAsUpdate(server));
      const decoded = studioCrdtStrokeToDrawElement(remote.getStroke(source.id)!);
      expect(decoded.brushEnginePrograms, recipe.id).toEqual(source.brushEnginePrograms);
      expect(planStudioMaterialBrush(decoded as StudioMaterialBrushElement), recipe.id).toEqual(planStudioMaterialBrush(source as StudioMaterialBrushElement));
      expect(decoded.points).toEqual(source.points);
      remote.destroy();
      server.destroy();
    }
  });

  it("admits the paint contract on wire v6 only alongside a validated engine program", () => {
    const programs = materialStroke().brushEnginePrograms;
    const input = { payloadVersion: 6, paintModel: "layered-flow-v1", brush: "marker", sampleSpacing: 0.5 };
    expect(hasValidStudioCrdtStrokePaintContract(input)).toBe(false);
    expect(hasValidStudioCrdtStrokePaintContract({ ...input, brushEnginePrograms: programs })).toBe(true);
    expect(hasValidStudioCrdtStrokePaintContract({ ...input, payloadVersion: 5, brushEnginePrograms: programs })).toBe(false);
  });

  it("preserves legacy payload versions when no engine override is present", () => {
    const source = materialStroke();
    delete source.brushEnginePrograms;
    const encoded = studioDrawElementToCrdtStroke("page-a", source);
    expect(encoded.payload.version).toBe(1);
    expect(encoded.payload.extensions).toBeUndefined();
    const server = serverDocument(encoded.payload);
    expect(hasValidStudioCrdtRootSchema(server)).toBe(true);
    server.destroy();
  });

  it("also preserves existing oil program switches instead of losing them in collaboration", () => {
    const source = materialStroke();
    source.brushEnginePrograms = studioBrushEngineProgramSetFromOil({ bristlePhysics: false, bristleLoadDynamics: true, impastoRelief: true });
    const encoded = studioDrawElementToCrdtStroke("page-a", source);
    const server = serverDocument(encoded.payload);
    expect(hasValidStudioCrdtRootSchema(server)).toBe(true);
    const remote = new StudioCrdtDocument(Y.encodeStateAsUpdate(server));
    expect(studioCrdtStrokeToDrawElement(remote.getStroke(source.id)!).brushEnginePrograms).toEqual(source.brushEnginePrograms);
    remote.destroy();
    server.destroy();
  });

  it.each([1, 2, 3, 4, 5] as const)("rejects material overrides carried by legacy wire v%i", (version) => {
    const encoded = studioDrawElementToCrdtStroke("page-a", materialStroke());
    const server = serverDocument(encoded.payload);
    const record = server.getMap<Y.Map<unknown>>("strokes").get("material-stroke")!;
    record.set("payloadVersion", version);
    expect(hasValidStudioCrdtRootSchema(server)).toBe(false);
    const local = new StudioCrdtDocument();
    expect(() => local.addStroke({ ...encoded, payload: { ...encoded.payload, version } })).toThrow(/엔진 프로그램/);
    local.destroy();
    server.destroy();
  });

  it.each(["missing", "future-program", "future-material", "out-of-range", "missing-tuning", "unknown-field"] as const)("rejects %s material metadata on both browser and authoritative server", (kind) => {
    const encoded = studioDrawElementToCrdtStroke("page-a", materialStroke());
    const server = serverDocument(encoded.payload);
    const extensions = JSON.parse(JSON.stringify(encoded.payload.extensions)) as Record<string, unknown>;
    const programs = extensions.brushEnginePrograms as { version: number; material: { version: number; tuning: Record<string, number> }; unsupported?: string };
    if (kind === "missing") delete extensions.brushEnginePrograms;
    if (kind === "future-program") programs.version = 2;
    if (kind === "future-material") programs.material.version = 2;
    if (kind === "out-of-range") programs.material.tuning.size = 1_000_000;
    if (kind === "missing-tuning") delete programs.material.tuning.flow;
    if (kind === "unknown-field") programs.unsupported = "future-renderer";
    server.getMap<Y.Map<unknown>>("strokes").get("material-stroke")!.set("extensions", extensions);
    expect(hasValidStudioCrdtRootSchema(server)).toBe(false);
    const local = new StudioCrdtDocument();
    const payload = { ...encoded.payload, extensions } as StudioCrdtDrawStrokePayload;
    expect(() => local.addStroke({ ...encoded, payload })).toThrow(/엔진 프로그램/);
    expect(() => studioCrdtStrokeToDrawElement({ ...encoded, payload, status: "finalized", deleted: false, orderIndex: 0 })).toThrow(/엔진 프로그램/);
    local.destroy();
    server.destroy();
  });

  it("rejects invalid program data before encoding can silently substitute a generic brush", () => {
    const source = materialStroke();
    const invalid = JSON.parse(JSON.stringify(source)) as StudioCrdtCompatibleDrawElement;
    Object.assign(invalid.brushEnginePrograms!.material!, { version: 2 });
    expect(() => studioDrawElementToCrdtStroke("page-a", invalid)).toThrow(/엔진 프로그램/);
  });
});
