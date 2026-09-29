import { describe, expect, it } from "vitest";

import {
  createStudioMannequinHandFrameResult,
  mirrorStudioMannequinHandEuler,
  solveMannequinHandWristEuler,
  solveMannequinHandWristsFromDetections,
  STUDIO_MANNEQUIN_HAND_LANDMARK_COUNT,
  STUDIO_MANNEQUIN_HAND_MAX_HANDS,
  type StudioMannequinHandSide,
} from "./studio-mannequin-hand-tracking";

import type { HandLandmark } from "../vrm/studio-vrm-hand-solver";
import { avatarSideForHand } from "../vrm/studio-vrm-hand-solver";
import type { StudioMannequinVec3 } from "./studio-mannequin-model";

function requireEuler(
  landmarks: readonly HandLandmark[],
  side: StudioMannequinHandSide,
): StudioMannequinVec3 {
  const euler = solveMannequinHandWristEuler(landmarks, side);
  if (euler === null) throw new Error("wrist euler should be solvable for a valid palm");
  return euler;
}

/**
 * 합성 열린 손바닥. 랜드마크 공간(x=오른쪽, y=아래, z=관찰자 쪽)에서
 * 손가락은 아래(+y), 손바닥은 관찰자(+z)를 향한 휴식 자세다.
 * 중지 x=0 으로 손목→중지 축을 정확히 세워 휴식 오일러가 0이 되게 한다.
 */
function openPalm(side: StudioMannequinHandSide): HandLandmark[] {
  const sign = side === "left" ? 1 : -1;
  const points: Array<[number, number, number]> = [
    [0, 0, 0], // 0 wrist
    [sign * 0.06, 0.02, 0.01], // 1 thumbCmc
    [sign * 0.09, 0.05, 0.02], // 2 thumbMcp
    [sign * 0.11, 0.08, 0.02], // 3 thumbIp
    [sign * 0.13, 0.11, 0.02], // 4 thumbTip
    [sign * 0.045, 0.1, 0], // 5 indexMcp
    [sign * 0.045, 0.16, 0], // 6 indexPip
    [sign * 0.045, 0.21, 0], // 7 indexDip
    [sign * 0.045, 0.25, 0], // 8 indexTip
    [0, 0.11, 0], // 9 middleMcp
    [0, 0.18, 0], // 10 middlePip
    [0, 0.24, 0], // 11 middleDip
    [0, 0.29, 0], // 12 middleTip
    [sign * -0.015, 0.1, 0], // 13 ringMcp
    [sign * -0.015, 0.16, 0], // 14 ringPip
    [sign * -0.015, 0.2, 0], // 15 ringDip
    [sign * -0.015, 0.24, 0], // 16 ringTip
    [sign * -0.045, 0.09, 0], // 17 littleMcp
    [sign * -0.045, 0.14, 0], // 18 littlePip
    [sign * -0.045, 0.18, 0], // 19 littleDip
    [sign * -0.045, 0.21, 0], // 20 littleTip
  ];
  return points.map(([x, y, z]) => ({ x, y, z }));
}

/** 손바닥이 이미지 왼쪽(-x)을 향하도록 Y축 회전한 손. */
function palmFacingLeft(side: StudioMannequinHandSide): HandLandmark[] {
  return openPalm(side).map(({ x, y, z }) => ({ x: -z, y, z: x }));
}

/** 손가락이 위(-y)를 향하도록 Z축 180° 회전한 손(손바닥은 정면 유지). */
function fingersUp(side: StudioMannequinHandSide): HandLandmark[] {
  return openPalm(side).map(({ x, y, z }) => ({ x: -x, y: -y, z }));
}

