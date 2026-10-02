import { describe, expect, it } from "vitest";

import { shouldShowEntryIntro } from "./entry-intro-policy";

describe("shouldShowEntryIntro", () => {
  it.each(["/studio", "/studio/", "/studio/tools-companion"])(
    "전용 편집기 %s에서는 앱 인트로를 생략한다",
    (pathname) => {
      expect(shouldShowEntryIntro(pathname)).toBe(false);
    }
  );

  it("게시용 upload 모드는 인트로 흐름을 유지한다", () => {
    expect(shouldShowEntryIntro("/studio", "?mode=upload")).toBe(true);
    expect(shouldShowEntryIntro("/studio/publish")).toBe(true);
    expect(shouldShowEntryIntro("/studio/work/work-1/publish")).toBe(true);
  });

  it.each(["/", "/ranking", "/create", "/create/work-1"])(
    "일반 앱 경로 %s에서는 인트로를 유지한다",
    (pathname) => {
      expect(shouldShowEntryIntro(pathname)).toBe(true);
    },
  );

  it.each(["/admin", "/admin/members"])(
    "관리자 콘솔 %s에서는 인트로를 생략한다",
    (pathname) => {
      expect(shouldShowEntryIntro(pathname)).toBe(false);
    },
  );

  it.each([
    "/team",
    "/team/lobby",
    "/home",
    "/hub",
    "/studio/space",
    "/studio/p/work-9/space",
    "/onboarding/character",
  ])(
    "자체 진입 연출을 가진 몰입 표면 %s에서는 인트로를 겹치지 않는다",
    (pathname) => {
      expect(shouldShowEntryIntro(pathname)).toBe(false);
    },
  );
});
