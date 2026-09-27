import { describe, expect, it } from "vitest";

import {
  executeCharacterAuthoringTask,
} from "./character-authoring-worker-runtime";
import {
  isCharacterAuthoringWorkerMeshPayload,
} from "./character-authoring-worker-protocol";

import type { CharacterGroomGuideCurve, CharacterGroomProfile } from "../groom/character-groom-document";
import type { CharacterGeometryStroke } from "../surface-ink/character-geometry-stroke";

const guide: CharacterGroomGuideCurve = {
  guideId: "guide:worker",
  status: "valid",
  points: [
    { position: [0, 0, 0], width: 1, twist: 0 },
    { position: [0.2, 0.6, 0.1], width: 0.7, twist: 0.1 },
    { position: [0.3, 1, 0.2], width: 0.2, twist: 0.2 },
  ],
};
const profile: CharacterGroomProfile = {
  baseWidth: 0.1,
  taper: 0.7,
  lengthScale: 1,
  curl: 0,
  wave: 0,
  clump: 0,
  noise: 0,
  rootRotation: 0,
  lineOnly: false,
  fill: true,
  segmentsPerSpan: 4,
};
const stroke: CharacterGeometryStroke = {
  strokeId: "stroke:worker",
  name: "worker",
  visible: true,
  locked: false,
  status: "valid",
  style: {
    color: "#111111",
    baseWidth: 0.02,
    opacity: 1,
    taperStart: 0,
    taperEnd: 0.5,
    pressureWidth: 0.5,
    profile: "ribbon",
    fill: true,
    lineOnly: false,
  },
  points: [
    { anchor: { kind: "free", position: [0, 0, 0] }, pressure: 0.5, width: 1, twist: 0 },
    { anchor: { kind: "free", position: [0.4, 0.2, 0] }, pressure: 0.7, width: 0.5, twist: 0.2 },
  ],
};

describe("Character authoring worker runtime", () => {
  it("resamples a guide with the exact final point", () => {
    const result = executeCharacterAuthoringTask({ kind: "resample-groom-guide", guide, spacing: 0.15 });
    expect(result.kind).toBe("groom-guide");
    if (result.kind === "groom-guide") {
      expect(result.guide.points.length).toBeGreaterThan(guide.points.length);
      expect(result.guide.points.at(-1)?.position).toEqual(guide.points.at(-1)?.position);
    }
  });

  it("packs groom and geometry derivatives into transferable binary meshes", () => {
    for (const task of [
      { kind: "build-groom-ribbon", guide, profile } as const,
      { kind: "build-geometry-stroke", stroke } as const,
    ]) {
      const result = executeCharacterAuthoringTask(task);
      expect(result.kind).toBe("mesh");
      expect(isCharacterAuthoringWorkerMeshPayload(result)).toBe(true);
      if (result.kind === "mesh") {
        expect(result.vertexCount).toBeGreaterThan(0);
        expect(result.triangleCount).toBeGreaterThan(0);
        expect(result.byteLength).toBe(
          result.positions.byteLength + result.normals.byteLength
          + result.uvs.byteLength + result.indices.byteLength,
        );
      }
    }
  });
});

describe("Worker 파생 데이터 안전 한도", () => {
  it("작은 입력의 극단적 재샘플 확대도 계산 전에 거절하고 원본 점을 보존한다", () => {
    const before = JSON.stringify(guide);
    expect(() => executeCharacterAuthoringTask({ kind: "resample-groom-guide", guide, spacing: 1e-20 }))
      .toThrow(expect.objectContaining({ code: "point-budget-exceeded" }));
    expect(JSON.stringify(guide)).toBe(before);
  });

  it("허용된 재샘플에서는 유한한 위치와 원래 끝점을 만든다", () => {
    const result = executeCharacterAuthoringTask({ kind: "resample-groom-guide", guide, spacing: 0.01 });
    if (result.kind !== "groom-guide") throw new Error("가이드 결과가 아닙니다.");
    expect(result.guide.points.length).toBeLessThanOrEqual(2048);
    expect(result.guide.points.every((point) => point.position.every(Number.isFinite))).toBe(true);
    expect(result.guide.points[0]?.position).toEqual(guide.points[0]?.position);
    expect(result.guide.points.at(-1)?.position).toEqual(guide.points.at(-1)?.position);
  });
});

describe("Groom 보간점과 메시 예산", () => {
  it("segmentsPerSpan이 만든 실제 보간 정점과 인덱스의 수를 반환한다", () => {
    const result = executeCharacterAuthoringTask({ kind: "build-groom-ribbon", guide, profile });
    if (result.kind !== "mesh") throw new Error("메시 결과가 아닙니다.");
    const samples = (guide.points.length - 1) * profile.segmentsPerSpan + 1;
    expect(result.vertexCount).toBe(samples * 2);
    expect(result.triangleCount).toBe((samples - 1) * 2);
    expect(new Float32Array(result.positions).every(Number.isFinite)).toBe(true);
  });

  it("작은 원본을 과도하게 확대하는 보간 요청을 메시 할당 전에 거절한다", () => {
    expect(() => executeCharacterAuthoringTask({ kind: "build-groom-ribbon", guide, profile: { ...profile, segmentsPerSpan: 100_000_000 } }))
      .toThrow(expect.objectContaining({ code: "point-budget-exceeded" }));
  });
});
