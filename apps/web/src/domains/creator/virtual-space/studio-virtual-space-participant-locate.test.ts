import { describe, expect, it } from "vitest";
import {
  computeLocateGuide,
  sortLocateCandidates,
} from "./studio-virtual-space-participant-locate";

describe("computeLocateGuide", () => {
  it("같은 위치면 null", () => {
    expect(computeLocateGuide({ x: 10, y: 10 }, { x: 10, y: 10 }, 500)).toBeNull();
  });

  it("방향·거리·각도 계산", () => {
    const guide = computeLocateGuide({ x: 0, y: 0 }, { x: 100, y: 0 }, 500);
    expect(guide?.distance).toBe(100);
    expect(guide?.direction.x).toBeCloseTo(1);
    expect(guide?.direction.y).toBeCloseTo(0);
    expect(guide?.onScreen).toBe(true);
  });

  it("화면 밖이면 onScreen=false", () => {
    const guide = computeLocateGuide({ x: 0, y: 0 }, { x: 1000, y: 0 }, 500);
    expect(guide?.onScreen).toBe(false);
    expect(guide?.distance).toBe(1000);
  });

  it("대각선 방향 단위벡터", () => {
    const guide = computeLocateGuide({ x: 0, y: 0 }, { x: 3, y: 4 }, 500);
    expect(guide?.distance).toBe(5);
    expect(guide?.direction.x).toBeCloseTo(0.6);
    expect(guide?.direction.y).toBeCloseTo(0.8);
  });
});

describe("sortLocateCandidates", () => {
  it("거리순 정렬 + limit", () => {
    const candidates = sortLocateCandidates(
      { x: 0, y: 0 },
      [
        { sessionId: "far", point: { x: 300, y: 0 } },
        { sessionId: "near", point: { x: 50, y: 0 } },
        { sessionId: "mid", point: { x: 150, y: 0 } },
      ],
      2,
    );
    expect(candidates.map((c) => c.sessionId)).toEqual(["near", "mid"]);
  });

  it("빈 목록", () => {
    expect(sortLocateCandidates({ x: 0, y: 0 }, [])).toHaveLength(0);
  });
});
