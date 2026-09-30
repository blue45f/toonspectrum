import { describe, expect, it } from "vitest";
import {
  layoutStudioVirtualNameplates,
  studioVirtualDisambiguatedName,
  studioVirtualNameplatePresentation,
  studioVirtualNameplateStatusLabel,
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

  it("상태 라벨은 한국어 기본과 영어 병기", () => {
    const base = { name: "희준", sessionId: "a", duplicateCount: 1, distance: 50, mode: "auto" as const };
    expect(studioVirtualNameplatePresentation({ ...base, activity: "focused" })).toMatchObject({ text: "희준 · 집중 중", status: "focused" });
    expect(studioVirtualNameplatePresentation({ ...base, activity: "reviewing" }).text).toBe("희준 · 검토 중");
    expect(studioVirtualNameplatePresentation({ ...base, activity: "away" }).text).toBe("희준 · 자리 비움");
    const english = (_ko: string, en: string) => en;
    expect(studioVirtualNameplatePresentation({ ...base, activity: "away", translate: english }).text).toBe("희준 · Away");
    expect(studioVirtualNameplateStatusLabel("focused", english)).toBe("Focusing");
    const both = (ko: string, en: string) => `${ko}/${en}`;
    expect(studioVirtualNameplateStatusLabel("reviewing", both)).toBe("검토 중/Reviewing");
    // 영문 대문자 접미사는 더 이상 쓰지 않는다.
    expect(studioVirtualNameplatePresentation({ ...base, activity: "focused" }).text).not.toMatch(/FOCUS|REVIEW|AWAY/u);
    // 가용 상태·축약 이름표는 상태를 붙이지 않는다.
    expect(studioVirtualNameplatePresentation({ ...base, activity: "available" })).toMatchObject({ text: "희준", status: null });
    expect(studioVirtualNameplatePresentation({ ...base, distance: 300, activity: "focused" })).toMatchObject({ text: "희준", status: null });
  });

  it("NPC 휴식은 자리 비움으로 표기하지 않는다", () => {
    const npc = studioVirtualNameplatePresentation({
      name: "NPC · 카페 매니저", sessionId: "npc:cafe", duplicateCount: 1, distance: 40, mode: "auto", activity: "break",
    });
    expect(npc.text).toBe("NPC · 카페 매니저 · 휴식 중");
    expect(npc.text).not.toContain("자리 비움");
    expect(npc.status).toBe("break");
    expect(studioVirtualNameplateStatusLabel("break", (_ko, en) => en)).toBe("On a break");
  });
});
