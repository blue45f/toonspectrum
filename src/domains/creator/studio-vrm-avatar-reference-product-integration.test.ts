import { describe, expect, it } from "vitest";

import productSource from "./studio-vrm-avatar-reference-product.ts?raw";
import panelSource from "./StudioVrmAvatarReferenceRecommendationsPanel.tsx?raw";
import poserSource from "./StudioVrmPoser.tsx?raw";

function section(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe("Avatar reference recommendation product wiring", () => {
  it("mounts the fail-closed recommendation panel on the real Avatar Forge screen", () => {
    const forgePanel = section(
      poserSource,
      '<section\n                id="vrm-character-section-forge"',
      "<StudioVrmTexturePaintPanel",
    );
    expect(forgePanel).toContain("<StudioVrmAvatarReferenceRecommendationsPanel");
    expect(forgePanel).toContain("STUDIO_VRM_AVATAR_REFERENCE_APPROVED_CATALOGUE");
    expect(forgePanel).toContain("avatarForgeReferenceInteractionBlocked()");
    expect(productSource).toContain("StudioVrmAvatarReferenceCatalogue | null = null");
    expect(panelSource).toContain("검증된 프리셋 기준 임베딩이 아직 연결되지 않아");
  });

  it("keeps preview ephemeral, reversible, and outside full-state persistence", () => {
    expect(poserSource).toContain(
      "state={avatarForgeReferencePreviewActive?.state ?? avatarForgeState}",
    );
    expect(poserSource).toContain('&& !broadcastPreviewActive\n      ? avatarForgeReferencePreview');
    expect(poserSource).toContain("if (avatarForgeReferencePreviewActive) return false");
    expect(poserSource).toContain("onPreviewClear={() => setAvatarForgeReferencePreview(null)}");
    expect(panelSource).toContain("아직 프로젝트와 되돌리기 기록에는 반영되지 않았습니다");
    expect(productSource).not.toMatch(/localStorage|indexedDB|sessionStorage|FileSystem/u);
  });

  it("commits one receipt-checked appearance apply as one explicit full-state Undo command", () => {
    const apply = section(
      poserSource,
      "function handleAvatarForgeReferenceApply(",
      "function handleAvatarForgeChange(",
    );
    expect(apply.match(/commitStudioVrmFullStateHistoryTransaction\(/gu)).toHaveLength(1);
    expect(apply).toContain("const before = captureFullState()");
    expect(apply).toContain("avatarForge: serializeAvatarForgeState(nextState)");
    expect(apply).toContain("setAvatarForgeState(nextState)");
    expect(apply).toContain("setAvatarForgeReferencePreview(null)");
    expect(productSource).toContain("isStudioVrmAvatarReferenceRecommendationReceipt");
    expect(productSource).toContain("body: current.body");
    expect(productSource).toContain("proportions: current.proportions");
  });

  it("pins catalogue generation to the tracked VRM and every canonical preset state", () => {
    expect(productSource).toContain("sourceByteLength: 15_096_320");
    expect(productSource).toContain(
      "b86b0b8a66d48911431d6f920a5211a974226f83aa672eca3f3dfade58ac346e",
    );
    expect(productSource).toContain("studioVrmAvatarReferencePresetStateSha256");
    expect(productSource).toContain("referenceImageSha256");
    expect(productSource).toContain("candidate.renders.length !== PRESET_IDS.length");
  });
});
