import { describe, expect, it } from "vitest";

import { emptyPromoProject } from "./promo-model";
import { isPristinePromoProject } from "./promo-draft";

describe("isPristinePromoProject", () => {
  it("손대지 않은 빈 프로젝트는 pristine이다", () => {
    expect(isPristinePromoProject(emptyPromoProject())).toBe(true);
  });

  it("컷이 없어도 제목만 바꿨으면 pristine이 아니다 (자동 저장 대상)", () => {
    expect(isPristinePromoProject({ ...emptyPromoProject(), title: "새 제목" })).toBe(false);
    expect(isPristinePromoProject({ ...emptyPromoProject(), synopsis: "줄거리" })).toBe(false);
    expect(isPristinePromoProject({ ...emptyPromoProject(), seconds: 30 })).toBe(false);
  });
});
