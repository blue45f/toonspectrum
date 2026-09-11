import { describe, expect, it } from "vitest";

import { planStudioWebtoon3dRender } from "./studio-webtoon-3d-render";

const SCENE = Object.freeze({
  id: "school-scene",
  cameraId: "camera-1",
  lightRigId: "daylight",
  widthPx: 1600,
  heightPx: 2000,
  transparentBackground: true,
  assets: [{
    id: "school",
    title: "학교",
    triangles: 200_000,
    materials: 8,
    hasNormals: true,
    hasUv: true,
    rightsStatus: "allowed" as const,
  }],
});

describe("Studio webtoon 3D render planning", () => {
  it("builds stable PSD-style pass layers for webtoon finishing", () => {
    expect(planStudioWebtoon3dRender(SCENE, {
      passes: ["color", "line", "shadow", "depth", "object-mask"],
      output: "psd",
      lineStyleId: "webtoon-ink",
      preserveEditableScene: true,
    })).toMatchObject({
      status: "ready",
      mode: "full",
      preserveEditableScene: true,
      layers: [
        { pass: "color", name: "01_Color", blendMode: "normal" },
        { pass: "line", name: "02_Line", blendMode: "multiply" },
        { pass: "shadow", name: "03_Shadow", blendMode: "multiply" },
        { pass: "depth", name: "05_Depth", blendMode: "normal" },
        { pass: "object-mask", name: "07_Object_Mask", blendMode: "normal" },
      ],
    });
  });

  it("blocks missing camera, line setup and asset rights", () => {
    const plan = planStudioWebtoon3dRender({
      ...SCENE,
      cameraId: null,
      assets: [{ ...SCENE.assets[0]!, rightsStatus: "blocked" }],
    }, {
      passes: ["line"],
      output: "document-layers",
      lineStyleId: null,
      preserveEditableScene: true,
    });
    expect(plan.status).toBe("blocked");
    expect(plan.findings).toEqual(expect.arrayContaining([
      "camera-missing",
      "line-style-missing",
      "asset-rights-blocked",
    ]));
  });

  it("uses a proxy only for preview while retaining the editable scene", () => {
    expect(planStudioWebtoon3dRender({
      ...SCENE,
      assets: [{ ...SCENE.assets[0]!, triangles: 1_000_000 }],
    }, {
      passes: ["color"],
      output: "png-set",
      lineStyleId: null,
      preserveEditableScene: true,
    })).toMatchObject({
      status: "review",
      mode: "proxy",
      preserveEditableScene: true,
      findings: ["proxy-preview-recommended"],
    });
  });
});
