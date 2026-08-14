import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { ImageEmbedder } from "@mediapipe/tasks-vision";
import { describe, expect, it } from "vitest";

import {
  AVATAR_FORGE_PRESETS,
  applyAvatarForgeBodyPreset,
  createAvatarForgeState,
} from "./studio-vrm-avatar-forge";
import {
  STUDIO_VRM_AVATAR_REFERENCE_APPROVED_CATALOGUE,
  STUDIO_VRM_AVATAR_REFERENCE_CANONICAL_RENDER_AUTHORITY,
  admitStudioVrmAvatarReferenceCatalogueEnvelope,
  resolveStudioVrmAvatarReferenceAppearanceState,
  studioVrmAvatarReferencePresetStateSha256,
} from "./studio-vrm-avatar-reference-product";
import {
  STUDIO_VRM_AVATAR_REFERENCE_MODEL_ID,
  STUDIO_VRM_AVATAR_REFERENCE_MODEL_REVISION,
  STUDIO_VRM_AVATAR_REFERENCE_MODEL_SHA256,
  STUDIO_VRM_AVATAR_REFERENCE_PROTOCOL_VERSION,
  STUDIO_VRM_AVATAR_REFERENCE_PROVIDER_ID,
  rankStudioVrmAvatarReferenceRecommendations,
  type StudioVrmAvatarReferenceCatalogue,
} from "./studio-vrm-avatar-reference-recommendation";

function catalogue(presetIds = ["natural-short", "soft-bob"]): StudioVrmAvatarReferenceCatalogue {
  return {
    version: STUDIO_VRM_AVATAR_REFERENCE_PROTOCOL_VERSION,
    providerId: STUDIO_VRM_AVATAR_REFERENCE_PROVIDER_ID,
    modelId: STUDIO_VRM_AVATAR_REFERENCE_MODEL_ID,
    modelRevision: STUDIO_VRM_AVATAR_REFERENCE_MODEL_REVISION,
    modelSha256: STUDIO_VRM_AVATAR_REFERENCE_MODEL_SHA256,
    catalogueRevision: "avatar-forge-render-v1",
    entries: presetIds.map((presetId, index) => ({
      presetId,
      embedding: {
        headIndex: 0,
        headName: "feature",
        floatEmbedding: index === 0 ? [1, 0] : [0, 1],
      },
    })),
  };
}

function selection(source = catalogue()) {
  const receipt = rankStudioVrmAvatarReferenceRecommendations({
    catalogue: source,
    queryEmbedding: { headIndex: 0, headName: "feature", floatEmbedding: [1, 0] },
    queryEmbeddingSha256: "a".repeat(64),
    topK: 2,
    cosineSimilarity: ImageEmbedder.cosineSimilarity,
  });
  return {
    presetId: "natural-short",
    state: createAvatarForgeState("natural-short"),
    receipt,
  };
}

function completeEnvelope() {
  const presetIds = AVATAR_FORGE_PRESETS.map(({ id }) => id);
  return {
    authority: { ...STUDIO_VRM_AVATAR_REFERENCE_CANONICAL_RENDER_AUTHORITY },
    renders: presetIds.map((presetId, index) => ({
      presetId,
      presetStateSha256: studioVrmAvatarReferencePresetStateSha256(presetId)!,
      referenceImageSha256: index.toString(16).padStart(64, "0"),
    })),
    catalogue: catalogue(presetIds),
  };
}

describe("Avatar reference recommendation product authority", () => {
  it("pins the tracked canonical VRM to its real repository bytes", () => {
    const bytes = readFileSync(new URL("../../../public/vrm/AvatarSample_A.vrm", import.meta.url));
    expect(bytes.byteLength).toBe(
      STUDIO_VRM_AVATAR_REFERENCE_CANONICAL_RENDER_AUTHORITY.sourceByteLength,
    );
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      STUDIO_VRM_AVATAR_REFERENCE_CANONICAL_RENDER_AUTHORITY.sourceSha256,
    );
  });

  it("admits only a complete all-preset render envelope tied to exact state and image hashes", () => {
    const source = completeEnvelope();
    const admitted = admitStudioVrmAvatarReferenceCatalogueEnvelope(source);
    expect(admitted?.renders).toHaveLength(AVATAR_FORGE_PRESETS.length);
    expect(admitted?.catalogue.entries).toHaveLength(AVATAR_FORGE_PRESETS.length);
    expect(Object.isFrozen(admitted?.renders)).toBe(true);

    expect(admitStudioVrmAvatarReferenceCatalogueEnvelope({
      ...source,
      renders: source.renders.slice(1),
    })).toBeNull();
    expect(admitStudioVrmAvatarReferenceCatalogueEnvelope({
      ...source,
      authority: { ...source.authority, rendererRevision: "latest" },
    })).toBeNull();
    expect(admitStudioVrmAvatarReferenceCatalogueEnvelope({
      ...source,
      renders: source.renders.map((entry, index) => index === 0
        ? { ...entry, presetStateSha256: "f".repeat(64) }
        : entry),
    })).toBeNull();
  });

  it("keeps production unavailable until an approved envelope is committed", () => {
    expect(STUDIO_VRM_AVATAR_REFERENCE_APPROVED_CATALOGUE).toBeNull();
  });

  it("applies only receipt-bound preset appearance while preserving body and proportions", () => {
    const source = catalogue();
    const current = applyAvatarForgeBodyPreset(createAvatarForgeState("wave-diva"), "hero");
    const next = resolveStudioVrmAvatarReferenceAppearanceState({
      current,
      selection: selection(source),
      catalogue: source,
    });

    expect(next).not.toBeNull();
    expect(next?.hair).toEqual(createAvatarForgeState("natural-short").hair);
    expect(next?.face).toEqual(createAvatarForgeState("natural-short").face);
    expect(next?.body).toEqual(current.body);
    expect(next?.bodyPresetId).toBe(current.bodyPresetId);
    expect(next?.proportions).toEqual(current.proportions);
    expect(next?.presetId).toBeUndefined();
  });

  it("rejects a stale receipt, forged preset state, or unavailable catalogue", () => {
    const source = catalogue();
    const valid = selection(source);
    const current = createAvatarForgeState("wave-diva");
    expect(resolveStudioVrmAvatarReferenceAppearanceState({
      current,
      catalogue: null,
      selection: valid,
    })).toBeNull();
    expect(resolveStudioVrmAvatarReferenceAppearanceState({
      current,
      catalogue: source,
      selection: {
        ...valid,
        state: createAvatarForgeState("soft-bob"),
      },
    })).toBeNull();
    expect(resolveStudioVrmAvatarReferenceAppearanceState({
      current,
      catalogue: source,
      selection: {
        ...valid,
        receipt: { ...valid.receipt, catalogueRevision: "stale" },
      },
    })).toBeNull();
  });
});
