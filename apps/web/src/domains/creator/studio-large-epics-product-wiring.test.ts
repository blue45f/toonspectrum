import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (relativePath: string): string =>
  readFileSync(path.join(root, relativePath), "utf8");

describe("Studio large-epic production wiring", () => {
  it("connects stroke proposal context and review to the actual editor and AI hub", () => {
    const host = source("apps/web/src/domains/creator/StudioCuttoonEditorHost.tsx");
    const hub = source("apps/web/src/domains/creator/ai/StudioAiAssistHub.tsx");
    expect(host).toContain("useStudioAiCanvasBridge");
    expect(host).toMatch(/appendElement\s*:/u);
    expect(hub).toContain("StudioAdvancedAiTools");
    expect(hub).toContain("advancedAiUserId");
  });

  it("registers the resumable 3D controller and service in the production API module", () => {
    const moduleSource = source("apps/api/src/modules/studio-ai/studio-ai.module.ts");
    expect(moduleSource).toContain("Studio3dGenerationController");
    expect(moduleSource).toContain("Studio3dGenerationService");
    expect(moduleSource).toMatch(/controllers\s*:\s*\[[^\]]*Studio3dGenerationController/su);
    expect(moduleSource).toMatch(/providers\s*:\s*\[[^\]]*Studio3dGenerationService/su);
  });

  it("keeps structured AI candidates connected to the existing comic composer review desk", () => {
    const host = source("apps/web/src/domains/creator/StudioCuttoonEditorHost.tsx");
    const candidateDesk = source("apps/web/src/domains/creator/StudioScenarioCandidateDesk.tsx");
    expect(host).toContain("onImportScenarioProductionPlan");
    expect(candidateDesk).toMatch(/approvedImageCandidateId|selectedImageCandidateId/u);
  });

  it("keeps immutable assets, timeline and effects attached to visible production workspaces", () => {
    const smartLibrary = source("apps/web/src/domains/creator/StudioUnifiedAssetSmartLibrary.tsx");
    const storyboard = source("apps/web/src/domains/creator/StudioStoryboardGridPanel.tsx");
    const layerPanel = source("apps/web/src/domains/creator/layer/StudioLayerEffectsStackPanel.tsx");
    expect(smartLibrary).toMatch(/recent|favorite|project/iu);
    expect(storyboard).toMatch(/review|sequence|control/iu);
    expect(layerPanel).toMatch(/addLayerEffect|reorderLayerEffect/u);
  });

  it("preserves existing 3D texture export and professional Lab color consumers", () => {
    const textureExport = source("apps/web/src/domains/creator/vrm/studio-vrm-texture-paint-export.ts");
    const colorPopover = source("apps/web/src/domains/creator/StudioColorPopover.tsx");
    expect(textureExport).toMatch(/manifest|channelPacking|colorSpace/u);
    expect(colorPopover).toMatch(/hexToLab|labToHex/u);
  });
});
