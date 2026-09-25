import { describe, expect, it } from "vitest";
import {
  layoutStudioVirtualNameplates,
  studioVirtualDisambiguatedName,
  studioVirtualNameplatePresentation,
} from "./studio-virtual-space-nameplate-layout";

describe("Virtual Studio nameplate layout", () => {
  it("uses distance LOD and disambiguates duplicate public names only when needed", () => {
    expect(studioVirtualDisambiguatedName("희준", "session-A7F2", 1)).toBe("희준");
    expect(studioVirtualDisambiguatedName("희준", "session-A7F2", 2)).toBe("희준 · A7F2");
    expect(studioVirtualNameplatePresentation({ name: "희준", sessionId: "a", duplicateCount: 1, distance: 120, mode: "auto" }).lod).toBe("full");
    expect(studioVirtualNameplatePresentation({ name: "희준", sessionId: "a", duplicateCount: 1, distance: 400, mode: "auto" }).lod).toBe("dot");
    expect(studioVirtualNameplatePresentation({ name: "희준", sessionId: "a", duplicateCount: 1, distance: 800, mode: "auto" }).visible).toBe(false);
  });

  it("moves lower-priority overlapping labels upward", () => {
    const layout = layoutStudioVirtualNameplates([
      { id: "self", x: 100, y: 100, width: 70, height: 20, priority: 10 },
      { id: "peer", x: 108, y: 104, width: 70, height: 20, priority: 2 },
    ]);
    expect(layout.get("self")).toEqual({ x: 0, y: 0 });
    expect(layout.get("peer")!.y).toBeLessThan(0);
  });
});
