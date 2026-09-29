import { describe, expect, it } from "vitest";

import {
  EMPTY_STATE_GUIDES,
  PRODUCTION_HUB_TOUR_STEPS,
  PRODUCTION_TOUR_STORAGE_KEY,
  canGoNextWizardStep,
  canGoPrevWizardStep,
  clampWizardIndex,
  markProductionTourSeenValue,
  presenceAvatarTone,
  presenceInitial,
  shouldShowProductionTour,
  slicePresenceMembers,
  wizardProgressPercent,
  wizardStepStates,
} from "./production-ux-kit-model";

describe("마법사 단계", () => {
  it("인덱스를 0..stepCount-1 범위로 고정한다", () => {
    expect(clampWizardIndex(-1, 3)).toBe(0);
    expect(clampWizardIndex(5, 3)).toBe(2);
    expect(clampWizardIndex(1, 3)).toBe(1);
    expect(clampWizardIndex(0, 0)).toBe(0);
  });

  it("단계 표시 상태를 계산한다", () => {
    expect(wizardStepStates(3, 1)).toEqual(["done", "active", "todo"]);
  });

  it("이전/다음 이동 가능 여부를 판단한다", () => {
    expect(canGoPrevWizardStep(3, 0)).toBe(false);
    expect(canGoPrevWizardStep(3, 2)).toBe(true);
    expect(canGoNextWizardStep(3, 2)).toBe(false);
    expect(canGoNextWizardStep(3, 0)).toBe(true);
  });

  it("진행률을 0..100으로 계산한다", () => {
    expect(wizardProgressPercent(3, 0)).toBe(33);
    expect(wizardProgressPercent(3, 2)).toBe(100);
    expect(wizardProgressPercent(0, 0)).toBe(0);
  });
});

describe("스포트라이트 투어", () => {
  it("3단계로 구성된다", () => {
    expect(PRODUCTION_HUB_TOUR_STEPS).toHaveLength(3);
    expect(PRODUCTION_HUB_TOUR_STEPS.map((step) => step.id)).toEqual(["board", "review", "team"]);
  });

  it("본 적 없으면 투어를 보여준다", () => {
    expect(shouldShowProductionTour(null)).toBe(true);
    expect(shouldShowProductionTour(undefined)).toBe(true);
    expect(shouldShowProductionTour("seen")).toBe(false);
    expect(shouldShowProductionTour(markProductionTourSeenValue())).toBe(false);
  });

  it("저장 키가 고정된다", () => {
    expect(PRODUCTION_TOUR_STORAGE_KEY).toBe("toonstudio.production-hub.tour.v1");
  });
});

describe("함께 보는 사람", () => {
  it("활성 멤버를 먼저 보여주고 넘침을 계산한다", () => {
    const members = [
      { id: "a", name: "김작가", roleLabel: "편집자", active: false },
      { id: "b", name: "이검수", roleLabel: "검수자", active: true },
      { id: "c", name: "박뷰어", roleLabel: "뷰어", active: false },
    ];
    const { visible, overflowCount } = slicePresenceMembers(members, 2);
    expect(visible[0]!.id).toBe("b");
    expect(visible).toHaveLength(2);
    expect(overflowCount).toBe(1);
  });

  it("이름에서 이니셜을 추출한다", () => {
    expect(presenceInitial("김희준")).toBe("김희");
    expect(presenceInitial("John Doe")).toBe("JD");
    expect(presenceInitial("  ")).toBe("?");
  });

  it("id 해시로 아바타 톤을 고정 선택한다", () => {
    expect(presenceAvatarTone("user-1")).toBe(presenceAvatarTone("user-1"));
  });
});

describe("빈 상태 가이드", () => {
  it("가이드 4종이 모두 정의된다", () => {
    const ids = Object.keys(EMPTY_STATE_GUIDES);
    expect(ids).toContain("board-empty");
    expect(ids).toContain("board-filtered");
    expect(ids).toContain("review-empty");
    expect(ids).toContain("team-empty");
    for (const guide of Object.values(EMPTY_STATE_GUIDES)) {
      expect(guide.title.length).toBeGreaterThan(0);
      expect(guide.guide.length).toBeGreaterThan(0);
      expect(guide.actionLabel.length).toBeGreaterThan(0);
    }
  });
});
