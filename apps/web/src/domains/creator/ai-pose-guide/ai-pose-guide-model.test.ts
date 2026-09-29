/**
 * AI 포즈/선화 가이드 도메인 모델 테스트 (티켓 A1 [P0])
 */
import { describe, expect, it } from "vitest";
import {
  POSE_JOINT_IDS,
  adherenceToWeight,
  compareResults,
  createDefaultPose,
  normalizeControlWeight,
  transitionJobState,
  validatePoseGuideRequest,
  type PoseGuideJob,
  type PoseGuideRequest,
  type PoseJointId,
  type NormalizedPoint,
} from "./ai-pose-guide-model";

/** 유효한 요청을 만드는 헬퍼 (각 테스트에서 변형해서 사용). */
function makeValidRequest(overrides: Partial<PoseGuideRequest> = {}): PoseGuideRequest {
  return {
    pose: createDefaultPose(),
    controlWeight: 65,
    prompt: "anime girl, colored, detailed",
    ...overrides,
  };
}

describe("선화 준수도 3단계 → 가중치 매핑", () => {
  it("low는 0.35", () => {
    expect(adherenceToWeight("low")).toBe(0.35);
  });

  it("medium은 0.65", () => {
    expect(adherenceToWeight("medium")).toBe(0.65);
  });

  it("high은 0.9", () => {
    expect(adherenceToWeight("high")).toBe(0.9);
  });

  it("매핑 값이 0..1 범위이며 준수도 순서대로 증가한다", () => {
    const low = adherenceToWeight("low");
    const medium = adherenceToWeight("medium");
    const high = adherenceToWeight("high");
    expect(low).toBeGreaterThanOrEqual(0);
    expect(high).toBeLessThanOrEqual(1);
    expect(low).toBeLessThan(medium);
    expect(medium).toBeLessThan(high);
  });
});

describe("ControlNet 가중치 클램프 (normalizeControlWeight)", () => {
  it("범위 내 값은 반올림만 적용한다", () => {
    expect(normalizeControlWeight(65)).toBe(65);
    expect(normalizeControlWeight(65.4)).toBe(65);
    expect(normalizeControlWeight(65.6)).toBe(66);
  });

  it("0 미만은 0으로, 100 초과는 100으로 클램프한다", () => {
    expect(normalizeControlWeight(-1)).toBe(0);
    expect(normalizeControlWeight(-999)).toBe(0);
    expect(normalizeControlWeight(101)).toBe(100);
    expect(normalizeControlWeight(500)).toBe(100);
  });

  it("경계값 0과 100은 그대로 둔다", () => {
    expect(normalizeControlWeight(0)).toBe(0);
    expect(normalizeControlWeight(100)).toBe(100);
  });

  it("NaN/Infinity는 0으로", () => {
    expect(normalizeControlWeight(NaN)).toBe(0);
    expect(normalizeControlWeight(Infinity)).toBe(0);
    expect(normalizeControlWeight(-Infinity)).toBe(0);
  });
});

describe("기본 포즈 (createDefaultPose)", () => {
  it("모든 조인트가 0..1 범위의 정규화 좌표를 갖는다", () => {
    const pose = createDefaultPose();
    expect(Object.keys(pose.joints)).toHaveLength(POSE_JOINT_IDS.length);
    for (const id of POSE_JOINT_IDS) {
      const p = pose.joints[id as PoseJointId];
      expect(p).toBeDefined();
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(1);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(1);
    }
  });

  it("양팔이 수평으로 뻗어 있고 다리는 직립(어깨 y ≈ 팔꿈치 y)", () => {
    const pose = createDefaultPose();
    expect(pose.joints.shoulderL.y).toBe(pose.joints.elbowL.y);
    expect(pose.joints.elbowL.y).toBe(pose.joints.handL.y);
    expect(pose.joints.shoulderR.y).toBe(pose.joints.elbowR.y);
    expect(pose.joints.elbowR.y).toBe(pose.joints.handR.y);
    // 왼쪽 → 오른쪽 순으로 배치
    expect(pose.joints.handL.x).toBeLessThan(pose.joints.shoulderL.x);
    expect(pose.joints.shoulderR.x).toBeLessThan(pose.joints.handR.x);
    expect(pose.joints.footL.y).toBeGreaterThan(pose.joints.kneeL.y);
  });
});

