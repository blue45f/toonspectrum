import { describe, expect, it } from "vitest";

import { planStudioAiEpisodeProduction } from "./studio-ai-episode-production-director";
import { createStudioAiComicComposerHandoff } from "./studio-ai-comic-composer-handoff";

describe("AI comic composer handoff", () => {
  it("turns the entire deterministic episode plan into editable scenario cuts", () => {
    const plan = planStudioAiEpisodeProduction({
      episodeTitle: "비 오는 약속",
      script: [
        "장면 1. 비 오는 골목에서 주인공이 우산을 들고 달린다.\n주인공: 늦었다!",
        "장면 2. 카페 앞에서 친구와 마주친다.\n친구: 여기야!",
      ].join("\n\n"),
      variants: 4,
      characterAnchor: "검은 단발의 주인공",
      costumeAnchor: "남색 교복",
      styleAnchor: "선명한 한국 웹툰 잉크 스타일",
      propAnchor: "노란 우산",
    });

    const handoff = createStudioAiComicComposerHandoff(plan);

    expect(handoff.source).toBe("episode-production-director");
    expect(handoff.variants).toBe(4);
    expect(handoff.scenes).toHaveLength(plan.totalCuts);
    expect(handoff.scenes[0]).toMatchObject({ sourceSceneNumber: 1, sourceCutNumber: 1 });
    expect(handoff.scenes[0]?.imagePrompt).toContain("말풍선과 읽을 수 있는 텍스트는 이미지에 그리지 않습니다.");
    expect(handoff.scenes[0]?.continuity?.characterNames).toContain("검은 단발의 주인공");
    expect(handoff.storyText).toContain("[연속성 기준]");
    expect(handoff.characterDescription).toContain("남색 교복");
  });
});
