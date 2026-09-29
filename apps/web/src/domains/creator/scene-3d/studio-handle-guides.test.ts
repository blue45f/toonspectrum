import { describe, expect, it } from "vitest";

import {
  describeStudioMannequinHandleJoints,
  findStudioMannequinHandleGuide,
  STUDIO_MANNEQUIN_HANDLE_GUIDES,
  validateStudioMannequinHandleGuides,
} from "./studio-handle-guides";

describe("studio handle guides", () => {
  it("핸들 4종이 정의되어 있습니다", () => {
    expect(STUDIO_MANNEQUIN_HANDLE_GUIDES.map((guide) => guide.id)).toEqual([
      "center-of-gravity",
      "spine",
      "upper-body",
      "head",
    ]);
  });

  it("기본 가이드 스펙은 정합성 검증을 통과합니다", () => {
    expect(validateStudioMannequinHandleGuides()).toEqual([]);
  });

  it("모든 툴팁은 한국어 합니다체로 비어 있지 않습니다", () => {
    for (const guide of STUDIO_MANNEQUIN_HANDLE_GUIDES) {
      expect(guide.tooltip.length).toBeGreaterThan(10);
      expect(guide.tooltip).toMatch(/합니다\.$/);
    }
  });

  it("핸들 조회가 동작합니다", () => {
    const guide = findStudioMannequinHandleGuide("head");
    expect(guide?.targetJoint).toBe("head");
    const described = describeStudioMannequinHandleJoints(guide!);
    expect(described.target.length).toBeGreaterThan(0);
    expect(described.affected.length).toBeGreaterThan(0);
  });

  it("깨진 스펙은 문제를 찾아냅니다", () => {
    const broken = [
      ...STUDIO_MANNEQUIN_HANDLE_GUIDES,
      {
        id: "head",
        label: "중복",
        targetJoint: "not-a-joint",
        affectedJoints: [],
        tooltip: "",
      } as never,
    ];
    const problems = validateStudioMannequinHandleGuides(broken);
    expect(problems.length).toBeGreaterThanOrEqual(3);
  });
});
