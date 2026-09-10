import { describe, expect, it } from "vitest";

import {
  BUBBLE_LIBRARY_PREFERENCES_STORAGE_KEY,
  BUBBLE_LIBRARY_PREFERENCES_VERSION,
  BUBBLE_LIBRARY_RECENT_LIMIT,
  EMPTY_BUBBLE_LIBRARY_PREFERENCES,
  bubbleVariantForDialogueRecommendation,
  bubbleVariantForShapePreset,
  buildBubbleLibrarySections,
  countUniqueBubbleLibraryVariants,
  dialogueSampleForBubbleRecommendation,
  extractHangulInitials,
  getBubbleLibraryVariant,
  parseBubbleLibraryPreferences,
  readBubbleLibraryPreferences,
  recordBubbleUse,
  scoreBubbleVariantSearch,
  searchBubbleVariants,
  toggleBubbleFavorite,
  writeBubbleLibraryPreferences,
  type BubbleLibraryStorage,
} from "./studio-bubble-library";

function memoryStorage(initial: string | null = null): BubbleLibraryStorage & {
  value: string | null;
} {
  return {
    value: initial,
    getItem() {
      return this.value;
    },
    setItem(_key, value) {
      this.value = value;
    },
  };
}

describe("speech-bubble library search", () => {
  it("normalizes Hangul initials for compact Korean search", () => {
    expect(extractHangulInitials("속삭임 말풍선")).toBe("ㅅㅅㅇ ㅁㅍㅅ");
    expect(searchBubbleVariants("ㅅㅅㅇ")[0]?.id).toBe("whisper");
  });

  it("supports Korean purpose aliases and AND-token matching", () => {
    expect(searchBubbleVariants("긴 대사")[0]?.id).toBe("double");
    expect(searchBubbleVariants("전자음 홀로그램")[0]?.id).toBe("digital-code");
  });

  it("supports English and Japanese aliases without changing document locale", () => {
    expect(searchBubbleVariants("machine hologram")[0]?.id).toBe("digital-code");
    expect(searchBubbleVariants("ナレーション")[0]?.id).toBe("box");
    expect(searchBubbleVariants("romance heart")[0]?.id).toBe("heart");
  });

  it("ranks exact label matches ahead of broader aliases", () => {
    const whisper = getBubbleLibraryVariant("whisper");
    const speech = getBubbleLibraryVariant("speech");
    expect(whisper).not.toBeNull();
    expect(speech).not.toBeNull();
    expect(scoreBubbleVariantSearch(whisper!, "속삭임")).toBe(120);
    expect(scoreBubbleVariantSearch(whisper!, "속삭")).toBe(90);
    expect(scoreBubbleVariantSearch(speech!, "대사")).toBe(120);
  });

  it("accepts generic bubble words while still requiring the specific tokens", () => {
    expect(searchBubbleVariants("말풍선 속삭임")[0]?.id).toBe("whisper");
    expect(searchBubbleVariants("bubble hologram")[0]?.id).toBe("digital-code");
    expect(searchBubbleVariants("사랑 기계음")).toEqual([]);
  });
});

describe("speech-bubble library sections", () => {
  it("shows every catalog item exactly once with empty preferences", () => {
    const sections = buildBubbleLibrarySections({
      query: "",
      favoritesOnly: false,
      preferences: EMPTY_BUBBLE_LIBRARY_PREFERENCES,
    });
    expect(sections.map((section) => section.label)).toEqual(["대사", "감정", "연출·UI"]);
    expect(countUniqueBubbleLibraryVariants(sections)).toBe(16);
    expect(sections.flatMap((section) => section.variants)).toHaveLength(16);
  });

  it("pins favorites and recents while de-duplicating the remaining groups", () => {
    const sections = buildBubbleLibrarySections({
      query: "",
      favoritesOnly: false,
      preferences: {
        favoriteIds: ["heart", "speech"],
        recentIds: ["speech", "phone", "thought"],
      },
    });
    expect(sections[0]?.label).toBe("즐겨찾기");
    expect(sections[0]?.variants.map((variant) => variant.id)).toEqual([
      "heart",
      "speech",
    ]);
    expect(sections[1]?.label).toBe("최근 사용");
    expect(sections[1]?.variants.map((variant) => variant.id)).toEqual([
      "phone",
      "thought",
    ]);
    expect(countUniqueBubbleLibraryVariants(sections)).toBe(16);
    expect(sections.flatMap((section) => section.variants)).toHaveLength(16);
  });

  it("combines favorite-only mode with search", () => {
    const sections = buildBubbleLibrarySections({
      query: "사랑",
      favoritesOnly: true,
      preferences: {
        favoriteIds: ["speech", "heart", "digital-code"],
        recentIds: [],
      },
    });
    expect(sections).toHaveLength(1);
    expect(sections[0]?.variants.map((variant) => variant.id)).toEqual(["heart"]);
  });

  it("keeps search results in the established role groups", () => {
    const sections = buildBubbleLibrarySections({
      query: "충격",
      favoritesOnly: false,
      preferences: EMPTY_BUBBLE_LIBRARY_PREFERENCES,
    });
    expect(sections.map((section) => section.label)).toEqual(["감정"]);
    expect(sections[0]?.variants.map((variant) => variant.id)).toEqual([
      "explosive",
      "shout",
    ]);
  });

  it("orders matching role groups by their strongest search result", () => {
    const sections = buildBubbleLibrarySections({
      query: "bubble narrative",
      favoritesOnly: false,
      preferences: EMPTY_BUBBLE_LIBRARY_PREFERENCES,
    });
    expect(sections.map((section) => section.label)).toEqual(["연출·UI", "대사"]);
    expect(sections[0]?.variants[0]?.id).toBe("box");
    expect(sections[1]?.variants[0]?.id).toBe("comic-narrative");
  });
});

