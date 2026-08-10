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
const characterSource = readFileSync(
  new URL("./StudioBg3dSharedVrmCharacter.tsx", import.meta.url),
  "utf8",
);
const appearanceRuntimeSource = readFileSync(
  new URL("./StudioBg3dSharedVrmAppearanceRuntime.tsx", import.meta.url),
  "utf8",
);
const characterRuntimeSource = readFileSync(
  new URL("./studio-bg3d-shared-vrm-runtime.ts", import.meta.url),
  "utf8",
);
const appearancePlanSource = readFileSync(
  new URL("./studio-vrm-linked-appearance-projection-plan.ts", import.meta.url),
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
    expect(backgroundSource).not.toContain("StudioBg3dSharedVrmCharacter");
    expect(characterSceneContentSource.match(
      /["']\.\/StudioBg3dSharedVrmCharacter["']/gu,
    )).toHaveLength(1);
    expect(backgroundSource).toContain("{sharedCharacterSceneContent}");
    expect(characterStatusSource).toContain("studio-bg3d-shared-characters-status");
    expect(characterStatusSource).toContain("포즈 원본은 각 캐릭터 레이어에 그대로 보존돼요");
    // The main View is a single stable owner in both single and quad layouts. Capture must never
    // move the character beneath another parent and restart its VRM/appearance generation.
    expect(backgroundSource.match(/\{sharedCharacterSceneContent\}/gu)).toHaveLength(1);
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
      backgroundSource.indexOf('<View\n                    key="studio-bg3d-main-view"'),
    );
    expect(topView).not.toContain("sharedCharacterSceneContent");
    expect(frontView).not.toContain("sharedCharacterSceneContent");
    expect(rightView).not.toContain("sharedCharacterSceneContent");
    expect(backgroundSource).toContain(
      "const mainViewTrackRef = effectiveIsQuadView ? viewPerspRef : viewportHostRef;",
    );
    expect(backgroundSource).toContain(
      "const effectiveIsQuadView = isQuadView && !physicsInteractionLocked && !placementActive;",
    );
  });

  it("keeps capture and viewport authority exclusively inside the stable main View", () => {
    const sceneContentStart = backgroundSource.indexOf("const sceneContent = (");
    const mainViewStart = backgroundSource.indexOf(
      '<View\n                    key="studio-bg3d-main-view"',
    );
    const mainViewEnd = backgroundSource.indexOf("</View>", mainViewStart);
    expect(sceneContentStart).toBeGreaterThanOrEqual(0);
    expect(mainViewStart).toBeGreaterThan(sceneContentStart);
    const sceneContent = backgroundSource.slice(sceneContentStart, mainViewStart);
    const mainView = backgroundSource.slice(mainViewStart, mainViewEnd);
    expect(sceneContent).not.toContain("<CaptureBridge");
    expect(sceneContent).not.toContain("<BgViewportController");
    expect(mainView.match(/<CaptureBridge/gu)).toHaveLength(1);
    expect(mainView.match(/<BgViewportController/gu)).toHaveLength(1);
  });

  it("reuses the loaded VRM until the linked model identity changes", () => {
    expect(characterSceneContentSource).toContain(
      "<Suspense key={source.modelRuntimeKey} fallback={null}>",
    );
    expect(characterSceneContentSource).not.toContain(
      "<Suspense key={source.runtimeKey}",
    );
  });

  it("measures the pristine rig before projecting pose, wardrobe, props, or costume state", () => {
    const wardrobeMeasurement = characterSource.indexOf(
      "measureStudioVrmWardrobeMetrics(loaded)",
    );
    const propMeasurement = characterSource.indexOf("measureVrmPropRigMetrics(loaded)");
    const costumeCollection = characterSource.indexOf("collectStudioVrmCostumeMeshes(loaded)");
    const assetAdmission = characterSource.indexOf("setAsset({ vrm: loaded");
    expect(wardrobeMeasurement).toBeGreaterThan(0);
    expect(propMeasurement).toBeGreaterThan(wardrobeMeasurement);
    expect(costumeCollection).toBeGreaterThan(propMeasurement);
    expect(assetAdmission).toBeGreaterThan(costumeCollection);
    expect(characterSource).toContain("<StudioBg3dSharedVrmAppearanceRuntime");
  });

  it("keeps the two-frame receipt gate inside the already-lazy character leaf", () => {
    expect(appearanceRuntimeSource).toContain("StudioVrmPropAttachment");
    expect(appearanceRuntimeSource).toContain("StudioVrmWardrobeAttachment");
    expect(appearanceRuntimeSource).toContain("StudioVrmRuntimeCommit");
    expect(appearanceRuntimeSource).toContain('kind: "runtime-commit"');
    expect(appearanceRuntimeSource).toContain('kind: "post-commit"');
    expect(appearanceRuntimeSource).toContain("frame > current.commitFrame");
    expect(appearanceRuntimeSource.match(/invalidate\(\)/gu)?.length).toBeGreaterThanOrEqual(2);
    expect(characterSceneContentSource).not.toContain(
      "StudioBg3dSharedVrmAppearanceRuntime",
    );
  });

  it("keeps appearance planning pure and outside the heavy renderer boundary", () => {
    expect(appearancePlanSource).not.toMatch(/from ["'](?:react|three|@react-three\/fiber)/u);
    expect(appearancePlanSource).not.toContain("StudioVrmPoser");
    expect(appearancePlanSource).toContain("inspectVrmPropsDocumentForProjection");
    expect(characterSceneContentSource).not.toContain(
      "studio-vrm-linked-appearance-projection-plan",
    );
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
