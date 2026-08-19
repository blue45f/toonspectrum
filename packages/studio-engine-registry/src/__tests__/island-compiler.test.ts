import { describe, expect, it } from "vitest";

import { compileRenderIslands } from "../island-compiler";
import { chooseProviderHint, fingerprintRenderScene } from "../workload-fingerprint";

import type { RenderSceneIR } from "@toonspectrum/studio-project-model";

function rect(id: string, x: number): RenderSceneIR["nodes"][number] {
  return {
    id,
    kind: "fill-path",
    opacity: 1,
    blend: "src-over",
    fillRule: "nonzero",
    path: {
      verbs: [
        { v: "M", x, y: 0 },
        { v: "L", x: x + 10, y: 0 },
        { v: "L", x: x + 10, y: 10 },
        { v: "L", x, y: 10 },
        { v: "Z" },
      ],
    },
    paint: { kind: "solid", color: { r: 0, g: 0, b: 0, a: 1 } },
  };
}

describe("RenderIslandCompiler", () => {
  it("keeps consecutive path nodes on one Vello Classic island", () => {
    const scene: RenderSceneIR = {
      version: 13,
      width: 128,
      height: 128,
      background: { r: 1, g: 1, b: 1, a: 1 },
      nodes: [rect("a", 0), rect("b", 12), rect("c", 24)],
    };
    const plan = compileRenderIslands(scene);
    expect(plan.islands).toHaveLength(1);
    expect(plan.islands[0]?.providerHint).toBe("vello-classic");
    expect(plan.islands[0]?.documentIds).toEqual(["a", "b", "c"]);
    expect(plan.islands[0]?.transport).toBe("same-gpu-texture");
  });

  it("does not split path A / image B / path C into per-object islands", () => {
    const scene: RenderSceneIR = {
      version: 13,
      width: 128,
      height: 128,
      background: { r: 1, g: 1, b: 1, a: 1 },
      nodes: [
        rect("path-a", 0),
        {
          id: "photo",
          kind: "image",
          x: 0,
          y: 0,
          width: 32,
          height: 32,
          src: "asset:photo",
          opacity: 1,
          blend: "src-over",
          rotationDeg: 0,
          flipX: false,
          flipY: false,
        },
        rect("path-c", 40),
      ],
    };
    const plan = compileRenderIslands(scene);
    expect(plan.islands.length).toBeLessThanOrEqual(3);
    expect(plan.islands.some((island) => island.providerHint === "vello-hybrid")).toBe(true);
    expect(plan.islands.map((island) => island.nodes.length).every((count) => count >= 1)).toBe(true);
  });

  it("expands a non-isolated mask to a Skia island instead of a per-child split", () => {
    const scene: RenderSceneIR = {
      version: 13,
      width: 64,
      height: 64,
      background: { r: 1, g: 1, b: 1, a: 1 },
      nodes: [
        {
          id: "masked",
          kind: "mask-group",
          opacity: 1,
          blend: "src-over",
          isolated: false,
          mask: { verbs: [{ v: "M", x: 0, y: 0 }, { v: "L", x: 64, y: 0 }, { v: "Z" }] },
          children: [rect("inside", 0), rect("also", 8)],
        },
      ],
    };
    const plan = compileRenderIslands(scene, { mode: "interactive" });
    expect(plan.islands).toHaveLength(1);
    expect(plan.islands[0]?.providerHint).toBe("skia-gpu");
    expect(plan.rejectedInteractiveCpuReadback).toBe(false);
    expect(plan.islands[0]?.transport).not.toBe("cpu-readback");
  });

  it("classifies path-heavy fingerprints as Vello Classic", () => {
    const nodes = Array.from({ length: 20 }, (_, index) => rect(`p${index}`, index * 4));
    const scene: RenderSceneIR = {
      version: 13,
      width: 400,
      height: 64,
      background: { r: 1, g: 1, b: 1, a: 1 },
      nodes,
    };
    const fingerprint = fingerprintRenderScene(scene);
    expect(chooseProviderHint(["render.vector.fill"], fingerprint, "interactive")).toBe(
      "vello-classic",
    );
  });
});
