import { describe, expect, it } from "vitest";

import {
  buildTimeline,
  clampCutDuration,
  clampIntensity,
  episodeDurationSeconds,
  sceneMoodToBgmMood,
  validateMotionEpisode,
  type MotionCut,
  type MotionEpisode,
} from "./motion-webtoon-model";

function makeCut(partial?: Partial<MotionCut>): MotionCut {
  return {
    id: "cut-1",
    imageUrl: "https://example.com/cut1.png",
    altKo: "컷 1",
    altEn: "Cut 1",
    direction: { cameraMove: "zoom-in", durationSeconds: 6, intensity: 0.5 },
    transitionIn: "fade",
    bgm: { sceneMood: "daily", crossfadeSeconds: 2 },
    dialogues: [],
    ...partial,
  };
}

function makeEpisode(cuts: MotionCut[]): MotionEpisode {
  return {
    id: "ep-1",
    titleKo: "1화",
    titleEn: "Episode 1",
    characters: [{ id: "char-1", nameKo: "주인공", nameEn: "Hero", presetId: "narrator" }],
    cuts,
  };
}

describe("sceneMoodToBgmMood", () => {
  it("씬 분위기를 기존 BGM 엔진 무드로 매핑한다", () => {
    expect(sceneMoodToBgmMood("battle")).toBe("virtual");
    expect(sceneMoodToBgmMood("tension")).toBe("studio");
    expect(sceneMoodToBgmMood("romance")).toBe("home");
    expect(sceneMoodToBgmMood("daily")).toBe("material");
    expect(sceneMoodToBgmMood("sad")).toBe("draw");
    expect(sceneMoodToBgmMood("mystery")).toBe("draw");
    expect(sceneMoodToBgmMood("comedy")).toBe("virtual");
    expect(sceneMoodToBgmMood("horror")).toBe("studio");
  });
});

describe("buildTimeline", () => {
  it("컷 시작·BGM 전환·대사 이벤트를 시간순으로 만든다", () => {
    const episode = makeEpisode([
      makeCut({
        id: "cut-1",
        direction: { cameraMove: "static", durationSeconds: 6, intensity: 0.5 },
        dialogues: [
          { id: "dlg-1", text: "안녕", characterId: "char-1", startOffsetSeconds: 1 },
          { id: "dlg-2", text: "잘가", characterId: "char-1", startOffsetSeconds: 3 },
        ],
      }),
      makeCut({
        id: "cut-2",
        direction: { cameraMove: "static", durationSeconds: 4, intensity: 0.5 },
      }),
    ]);
    const timeline = buildTimeline(episode);
    expect(timeline.map((e) => [e.atSeconds, e.kind])).toEqual([
      [0, "cut-start"],
      [0, "bgm-change"],
      [1, "dialogue-start"],
      [3, "dialogue-start"],
      [6, "cut-start"],
      [6, "bgm-change"],
    ]);
    expect(timeline[2]?.dialogueId).toBe("dlg-1");
  });

  it("컷 길이를 벗어난 대사는 스케줄하지 않는다", () => {
    const episode = makeEpisode([
      makeCut({
        direction: { cameraMove: "static", durationSeconds: 4, intensity: 0.5 },
        dialogues: [
          { id: "dlg-late", text: "늦음", characterId: "char-1", startOffsetSeconds: 10 },
        ],
      }),
    ]);
    const timeline = buildTimeline(episode);
    expect(timeline.some((e) => e.kind === "dialogue-start")).toBe(false);
  });
});

describe("episodeDurationSeconds", () => {
  it("컷 길이 합을 반환한다", () => {
    const episode = makeEpisode([
      makeCut({ direction: { cameraMove: "static", durationSeconds: 6, intensity: 0.5 } }),
      makeCut({ direction: { cameraMove: "static", durationSeconds: 4, intensity: 0.5 } }),
    ]);
    expect(episodeDurationSeconds(episode)).toBe(10);
  });
});

describe("clampCutDuration / clampIntensity", () => {
  it("범위를 벗어나면 클램프한다", () => {
    expect(clampCutDuration(1)).toBe(2);
    expect(clampCutDuration(100)).toBe(30);
    expect(clampCutDuration(Number.NaN)).toBe(6);
    expect(clampIntensity(-1)).toBe(0);
    expect(clampIntensity(2)).toBe(1);
    expect(clampIntensity(Number.NaN)).toBe(0.5);
  });
});

describe("validateMotionEpisode", () => {
  it("빈 이미지·빈 대사·미등록 캐릭터를 지적한다", () => {
    const episode = makeEpisode([
      makeCut({
        imageUrl: "",
        dialogues: [
          { id: "dlg-1", text: "", characterId: "char-1", startOffsetSeconds: 0 },
          { id: "dlg-2", text: "누구?", characterId: "ghost", startOffsetSeconds: 1 },
        ],
      }),
    ]);
    const issues = validateMotionEpisode(episode);
    expect(issues).toHaveLength(3);
    expect(issues[0]?.cutIndex).toBe(0);
  });

  it("정상 회차는 이슈가 없다", () => {
    const episode = makeEpisode([
      makeCut({
        dialogues: [{ id: "dlg-1", text: "안녕", characterId: "char-1", startOffsetSeconds: 0 }],
      }),
    ]);
    expect(validateMotionEpisode(episode)).toHaveLength(0);
  });
});
