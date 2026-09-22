import { describe, expect, it } from "vitest";

import {
  CREATOR_SERIES_STATUSES,
  nextEpisodeNumber,
  parseSeriesStatus,
  validateSeriesInput,
} from "./community-contract";

describe("creator series lifecycle contract", () => {
  it("accepts ongoing, hiatus, and completed as explicit lifecycle states", () => {
    expect(CREATOR_SERIES_STATUSES).toEqual([
      "ongoing",
      "hiatus",
      "completed",
    ]);
    expect(parseSeriesStatus("ongoing")).toBe("ongoing");
    expect(parseSeriesStatus("hiatus")).toBe("hiatus");
    expect(parseSeriesStatus("completed")).toBe("completed");
  });

  it("falls back to ongoing for unknown or legacy-corrupt states", () => {
    expect(parseSeriesStatus("paused")).toBe("ongoing");
    expect(parseSeriesStatus(null)).toBe("ongoing");
    expect(parseSeriesStatus({ status: "hiatus" })).toBe("ongoing");
  });

  it("preserves a creator-selected hiatus state during input normalization", () => {
    expect(validateSeriesInput({
      title: "  휴재 중인 연재  ",
      description: "다음 시즌을 준비하고 있습니다.",
      tags: ["시즌제", "드라마"],
      status: "hiatus",
    })).toEqual({
      value: {
        title: "휴재 중인 연재",
        description: "다음 시즌을 준비하고 있습니다.",
        cover: "",
        tags: ["시즌제", "드라마"],
        status: "hiatus",
        showcaseEnabled: false,
      },
    });
  });

  it("uses an explicit boolean for spatial showcase placement", () => {
    expect(validateSeriesInput({ title: "공간 전시", showcaseEnabled: true }).value?.showcaseEnabled).toBe(true);
    expect(validateSeriesInput({ title: "기본값" }).value?.showcaseEnabled).toBe(false);
  });

  it("continues numbering after the highest valid episode across hiatus", () => {
    expect(nextEpisodeNumber([1, 2, "7", null, "invalid", -2])).toBe(8);
  });
});
