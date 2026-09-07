import {
  createCharacterCompatibilityReport,
  characterCompatibilitySnapshot,
} from "../character-platform/compatibility/character-compatibility-report";
import {
  createCharacterDocumentV2,
  projectCharacterRecipeV1,
} from "../character-platform/document/character-document-v2";

import type {
  CharacterCapabilityProfile,
  CharacterHostSnapshot,
  CharacterRecipe,
} from "./character-shaper-contract";
import type { CharacterDocumentV2 } from "../character-platform/document/character-document-v2";

export interface ProjectCharacterShaperDocumentInput {
  readonly documentId: string;
  readonly recipe: CharacterRecipe;
  readonly snapshot: CharacterHostSnapshot;
  readonly profile: Partial<CharacterCapabilityProfile>;
  readonly assetId?: string;
  readonly assetVersion?: string;
  readonly contentSha256?: string | null;
  readonly canonical?: boolean;
  readonly transparentBackground?: boolean;
  readonly backgroundColor?: string;
  readonly revision?: number;
  readonly now?: string;
}

function customControls(snapshot: CharacterHostSnapshot): Readonly<Record<string, number>> {
  const values: Record<string, number> = {};
  for (const [key, value] of Object.entries(snapshot.forgeFace)) {
    if (typeof value === "number" && Number.isFinite(value)) values[`face.${key}`] = value;
  }
  for (const [key, value] of Object.entries(snapshot.semanticMorphs)) {
    if (typeof value === "number" && Number.isFinite(value)) values[`morph.${key}`] = value;
  }
  return Object.freeze(values);
}

export function projectCharacterShaperDocument(
  input: ProjectCharacterShaperDocumentInput,
): CharacterDocumentV2 {
  const compatibilityReport = createCharacterCompatibilityReport(input.profile, {
    canonical: input.canonical,
    sourceRevision: input.canonical ? "character-manifest-v2" : "character-capability-profile-v1",
  });
  const modelId = input.assetId
    ?? (typeof input.profile.modelId === "string" && input.profile.modelId.trim().length > 0
      ? input.profile.modelId
      : "unloaded-character");
  return createCharacterDocumentV2({
    documentId: input.documentId,
    model: {
      assetId: modelId,
      assetVersion: input.assetVersion ?? "legacy-runtime",
      contentSha256: input.contentSha256 ?? null,
      mode: input.canonical ? "canonical" : "compatible",
    },
    compatibility: characterCompatibilitySnapshot(compatibilityReport),
    recipe: projectCharacterRecipeV1(input.recipe),
    colors: input.recipe.colors,
    customControls: customControls(input.snapshot),
    expression: {
      activeEntryId: input.snapshot.activeExpressionId,
      weights: input.snapshot.expressionWeights,
    },
    pose: {
      activeEntryId: input.snapshot.activePoseId,
      source: input.snapshot.activePoseId ? "preset" : null,
    },
    transparentBackground: input.transparentBackground,
    backgroundColor: input.backgroundColor,
    revision: input.revision,
    now: input.now,
  });
}
