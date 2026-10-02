import { describe, expect, it } from "vitest";
import {
  layoutStudioVirtualNameplates,
  layoutStudioNameplateBubble,
  studioVirtualDisambiguatedName,
  studioVirtualNameplateDistanceAlpha,
  studioVirtualNameplatePresentation,
  studioVirtualNameplateStatusLabel,
  studioVirtualNameplateRoleBadge,
  STUDIO_NAMEPLATE_BUBBLE_MAX_CHARS,
  STUDIO_NAMEPLATE_FADE_FULL_DISTANCE,
  STUDIO_NAMEPLATE_FADE_HIDDEN_DISTANCE,
  truncateStudioNameplateBubble,
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

describe("이름표 사용자 상태", () => {
  const base = { name: "지우", sessionId: "s1", duplicateCount: 1, distance: 100, mode: "auto" } as const;

  it("명시적 사용자 상태가 활동 접미사를 덮어쓴다", () => {
    expect(
      studioVirtualNameplatePresentation({ ...base, activity: "focused", userStatus: "in-meeting" }).text,
    ).toBe("지우 · 회의 중");
    expect(
      studioVirtualNameplatePresentation({ ...base, activity: "available", userStatus: "break" }).text,
    ).toBe("지우 · 휴식 중");
  });

  it("userStatus가 available이면 접미사를 붙이지 않는다", () => {
    expect(
      studioVirtualNameplatePresentation({ ...base, activity: "focused", userStatus: "available" }).text,
    ).toBe("지우");
  });

  it("userStatus가 없으면 기존 활동 접미사를 유지한다", () => {
    expect(
      studioVirtualNameplatePresentation({ ...base, activity: "reviewing" }).text,
    ).toBe("지우 · 검토 중");
    expect(
      studioVirtualNameplatePresentation({ ...base, activity: "available" }).text,
    ).toBe("지우");
  });

  it("이모트 실행 중이면 이름표에 인디케이터를 붙인다", () => {
    const emote = { glyph: "💃", labelKo: "춤추는 중", labelEn: "Dancing" };
    expect(
      studioVirtualNameplatePresentation({ ...base, activity: "available", emote }).text,
    ).toBe("지우 · 💃 춤추는 중");
  });

  it("명시 상태가 있으면 이모트 인디케이터보다 우선한다", () => {
    const emote = { glyph: "💃", labelKo: "춤추는 중", labelEn: "Dancing" };
    expect(
      studioVirtualNameplatePresentation({ ...base, activity: "available", userStatus: "in-meeting", emote }).text,
    ).toBe("지우 · 회의 중");
  });

  it("이모트 라벨은 translate를 거친다", () => {
    const emote = { glyph: "😴", labelKo: "자는 중", labelEn: "Sleeping" };
    const translate = (_ko: string, en: string) => en;
    expect(
      studioVirtualNameplatePresentation({ ...base, activity: "available", emote, translate }).text,
    ).toBe("지우 · 😴 Sleeping");
  });

  it("compact LOD에서는 이모트 인디케이터를 붙이지 않는다", () => {
    const emote = { glyph: "💃", labelKo: "춤추는 중", labelEn: "Dancing" };
    const presentation = studioVirtualNameplatePresentation({ ...base, distance: 300, activity: "available", emote });
    expect(presentation.lod).toBe("compact");
    expect(presentation.text).toBe("지우");
  });

  it("타이핑 중이면 이름표에 입력 중 접미사를 붙이고 typing을 반환한다", () => {
    const presentation = studioVirtualNameplatePresentation({ ...base, activity: "available", typing: true });
    expect(presentation.text).toBe("지우 · 입력 중…");
    expect(presentation.typing).toBe(true);
    const translate = (_ko: string, en: string) => en;
    expect(
      studioVirtualNameplatePresentation({ ...base, activity: "available", typing: true, translate }).text,
    ).toBe("지우 · Typing…");
  });

  it("타이핑 접미사는 이모트보다 우선하고, 명시 상태가 있으면 접미사 없이 typing만 남는다", () => {
    const emote = { glyph: "💃", labelKo: "춤추는 중", labelEn: "Dancing" };
    expect(
      studioVirtualNameplatePresentation({ ...base, activity: "available", emote, typing: true }).text,
    ).toBe("지우 · 입력 중…");
    const inMeeting = studioVirtualNameplatePresentation({ ...base, activity: "available", userStatus: "in-meeting", typing: true });
    expect(inMeeting.text).toBe("지우 · 회의 중");
    expect(inMeeting.typing).toBe(true);
    expect(studioVirtualNameplatePresentation({ ...base, activity: "available" }).typing).toBe(false);
  });
});

describe("거리 기반 연속 페이드", () => {
  it("가까우면 1, 멀면 0을 반환한다", () => {
    expect(studioVirtualNameplateDistanceAlpha(0)).toBe(1);
    expect(studioVirtualNameplateDistanceAlpha(STUDIO_NAMEPLATE_FADE_FULL_DISTANCE)).toBe(1);
    expect(studioVirtualNameplateDistanceAlpha(STUDIO_NAMEPLATE_FADE_HIDDEN_DISTANCE)).toBe(0);
    expect(studioVirtualNameplateDistanceAlpha(10_000)).toBe(0);
    expect(studioVirtualNameplateDistanceAlpha(Number.NaN)).toBe(0);
  });

  it("중간 거리에서는 0과 1 사이로 부드럽게 변한다", () => {
    const mid = (STUDIO_NAMEPLATE_FADE_FULL_DISTANCE + STUDIO_NAMEPLATE_FADE_HIDDEN_DISTANCE) / 2;
    const alpha = studioVirtualNameplateDistanceAlpha(mid);
    expect(alpha).toBeGreaterThan(0);
    expect(alpha).toBeLessThan(1);
    expect(alpha).toBeCloseTo(0.5, 5);
    // 단조 감소
    expect(studioVirtualNameplateDistanceAlpha(mid - 50)).toBeGreaterThan(alpha);
    expect(studioVirtualNameplateDistanceAlpha(mid + 50)).toBeLessThan(alpha);
  });
});

describe("역할 뱃지", () => {
  it("owner/admin/moderator 뱃지를 반환한다", () => {
    expect(studioVirtualNameplateRoleBadge("owner")).toMatchObject({ labelKo: "소유자", labelEn: "Owner" });
    expect(studioVirtualNameplateRoleBadge("admin")).toMatchObject({ labelKo: "관리자", labelEn: "Admin" });
    expect(studioVirtualNameplateRoleBadge("moderator")).toMatchObject({ labelKo: "모더레이터", labelEn: "Mod" });
  });

  it("member/guest/미지정은 뱃지가 없다", () => {
    expect(studioVirtualNameplateRoleBadge("member")).toBeNull();
    expect(studioVirtualNameplateRoleBadge("guest")).toBeNull();
    expect(studioVirtualNameplateRoleBadge(undefined)).toBeNull();
  });
});

describe("말풍선 텍스트·앵커", () => {
  it("짧은 텍스트는 그대로 둔다", () => {
    expect(truncateStudioNameplateBubble("안녕!")).toBe("안녕!");
  });

  it("긴 텍스트는 …으로 자른다", () => {
    const long = "가".repeat(STUDIO_NAMEPLATE_BUBBLE_MAX_CHARS + 10);
    const truncated = truncateStudioNameplateBubble(long);
    expect([...truncated].length).toBe(STUDIO_NAMEPLATE_BUBBLE_MAX_CHARS);
    expect(truncated.endsWith("…")).toBe(true);
  });

  it("여러 줄·앞뒤 공백을 한 줄로 다듬는다", () => {
    expect(truncateStudioNameplateBubble("  안녕\n반가워  ")).toBe("안녕 반가워");
  });

  it("이름표 위에 말풍선 위치를 잡는다", () => {
    const placement = layoutStudioNameplateBubble(100, 200, "안녕!", 28);
    expect(placement).toMatchObject({ x: 100, y: 200 - 28 - 6, text: "안녕!" });
  });

  it("빈 텍스트면 말풍선을 띄우지 않는다", () => {
    expect(layoutStudioNameplateBubble(100, 200, "   ", 28)).toBeNull();
  });
});