function frameResult(
  labels: readonly ("Left" | "Right")[],
  scores?: readonly number[],
  mutate?: (raw: { landmarks: HandLandmark[][]; worldLandmarks: HandLandmark[][] }) => void,
) {
  // 라벨은 셀카(미러) 가정의 뒤집힌 값: 기하 복원은 avatarSideForHand(label, false).
  const landmarks = labels.map((label) => openPalm(avatarSideForHand(label, false)));
  const worldLandmarks = landmarks.map((hand) =>
    hand.map(({ x, y, z }) => ({ x: x * 10, y: y * 10, z: z * 10 })),
  );
  mutate?.({ landmarks, worldLandmarks });
  return {
    landmarks,
    worldLandmarks,
    handedness: labels.map((label, index) => [
      { categoryName: label, score: scores?.[index] ?? 0.9 },
    ]),
  };
}

describe("solveMannequinHandWristEuler", () => {
  it("휴식 자세(손가락 아래·손바닥 정면)에서는 0에 가까운 오일러를 낸다", () => {
    for (const side of ["left", "right"] as const) {
      const euler = requireEuler(openPalm(side), side);
      expect(Math.abs(euler[0])).toBeLessThan(0.05);
      expect(Math.abs(euler[1])).toBeLessThan(0.05);
      expect(Math.abs(euler[2])).toBeLessThan(0.05);
    }
  });

  it("손바닥이 이미지 왼쪽을 향하면 yaw 가 -90° 근처가 된다", () => {
    const euler = requireEuler(palmFacingLeft("left"), "left");
    expect(euler[1]).toBeCloseTo(-Math.PI / 2, 1);
  });

  it("손가락이 위를 향하면 pitch 가 180° 근처가 된다", () => {
    const euler = requireEuler(fingersUp("left"), "left");
    expect(Math.abs(euler[0])).toBeCloseTo(Math.PI, 1);
  });

  it("미러 반사는 하우스 계약(X 유지·Y/Z 부호 반전)을 따른다", () => {
    const reflected = mirrorStudioMannequinHandEuler([0.3, -1.2, 0.5]);
    expect(reflected[0]).toBeCloseTo(0.3, 10);
    expect(reflected[1]).toBeCloseTo(1.2, 10);
    expect(reflected[2]).toBeCloseTo(-0.5, 10);
    const involuted = mirrorStudioMannequinHandEuler(reflected);
    expect(involuted[0]).toBeCloseTo(0.3, 10);
    expect(involuted[1]).toBeCloseTo(-1.2, 10);
    expect(involuted[2]).toBeCloseTo(0.5, 10);
  });

  it("퇴화한 입력에는 null 을 돌리고 절대 예외를 던지지 않는다", () => {
    expect(solveMannequinHandWristEuler(undefined, "left")).toBeNull();
    expect(solveMannequinHandWristEuler([], "left")).toBeNull();
    expect(
      solveMannequinHandWristEuler(openPalm("left").slice(0, 20), "left"),
    ).toBeNull();
    // 모든 점이 같으면 분절 길이가 0이라 방향을 정할 수 없다.
    const degenerate = Array.from(
      { length: STUDIO_MANNEQUIN_HAND_LANDMARK_COUNT },
      () => ({ x: 0.5, y: 0.5, z: 0 }),
    );
    expect(solveMannequinHandWristEuler(degenerate, "left")).toBeNull();
    const withNaN = openPalm("left");
    withNaN[9] = { x: Number.NaN, y: 0.11, z: 0 };
    expect(solveMannequinHandWristEuler(withNaN, "left")).toBeNull();
  });
});

