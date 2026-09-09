import { describe, expect, it } from "vitest";

import { DEFAULT_STUDIO_LAYER_NAVIGATOR_FILTERS } from "./studio-layer-navigator";
import {
  STUDIO_LAYER_FILTER_PRESET_LIMIT,
  cloneStudioLayerNavigatorFilters,
  normalizeStudioLayerFilterPresets,
  parseStudioLayerFilterPresets,
  removeStudioLayerFilterPreset,
  saveStudioLayerFilterPreset,
  serializeStudioLayerFilterPresets,
} from "./studio-layer-filter-presets";

const attentionFilters = {
  ...DEFAULT_STUDIO_LAYER_NAVIGATOR_FILTERS,
  flags: ["masked"] as const,
  smart: "attention" as const,
};

describe("studio layer filter presets", () => {
  it("saves only active filters and updates a same-name preset in place", () => {
    expect(
      saveStudioLayerFilterPreset([], {
        name: "빈 필터",
        filters: DEFAULT_STUDIO_LAYER_NAVIGATOR_FILTERS,
        now: 1,
        id: "empty",
      })
    ).toEqual([]);

    const saved = saveStudioLayerFilterPreset([], {
      name: "  선화   검수  ",
      filters: attentionFilters,
      now: 10,
      id: "preset-1",
    });
    expect(saved).toEqual([
      {
        id: "preset-1",
        name: "선화 검수",
        filters: attentionFilters,
        createdAt: 10,
        updatedAt: 10,
      },
    ]);

    const updated = saveStudioLayerFilterPreset(saved, {
      name: "선화 검수",
      filters: {
        ...DEFAULT_STUDIO_LAYER_NAVIGATOR_FILTERS,
        flags: [],
        role: "lineart",
      },
      now: 20,
      id: "ignored",
    });
    expect(updated[0]?.id).toBe("preset-1");
    expect(updated[0]?.createdAt).toBe(10);
    expect(updated[0]?.updatedAt).toBe(20);
    expect(updated[0]?.filters.role).toBe("lineart");
  });

  it("normalizes malformed persisted data and de-duplicates ids and names", () => {
    expect(
      normalizeStudioLayerFilterPresets({
        version: 1,
        presets: [
          {
            id: "a",
            name: "검수",
            filters: { ...attentionFilters, smart: "unsupported", flags: ["masked", "bad", "masked"] },
            createdAt: -1,
            updatedAt: "bad",
          },
          {
            id: "a",
            name: "중복 ID",
            filters: attentionFilters,
          },
          {
            id: "b",
            name: "검수",
            filters: attentionFilters,
          },
          { id: "", name: "무효", filters: attentionFilters },
        ],
      })
    ).toEqual([
      {
        id: "a",
        name: "검수",
        filters: {
          ...DEFAULT_STUDIO_LAYER_NAVIGATOR_FILTERS,
          flags: ["masked"],
        },
        createdAt: 0,
        updatedAt: 0,
      },
    ]);
  });

  it("round-trips a versioned payload and safely rejects bad or oversized JSON", () => {
    const presets = saveStudioLayerFilterPreset([], {
      name: "출력 후보",
      filters: { ...DEFAULT_STUDIO_LAYER_NAVIGATOR_FILTERS, flags: [], smart: "output" },
      now: 100,
      id: "output",
    });
    expect(parseStudioLayerFilterPresets(serializeStudioLayerFilterPresets(presets))).toEqual(presets);
    expect(parseStudioLayerFilterPresets("not-json")).toEqual([]);
    expect(parseStudioLayerFilterPresets(JSON.stringify({ version: 2, presets }))).toEqual([]);
    expect(parseStudioLayerFilterPresets("x".repeat(64 * 1024 + 1))).toEqual([]);
    expect(
      normalizeStudioLayerFilterPresets([
        {
          id: "inactive",
          name: "빈 조건",
          filters: DEFAULT_STUDIO_LAYER_NAVIGATOR_FILTERS,
          createdAt: 0,
          updatedAt: 0,
        },
      ])
    ).toEqual([]);
  });

  it("caps storage, removes by id, and never shares the caller's flags array", () => {
    let presets = [] as ReturnType<typeof normalizeStudioLayerFilterPresets>;
    for (let index = 0; index < STUDIO_LAYER_FILTER_PRESET_LIMIT + 2; index += 1) {
      presets = saveStudioLayerFilterPreset(presets, {
        name: `필터 ${index}`,
        filters: { ...attentionFilters, flags: ["masked"] },
        now: index,
        id: `preset-${index}`,
      });
    }
    expect(presets).toHaveLength(STUDIO_LAYER_FILTER_PRESET_LIMIT);
    expect(presets[0]?.name).toBe(`필터 ${STUDIO_LAYER_FILTER_PRESET_LIMIT + 1}`);
    expect(removeStudioLayerFilterPreset(presets, presets[0]!.id)).toHaveLength(
      STUDIO_LAYER_FILTER_PRESET_LIMIT - 1
    );

    const sourceFlags = ["masked"] as const;
    const cloned = cloneStudioLayerNavigatorFilters({ ...attentionFilters, flags: sourceFlags });
    expect(cloned.flags).toEqual(sourceFlags);
    expect(cloned.flags).not.toBe(sourceFlags);
  });
});
