import { describe, expect, it } from "vitest";
import { FORTUNE_EXPERIENCES, buildFortuneReading } from "@toonspectrum/core/fortune";
import { FORTUNE_INTENTS, fortuneCreativeMission, fortunePublicShare, fortuneSceneTheme, fortuneStoryScenes, shuffleFortuneDeck } from "./fortune-cinematic-model";

describe("fortune cinematic model", () => {
  it("links every mood recommendation to a real experience", () => {
    const ids = FORTUNE_EXPERIENCES.map((item) => item.id);
    for (const intent of FORTUNE_INTENTS) for (const id of intent.content) expect(ids).toContain(id);
  });
  it.each([0, .3, .99999, -5, 5, NaN, Infinity])("keeps 22 unique numbered choices for random sample %s", (sample) => {
    expect(shuffleFortuneDeck(() => sample).sort((a, b) => a - b)).toEqual(Array.from({ length: 22 }, (_, i) => i));
  });
  it("gives topic-specific visual identities", () => {
    expect(fortuneSceneTheme("saju")).toBe("gold"); expect(fortuneSceneTheme("love-match")).toBe("rose");
    expect(fortuneSceneTheme("rest")).toBe("mint"); expect(fortuneSceneTheme("tarot")).toBe("violet");
  });
  it.each(FORTUNE_EXPERIENCES.map((item) => item.id))("preserves the complete %s reading in comic scenes", async (id) => {
    const reading = await buildFortuneReading(id, { birth: { date: "1990-06-15", calendar: "solar" }, partner: { date: "1992-11-23", calendar: "solar" }, question: "바다 고양이 나무", date: "2026-09-13", month: "2026-09", year: 2026, pick: 4 });
    const scenes = fortuneStoryScenes(reading);
    expect(scenes).toHaveLength(reading.sections.length + 2);
    expect(scenes[0].body).toBe(reading.summary);
    reading.sections.forEach((section, i) => { expect(scenes[i + 1].title).toBe(section.title); expect(scenes[i + 1].body).toBe(section.body); expect(scenes[i + 1].items).toEqual(section.items ?? []); });
    expect(fortuneCreativeMission(reading)).toHaveLength(3);
    expect(fortunePublicShare(reading).path).toBe(`/fortune?content=${id}`);
    expect(fortunePublicShare(reading).text).not.toContain("1990-06-15");
    expect(fortunePublicShare(reading).text).not.toContain("1992-11-23");
    if (id === "numerology") expect(fortunePublicShare(reading).text).not.toContain("계산을 따라가기");
  });
});