describe("createStudioMannequinHandFrameResult", () => {
  it("0·1·2개 손을 받아 해당 측 손목 회전만 만든다", () => {
    const none = createStudioMannequinHandFrameResult(frameResult([]), { mirror: true });
    expect(none).toMatchObject({ detectedSides: [], droppedSides: [], wrists: {} });

    const one = createStudioMannequinHandFrameResult(frameResult(["Left"]), {
      mirror: true,
    });
    expect(one.detectedSides).toEqual(["left"]);
    expect(one.droppedSides).toEqual([]);
    expect(one.wrists.leftHand).toBeDefined();
    expect(one.wrists.rightHand).toBeUndefined();

    const two = createStudioMannequinHandFrameResult(frameResult(["Left", "Right"]), {
      mirror: true,
    });
    expect(two.detectedSides).toEqual(["left", "right"]);
    expect(two.wrists.leftHand).toBeDefined();
    expect(two.wrists.rightHand).toBeDefined();
  });

  it("미러 설정에 따라 handedness 라벨을 마네킹 측으로 매핑한다", () => {
    const mirrored = createStudioMannequinHandFrameResult(frameResult(["Left"]), {
      mirror: true,
    });
    const anatomical = createStudioMannequinHandFrameResult(frameResult(["Left"]), {
      mirror: false,
    });
    expect(mirrored.detectedSides).toEqual(["left"]);
    expect(anatomical.detectedSides).toEqual(["right"]);
  });

  it("미러 모드에서는 기하 오일러를 YZ 반사해 반대 측 관절에 얹는다(거울 따라하기)", () => {
    // 사용자의 해부학적 왼손이 손바닥을 이미지 왼쪽으로 돌린 자세.
    const geometry = palmFacingLeft("left");
    const geometric = requireEuler(geometry, "left");
    expect(geometric[1]).toBeCloseTo(-Math.PI / 2, 5);

    // 셀카 가정: 해부학적 왼손 → 라벨 "Right".
    const framed = createStudioMannequinHandFrameResult(
      {
        landmarks: [geometry],
        worldLandmarks: [geometry.map(({ x, y, z }) => ({ x: x * 10, y: y * 10, z: z * 10 }))],
        handedness: [[{ categoryName: "Right", score: 0.9 }]],
      },
      { mirror: true },
    );
    expect(framed.detectedSides).toEqual(["right"]);
    const wrist = framed.wrists.rightHand;
    if (!wrist) throw new Error("expected right wrist for mirrored left hand");
    expect(wrist[0]).toBeCloseTo(geometric[0], 5);
    expect(wrist[1]).toBeCloseTo(-geometric[1], 5);
    expect(wrist[2]).toBeCloseTo(-geometric[2], 5);
    // yaw -90° → +90°: 아바타 오른손 손바닥이 이미지 오른쪽을 향한다.
    expect(wrist[1]).toBeCloseTo(Math.PI / 2, 1);
  });

  it("비미러 모드에서는 기하 오일러를 그대로 복사한다", () => {
    const geometry = palmFacingLeft("right");
    const geometric = requireEuler(geometry, "right");
    const framed = createStudioMannequinHandFrameResult(
      {
        landmarks: [geometry],
        worldLandmarks: [geometry.map(({ x, y, z }) => ({ x: x * 10, y: y * 10, z: z * 10 }))],
        handedness: [[{ categoryName: "Left", score: 0.9 }]],
      },
      { mirror: false },
    );
    // 비미러: 라벨 "Left" → 해부학적 오른손 → 아바타 오른쪽.
    expect(framed.detectedSides).toEqual(["right"]);
    const wrist = framed.wrists.rightHand;
    if (!wrist) throw new Error("expected right wrist in non-mirror mode");
    expect(wrist[0]).toBeCloseTo(geometric[0], 5);
    expect(wrist[1]).toBeCloseTo(geometric[1], 5);
    expect(wrist[2]).toBeCloseTo(geometric[2], 5);
  });

  it("같은 측 중복 검출은 배열 순서 덮어쓰기 대신 그 측을 통째로 버린다", () => {
    const duplicate = createStudioMannequinHandFrameResult(frameResult(["Left", "Left"]), {
      mirror: true,
    });
    expect(duplicate.detectedSides).toEqual([]);
    expect(duplicate.droppedSides).toEqual(["left"]);
    expect(duplicate.wrists).toEqual({});
  });

  it("신뢰도 미달 손은 버리고 유효한 손은 유지한다", () => {
    const mixed = createStudioMannequinHandFrameResult(frameResult(["Left", "Right"], [0.9, 0.2]), {
      mirror: true,
    });
    expect(mixed.detectedSides).toEqual(["left"]);
    expect(mixed.wrists.leftHand).toBeDefined();
    expect(mixed.wrists.rightHand).toBeUndefined();

    const custom = createStudioMannequinHandFrameResult(frameResult(["Right"], [0.85]), {
      mirror: true,
      minimumHandednessConfidence: 0.9,
    });
    expect(custom.detectedSides).toEqual([]);
    expect(custom.wrists).toEqual({});
  });

  it("손상 프레임에는 예외 없이 빈 기여로 버린다(프레임 루프 보호)", () => {
    expect(createStudioMannequinHandFrameResult(null, { mirror: true }).wrists).toEqual({});
    expect(createStudioMannequinHandFrameResult(undefined, { mirror: true }).wrists).toEqual({});
    expect(createStudioMannequinHandFrameResult({}, { mirror: true }).wrists).toEqual({});
    expect(
      createStudioMannequinHandFrameResult({ landmarks: "broken" }, { mirror: true }).wrists,
    ).toEqual({});
    expect(
      createStudioMannequinHandFrameResult({ landmarks: [] }, { mirror: true }).wrists,
    ).toEqual({});
  });

  it("21개 미만 랜드마크·비유한 좌표 손은 버린다", () => {
    const short = createStudioMannequinHandFrameResult(
      frameResult(["Left"], undefined, ({ landmarks, worldLandmarks }) => {
        const normalized = landmarks[0];
        const world = worldLandmarks[0];
        if (normalized) landmarks[0] = normalized.slice(0, 20);
        if (world) worldLandmarks[0] = world.slice(0, 20);
      }),
      { mirror: true },
    );
    expect(short.detectedSides).toEqual([]);
    expect(short.wrists).toEqual({});

    const nonFinite = createStudioMannequinHandFrameResult(
      frameResult(["Left"], undefined, ({ landmarks, worldLandmarks }) => {
        const normalized = landmarks[0];
        const world = worldLandmarks[0];
        const normalizedPoint = normalized?.[0];
        const worldPoint = world?.[0];
        if (normalized && normalizedPoint) {
          normalized[0] = { ...normalizedPoint, x: Number.POSITIVE_INFINITY };
        }
        if (world && worldPoint) {
          world[0] = { ...worldPoint, x: Number.POSITIVE_INFINITY };
        }
      }),
      { mirror: true },
    );
    expect(nonFinite.detectedSides).toEqual([]);
    expect(nonFinite.wrists).toEqual({});
  });

  it("worldLandmarks 가 손상되면 정규화 landmarks 로 폴백한다", () => {
    const raw = frameResult(["Left"]);
    const fallback = createStudioMannequinHandFrameResult(
      { ...raw, worldLandmarks: [[{ x: 0, y: 0, z: 0 }]] },
      { mirror: true },
    );
    expect(fallback.detectedSides).toEqual(["left"]);
    expect(fallback.wrists.leftHand).toBeDefined();
  });

  it("deprecated handednesses 필드를 폴백으로 읽는다", () => {
    const raw = frameResult(["Right"]);
    const legacy = createStudioMannequinHandFrameResult(
      { landmarks: raw.landmarks, handednesses: raw.handedness },
      { mirror: true },
    );
    expect(legacy.detectedSides).toEqual(["right"]);
  });

  it("3개 이상 손은 처음 2개만 처리한다", () => {
    const three = createStudioMannequinHandFrameResult(
      frameResult(["Left", "Right", "Left"]),
      { mirror: true },
    );
    expect(three.detectedSides).toEqual(["left", "right"]);
    expect(Object.keys(three.wrists)).toHaveLength(2);
  });

  it("범위 밖 신뢰도 옵션은 기본값(0.5)으로 대체한다", () => {
    const low = createStudioMannequinHandFrameResult(frameResult(["Left"], [0.4]), {
      mirror: true,
      minimumHandednessConfidence: 99,
    });
    expect(low.detectedSides).toEqual([]);
  });
});

