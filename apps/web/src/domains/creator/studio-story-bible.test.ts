import { describe, expect, it } from "vitest";

import {
  analyzeStudioStoryContinuity,
  validateStudioStoryBible,
  type StudioCharacterContinuityState,
  type StudioStoryBible,
} from "./studio-story-bible";

const BIBLE: StudioStoryBible = Object.freeze({
  projectId: "project-1",
  characters: [
    {
      id: "hero",
      name: "해나",
      aliases: ["주인공"],
      defaultCostumeId: "school",
      defaultAppearanceId: "hero-default",
    },
    {
      id: "friend",
      name: "민서",
      aliases: [],
      defaultCostumeId: "casual",
      defaultAppearanceId: "friend-default",
    },
  ],
  locations: [
    { id: "school", name: "학교" },
    { id: "hospital", name: "병원" },
  ],
  facts: [
    { id: "secret", label: "비밀을 알게 됨", characterIds: ["hero"], locationId: null },
  ],
});

const STATES: readonly StudioCharacterContinuityState[] = [
  {
    sceneId: "scene-1",
    sequence: 1,
    characterId: "hero",
    costumeId: "school",
    appearanceId: "hero-default",
    injuryIds: ["left-arm"],
    propIds: ["bag"],
    knownFactIds: ["secret"],
    locationId: "school",
  },
  {
    sceneId: "scene-2",
    sequence: 2,
    characterId: "hero",
    costumeId: "hospital",
    appearanceId: "hero-bandage",
    injuryIds: [],
    propIds: [],
    knownFactIds: [],
    locationId: "hospital",
  },
];

describe("Studio story bible and continuity", () => {
  it("accepts a consistent story bible", () => {
    expect(validateStudioStoryBible(BIBLE)).toEqual([]);
  });

  it("reports ambiguous names and broken references", () => {
    const issues = validateStudioStoryBible({
      ...BIBLE,
      characters: [
        ...BIBLE.characters,
        {
          id: "rival",
          name: "주인공",
          aliases: [],
          defaultCostumeId: null,
          defaultAppearanceId: null,
        },
      ],
      facts: [
        ...BIBLE.facts,
        {
          id: "bad-fact",
          label: "잘못된 참조",
          characterIds: ["missing"],
          locationId: "unknown",
        },
      ],
    });
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "character-name-conflict", severity: "warning" }),
      expect.objectContaining({ code: "fact-character-reference", severity: "error" }),
      expect.objectContaining({ code: "fact-location-reference", severity: "error" }),
    ]));
  });

  it("detects unexplained visual, prop, knowledge and location changes", () => {
    const report = analyzeStudioStoryContinuity(BIBLE, STATES);
    expect(report.status).toBe("blocked");
    expect(report.blockingCount).toBe(2);
    expect(report.warningCount).toBe(4);
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "costume-change",
      "appearance-change",
      "injury-disappeared",
      "prop-disappeared",
      "knowledge-regression",
      "location-change",
    ]));
  });

  it("suppresses changes explicitly explained by a scene transition", () => {
    const report = analyzeStudioStoryContinuity(BIBLE, STATES, [
      {
        characterId: "hero",
        fromSceneId: "scene-1",
        toSceneId: "scene-2",
        allowedCategories: [
          "costume",
          "appearance",
          "injury",
          "prop",
          "knowledge",
          "location",
        ],
        note: "시간이 흐른 뒤 병원에서 기억을 잃은 장면",
      },
    ]);
    expect(report).toMatchObject({
      status: "pass",
      blockingCount: 0,
      warningCount: 0,
      issues: [],
    });
  });

  it("rejects duplicate character appearances in one scene", () => {
    expect(() => analyzeStudioStoryContinuity(BIBLE, [STATES[0]!, STATES[0]!])).toThrow(
      "one continuity state per scene",
    );
  });
});
