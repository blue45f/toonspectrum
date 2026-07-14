import { describe, expect, it } from "vitest";

import {
  assignStudioBrushSlot,
  emptyStudioBrushSlots,
  loadStudioBrushSlotsState,
  rememberStudioBrushSlot,
  saveStudioBrushSlotsState,
  studioBrushSlotAt,
} from "./studio-brush-slots";

describe("studio brush slots", () => {
  it("remembers recent brushes at the front like Magma quick tools", () => {
    let state = emptyStudioBrushSlots();
    state = rememberStudioBrushSlot(state, { brushId: "pen", strokeWidth: 6, brushOpacity: 1 });
    state = rememberStudioBrushSlot(state, { brushId: "marker", strokeWidth: 16, brushOpacity: 0.6 });
    expect(state.slots[0]?.brushId).toBe("marker");
    expect(state.slots[1]?.brushId).toBe("pen");
  });

  it("assigns and recalls numbered slots 1–6", () => {
    let state = emptyStudioBrushSlots();
    state = assignStudioBrushSlot(state, 2, { brushId: "pencil", strokeWidth: 3, brushOpacity: 0.85 });
    expect(studioBrushSlotAt(state, 2)).toEqual({
      brushId: "pencil",
      strokeWidth: 3,
      brushOpacity: 0.85,
    });
    expect(studioBrushSlotAt(state, 0)).toBeNull();
  });

  it("persists through storage helpers", () => {
    const map = new Map<string, string>();
    const storage = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => {
        map.set(k, v);
      },
    };
    const state = rememberStudioBrushSlot(emptyStudioBrushSlots(), {
      brushId: "gpen",
      strokeWidth: 8,
      brushOpacity: 1,
    });
    expect(saveStudioBrushSlotsState(storage, state)).toBe(true);
    expect(loadStudioBrushSlotsState(storage).slots[0]?.brushId).toBe("gpen");
  });
});
