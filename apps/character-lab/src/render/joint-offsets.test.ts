import { describe, expect, it } from "vitest";

import { sameOffset, sumJointOffsets, summarizeJointOffsets } from "./joint-offsets";

import type { MorphJointOffsets } from "../contracts";

const TABLE: MorphJointOffsets = {
  "param:height:+": { leftUpperArm: [0, 0.02, 0], leftLowerArm: [0, 0.04, 0] },
  "param:height:-": { leftUpperArm: [0, -0.02, 0], leftLowerArm: [0, -0.04, 0] },
  "param:shoulder:+": { leftUpperArm: [0.01, 0, 0] },
  "param:empty:+": {},
};

describe("joint-offsets", () => {
  it("가중치 × 오프셋을 본별로 합산한다(여러 morph가 같은 본에 겹치면 더한다)", () => {
    const sums = sumJointOffsets(TABLE, { "param:height:+": 0.5, "param:shoulder:+": 1 });
    expect(sums.get("leftUpperArm")).toEqual([0.01, 0.01, 0]);
    expect(sums.get("leftLowerArm")).toEqual([0, 0.02, 0]);
    expect(sums.size).toBe(2);
  });

  it("가중치는 [0, 1]로 자르고 NaN·0은 건너뛴다", () => {
    const sums = sumJointOffsets(TABLE, { "param:height:+": 3, "param:height:-": -2, "param:shoulder:+": Number.NaN });
    expect(sums.get("leftUpperArm")).toEqual([0, 0.02, 0]);
    expect(sums.get("leftLowerArm")).toEqual([0, 0.04, 0]);
  });

  it("리그에 없는 morph는 건너뛴다(정점이 안 움직이는데 본만 움직이면 형상이 찢어진다)", () => {
    const sums = sumJointOffsets(TABLE, { "param:height:+": 1, "param:shoulder:+": 1 }, (name) => name !== "param:height:+");
    expect([...sums.keys()]).toEqual(["leftUpperArm"]);
    expect(sums.get("leftUpperArm")).toEqual([0.01, 0, 0]);
  });

  it("표에 없는 morph·빈 오프셋은 무시한다", () => {
    expect(sumJointOffsets(TABLE, { unknown: 1, "param:empty:+": 1 }).size).toBe(0);
  });

  it("sameOffset은 미세 오차 이하와 undefined(= 0)를 같다고 본다", () => {
    expect(sameOffset(undefined, undefined)).toBe(true);
    expect(sameOffset(undefined, [0, 0, 0])).toBe(true);
    expect(sameOffset([0.1, 0, 0], [0.1 + 1e-12, 0, 0])).toBe(true);
    expect(sameOffset([0.1, 0, 0], [0.2, 0, 0])).toBe(false);
  });

  it("표 요약: morph 수·본 수·최대 길이", () => {
    expect(summarizeJointOffsets(undefined)).toEqual({ morphCount: 0, boneCount: 0, maxOffsetM: 0 });
    const summary = summarizeJointOffsets(TABLE);
    expect(summary.morphCount).toBe(3);
    expect(summary.boneCount).toBe(2);
    expect(summary.maxOffsetM).toBeCloseTo(0.04, 12);
  });
});
