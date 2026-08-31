import { describe, expect, it } from "vitest";

import {
  createPresentOnlyFrameGraph,
  frameGraphIRSchema,
  renderSceneIRSchema,
  renderSceneToSceneIR,
  sceneIRToRenderScene,
} from "../index";

describe("V13 RenderSceneIR / FrameGraphIR", () => {
  it("round-trips a mixed image + path render scene without storing GPU handles", () => {
    const parsed = renderSceneIRSchema.parse({
      version: 13,
      width: 256,
      height: 128,
      background: { r: 1, g: 1, b: 1, a: 1 },
      nodes: [
        {
          id: "panel",
          kind: "fill-path",
          path: {
            verbs: [
              { v: "M", x: 0, y: 0 },
              { v: "L", x: 100, y: 0 },
              { v: "L", x: 100, y: 80 },
              { v: "L", x: 0, y: 80 },
              { v: "Z" },
            ],
          },
          paint: { kind: "solid", color: { r: 1, g: 1, b: 1, a: 1 } },
        },
        {
          id: "photo",
          kind: "image",
          x: 8,
          y: 8,
          width: 80,
          height: 60,
          src: "asset:photo-1",
        },
      ],
    });
    expect(parsed.nodes.map((node) => node.kind)).toEqual(["fill-path", "image"]);
    const vector = renderSceneToSceneIR(parsed);
    expect(vector.version).toBe(11);
    expect(vector.nodes).toHaveLength(1);
    expect(vector.nodes[0]?.kind).toBe("fill-path");
  });

  it("promotes a v11 SceneIR into a v13 render scene", () => {
    const render = sceneIRToRenderScene({
      version: 11,
      width: 16,
      height: 16,
      background: { r: 0, g: 0, b: 0, a: 0 },
      nodes: [],
    });
    expect(render.version).toBe(13);
    expect(render.width).toBe(16);
  });

  it("rejects storing a raw GPU object on a texture handle", () => {
    expect(() =>
      frameGraphIRSchema.parse({
        version: 13,
        surfaceId: "studio",
        deviceEpoch: 1,
        width: 8,
        height: 8,
        passes: [{ id: "present", kind: "present" }],
        textures: [{ id: {} }],
      }),
    ).toThrow();
    const graph = createPresentOnlyFrameGraph({
      surfaceId: "studio",
      width: 8,
      height: 8,
      deviceEpoch: 4,
    });
    expect(graph.passes.map((pass) => pass.kind)).toEqual(["present"]);
  });

  it("rejects a legacy island fallback chain instead of silently stripping it", () => {
    expect(() =>
      frameGraphIRSchema.parse({
        version: 13,
        surfaceId: "studio",
        deviceEpoch: 1,
        width: 8,
        height: 8,
        textures: [
          { id: "document", width: 8, height: 8, revision: 0 },
        ],
        islands: [
          {
            id: "document-island",
            providerId: "vello-hybrid-wgpu",
            fallbackChain: ["vello-gpu-browser", "vello-cpu"],
            transport: "same-gpu-texture",
            textureHandle: "document",
          },
        ],
        passes: [{ id: "present", kind: "present" }],
      }),
    ).toThrow(/unrecognized key.*fallbackChain/i);
  });
});