describe("speech-bubble library preferences", () => {
  it("rejects malformed, oversized, and future-version payloads", () => {
    expect(parseBubbleLibraryPreferences("not json")).toBe(
      EMPTY_BUBBLE_LIBRARY_PREFERENCES,
    );
    expect(parseBubbleLibraryPreferences("x".repeat(20_000))).toBe(
      EMPTY_BUBBLE_LIBRARY_PREFERENCES,
    );
    expect(
      parseBubbleLibraryPreferences(
        JSON.stringify({ version: 999, favoriteIds: ["speech"], recentIds: [] }),
      ),
    ).toBe(EMPTY_BUBBLE_LIBRARY_PREFERENCES);
  });

  it("filters unknown and duplicate ids and caps recents", () => {
    const parsed = parseBubbleLibraryPreferences(
      JSON.stringify({
        version: BUBBLE_LIBRARY_PREFERENCES_VERSION,
        favoriteIds: ["heart", "unknown", "heart", "speech"],
        recentIds: [
          "speech",
          "thought",
          "phone",
          "heart",
          "box",
          "whisper",
          "angry",
          "speech",
        ],
      }),
    );
    expect(parsed.favoriteIds).toEqual(["heart", "speech"]);
    expect(parsed.recentIds).toEqual([
      "speech",
      "thought",
      "phone",
      "heart",
      "box",
      "whisper",
    ]);
    expect(parsed.recentIds).toHaveLength(BUBBLE_LIBRARY_RECENT_LIMIT);
  });

  it("round-trips the versioned payload", () => {
    const storage = memoryStorage();
    expect(
      writeBubbleLibraryPreferences(storage, {
        favoriteIds: ["heart", "speech"],
        recentIds: ["phone", "thought"],
      }),
    ).toBe(true);
    expect(storage.value).toContain(
      `"version":${BUBBLE_LIBRARY_PREFERENCES_VERSION}`,
    );
    expect(readBubbleLibraryPreferences(storage)).toEqual({
      favoriteIds: ["heart", "speech"],
      recentIds: ["phone", "thought"],
    });
  });

  it("fails open when browser storage is unavailable", () => {
    const broken: BubbleLibraryStorage = {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("quota");
      },
    };
    expect(readBubbleLibraryPreferences(broken)).toBe(
      EMPTY_BUBBLE_LIBRARY_PREFERENCES,
    );
    expect(writeBubbleLibraryPreferences(broken, { favoriteIds: [], recentIds: [] })).toBe(
      false,
    );
  });

  it("toggles favorites immutably and keeps the newest favorite first", () => {
    const initial = { favoriteIds: ["speech"] as const, recentIds: [] as const };
    const added = toggleBubbleFavorite(initial, "heart");
    expect(added.favoriteIds).toEqual(["heart", "speech"]);
    expect(initial.favoriteIds).toEqual(["speech"]);
    expect(toggleBubbleFavorite(added, "speech").favoriteIds).toEqual(["heart"]);
  });

  it("records MRU use immutably, de-duplicates, and enforces the cap", () => {
    let preferences = EMPTY_BUBBLE_LIBRARY_PREFERENCES;
    for (const id of [
      "speech",
      "thought",
      "shout",
      "box",
      "whisper",
      "phone",
      "heart",
      "thought",
    ] as const) {
      preferences = recordBubbleUse(preferences, id);
    }
    expect(preferences.recentIds).toEqual([
      "thought",
      "heart",
      "phone",
      "whisper",
      "box",
      "shout",
    ]);
    expect(preferences.recentIds).toHaveLength(BUBBLE_LIBRARY_RECENT_LIMIT);
  });

  it("uses the stable storage key", () => {
    expect(BUBBLE_LIBRARY_PREFERENCES_STORAGE_KEY).toBe(
      "toonstudio.studio.bubble-library.v1",
    );
  });
});

describe("contextual bubble recommendation adapters", () => {
  it("uses the latest non-empty dialogue and strips a speaker prefix", () => {
    expect(
      dialogueSampleForBubbleRecommendation("민수: 안녕?\n\n지영： 쉿, 이건 비밀이야..."),
    ).toBe("쉿, 이건 비밀이야...");
    expect(dialogueSampleForBubbleRecommendation("(잠시 후)")).toBe("(잠시 후)");
  });

  it("maps every current emotion matcher shape to an editable bubble variant", () => {
    expect(bubbleVariantForShapePreset("shout-spiky")).toBe("shout");
    expect(bubbleVariantForShapePreset("wobbly-distress")).toBe("scared");
    expect(bubbleVariantForShapePreset("whisper-dashed")).toBe("whisper");
    expect(bubbleVariantForShapePreset("cloud-thought")).toBe("thought");
    expect(bubbleVariantForShapePreset("soft-blush")).toBe("heart");
    expect(bubbleVariantForShapePreset("future-shape")).toBe("speech");
  });

  it("keeps the batch-script parenthesis grammar mapped to narration", () => {
    expect(
      bubbleVariantForDialogueRecommendation("(잠시 후)", "cloud-thought"),
    ).toBe("box");
    expect(
      bubbleVariantForDialogueRecommendation("（다음 날）", "standard-oval"),
    ).toBe("box");
    expect(
      bubbleVariantForDialogueRecommendation("이건 비밀이야", "whisper-dashed"),
    ).toBe("whisper");
  });
});
