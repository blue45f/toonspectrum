import { describe, expect, it } from "vitest";

import { DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT } from "../bg3d/studio-bg3d-scene-document";
import { projectStudioBg3dDocumentToScene3d } from "./studio-scene3d-bg3d-projection";
import { buildStudioScene3dNprRenderGraph } from "./studio-scene3d-npr-render-graph";

import type { StudioScene3dDeviceCapabilities } from "./studio-scene3d-runtime-policy";

const WEBGPU: StudioScene3dDeviceCapabilities = Object.freeze({
  webgpu: true,
  webgl2: true,
  computeShaders: true,
  timestampQueries: true,
  float16Shaders: true,
  compressedTextureAstc: true,
  compressedTextureBc: false,
  compressedTextureEtc2: true,
  maxTextureDimension2d: 16_384,
  deviceMemoryGiB: 8,
});

function document(transparentBackground = false) {
  return projectStudioBg3dDocumentToScene3d({
    documentId: "npr-test",
    source: {
      ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
      output: {
        ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.output,
        transparentBackground,
      },
    },
    viewportAspectRatio: 16 / 9,
    now: "2026-09-17T00:00:00.000Z",
  });
}

describe("Studio Scene3D NPR render graph", () => {
  it("expands line and tone into deterministic dependency-ordered passes", () => {
    const graph = buildStudioScene3dNprRenderGraph({
      document: document(),
      capabilities: WEBGPU,
      requestedPasses: ["line", "tone"],
    });
    const index = (pass: string) => graph.executionOrder.indexOf(pass as never);
    expect(index("depth")).toBeLessThan(index("line"));
    expect(index("normal")).toBeLessThan(index("line"));
    expect(index("object-id")).toBeLessThan(index("line"));
    expect(index("material-id")).toBeLessThan(index("line"));
    expect(index("beauty")).toBeLessThan(index("tone"));
    expect(index("shadow")).toBeLessThan(index("tone"));
    expect(index("ao")).toBeLessThan(index("tone"));
    expect(graph.runtimePlan.primaryRenderer).toBe("three-webgpu");
    expect(graph.passes.find(({ id }) => id === "depth")).toMatchObject({
      executor: "three-primary",
      fallbackRuntime: "three-webgl2",
    });
  });

  it("keeps Babylon isolated to an explicit FX overlay job", () => {
    const graph = buildStudioScene3dNprRenderGraph({
      document: document(),
      capabilities: WEBGPU,
      requestedPasses: ["beauty", "line"],
      fx: { rain: true, bloom: true },
      babylonSpecialistAvailable: true,
    });
    expect(graph.fxSpecialistEnabled).toBe(true);
    expect(graph.executionOrder).toContain("fx-overlay");
    expect(graph.passes.find(({ id }) => id === "fx-overlay")).toMatchObject({
      executor: "babylon-specialist",
      runtime: "babylon",
      fallbackRuntime: null,
    });
    expect(graph.passes.filter(({ executor }) => executor === "babylon-specialist"))
      .toHaveLength(1);
    expect(graph.passes.find(({ id }) => id === "beauty")?.dependencies)
      .toContain("fx-overlay");
  });

  it("fails soft without silently giving Babylon scene authority", () => {
    const graph = buildStudioScene3dNprRenderGraph({
      document: document(true),
      capabilities: { ...WEBGPU, webgpu: false, computeShaders: false },
      requestedPasses: ["beauty"],
      fx: { snow: true },
      babylonSpecialistAvailable: false,
    });
    expect(graph.runtimePlan.primaryRenderer).toBe("three-webgl2");
    expect(graph.fxSpecialistEnabled).toBe(false);
    expect(graph.executionOrder).not.toContain("fx-overlay");
    expect(graph.executionOrder).toContain("transparent-beauty");
    expect(graph.warnings.join(" ")).toContain("Babylon FX specialist");
    expect(graph.warnings.join(" ")).toContain("WebGL2");
  });
});
