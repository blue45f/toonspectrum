import { describe, expect, it } from "vitest";

import {
  evaluateStudioCharacterConsistency,
  validateStudioCharacterReference,
  type StudioCharacterReferenceProfile,
} from "./studio-character-consistency";

const PROFILE: StudioCharacterReferenceProfile = Object.freeze({
  characterId: "hero",
  eyeColor: "#554433",
  hairColor: "#221c18",
  faceShapeId: "oval",
  defaultCostumeId: "school-uniform",
  minimumFaceSimilarity: 0.82,
  maximumBodyRatioDelta: 0.08,
  variants: [
    {
      id: "winter",
      eyeColor: null,
      hairColor: null,
      costumeId: "winter-coat",
      maximumBodyRatioDelta: 0.1,
    },
  ],
});

describe("Studio character consistency", () => {
  it("accepts an observation matching the character reference", () => {
    expect(validateStudioCharacterReference(PROFILE)).toEqual([]);
    expect(evaluateStudioCharacterConsistency(PROFILE, {
      id: "cut-1",
      characterId: "hero",
      variantId: null,
      faceSimilarity: 0.95,
      eyeColor: "#554433",
      hairColor: "#221c18",
      faceShapeId: "oval",
      costumeId: "school-uniform",
      bodyRatioDelta: 0.02,
    })).toMatchObject({ status: "consistent", issues: [], score: 0.95 });
  });

  it("uses an explicitly approved costume variant", () => {
    expect(evaluateStudioCharacterConsistency(PROFILE, {
      id: "cut-2",
      characterId: "hero",
      variantId: "winter",
      faceSimilarity: 0.9,
      eyeColor: "#554433",
      hairColor: "#221c18",
      faceShapeId: "oval",
      costumeId: "winter-coat",
      bodyRatioDelta: 0.09,
    })).toMatchObject({
      status: "consistent",
      appliedVariantId: "winter",
      issues: [],
    });
  });

  it("blocks facial and body proportion drift while warning about styling drift", () => {
    const result = evaluateStudioCharacterConsistency(PROFILE, {
      id: "cut-3",
      characterId: "hero",
      variantId: null,
      faceSimilarity: 0.6,
      eyeColor: "#0088ff",
      hairColor: "#ff00ff",
      faceShapeId: "square",
      costumeId: "unknown-costume",
      bodyRatioDelta: 0.2,
    });
    expect(result.status).toBe("blocked");
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "face-similarity", severity: "error" }),
      expect.objectContaining({ code: "body-ratio", severity: "error" }),
      expect.objectContaining({ code: "eye-color", severity: "warning" }),
      expect.objectContaining({ code: "costume", severity: "warning" }),
    ]));
  });

  it("rejects unknown variants rather than silently accepting them", () => {
    expect(() => evaluateStudioCharacterConsistency(PROFILE, {
      id: "cut-4",
      characterId: "hero",
      variantId: "unregistered",
      faceSimilarity: 0.9,
      eyeColor: "#554433",
      hairColor: "#221c18",
      faceShapeId: "oval",
      costumeId: "winter-coat",
      bodyRatioDelta: 0.01,
    })).toThrow("Unknown character variant");
  });
});
