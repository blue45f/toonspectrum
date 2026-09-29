import { describe, expect, it } from "vitest";

import { createStudioVrmVideoHandFrameResult } from "./studio-vrm-video-hand";

function hand(offset = 0): Array<{ x: number; y: number; z: number }> {
  return Array.from({ length: 21 }, (_, index) => ({
    x: offset + index * 0.01,
    y: index * 0.02,
    z: -index * 0.005,
  }));
}

function result(labels: readonly ("Left" | "Right")[], scores?: readonly number[]) {
  return {
    landmarks: labels.map((_, index) => hand(index * 0.1)),
    worldLandmarks: labels.map((_, index) => hand(index * 0.01)),
    handedness: labels.map((label, index) => [{
      categoryName: label,
      score: scores?.[index] ?? 0.9,
    }]),
  };
}

describe("studio VRM 실시간(VIDEO) 손 경계", () => {
  it("0·1·2개 손을 받아 해당 측 손가락 본만 만든다", () => {
    const none = createStudioVrmVideoHandFrameResult(result([]), { mirror: true });
    expect(none).toMatchObject({ detectedSides: [], droppedSides: [], fingers: {} });

    const one = createStudioVrmVideoHandFrameResult(result(["Left"]), { mirror: true });
    expect(one.detectedSides).toEqual(["left"]);
    expect(one.droppedSides).toEqual([]);
    expect(one.fingers.leftIndexProximal).toBeDefined();
    expect(one.fingers.rightIndexProximal).toBeUndefined();

    const two = createStudioVrmVideoHandFrameResult(result(["Left", "Right"]), { mirror: true });
    expect(two.detectedSides).toEqual(["left", "right"]);
    expect(two.fingers.leftThumbDistal).toBeDefined();
    expect(two.fingers.rightThumbDistal).toBeDefined();
  });

  it("미러 설정에 따라 handedness 라벨을 아바타 측으로 매핑한다", () => {
    const mirrored = createStudioVrmVideoHandFrameResult(result(["Left"]), { mirror: true });
    const anatomical = createStudioVrmVideoHandFrameResult(result(["Left"]), { mirror: false });
    expect(mirrored.detectedSides).toEqual(["left"]);
    expect(anatomical.detectedSides).toEqual(["right"]);
  });

  it("같은 측 중복 검출은 배열 순서 덮어쓰기 대신 그 측을 통째로 버린다", () => {
    const duplicate = createStudioVrmVideoHandFrameResult(result(["Left", "Left"]), { mirror: true });
    expect(duplicate.detectedSides).toEqual([]);
    expect(duplicate.droppedSides).toEqual(["left"]);
    expect(duplicate.fingers).toEqual({});
  });

  it("신뢰도 미달 손은 버리고 유효한 손은 유지한다", () => {
    const mixed = createStudioVrmVideoHandFrameResult(result(["Left", "Right"], [0.9, 0.2]), {
      mirror: true,
    });
    expect(mixed.detectedSides).toEqual(["left"]);
    expect(mixed.fingers.leftIndexProximal).toBeDefined();
    expect(mixed.fingers.rightIndexProximal).toBeUndefined();

    const custom = createStudioVrmVideoHandFrameResult(result(["Right"], [0.85]), {
      mirror: true,
      minimumHandednessConfidence: 0.9,
    });
    expect(custom.detectedSides).toEqual([]);
    expect(custom.fingers).toEqual({});
  });

  it("손상 프레임에는 예외 없이 빈 기여로 버린다(프레임 루프 보호)", () => {
    expect(createStudioVrmVideoHandFrameResult(null, { mirror: true }).fingers).toEqual({});
    expect(createStudioVrmVideoHandFrameResult(undefined, { mirror: true }).fingers).toEqual({});
    expect(createStudioVrmVideoHandFrameResult({}, { mirror: true }).fingers).toEqual({});

    // 21개 미만 랜드마크.
    const short = result(["Left"]);
    short.worldLandmarks[0] = short.worldLandmarks[0]!.slice(0, 20);
    short.landmarks[0] = short.landmarks[0]!.slice(0, 20);
    expect(createStudioVrmVideoHandFrameResult(short, { mirror: true }).detectedSides).toEqual([]);

    // NaN 좌표.
    const nonFinite = result(["Left"]);
    nonFinite.worldLandmarks[0]![4]!.z = Number.NaN;
    nonFinite.landmarks[0]![4]!.z = Number.NaN;
    expect(createStudioVrmVideoHandFrameResult(nonFinite, { mirror: true }).detectedSides).toEqual([]);

    // 잘못된 라벨/점수.
    const invalidLabel = result(["Left"]);
    invalidLabel.handedness[0]![0]!.categoryName = "Unknown" as "Left";
    expect(createStudioVrmVideoHandFrameResult(invalidLabel, { mirror: true }).detectedSides).toEqual([]);

    const invalidScore = result(["Left"]);
    invalidScore.handedness[0]![0]!.score = 2;
    expect(createStudioVrmVideoHandFrameResult(invalidScore, { mirror: true }).detectedSides).toEqual([]);

    // handedness 누락 — 추측(Right 기본값)으로 얹지 않고 버린다.
    const noHandedness = { landmarks: result(["Left"]).landmarks, worldLandmarks: result(["Left"]).worldLandmarks };
    expect(createStudioVrmVideoHandFrameResult(noHandedness, { mirror: true }).detectedSides).toEqual([]);
  });

  it("worldLandmarks 가 손상되면 정규화 landmarks 로 폴백한다", () => {
    const raw = result(["Right"]);
    raw.worldLandmarks[0]![4]!.z = Number.NaN;
    const frame = createStudioVrmVideoHandFrameResult(raw, { mirror: true });
    expect(frame.detectedSides).toEqual(["right"]);
    expect(frame.fingers.rightIndexProximal).toBeDefined();
  });

  it("deprecated handednesses 필드를 폴백으로 읽는다", () => {
    const legacy = result(["Right"]);
    const raw = {
      landmarks: legacy.landmarks,
      worldLandmarks: legacy.worldLandmarks,
      handednesses: legacy.handedness,
    };
    expect(createStudioVrmVideoHandFrameResult(raw, { mirror: true }).detectedSides).toEqual(["right"]);
  });

  it("3개 이상 손은 처음 2개만 처리한다", () => {
    const raw = result(["Left", "Right", "Left"]);
    const frame = createStudioVrmVideoHandFrameResult(raw, { mirror: true });
    expect(frame.detectedSides).toEqual(["left", "right"]);
    expect(frame.droppedSides).toEqual([]);
  });

  it("범위 밖 신뢰도 옵션은 기본값(0.5)으로 대체한다", () => {
    const frame = createStudioVrmVideoHandFrameResult(result(["Left"], [0.6]), {
      mirror: true,
      minimumHandednessConfidence: 7,
    });
    expect(frame.detectedSides).toEqual(["left"]);
  });
});
