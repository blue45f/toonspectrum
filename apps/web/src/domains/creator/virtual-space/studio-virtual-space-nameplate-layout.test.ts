import { describe, expect, it } from "vitest";
import {
  layoutStudioVirtualNameplates,
  layoutStudioNameplateBubble,
  studioVirtualDisambiguatedName,
  studioVirtualNameplateDistanceAlpha,
  studioVirtualNameplatePresentation,
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