describe("solveMannequinHandWristsFromDetections", () => {
  it("검증된 검출 목록을 손목 관절 회전으로 바꾼다", () => {
    const result = solveMannequinHandWristsFromDetections([
      { side: "left", handedness: "Right", worldLandmarks: openPalm("left") },
      { side: "right", handedness: "Left", worldLandmarks: openPalm("right") },
    ]);
    expect(result.appliedSides).toEqual(["left", "right"]);
    expect(result.skippedSides).toEqual([]);
    expect(result.wrists.leftHand).toBeDefined();
    expect(result.wrists.rightHand).toBeDefined();
  });

  it("사진 경로는 미러 반사 없이 기하 오일러를 그대로 복사한다", () => {
    const geometry = palmFacingLeft("left");
    const geometric = requireEuler(geometry, "left");
    const result = solveMannequinHandWristsFromDetections([
      { side: "left", handedness: "Right", worldLandmarks: geometry },
    ]);
    const wrist = result.wrists.leftHand;
    if (!wrist) throw new Error("expected left wrist in photo path");
    expect(wrist[0]).toBeCloseTo(geometric[0], 5);
    expect(wrist[1]).toBeCloseTo(geometric[1], 5);
    expect(wrist[2]).toBeCloseTo(geometric[2], 5);
  });

  it("같은 측 중복 검출은 그 측을 fail-closed 로 버린다", () => {
    // 스캐너는 최대 2손만 보장하므로 현실적인 중복은 2개 검출이 같은 측에 매핑되는 경우.
    const result = solveMannequinHandWristsFromDetections([
      { side: "left", handedness: "Right", worldLandmarks: openPalm("left") },
      { side: "left", handedness: "Right", worldLandmarks: openPalm("left") },
    ]);
    expect(result.appliedSides).toEqual([]);
    expect(result.skippedSides).toEqual(["left"]);
    expect(result.wrists).toEqual({});
  });

  it("손상된 검출은 건너뛰고 유효한 측만 적용한다", () => {
    const broken = openPalm("left").slice(0, 10);
    const result = solveMannequinHandWristsFromDetections([
      { side: "left", handedness: "Right", worldLandmarks: broken },
      { side: "right", handedness: "Left", worldLandmarks: openPalm("right") },
    ]);
    expect(result.appliedSides).toEqual(["right"]);
    expect(result.skippedSides).toEqual(["left"]);
  });

  it("handedness 가 비정상이면 그 검출을 건너뛴다", () => {
    const result = solveMannequinHandWristsFromDetections([
      {
        side: "left",
        handedness: "Unknown" as "Left",
        worldLandmarks: openPalm("left"),
      },
      { side: "right", handedness: "Left", worldLandmarks: openPalm("right") },
    ]);
    expect(result.appliedSides).toEqual(["right"]);
    expect(result.skippedSides).toEqual(["left"]);
    expect(result.wrists.leftHand).toBeUndefined();
  });

  it("빈 입력·3개 초과 입력은 안전하게 처리한다", () => {
    expect(solveMannequinHandWristsFromDetections(undefined).appliedSides).toEqual([]);
    expect(solveMannequinHandWristsFromDetections([]).wrists).toEqual({});
    const overflow = solveMannequinHandWristsFromDetections(
      Array.from({ length: STUDIO_MANNEQUIN_HAND_MAX_HANDS + 1 }, () => ({
        side: "left" as const,
        handedness: "Right" as const,
        worldLandmarks: openPalm("left"),
      })),
    );
    expect(overflow.wrists).toEqual({});
    expect(overflow.skippedSides).toEqual(["left", "right"]);
  });
});
