import { expect, it } from "vitest";
import { pushRecentColor } from "../studio-color-utils";
import { emptyStudioRecentColorIntents, reduceStudioRecentColorIntents, replayStudioRecentColorIntents } from "./studio-recent-color-intents";

it("retains at most 12 intents and the same outcome as 10,000 selections", () => {
  let summary = emptyStudioRecentColorIntents();
  let reference = ["#fedcba"];
  for (let i = 0; i < 10000; i++) {
    const color = `#${i.toString(16).padStart(6, "0")}`;
    summary = reduceStudioRecentColorIntents(summary, { type: "remember", color });
    reference = pushRecentColor(reference, color);
    expect(summary.colors.length).toBeLessThanOrEqual(12);
  }
  expect(replayStudioRecentColorIntents(["#fedcba"], summary)).toEqual(reference);
});
it("clear is retained across retry and failed hydration without reviving old colors", () => {
  let summary = reduceStudioRecentColorIntents(emptyStudioRecentColorIntents(), { type: "remember", color: "#abc" });
  summary = reduceStudioRecentColorIntents(summary, { type: "clear" });
  summary = reduceStudioRecentColorIntents(summary, { type: "remember", color: "#123" });
  summary = reduceStudioRecentColorIntents(summary, { type: "retry" });
  expect(replayStudioRecentColorIntents(["#fedcba"], summary)).toEqual(["#112233"]);
});
it("normalizes duplicates without discarding older stored colors on a retry", () => {
  let summary = emptyStudioRecentColorIntents();
  for (const color of ["#abc", "#123", "#AABBCC", "invalid"]) summary = reduceStudioRecentColorIntents(summary, { type: "remember", color });
  expect(replayStudioRecentColorIntents(["#556677"], summary)).toEqual(["#aabbcc", "#112233", "#556677"]);
});
