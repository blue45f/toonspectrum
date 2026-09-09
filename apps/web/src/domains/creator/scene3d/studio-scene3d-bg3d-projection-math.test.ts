import { describe, expect, it } from "vitest";

import { studioBg3dFovDegreesToFocalLength } from "../bg3d/studio-bg3d-lens";
import { DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT } from "../bg3d/studio-bg3d-scene-document";
import { projectStudioBg3dDocumentToScene3d } from "./studio-scene3d-bg3d-projection";

describe("BG3D projection math contracts", () => {
  it("uses the canonical vertical-sensor focal conversion", () => {
    const projected = projectStudioBg3dDocumentToScene3d({
      documentId: "lens-contract",
      source: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
      viewportAspectRatio: 1,
      now: "2026-09-10T00:00:00.000Z",
    });

    expect(projected.cameras[0]?.focalLengthMm).toBeCloseTo(
      studioBg3dFovDegreesToFocalLength(
        DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.camera.fovDegrees,
      ),
      12,
    );
  });

  it("fits landscape output inside 4096px without distorting its aspect ratio", () => {
    const aspect = 2.4;
    const projected = projectStudioBg3dDocumentToScene3d({
      documentId: "landscape-contract",
      source: {
        ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
        output: {
          ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.output,
          exportHeight: 2160,
          exportAspectRatio: aspect,
        },
      },
      now: "2026-09-10T00:00:00.000Z",
    });

    expect(Math.max(projected.output.width, projected.output.height)).toBeLessThanOrEqual(4096);
    expect(projected.output.width / projected.output.height).toBeCloseTo(aspect, 2);
  });

  it("fails closed when an automatic legacy ratio has no live viewport measurement", () => {
    expect(() => projectStudioBg3dDocumentToScene3d({
      documentId: "missing-viewport-contract",
      source: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
    })).toThrowError(expect.objectContaining({ code: "missing-viewport-aspect-ratio" }));
  });

  it("preserves disabled AA, no tone mapping, sky identity, fog, and viewport ratio", () => {
    const projected = projectStudioBg3dDocumentToScene3d({
      documentId: "render-contract",
      viewportAspectRatio: 0.75,
      source: {
        ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
        render: {
          ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.render,
          antialias: false,
          toneMapping: "none",
        },
        background: {
          ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.background,
          mode: "sky-preset",
          skyPresetId: "sunset",
          fogEnabled: true,
          fogColor: "#445566",
          fogNear: 2,
          fogFar: 80,
        },
      },
      now: "2026-09-10T00:00:00.000Z",
    });

    expect(projected.output).toMatchObject({
      width: 480,
      height: 640,
      sourceAspectRatioMode: "viewport",
    });
    expect(projected.render).toMatchObject({
      antialiasing: "none",
      toneMapping: "none",
    });
    expect(projected.environment).toMatchObject({
      mode: "procedural-sky",
      proceduralSkyPresetId: "sunset",
      fog: { enabled: true, color: "#445566", near: 2, far: 80 },
    });
  });

});
