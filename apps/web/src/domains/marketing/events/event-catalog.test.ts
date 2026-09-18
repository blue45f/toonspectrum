import { describe, expect, it } from "vitest";

import {
  BETA_OPEN_EVENT,
  findMarketingEvent,
  resolveMarketingEventStatus,
} from "./event-catalog";

describe("marketing event catalog", () => {
  it("keeps the beta opening benefit explicit and non-stacking", () => {
    expect(BETA_OPEN_EVENT.signupFreeMonths).toBe(6);
    expect(BETA_OPEN_EVENT.publicCreatorFreeMonths).toBe(12);
    expect(BETA_OPEN_EVENT.minimumPublicContentCount).toBe(1);
    expect(BETA_OPEN_EVENT.minimumPublicDays).toBe(30);
    expect(BETA_OPEN_EVENT.notices.some((notice) => notice.ko.includes("합산되지"))).toBe(true);
  });

  it("resolves the open-ended beta event as active after launch", () => {
    expect(
      resolveMarketingEventStatus(
        BETA_OPEN_EVENT,
        new Date("2026-09-18T12:00:00+09:00"),
      ),
    ).toBe("active");
  });

  it("finds the public beta event by slug", () => {
    expect(findMarketingEvent("beta-open")?.id).toBe("beta-open-2026");
  });
});
