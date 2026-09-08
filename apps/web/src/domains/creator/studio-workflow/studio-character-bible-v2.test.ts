import { describe, expect, it } from "vitest";

import type { StudioCharacterBible } from "../studio-character-bible";

import {
  createStudioCharacterPromptReceiptV2,
  migrateStudioCharacterBibleV1ToV2,
  resolveStudioCharacterContextV2,
  validateStudioCharacterBibleV2,
  type StudioCharacterBibleV2,
  type StudioCharacterVersionV2,
} from "./studio-character-bible-v2";

const NOW = "2026-09-07T00:00:00.000Z";

function v1Bible(): StudioCharacterBible {
  return {
    version: 1,
    characters: [{
      id: "character-sua",
      name: "수아",
      role: "주인공",
      appearance: "짧은 검은 머리와 갈색 눈",
      costume: "겨울 교복",
      colors: ["검정", "갈색"],
      voice: "짧고 단정한 말투",
      goal: "친구를 지킨다",
      relationships: ["민준과 오래된 친구"],
      props: ["은색 반지"],
      lockedFields: ["appearance", "colors"],
    }],
  };
}

function baseV2(): StudioCharacterBibleV2 {
  return migrateStudioCharacterBibleV1ToV2(v1Bible(), { createdAt: NOW });
}

