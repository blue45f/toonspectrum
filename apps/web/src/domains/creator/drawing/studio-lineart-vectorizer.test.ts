import Module from "node:module";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  mergeBubbleWithTail,
  pointsToPolylinePathData,
  simplifyVectorPath,
  vectorizeLineartStroke,
} from "./studio-lineart-vectorizer";

interface NodeModuleLoader {
  _load(request: string, parent: unknown, isMain: boolean): unknown;
}

const nodeModuleLoader = Module as unknown as NodeModuleLoader;
const originalNodeModuleLoad = nodeModuleLoader._load;

// Paper.js Node 어댑터가 jsdom canvas 를 opportunistic 하게 시도하는 것을 차단.
// (studio-engine-vector-geometry-provider.test.ts 와 동일한 패턴)
beforeAll(() => {
  nodeModuleLoader._load = function loadWithoutOptionalJsdom(
    request: string,
    parent: unknown,
    isMain: boolean,
  ): unknown {
    if (request === "jsdom") throw new Error("Paper geometry test omits optional jsdom");
    return originalNodeModuleLoad.call(this, request, parent, isMain);
  };
});

afterAll(() => {
  nodeModuleLoader._load = originalNodeModuleLoad;
});

describe("pointsToPolylinePathData", () => {
  it("점열을 M/L 폴리라인으로 변환한다", () => {
    const result = pointsToPolylinePathData([
      { x: 0, y: 0 },
      { x: 10.5, y: 20.25 },
      { x: 30, y: 40 },
    ]);
    expect(result).toBe("M0 0L10.5 20.25L30 40");
  });

  it("빈 점열은 빈 문자열을 반환한다", () => {
    expect(pointsToPolylinePathData([])).toBe("");
  });

  it("점 하나는 M만 반환한다", () => {
    expect(pointsToPolylinePathData([{ x: 5, y: 7 }])).toBe("M5 7");
  });
});

describe("vectorizeLineartStroke", () => {
  it("점이 2개 미만이면 실패한다", async () => {
    const result = await vectorizeLineartStroke([{ x: 0, y: 0 }]);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("최소 2개");
  });

  it("직선 점열을 스무딩된 벡터 패스로 변환한다", async () => {
    const points = Array.from({ length: 10 }, (_, i) => ({
      x: i * 10,
      y: 50 + Math.sin(i) * 2,
    }));
    const result = await vectorizeLineartStroke(points);
    expect(result.ok).toBe(true);
    expect(result.pathData.length).toBeGreaterThan(0);
  });

  it("simplifyTolerance 를 주면 단순화까지 적용된다", async () => {
    const points = Array.from({ length: 20 }, (_, i) => ({
      x: i * 5,
      y: 50,
    }));
    const result = await vectorizeLineartStroke(points, {
      simplifyTolerance: 1,
    });
    expect(result.ok).toBe(true);
    expect(result.pathData.length).toBeGreaterThan(0);
  });
});

describe("mergeBubbleWithTail", () => {
  it("pathData 가 비어 있으면 실패한다", async () => {
    const result = await mergeBubbleWithTail("", "M0 0L10 10Z");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("모두 필요");
  });

  it("겹치는 원 두 개를 합성한다", async () => {
    // 두 개의 겹치는 사각형
    const bubble = "M0 0H100V100H0Z";
    const tail = "M50 50H150V150H50Z";
    const result = await mergeBubbleWithTail(bubble, tail);
    expect(result.ok).toBe(true);
    expect(result.pathData.length).toBeGreaterThan(0);
  });
});

describe("simplifyVectorPath", () => {
  it("빈 pathData 는 실패한다", async () => {
    const result = await simplifyVectorPath("", 1);
    expect(result.ok).toBe(false);
  });

  it("음수 tolerance 는 실패한다", async () => {
    const result = await simplifyVectorPath("M0 0L10 10", -1);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("tolerance");
  });

  it("지그재그 패스를 단순화한다", async () => {
    const zigzag =
      "M0 0" +
      Array.from({ length: 20 }, (_, i) => `L${i * 5} ${(i % 2) * 10}`).join("");
    const inputSegments = (zigzag.match(/L/g) ?? []).length;
    const result = await simplifyVectorPath(zigzag, 2);
    expect(result.ok).toBe(true);
    // 단순화되면 세그먼트(커브) 수가 원본 라인 수보다 줄어든다
    const outputSegments = (result.pathData.match(/[CL]/g) ?? []).length;
    expect(outputSegments).toBeLessThan(inputSegments);
  });
});
