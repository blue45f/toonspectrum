import { describe, expect, it } from "vitest";

import { parseShareAnalyticsDetail } from "./share-analytics-event";

describe("share analytics browser contract", () => {
  it.each(["opened", "completed", "cancelled", "failed"] as const)(
    "accepts the reviewed %s outcome without adding payload content",
    (outcome) => {
      expect(parseShareAnalyticsDetail({
        channel: "kakao",
        outcome,
        path: "/create/work-1",
        title: "must not cross the analytics boundary",
      })).toEqual({ channel: "kakao", outcome, path: "/create/work-1" });
    },
  );

  it.each([
    { channel: "kakao", outcome: "success", path: "/create/work-1" },
    { channel: "unknown", outcome: "opened", path: "/create/work-1" },
    { channel: "copy", outcome: "completed", path: "/create/work-1?secret=1" },
    { channel: "copy", outcome: "completed", path: "https://example.com/create/work-1" },
  ])("rejects ambiguous or privacy-unsafe detail %#", (detail) => {
    expect(parseShareAnalyticsDetail(detail)).toBeNull();
  });
});