describe("Studio Character Bible v2", () => {
  it("migrates v1 without inventing references, ranges, aliases, or colour values", () => {
    const migrated = baseV2();
    const character = migrated.characters[0];
    const version = character.versions[0];

    expect(migrated.version).toBe(2);
    expect(character.aliases).toEqual([]);
    expect(character.tags).toEqual([]);
    expect(version.references).toEqual([]);
    expect(version.effectiveFromEpisodeNo).toBeNull();
    expect(version.effectiveToEpisodeNo).toBeNull();
    expect(version.palette).toEqual([
      expect.objectContaining({ label: "검정", value: null, sourceText: "검정" }),
      expect.objectContaining({ label: "갈색", value: null, sourceText: "갈색" }),
    ]);
    expect(version.locks).toEqual({ appearance: "hard", colors: "hard" });
    expect(character.relationships[0]).toMatchObject({
      targetCharacterId: null,
      description: "민준과 오래된 친구",
    });
    expect(validateStudioCharacterBibleV2(migrated)).toEqual([]);
  });

  it("resolves the approved version in range and applies only explicitly scoped variants", () => {
    const migrated = baseV2();
    const character = migrated.characters[0];
    const first = character.versions[0];
    const later: StudioCharacterVersionV2 = {
      ...first,
      id: "character-sua:canon:2",
      label: "17화 이후",
      effectiveFromEpisodeNo: 17,
      appearance: { ...first.appearance, hair: "어깨까지 자란 검은 머리" },
      createdAt: "2026-09-08T00:00:00.000Z",
      changeReason: "시간 경과",
    };
    const bible: StudioCharacterBibleV2 = {
      ...migrated,
      characters: [{
        ...character,
        canonicalVersionId: later.id,
        versions: [first, later],
        variants: [{
          id: "character-sua:variant:raincoat",
          characterId: character.id,
          baseVersionId: later.id,
          label: "비 오는 날",
          kind: "outfit",
          overrides: {
            costume: "노란 우비",
            props: ["은색 반지", "투명 우산"],
            promptNotes: "젖은 옷자락",
          },
          applicableWorkIds: ["work-17"],
          applicableSceneIds: ["scene-rain"],
          createdAt: "2026-09-08T00:00:00.000Z",
        }],
      }],
    };

    const context = resolveStudioCharacterContextV2(bible, {
      characterId: character.id,
      episodeNo: 17,
      workId: "work-17",
      sceneId: "scene-rain",
      variantIds: ["character-sua:variant:raincoat"],
    });

    expect(context.characterVersionId).toBe(later.id);
    expect(context.appearance.hair).toContain("어깨");
    expect(context.costume).toBe("노란 우비");
    expect(context.props).toContain("투명 우산");
    expect(context.promptNotes).toEqual(["젖은 옷자락"]);

    const receipt = createStudioCharacterPromptReceiptV2(context);
    expect(receipt).toMatchObject({
      characterId: character.id,
      characterVersionId: later.id,
      variantIds: ["character-sua:variant:raincoat"],
      hardLockedFields: ["appearance", "colors"],
    });
    expect(receipt.contextDigestInput).toContain("노란 우비");
  });

  it.each([undefined, null])("defaults to the canonical version without an episode: %s", (episodeNo) => {
    const migrated = baseV2();
    const character = migrated.characters[0];
    const canonical: StudioCharacterVersionV2 = {
      ...character.versions[0],
      effectiveToEpisodeNo: 10,
      references: [{
        id: "canonical-front",
        role: "front",
        assetRevisionId: "canonical-image:r1",
        label: "Canonical front",
      }],
    };
    const later: StudioCharacterVersionV2 = {
      ...canonical,
      id: "character-sua:canon:2",
      effectiveFromEpisodeNo: 17,
      effectiveToEpisodeNo: null,
      appearance: { ...canonical.appearance, hair: "Different episode appearance" },
      locks: { appearance: "soft" },
      references: [],
    };
    const bible: StudioCharacterBibleV2 = {
      ...migrated,
      characters: [{ ...character, versions: [canonical, later] }],
    };

    const context = resolveStudioCharacterContextV2(bible, {
      characterId: character.id,
      ...(episodeNo === undefined ? {} : { episodeNo }),
    });

    expect(context).toMatchObject({
      characterVersionId: canonical.id,
      appearance: canonical.appearance,
      references: canonical.references,
      locks: canonical.locks,
    });
    const receipt = createStudioCharacterPromptReceiptV2(context);
    expect(receipt.characterVersionId).toBe(canonical.id);
    expect(receipt.hardLockedFields).toEqual(["appearance", "colors"]);
    expect(JSON.parse(receipt.contextDigestInput)).toMatchObject({
      appearance: canonical.appearance,
      references: canonical.references,
      locks: canonical.locks,
    });
    expect(resolveStudioCharacterContextV2(bible, {
      characterId: character.id,
      episodeNo: 17,
    }).characterVersionId).toBe(later.id);
    expect(resolveStudioCharacterContextV2(bible, {
      characterId: character.id,
      episodeNo: 12,
    }).characterVersionId).toBe(canonical.id);
  });

  it("does not substitute another approved version for a missing default canonical version", () => {
    const migrated = baseV2();
    const character = migrated.characters[0];
    expect(() => resolveStudioCharacterContextV2({
      ...migrated,
      characters: [{ ...character, canonicalVersionId: "missing-version" }],
    }, { characterId: character.id })).toThrow(/no resolvable version/u);
  });

  it("rejects a variant outside its declared work or scene scope", () => {
    const migrated = baseV2();
    const character = migrated.characters[0];
    const version = character.versions[0];
    const bible: StudioCharacterBibleV2 = {
      ...migrated,
      characters: [{
        ...character,
        variants: [{
          id: "character-sua:variant:school",
          characterId: character.id,
          baseVersionId: version.id,
          label: "학교",
          kind: "outfit",
          overrides: { costume: "하복" },
          applicableWorkIds: ["work-school"],
          applicableSceneIds: [],
          createdAt: NOW,
        }],
      }],
    };

    expect(() => resolveStudioCharacterContextV2(bible, {
      characterId: character.id,
      workId: "work-home",
      variantIds: ["character-sua:variant:school"],
    })).toThrow(/outside its declared scope/u);
  });

  it("reports missing canonical versions, inverted ranges, and invalid variant bases", () => {
    const migrated = baseV2();
    const character = migrated.characters[0];
    const version = character.versions[0];
    const invalid: StudioCharacterBibleV2 = {
      ...migrated,
      characters: [{
        ...character,
        canonicalVersionId: "missing-version",
        versions: [{
          ...version,
          effectiveFromEpisodeNo: 20,
          effectiveToEpisodeNo: 10,
        }],
        variants: [{
          id: "variant-invalid",
          characterId: character.id,
          baseVersionId: "missing-version",
          label: "잘못된 변형",
          kind: "temporary",
          overrides: {},
          applicableWorkIds: [],
          applicableSceneIds: [],
          createdAt: NOW,
        }],
      }],
    };

    expect(validateStudioCharacterBibleV2(invalid).map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "canonical-version-missing",
        "invalid-version-range",
        "variant-base-version-missing",
      ]),
    );
  });
});
