import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { AVATAR_FORGE_PRESETS } from "./studio-vrm-avatar-forge";
import { STUDIO_VRM_EXPORT_REQUIRED_BONES } from "./studio-vrm-export-vrm-extension";
import {
  inspectGeneratedVrmHumanoid,
  reloadGeneratedVrmAsHumanoid,
} from "./studio-vrm-generate-inspect";
import {
  createUnavailableStudioVrmGenerateMcpHost,
  generateStudioVrmCharacter,
  resolveStudioVrmGenerateMcpHost,
} from "./studio-vrm-generate-mcp";
import {
  buildStudioVrmGenerateAuthoringSnapshot,
  createStudioVrmGenerateRecipe,
  exportStudioVrmFromGenerateRecipe,
} from "./studio-vrm-generate-recipe";
import { validateVrmGlbBytes } from "./vrm-library";

const PRESET_A = "natural-short";
const PRESET_B = "romance-long";

describe("studio VRM generate surface wiring", () => {
  it("exposes generate/export controls on the shipped Avatar Forge panel and Poser import path", () => {
    const panel = readFileSync(new URL("./StudioVrmAvatarForgePanel.tsx", import.meta.url), "utf8");
    const poser = readFileSync(new URL("./StudioVrmPoser.tsx", import.meta.url), "utf8");
    expect(panel).toContain("data-studio-vrm-generate");
    expect(panel).toContain("data-studio-vrm-generate-submit");
    expect(panel).toContain("data-studio-vrm-generate-export");
    expect(panel).toContain("generateStudioVrmCharacter");
    expect(poser).toContain("onGeneratedFile=");
    expect(poser).toContain("handleGeneratedVrmFile");
  });
});

describe("studio VRM generate recipe", () => {
  it("builds distinct authoring snapshots from two shipped presets", () => {
    expect(AVATAR_FORGE_PRESETS.some((preset) => preset.id === PRESET_A)).toBe(true);
    expect(AVATAR_FORGE_PRESETS.some((preset) => preset.id === PRESET_B)).toBe(true);

    const recipeA = createStudioVrmGenerateRecipe({ presetId: PRESET_A });
    const recipeB = createStudioVrmGenerateRecipe({ presetId: PRESET_B });
    expect(recipeA.presetId).toBe(PRESET_A);
    expect(recipeB.presetId).toBe(PRESET_B);
    expect(recipeA.label).not.toBe(recipeB.label);
    expect(recipeA.state.hair.baseColor).not.toBe(recipeB.state.hair.baseColor);

    const snapshotA = buildStudioVrmGenerateAuthoringSnapshot(recipeA);
    const snapshotB = buildStudioVrmGenerateAuthoringSnapshot(recipeB);
    expect(snapshotA.meta.name).toBe(recipeA.label);
    expect(snapshotB.meta.name).toBe(recipeB.label);
    expect(snapshotA.materials?.[0]?.baseColorFactor).not.toEqual(
      snapshotB.materials?.[0]?.baseColorFactor,
    );
    expect(snapshotA.nodes[3]?.scale).not.toEqual(snapshotB.nodes[3]?.scale);
  });
});

describe("exportStudioVrmFromGenerateRecipe", () => {
  it("emits valid VRM 1.0 humanoids for two distinct presets", async () => {
    const recipeA = createStudioVrmGenerateRecipe({ presetId: PRESET_A });
    const recipeB = createStudioVrmGenerateRecipe({ presetId: PRESET_B });
    const bytesA = exportStudioVrmFromGenerateRecipe(recipeA);
    const bytesB = exportStudioVrmFromGenerateRecipe(recipeB);

    expect(bytesA.byteLength).toBeGreaterThan(200);
    expect(bytesB.byteLength).toBeGreaterThan(200);
    expect([...bytesA]).not.toEqual([...bytesB]);

    expect(validateVrmGlbBytes(bytesA)).toEqual({ vrmVersion: 1 });
    expect(validateVrmGlbBytes(bytesB)).toEqual({ vrmVersion: 1 });

    const humanoidA = inspectGeneratedVrmHumanoid(bytesA);
    const humanoidB = inspectGeneratedVrmHumanoid(bytesB);
    expect(humanoidA.isCompleteHumanoid).toBe(true);
    expect(humanoidB.isCompleteHumanoid).toBe(true);
    expect(humanoidA.humanoidBoneNames).toEqual([...STUDIO_VRM_EXPORT_REQUIRED_BONES].sort());

    const reloadedA = await reloadGeneratedVrmAsHumanoid(bytesA);
    const reloadedB = await reloadGeneratedVrmAsHumanoid(bytesB);
    expect(reloadedA.missingBones).toEqual([]);
    expect(reloadedB.missingBones).toEqual([]);
    expect(reloadedA.presentBones).toHaveLength(STUDIO_VRM_EXPORT_REQUIRED_BONES.length);
    expect(reloadedA.name).toBe(recipeA.label);
    expect(reloadedB.name).toBe(recipeB.label);
  });
});

describe("generateStudioVrmCharacter MCP adapter", () => {
  it("fails closed when the generate MCP host is missing", async () => {
    const result = await generateStudioVrmCharacter(
      { presetId: PRESET_A },
      { host: createUnavailableStudioVrmGenerateMcpHost() },
    );
    expect(result).toEqual({
      status: "unavailable",
      code: "vrm_generate_mcp_unavailable",
      message: expect.stringContaining("MCP"),
      hostId: "missing-vrm-generate-mcp",
    });
  });

  it("fails closed when the host env disables generation", async () => {
    const host = resolveStudioVrmGenerateMcpHost({ STUDIO_VRM_GENERATE_MCP: "none" });
    const result = await generateStudioVrmCharacter({ presetId: PRESET_B }, { host });
    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") throw new Error("expected unavailable");
    expect(result.hostId).toBe("disabled-vrm-generate-mcp");
  });

  it("uses the local generate MCP to emit a reloadable humanoid", async () => {
    const result = await generateStudioVrmCharacter({ presetId: PRESET_A });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected generated VRM");
    expect(result.hostId).toBe("toonspectrum-vrm-generate");
    expect(result.vrmVersion).toBe(1);
    expect(result.isCompleteHumanoid).toBe(true);
    expect(validateVrmGlbBytes(result.bytes)).toEqual({ vrmVersion: 1 });
    const reloaded = await reloadGeneratedVrmAsHumanoid(result.bytes);
    expect(reloaded.missingBones).toEqual([]);
    expect(reloaded.name).toBe(result.recipe.label);
  });
});
