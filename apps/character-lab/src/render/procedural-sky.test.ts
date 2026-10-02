import { describe, expect, it } from "vitest";

import { v3Length } from "../shared/math";

import { CUBE_FACE_COUNT, DEFAULT_SKY, cubeDirection, generateSkyFaces, skyAverageColor, skyRadiance } from "./procedural-sky";

describe("procedural-sky", () => {
  it("큐브 방향은 각 면의 중심에서 축 방향이고 단위 벡터다", () => {
    // -0과 +0은 같은 방향이므로 `+ 0`으로 부호 없는 0으로 정규화해 비교한다.
    const axis = (face: number): number[] => cubeDirection(face, 0.5, 0.5).map((value) => value + 0);
    expect(axis(0)).toEqual([1, 0, 0]);
    expect(axis(1)).toEqual([-1, 0, 0]);
    expect(axis(2)).toEqual([0, 1, 0]);
    expect(axis(3)).toEqual([0, -1, 0]);
    expect(axis(4)).toEqual([0, 0, 1]);
    expect(axis(5)).toEqual([0, 0, -1]);
    expect(v3Length(cubeDirection(2, 0.1, 0.9))).toBeCloseTo(1, 6);
    expect(() => cubeDirection(6, 0, 0)).toThrow();
  });

  it("천정은 zenith, 지면은 ground에 가깝고 태양 방향은 밝다", () => {
    const zenith = skyRadiance([0, 1, 0]);
    expect(zenith[2]).toBeGreaterThan(zenith[0]);
    const ground = skyRadiance([0, -1, 0]);
    expect(ground[0]).toBeCloseTo(DEFAULT_SKY.ground[0], 2);
    const sun = skyRadiance(DEFAULT_SKY.sunDirection);
    expect(sun[0]).toBeGreaterThan(5);
    const away = skyRadiance([-DEFAULT_SKY.sunDirection[0], DEFAULT_SKY.sunDirection[1], -DEFAULT_SKY.sunDirection[2]]);
    expect(away[0]).toBeLessThan(2);
  });

  it("6면 float RGBA를 만들고 결정적이다", () => {
    const faces = generateSkyFaces(8);
    expect(faces).toHaveLength(CUBE_FACE_COUNT);
    for (const face of faces) {
      expect(face.length).toBe(8 * 8 * 4);
      for (let i = 3; i < face.length; i += 4) expect(face[i]).toBe(1);
    }
    const again = generateSkyFaces(8);
    expect(Buffer.from(faces[0]!.buffer).equals(Buffer.from(again[0]!.buffer))).toBe(true);
    expect(() => generateSkyFaces(1)).toThrow();
  });

  it("평균색은 태양을 제외하고 0..1 범위", () => {
    const average = skyAverageColor();
    for (const channel of average) {
      expect(channel).toBeGreaterThan(0);
      expect(channel).toBeLessThan(1);
    }
  });
});
