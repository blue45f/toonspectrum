import { describe, expect, it } from "vitest";

import {
  applyStudioEpisodePoseDelta,
  checkStudioEpisodePoseConsistency,
  findSimilarEpisodePoses,
  recallStudioEpisodePose,
  saveStudioEpisodePoseMapping,
  StudioEpisodePoseError,
} from "./studio-shaper-episode-poses";
import type { StudioMannequinPose } from "../scene-3d/studio-mannequin-poses";

const POSE_A: StudioMannequinPose = {
  joints: { leftShoulder: [0.5, 0, 0] },
  pelvisOffset: [0, 0, 0],
};
const POSE_B: StudioMannequinPose = {
  joints: { leftShoulder: [0.55, 0, 0] },
  pelvisOffset: [0, 0, 0],
};
const POSE_FAR: StudioMannequinPose = {
  joints: { head: [0, 1.2, 0] },
  pelvisOffset: [0, 0.5, 0],
};

function seed() {
  let mappings = saveStudioEpisodePoseMapping(
    [],
    {
      episodeId: "ep-11",
      characterId: "char-1",
      poseId: "standing-front",
      pose: POSE_A,
      outfitId: "outfit-school",
      propIds: ["prop-bag"],
    },
    () => 1_700_000_000_000,
  );
  mappings = saveStudioEpisodePoseMapping(
    mappings,
    { episodeId: "ep-12", characterId: "char-1", pose: POSE_FAR, outfitId: "outfit-school", propIds: [] },
    () => 1_700_000_001_000,
  );
  return mappings;
}

describe("studio shaper episode poses", () => {
  it("회차 포즈 매핑 저장 시 ID가 비면 거부됩니다", () => {
    expect(() =>
      saveStudioEpisodePoseMapping([], { episodeId: " ", characterId: "c", pose: POSE_A }),
    ).toThrowError(StudioEpisodePoseError);
  });

  it("recall은 가장 최근 매핑을 돌립니다", () => {
    const mappings = seed();
    const latest = recallStudioEpisodePose(mappings, { characterId: "char-1" });
    expect(latest?.episodeId).toBe("ep-12");
    const ep11 = recallStudioEpisodePose(mappings, { characterId: "char-1", episodeId: "ep-11" });
    expect(ep11?.episodeId).toBe("ep-11");
    expect(recallStudioEpisodePose(mappings, { characterId: "unknown" })).toBeUndefined();
  });

  it("유사 포즈 검색이 유사도 순으로 돌립니다", () => {
    const mappings = seed();
    const similar = findSimilarEpisodePoses(mappings, "char-1", POSE_B, 2);
    expect(similar).toHaveLength(2);
    expect(similar[0]?.mapping.episodeId).toBe("ep-11");
    expect(similar[0]?.similarity).toBeGreaterThan(similar[1]?.similarity ?? 0);
    expect(similar[0]?.similarity).toBeLessThanOrEqual(1);
  });

  it("미세 조정 델타가 관절 각도에 더해집니다", () => {
    const adjusted = applyStudioEpisodePoseDelta(POSE_A, {
      joints: { leftShoulder: [0.1, 0, 0] },
      pelvisOffset: [0, 0.1, 0],
    });
    expect(adjusted.joints.leftShoulder?.[0]).toBeCloseTo(0.6, 10);
    expect(adjusted.pelvisOffset[1]).toBeCloseTo(0.1, 10);
  });

  it("의상·소품 누락 경고가 동작합니다", () => {
    const mappings = seed();
    const previous = recallStudioEpisodePose(mappings, {
      characterId: "char-1",
      episodeId: "ep-11",
    })!;
    const warnings = checkStudioEpisodePoseConsistency(previous, {
      outfitId: "outfit-other",
      propIds: [],
    });
    expect(warnings.map((warning) => warning.code)).toEqual(["outfit-missing", "prop-missing"]);
    const clean = checkStudioEpisodePoseConsistency(previous, {
      outfitId: "outfit-school",
      propIds: ["prop-bag"],
    });
    expect(clean).toEqual([]);
  });
});