describe("요청 검증 (validatePoseGuideRequest)", () => {
  it("정상 요청은 에러가 없다", () => {
    expect(validatePoseGuideRequest(makeValidRequest())).toEqual([]);
  });

  it("선택 필드(lineartRefId/negativePrompt/seed) 포함 요청도 정상", () => {
    expect(
      validatePoseGuideRequest(
        makeValidRequest({
          lineartRefId: "lineart-123",
          negativePrompt: "blurry",
          seed: 42,
        })
      )
    ).toEqual([]);
  });

  it("조인트 누락 시 MISSING_JOINTS 에러", () => {
    const pose = createDefaultPose();
    const joints = pose.joints as Partial<Record<PoseJointId, NormalizedPoint>>;
    delete joints.handR;
    const errors = validatePoseGuideRequest(makeValidRequest({ pose }));
    const missing = errors.find((e) => e.code === "MISSING_JOINTS");
    expect(missing).toBeDefined();
    if (missing?.code === "MISSING_JOINTS") {
      expect(missing.joints).toContain("handR");
    }
  });

  it("좌표 범위 초과 시 JOINT_OUT_OF_RANGE 에러", () => {
    const pose = createDefaultPose();
    pose.joints.kneeL = { x: 1.5, y: 0.75 };
    pose.joints.footR = { x: 0.6, y: -0.2 };
    const errors = validatePoseGuideRequest(makeValidRequest({ pose }));
    const out = errors.find((e) => e.code === "JOINT_OUT_OF_RANGE");
    expect(out).toBeDefined();
    if (out?.code === "JOINT_OUT_OF_RANGE") {
      expect(out.joints).toContain("kneeL");
      expect(out.joints).toContain("footR");
    }
  });

  it("controlWeight 범위 초과(101, -1) 시 에러", () => {
    const over = validatePoseGuideRequest(makeValidRequest({ controlWeight: 101 }));
    expect(over.some((e) => e.code === "CONTROL_WEIGHT_OUT_OF_RANGE")).toBe(true);
    const under = validatePoseGuideRequest(makeValidRequest({ controlWeight: -1 }));
    expect(under.some((e) => e.code === "CONTROL_WEIGHT_OUT_OF_RANGE")).toBe(true);
  });

  it("controlWeight 경계값 0/100은 통과", () => {
    expect(validatePoseGuideRequest(makeValidRequest({ controlWeight: 0 }))).toEqual([]);
    expect(validatePoseGuideRequest(makeValidRequest({ controlWeight: 100 }))).toEqual([]);
  });

  it("빈 prompt 시 PROMPT_EMPTY 에러", () => {
    expect(
      validatePoseGuideRequest(makeValidRequest({ prompt: "   " })).some(
        (e) => e.code === "PROMPT_EMPTY"
      )
    ).toBe(true);
  });

  it("비정수 seed 시 SEED_NOT_INTEGER 에러", () => {
    expect(
      validatePoseGuideRequest(makeValidRequest({ seed: 3.14 })).some(
        (e) => e.code === "SEED_NOT_INTEGER"
      )
    ).toBe(true);
  });
});

describe("작업 상태 전이 (transitionJobState)", () => {
  function makeJob(): PoseGuideJob {
    return {
      id: "job-1",
      status: "pending",
      request: makeValidRequest(),
      createdAt: 1000,
      updatedAt: 1000,
    };
  }

  it("pending → running → done", () => {
    const running = transitionJobState(makeJob(), "running", 2000);
    expect(running.status).toBe("running");
    expect(running.updatedAt).toBe(2000);
    const done = transitionJobState(running, "done", 3000, {
      resultImageId: "img-9",
    });
    expect(done.status).toBe("done");
    expect(done.resultImageId).toBe("img-9");
  });

  it("pending → failed, running → failed 모두 허용", () => {
    const failed1 = transitionJobState(makeJob(), "failed", 2000, {
      errorMessage: "서버 오류",
    });
    expect(failed1.status).toBe("failed");
    expect(failed1.errorMessage).toBe("서버 오류");

    const failed2 = transitionJobState(
      transitionJobState(makeJob(), "running", 2000),
      "failed",
      3000
    );
    expect(failed2.status).toBe("failed");
    expect(failed2.errorMessage).toBeDefined();
  });

  it("done → running 같은 역행/건너뛰기 전이는 Error를 던진다", () => {
    const done = transitionJobState(
      transitionJobState(makeJob(), "running", 2000),
      "done",
      3000,
      { resultImageId: "img-9" }
    );
    expect(() => transitionJobState(done, "running", 4000)).toThrow();
    expect(() => transitionJobState(makeJob(), "done", 2000)).toThrow();
    expect(() => transitionJobState(makeJob(), "pending", 2000)).toThrow();
  });

  it("failed → running 같은 전이도 Error를 던진다", () => {
    const failed = transitionJobState(makeJob(), "failed", 2000, {
      errorMessage: "취소",
    });
    expect(() => transitionJobState(failed, "running", 3000)).toThrow();
  });
});

describe("결과 비교 (compareResults)", () => {
  it("원본과 결과가 동일하면 changed 항목이 없다", () => {
    const meta = {
      imageId: "img-a",
      source: "pose" as const,
      controlWeight: 65,
      seed: 42,
      width: 1024,
      height: 1024,
    };
    const diff = compareResults(meta, { ...meta, imageId: "img-b" });
    expect(diff.every((d) => d.changed === false)).toBe(true);
  });

  it("가중치·해상도·시드 차이를 diff로 보고한다", () => {
    const original = {
      imageId: "img-a",
      source: "pose" as const,
      controlWeight: 65,
      seed: 42,
      width: 1024,
      height: 1024,
    };
    const generated = {
      imageId: "img-b",
      source: "lineart+pose" as const,
      controlWeight: 90,
      seed: 43,
      width: 512,
      height: 512,
    };
    const diff = compareResults(original, generated);
    const byField = Object.fromEntries(diff.map((d) => [d.field, d]));
    expect(byField.source.changed).toBe(true);
    expect(byField.width.changed).toBe(true);
    expect(byField.controlWeightDelta.generated).toBe(25);
    expect(byField.controlWeightDelta.changed).toBe(true);
    expect(byField.seedMatch.changed).toBe(true);
  });
});
