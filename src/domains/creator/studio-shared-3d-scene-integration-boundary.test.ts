import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const stackSource = readFileSync(
  new URL("./StudioThreeDPreviewPanelStack.tsx", import.meta.url),
  "utf8",
);
const backgroundSource = readFileSync(
  new URL("./StudioBackground3D.tsx", import.meta.url),
  "utf8",
);
const characterSceneContentSource = readFileSync(
  new URL("./StudioBg3dSharedCharacterSceneContent.tsx", import.meta.url),
  "utf8",
);
const characterStatusSource = readFileSync(
  new URL("./StudioBg3dSharedCharacterStatusOverlay.tsx", import.meta.url),
  "utf8",
);
const characterRuntimeSource = readFileSync(
  new URL("./studio-bg3d-shared-vrm-runtime.ts", import.meta.url),
  "utf8",
);
const pageSource = readFileSync(
  new URL("./StudioPage.tsx", import.meta.url),
  "utf8",
);

describe("shared character/background 3D scene integration boundary", () => {
  it("derives a bounded session from live page elements and hands it to the BG3D stage", () => {
    expect(stackSource).toContain("createStudioShared3dSceneSessionFromElements(");
    expect(stackSource).toContain("const sourceElements = masterEditMode ? [] : activePageElements");
    expect(stackSource).toContain("sharedSceneSession={shared3dSceneSession}");
  });

  it("loads the character renderer only inside the shared background scene", () => {
    expect(backgroundSource).toContain("StudioBg3dSharedCharacterSceneContent");
    expect(characterSceneContentSource).toContain(
      '() => import("./StudioBg3dSharedVrmCharacter")',
    );
    expect(backgroundSource).toContain("{sharedCharacterSceneContent}");
    expect(characterStatusSource).toContain("studio-bg3d-shared-characters-status");
    expect(characterStatusSource).toContain("포즈 원본은 각 캐릭터 레이어에 그대로 보존돼요");
    // One mount in the perspective View and one in the mutually exclusive single-view branch;
    // the top/front/right quad Views must not each start another VRM loader.
    expect(backgroundSource.match(/\{sharedCharacterSceneContent\}/gu)).toHaveLength(2);
    const topView = backgroundSource.slice(
      backgroundSource.indexOf("<View track={viewTopRef"),
      backgroundSource.indexOf("<View track={viewFrontRef"),
    );
    const frontView = backgroundSource.slice(
      backgroundSource.indexOf("<View track={viewFrontRef"),
      backgroundSource.indexOf("<View track={viewRightRef"),
    );
    const rightView = backgroundSource.slice(
      backgroundSource.indexOf("<View track={viewRightRef"),
      backgroundSource.indexOf("<View track={viewPerspRef"),
    );
    expect(topView).not.toContain("sharedCharacterSceneContent");
    expect(frontView).not.toContain("sharedCharacterSceneContent");
    expect(rightView).not.toContain("sharedCharacterSceneContent");
  });

  it("resolves both bundled and content-addressed VRM sources without schema conversion", () => {
    expect(characterRuntimeSource).toContain("selectableSampleVrmUrl(scene.model.id)");
    expect(characterRuntimeSource).toContain("getStoredVrmModelByHash(scene.model.hash)");
    expect(characterRuntimeSource).toContain("applyPoseToVrm(");
    expect(characterRuntimeSource).toContain("applyExpressionWeightsToVrm");
    expect(characterRuntimeSource).not.toContain("StudioBg3dModelNode");
  });

  it("hides only receipt-confirmed sources in the same Studio document transition", () => {
    expect(pageSource).toContain("planStudioShared3dCapturedSourceLayerVisibility({");
    expect(pageSource).toContain("let nextElements = [...sharedCharacterVisibility.nextElements]");
    expect(pageSource).toContain("hiddenElementIds.length > 0");
  });
});
