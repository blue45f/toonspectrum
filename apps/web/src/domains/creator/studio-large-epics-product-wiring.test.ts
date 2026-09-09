import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = join(process.cwd());
const source = (relativePath: string) =>
  readFileSync(join(repoRoot, relativePath), "utf8");

describe("large Studio epic product wiring", () => {
  it("connects the advanced AI surface to bridge-backed proposal review", () => {
    const advancedTools = source(
      "apps/web/src/domains/creator/ai/StudioAdvancedAiTools.tsx",
    );
    const connectedPanel = source(
      "apps/web/src/domains/creator/ai/StudioConnectedStrokeProposalPanel.tsx",
    );
    const bridge = source(
      "apps/web/src/domains/creator/ai/studio-stroke-proposal-bridge.ts",
    );

    expect(advancedTools).toContain("<StudioConnectedStrokeProposalPanel />");
    expect(connectedPanel).toContain("useStudioStrokeProposalBridgeSnapshot()");
    expect(connectedPanel).toContain("applyStudioStrokeProposalTransaction");
    expect(bridge).toContain("export function useStudioAiCanvasBridge");
    expect(bridge).toContain("input.appendElement");
    expect(bridge).toContain("input.replaceElement");
  });

  it("keeps 3D generation on the authenticated advanced AI surface", () => {
    const advancedTools = source(
      "apps/web/src/domains/creator/ai/StudioAdvancedAiTools.tsx",
    );
    const panel = source(
      "apps/web/src/domains/creator/ai/StudioAi3dGenerationPanel.tsx",
    );

    expect(advancedTools).toContain("new Studio3dGenerationHttpClient({ userId");
    expect(advancedTools).toContain("userId={userId}");
    expect(advancedTools).toContain("onInsertArtifact={");
    expect(advancedTools).toContain("onSaveArtifact={");
    expect(panel).toContain("readonly client: Studio3dGenerationHttpClient");
    expect(panel).toContain("readonly onInsertArtifact?:");
    expect(panel).toContain("readonly onSaveArtifact?:");
  });

  it("registers the 3D generation controller and service in the Studio AI API module", () => {
    const moduleSource = source(
      "apps/api/src/modules/studio-ai/studio-ai.module.ts",
    );

    expect(moduleSource).toContain("Studio3dGenerationController");
    expect(moduleSource).toContain("Studio3dGenerationService");
  });

  it("keeps perceptual color sliders on the shared Lab conversion core", () => {
    const sliders = source(
      "apps/web/src/domains/creator/StudioColorSlidersPanel.tsx",
    );
    const labCore = source(
      "apps/web/src/domains/creator/studio-lab-color.ts",
    );

    expect(sliders).toContain('from "./studio-lab-color"');
    expect(sliders).toContain("hexToLab");
    expect(sliders).toContain("labToHex");
    expect(labCore).toContain("export function hexToLab");
    expect(labCore).toContain("export function labToHex");
  });
});
