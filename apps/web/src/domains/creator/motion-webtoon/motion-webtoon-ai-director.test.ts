import { describe, expect, it } from "vitest";

import {
  analyzeDialogueEmotion,
  autoDirectCut,
  autoDirectEpisode,
  dominantCutEmotion,
  emotionToSceneMood,
  emotionToVoicePreset,
  suggestCameraMove,
} from "./motion-webtoon-ai-director";
import type { MotionCut, MotionEpisode } from "./motion-webtoon-model";

describe("analyzeDialogueEmotion", () => {
  it("한국어 키워드로 감정을 분석한다", () => {
    expect(analyzeDialogueEmotion("정말 화가 나! 용서 못 해")).toBe("anger");
    expect(analyzeDialogueEmotion("눈물이 나... 미안해")).toBe("sorrow");
    expect(analyzeDialogueEmotion("너무 행복해! 최고야")).toBe("joy");
    expect(analyzeDialogueEmotion("조심해, 위험해!")).toBe("tension");
    expect(analyzeDialogueEmotion("두근거려... 고백할 거야")).toBe("romance");
    expect(analyzeDialogueEmotion("무서워, 귀신이 나왔어")).toBe("fear");
    expect(analyzeDialogueEmotion("헉! 말도 안 돼")).toBe("surprise");
  });

  it("영어 키워드로 감정을 분석한다", () => {
    expect(analyzeDialogueEmotion("I am so angry, I hate this")).toBe("anger");
    expect(analyzeDialogueEmotion("I miss you, tears fall")).toBe("sorrow");
  });

  it("키워드가 없으면 neutral이다", () => {
    expect(analyzeDialogueEmotion("오늘 날씨가 좋네요")).toBe("neutral");
    expect(analyzeDialogueEmotion("")).toBe("neutral");
  });
});

describe("emotionToSceneMood / emotionToVoicePreset", () => {
  it("감정을 씬 분위기로 매핑한다", () => {
    expect(emotionToSceneMood("anger")).toBe("battle");
    expect(emotionToSceneMood("sorrow")).toBe("sad");
    expect(emotionToSceneMood("joy")).toBe("comedy");
    expect(emotionToSceneMood("romance")).toBe("romance");
    expect(emotionToSceneMood("fear")).toBe("horror");
    expect(emotionToSceneMood("neutral")).toBe("daily");
  });

  it("감정을 음성 프리셋으로 매핑한다", () => {
    expect(emotionToVoicePreset("anger")).toBe("passionate");
    expect(emotionToVoicePreset("sorrow")).toBe("mystic");
    expect(emotionToVoicePreset("neutral")).toBe("narrator");
  });
});

describe("suggestCameraMove", () => {
  it("구도에 맞는 카메라 무브를 추천한다", () => {
    expect(suggestCameraMove("closeup")).toBe("zoom-in");
    expect(suggestCameraMove("wide")).toBe("zoom-out");
    expect(suggestCameraMove("action")).toBe("shake");
    expect(suggestCameraMove("dialogue")).toBe("pan-right");
    expect(suggestCameraMove("establishing")).toBe("pan-down");
  });
});

describe("dominantCutEmotion", () => {
  it("컷의 대표 감정을 고른다", () => {
    expect(
      dominantCutEmotion({
        dialogues: [
          { id: "d1", text: "오늘 날씨가 좋네요", characterId: "c1", startOffsetSeconds: 0 },
          { id: "d2", text: "무서워! 도망쳐!", characterId: "c1", startOffsetSeconds: 2 },
        ],
      }),
    ).toBe("fear");
  });
});

describe("autoDirectCut", () => {
  function makeCut(): MotionCut {
    return {
      id: "cut-1",
      imageUrl: "https://example.com/1.png",
      altKo: "컷 1",
      altEn: "Cut 1",
      direction: { cameraMove: "static", durationSeconds: 6, intensity: 0.5 },
      transitionIn: "cut",
      bgm: { sceneMood: "daily", crossfadeSeconds: 2 },
      dialogues: [
        { id: "d1", text: "조심해! 위험해!", characterId: "c1", startOffsetSeconds: 0 },
      ],
    };
  }

  it("감정에 맞는 BGM·카메라·대사 오프셋을 채운다", () => {
    const directed = autoDirectCut(makeCut());
    expect(directed.bgm.sceneMood).toBe("battle");
    expect(directed.direction.cameraMove).toBe("shake");
    expect(directed.dialogues[0]?.startOffsetSeconds).toBe(0);
    // 대사 길이에 따라 컷 길이가 늘어난다
    expect(directed.direction.durationSeconds).toBeGreaterThan(6);
  });

  it("이미 감정 마크업이 있는 대사는 그대로 둔다", () => {
    const cut = makeCut();
    const marked: MotionCut = {
      ...cut,
      dialogues: [{ id: "d1", text: "[강조]조심해![/강조]", characterId: "c1", startOffsetSeconds: 0 }],
    };
    const directed = autoDirectCut(marked);
    expect(directed.dialogues[0]?.text).toBe("[강조]조심해![/강조]");
  });
});

describe("autoDirectEpisode", () => {
  it("회차 전체에 연출을 적용한다", () => {
    const episode: MotionEpisode = {
      id: "ep-1",
      titleKo: "1화",
      titleEn: "Ep 1",
      characters: [],
      cuts: [
        {
          id: "cut-1",
          imageUrl: "https://example.com/1.png",
          altKo: "컷 1",
          altEn: "Cut 1",
          direction: { cameraMove: "static", durationSeconds: 6, intensity: 0.5 },
          transitionIn: "cut",
          bgm: { sceneMood: "daily", crossfadeSeconds: 2 },
          dialogues: [{ id: "d1", text: "너무 행복해!", characterId: "c1", startOffsetSeconds: 0 }],
        },
      ],
    };
    const directed = autoDirectEpisode(episode);
    expect(directed.cuts[0]?.bgm.sceneMood).toBe("comedy");
    // 원본은 바꾸지 않는다
    expect(episode.cuts[0]?.bgm.sceneMood).toBe("daily");
  });
});
