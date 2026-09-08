import { describe, expect, it } from "vitest";

import { getKstDay, getMode, getThemeForDay, shiftIsoDate } from "../now";
import {
  createDefaultVariationDayState,
  createDefaultVariationSelection,
  createEmptyVariationState,
  createVariationCandidates,
  getVariationDayState,
  makeVariationBrief,
  NOW_VARIATION_NOTE_MAX_LENGTH,
  parseVariationState,
  serializeVariationState,
  upsertVariationDayState,
} from "./variation";

function createContext(shuffle = 0) {
  const day = getKstDay(new Date("2026-09-09T00:00:00.000Z"));
  const theme = getThemeForDay(day);
  const mode = getMode("mystery");
  return {
    day,
    theme,
    mode,
    sessionMinutes: 20,
    selection: createDefaultVariationSelection(mode.id),
    shuffle,
  };
}

describe("daily variation lab model", () => {
  it("builds three deterministic, inspectable routes from explicit choices", () => {
    const context = createContext();
    const first = createVariationCandidates(context);
    const second = createVariationCandidates(context);

    expect(first).toEqual(second);
    expect(first).toHaveLength(3);
    expect(new Set(first.map((candidate) => candidate.id)).size).toBe(3);
    expect(first[0]?.signature).toContain("원경");
    expect(first[0]?.signature).toContain("숨은 목격자");
    expect(first[0]?.hook).toContain(context.theme.object);
    expect(first[0]?.panelPlan).toContain(context.mode.pacing);
  });

  it("changes interpretation when the set is shuffled while preserving reproducibility", () => {
    const first = createVariationCandidates(createContext(0));
    const shuffled = createVariationCandidates(createContext(1));
    const shuffledAgain = createVariationCandidates(createContext(1));

    expect(shuffled).toEqual(shuffledAgain);
    expect(shuffled.map((candidate) => candidate.hook)).not.toEqual(first.map((candidate) => candidate.hook));
  });

  it("sanitizes untrusted local state and caps notes", () => {
    const day = getKstDay(new Date("2026-09-09T00:00:00.000Z"));
    const raw = JSON.stringify({
      version: 99,
      byDate: {
        [day.iso]: {
          selection: {
            framing: "detail",
            pressure: "not-valid",
            dialogue: "silent",
            visualRule: "repeat",
          },
          shuffle: 999_999,
          selectedCandidateId: "route-9",
          note: "메".repeat(NOW_VARIATION_NOTE_MAX_LENGTH + 50),
        },
        "not-a-date": { note: "discard" },
      },
    });

    const state = parseVariationState(raw);
    const restored = getVariationDayState(state, day.iso, "balanced");

    expect(Object.keys(state.byDate)).toEqual([day.iso]);
    expect(restored.selection.framing).toBe("detail");
    expect(restored.selection.pressure).toBe("deadline");
    expect(restored.selection.dialogue).toBe("silent");
    expect(restored.selection.visualRule).toBe("repeat");
    expect(restored.shuffle).toBe(9_999);
    expect(restored.selectedCandidateId).toBe("route-1");
    expect(restored.note).toHaveLength(NOW_VARIATION_NOTE_MAX_LENGTH);
  });

  it("keeps a bounded date history and round-trips valid state", () => {
    const baseDay = getKstDay(new Date("2026-09-09T00:00:00.000Z"));
    let state = createEmptyVariationState();

    for (let index = 0; index < 50; index += 1) {
      const dayState = createDefaultVariationDayState(index % 2 === 0 ? "emotion" : "visual");
      state = upsertVariationDayState(state, shiftIsoDate(baseDay.iso, -index), {
        ...dayState,
        note: `note-${index}`,
      });
    }

    const restored = parseVariationState(serializeVariationState(state));
    expect(Object.keys(restored.byDate)).toHaveLength(45);
    expect(restored).toEqual(state);
  });

  it("exports the selected route as a portable production brief", () => {
    const context = createContext();
    const candidate = createVariationCandidates(context)[1]!;
    const brief = makeVariationBrief(
      {
        day: context.day,
        theme: context.theme,
        mode: context.mode,
        sessionMinutes: context.sessionMinutes,
      },
      candidate,
      "마지막 컷에서만 손목시계를 보여주기",
    );

    expect(brief).toContain("오늘의 변주 랩");
    expect(brief).toContain(context.theme.title);
    expect(brief).toContain(candidate.signature);
    expect(brief).toContain("5컷 전략:");
    expect(brief).toContain("개인 메모: 마지막 컷에서만 손목시계를 보여주기");
  });
});
